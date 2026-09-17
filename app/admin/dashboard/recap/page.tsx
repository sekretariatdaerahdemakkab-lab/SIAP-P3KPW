'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import * as xlsx from 'xlsx';
import Link from 'next/link';
import {
  FileSpreadsheet,
  Download,
  Search,
  Calendar,
  Filter,
  RefreshCw,
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Building2,
  ArrowUpDown,
  ChevronRight,
  Printer,
  FileText,
  X,
  ExternalLink,
  Info
} from 'lucide-react';

import { PermitItem, PERMIT_TYPES } from '@/lib/permits';

interface EmployeeRecapRow {
  no: number;
  nip: string;
  nama: string;
  unit_kerja: string;
  jabatan: string;
  total_hari: number;
  hari_kerja_efektif: number;
  kehadiran: number;
  keterlambatan: number;
  mendahului: number;
  piket: number;
  izin_sah: number; // Total DL, Sakit, Cuti, Izin sah
  dinas_luar: number;
  sakit: number;
  izin_cuti: number;
  persen_kehadiran: number;
}

interface DailyLogItem {
  tanggal: string;
  hari: string;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
  waktu_masuk: string;
  waktu_keluar: string;
  isLate: boolean;
  isEarly: boolean;
  isPiket: boolean;
  catatan: string;
  permit?: PermitItem;
}

interface HolidayItem {
  tanggal: string;
  nama: string;
  jenis: string;
}

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const HARI_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// Helper time conversion to seconds
const parseTimeToSeconds = (timeStr?: string): number | null => {
  if (!timeStr) return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parts[2] ? parseInt(parts[2], 10) : 0;
  if (isNaN(h) || isNaN(m)) return null;
  return h * 3600 + m * 60 + s;
};

export default function AttendanceRecapPage() {
  const currentDate = new Date();
  const [bulan, setBulan] = useState<number>(currentDate.getMonth() + 1);
  const [tahun, setTahun] = useState<number>(currentDate.getFullYear());
  const [unitKerjaFilter, setUnitKerjaFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [recapData, setRecapData] = useState<EmployeeRecapRow[]>([]);
  const [availableUnits, setAvailableUnits] = useState<string[]>([]);
  const [hariEfektifBulan, setHariEfektifBulan] = useState<number>(0);

  // Derived calendar days
  const totalHariBulan = useMemo(() => new Date(tahun, bulan, 0).getDate(), [tahun, bulan]);

  // Sorting
  const [sortField, setSortField] = useState<keyof EmployeeRecapRow>('nama');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Modal Detail Pegawai
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRecapRow | null>(null);
  const [employeeDailyLogs, setEmployeeDailyLogs] = useState<DailyLogItem[]>([]);
  const [loadingModalLogs, setLoadingModalLogs] = useState<boolean>(false);

  // Load Data inside useEffect
  useEffect(() => {
    let isCancelled = false;

    async function executeFetch() {
      try {
        const prefix = `${tahun}-${String(bulan).padStart(2, '0')}`;
        const daysInMonth = new Date(tahun, bulan, 0).getDate();
        const startDate = `${prefix}-01`;
        const endDate = `${prefix}-${String(daysInMonth).padStart(2, '0')}`;

        // 1. Fetch Work Hours Settings
        let defaultMasukSec = 7 * 3600 + 30 * 60; // 07:30
        let defaultPulangSec = 16 * 3600; // 16:00
        let defaultPulangJumatSec = 15 * 3600; // 15:00
        let schedulesList: any[] = [];

        try {
          const whSnap = await getDoc(doc(db, 'settings', 'work_hours'));
          if (whSnap.exists()) {
            const d = whSnap.data();
            if (Array.isArray(d.schedules)) {
              schedulesList = d.schedules;
              const active = d.schedules.find((s: any) => s.is_active) || d.schedules[0];
              if (active) {
                defaultMasukSec = parseTimeToSeconds(active.jam_masuk) ?? defaultMasukSec;
                defaultPulangSec = parseTimeToSeconds(active.jam_pulang) ?? defaultPulangSec;
                defaultPulangJumatSec = parseTimeToSeconds(active.jam_pulang_jumat) ?? defaultPulangJumatSec;
              }
            }
          }
        } catch (err) {
          console.warn('Gagal memuat pengaturan jam kerja:', err);
        }

        // 2. Fetch Holidays for the Month
        const holidaysMap: Record<string, HolidayItem> = {};
        try {
          const holSnap = await getDocs(collection(db, 'holidays'));
          holSnap.forEach(docSnap => {
            const d = docSnap.data();
            if (d.tanggal && d.tanggal.startsWith(prefix)) {
              holidaysMap[d.tanggal] = {
                tanggal: d.tanggal,
                nama: d.nama || 'Hari Libur',
                jenis: d.jenis || 'libur_nasional'
              };
            }
          });
        } catch (err) {
          console.warn('Gagal memuat hari libur:', err);
        }

        // 3. Compute Effective Working Days for this Month
        let effectiveWorkingDays = 0;
        const calendarMatrix: Array<{
          dateStr: string;
          dayIndex: number;
          isWeekend: boolean;
          isFriday: boolean;
          isHoliday: boolean;
          holidayName?: string;
          masukSec: number;
          pulangSec: number;
        }> = [];

        for (let day = 1; day <= daysInMonth; day++) {
          const dayStr = String(day).padStart(2, '0');
          const dateStr = `${prefix}-${dayStr}`;
          const dateObj = new Date(tahun, bulan - 1, day);
          const dayIdx = dateObj.getDay();
          const isWeekend = dayIdx === 0 || dayIdx === 6; // Minggu / Sabtu
          const isFriday = dayIdx === 5;
          const holiday = holidaysMap[dateStr];
          const isHoliday = !!holiday;

          if (!isWeekend && !isHoliday) {
            effectiveWorkingDays++;
          }

          // Check if there is a special date-range schedule (e.g. Ramadhan)
          let dayMasukSec = defaultMasukSec;
          let dayPulangSec = isFriday ? defaultPulangJumatSec : defaultPulangSec;

          if (Array.isArray(schedulesList)) {
            const matched = schedulesList.find((s: any) =>
              s.is_date_range && s.start_date && s.end_date && dateStr >= s.start_date && dateStr <= s.end_date
            );
            if (matched) {
              dayMasukSec = parseTimeToSeconds(matched.jam_masuk) ?? dayMasukSec;
              dayPulangSec = parseTimeToSeconds(isFriday ? matched.jam_pulang_jumat : matched.jam_pulang) ?? dayPulangSec;
            }
          }

          calendarMatrix.push({
            dateStr,
            dayIndex: dayIdx,
            isWeekend,
            isFriday,
            isHoliday,
            holidayName: holiday?.nama,
            masukSec: dayMasukSec,
            pulangSec: dayPulangSec
          });
        }

        // 4. Fetch Employees Master List
        const empMap: Record<string, { nip: string; nama: string; unit_kerja: string; jabatan: string }> = {};
        const unitSet = new Set<string>();

        try {
          const empSnap = await getDocs(collection(db, 'employees'));
          empSnap.forEach(d => {
            const data = d.data();
            const cleanNip = String(data.nip || d.id || '').trim();
            if (cleanNip) {
              const unit = String(data.unit_kerja || 'Sekretariat Daerah').trim();
              empMap[cleanNip] = {
                nip: cleanNip,
                nama: String(data.nama || '').trim(),
                unit_kerja: unit,
                jabatan: String(data.jabatan || '').trim()
              };
              if (unit) unitSet.add(unit);
            }
          });
        } catch (err) {
          console.warn('Gagal memuat master pegawai:', err);
        }

        // 5. Fetch Attendances for the Month
        const attMap: Record<string, Record<string, any>> = {}; // NIP -> { dateStr: attData }
        try {
          const qAtt = query(
            collection(db, 'attendances'),
            where('tanggal', '>=', startDate),
            where('tanggal', '<=', endDate)
          );
          const attSnap = await getDocs(qAtt);
          attSnap.forEach(d => {
            const a = d.data();
            const nip = String(a.nip || '').trim();
            const tgl = String(a.tanggal || '').trim();
            if (nip && tgl) {
              if (!attMap[nip]) attMap[nip] = {};
              attMap[nip][tgl] = a;

              // If employee not in master table, register them so they don't get missed
              if (!empMap[nip]) {
                empMap[nip] = {
                  nip,
                  nama: String(a.nama || nip).trim(),
                  unit_kerja: String(a.unit_kerja || 'Sekretariat Daerah').trim(),
                  jabatan: 'PPPK Paruh Waktu'
                };
                if (a.unit_kerja) unitSet.add(String(a.unit_kerja).trim());
              }
            }
          });
        } catch (err) {
          console.error('Gagal memuat absensi bulanan:', err);
        }

        // 5b. Fetch Approved Permits for the Month
        const permitMap: Record<string, Record<string, PermitItem>> = {}; // NIP -> { dateStr: permitData }
        try {
          const qPermits = query(
            collection(db, 'permits'),
            where('status', '==', 'approved')
          );
          const pSnap = await getDocs(qPermits);
          pSnap.forEach(d => {
            const p = { id: d.id, ...(d.data() as Omit<PermitItem, 'id'>) };
            const nip = String(p.nip || '').trim();
            if (nip && p.tanggal_mulai && p.tanggal_selesai) {
              if (!permitMap[nip]) permitMap[nip] = {};
              const sDate = new Date(p.tanggal_mulai);
              const eDate = new Date(p.tanggal_selesai);
              for (let dt = new Date(sDate); dt <= eDate; dt.setDate(dt.getDate() + 1)) {
                const dtISO = dt.toISOString().split('T')[0];
                if (dtISO >= startDate && dtISO <= endDate) {
                  permitMap[nip][dtISO] = p;
                }
              }
            }
          });
        } catch (err) {
          console.warn('Gagal memuat data izin:', err);
        }

        // 6. Aggregate Metrics for Each Employee
        const rows: EmployeeRecapRow[] = [];
        const employeeList = Object.values(empMap);
        employeeList.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));

        employeeList.forEach((emp, index) => {
          const empAtt = attMap[emp.nip] || {};
          const empPermit = permitMap[emp.nip] || {};
          let kehadiran = 0;
          let keterlambatan = 0;
          let mendahului = 0;
          let piket = 0;
          let dinasLuar = 0;
          let sakit = 0;
          let izinCuti = 0;

          calendarMatrix.forEach(cal => {
            const att = empAtt[cal.dateStr];
            const permit = empPermit[cal.dateStr];
            const hasMasuk = !!att?.waktu_masuk && att.waktu_masuk.trim() !== '' && att.waktu_masuk !== '--:--';
            const hasPulang = !!att?.waktu_keluar && att.waktu_keluar.trim() !== '' && att.waktu_keluar !== '--:--';
            const hasFinger = hasMasuk || hasPulang;

            if (hasFinger) {
              kehadiran++;

              if (cal.isWeekend || cal.isHoliday) {
                // Clocked in on weekend or holiday -> Piket / Penugasan Khusus
                piket++;
              } else {
                // Regular working day: check late & early
                if (hasMasuk) {
                  const masukSec = parseTimeToSeconds(att.waktu_masuk);
                  if (masukSec !== null && masukSec > cal.masukSec) {
                    keterlambatan++;
                  }
                }
                if (hasPulang) {
                  const pulangSec = parseTimeToSeconds(att.waktu_keluar);
                  if (pulangSec !== null && pulangSec < cal.pulangSec) {
                    mendahului++;
                  }
                }
              }
            } else if (!cal.isWeekend && !cal.isHoliday && permit) {
              // Not fingerprinted, but has approved permit on active workday
              if (permit.jenis === 'dinas_luar') {
                dinasLuar++;
              } else if (permit.jenis === 'sakit') {
                sakit++;
              } else {
                izinCuti++;
              }
            }
          });

          const totalIzinSah = dinasLuar + sakit + izinCuti;
          // Kehadiran efektif = hadir fisik + dinas luar + sakit sah + izin sah
          const totalAkuntabilitas = kehadiran + totalIzinSah;
          const persen = effectiveWorkingDays > 0
            ? Math.min(100, Math.round((totalAkuntabilitas / effectiveWorkingDays) * 100))
            : 0;

          rows.push({
            no: index + 1,
            nip: emp.nip,
            nama: emp.nama || emp.nip,
            unit_kerja: emp.unit_kerja || 'Sekretariat Daerah',
            jabatan: emp.jabatan || '-',
            total_hari: daysInMonth,
            hari_kerja_efektif: effectiveWorkingDays,
            kehadiran,
            keterlambatan,
            mendahului,
            piket,
            izin_sah: totalIzinSah,
            dinas_luar: dinasLuar,
            sakit,
            izin_cuti: izinCuti,
            persen_kehadiran: persen
          });
        });

        if (!isCancelled) {
          setHariEfektifBulan(effectiveWorkingDays);
          setAvailableUnits(Array.from(unitSet).sort());
          setRecapData(rows);
          setLoading(false);
        }
      } catch (error: any) {
        console.error('Error calculating monthly recap:', error);
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    executeFetch();

    return () => {
      isCancelled = true;
    };
  }, [bulan, tahun, refreshTrigger]);

  const handleRefresh = () => {
    setLoading(true);
    setRefreshTrigger(prev => prev + 1);
  };

  // Filter & Search
  const filteredData = useMemo(() => {
    return recapData.filter(row => {
      const matchSearch =
        searchQuery.trim() === '' ||
        row.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.nip.includes(searchQuery.trim());

      const matchUnit =
        unitKerjaFilter === 'all' ||
        row.unit_kerja.toLowerCase() === unitKerjaFilter.toLowerCase();

      return matchSearch && matchUnit;
    });
  }, [recapData, searchQuery, unitKerjaFilter]);

  // Sorting
  const sortedData = useMemo(() => {
    const data = [...filteredData];
    data.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (typeof aVal === 'string') {
        return sortOrder === 'asc'
          ? (aVal as string).localeCompare(bVal as string, 'id')
          : (bVal as string).localeCompare(aVal as string, 'id');
      }

      if (typeof aVal === 'number') {
        return sortOrder === 'asc'
          ? (aVal as number) - (bVal as number)
          : (bVal as number) - (aVal as number);
      }

      return 0;
    });
    return data;
  }, [filteredData, sortField, sortOrder]);

  const handleSort = (field: keyof EmployeeRecapRow) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // KPI Summary Aggregates
  const stats = useMemo(() => {
    const totalPegawai = filteredData.length;
    const totalKehadiran = filteredData.reduce((acc, curr) => acc + curr.kehadiran, 0);
    const totalIzinSah = filteredData.reduce((acc, curr) => acc + curr.izin_sah, 0);
    const totalDL = filteredData.reduce((acc, curr) => acc + curr.dinas_luar, 0);
    const totalSakit = filteredData.reduce((acc, curr) => acc + curr.sakit, 0);
    const totalIzinCuti = filteredData.reduce((acc, curr) => acc + curr.izin_cuti, 0);
    const totalTerlambat = filteredData.reduce((acc, curr) => acc + curr.keterlambatan, 0);
    const totalMendahului = filteredData.reduce((acc, curr) => acc + curr.mendahului, 0);
    const totalPiket = filteredData.reduce((acc, curr) => acc + curr.piket, 0);
    const avgPersen = totalPegawai > 0
      ? Math.round(filteredData.reduce((acc, curr) => acc + curr.persen_kehadiran, 0) / totalPegawai)
      : 0;

    return {
      totalPegawai,
      totalKehadiran,
      totalIzinSah,
      totalDL,
      totalSakit,
      totalIzinCuti,
      totalTerlambat,
      totalMendahului,
      totalPiket,
      avgPersen
    };
  }, [filteredData]);

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    if (filteredData.length === 0) {
      alert('Tidak ada data kehadiran pegawai untuk diekspor pada periode ini.');
      return;
    }

    const namaBulanStr = NAMA_BULAN[bulan - 1];
    const timestampStr = new Date().toLocaleString('id-ID', {
      dateStyle: 'long',
      timeStyle: 'short'
    });

    // Structure rows with Government Header
    const exportRows: any[] = [];

    // Title Section
    exportRows.push(['PEMERINTAH KABUPATEN DEMAK']);
    exportRows.push(['SEKRETARIAT DAERAH']);
    exportRows.push(['REKAPITULASI KEHADIRAN PEGAWAI PPPK PARUH WAKTU']);
    exportRows.push([`PERIODE : BULAN ${namaBulanStr.toUpperCase()} TAHUN ${tahun}`]);
    exportRows.push([`Total Hari Kalender: ${totalHariBulan} Hari | Hari Kerja Efektif: ${hariEfektifBulan} Hari`]);
    exportRows.push([`Tanggal Unduh: ${timestampStr}`]);
    exportRows.push([]); // Empty row

    // Table Header
    exportRows.push([
      'NO',
      'NIP',
      'NAMA',
      'UNIT KERJA',
      'TOTAL HARI',
      'HARI KERJA EFEKTIF',
      'KEHADIRAN FISIK',
      'DINAS LUAR (DL)',
      'SAKIT (S)',
      'IZIN/CUTI',
      'TOTAL SAH',
      'KETERLAMBATAN',
      'MENDAHULUI',
      'PIKET',
      '% AKUNTABILITAS'
    ]);

    // Data Rows
    filteredData.forEach((row, idx) => {
      exportRows.push([
        idx + 1,
        row.nip,
        row.nama,
        row.unit_kerja,
        row.total_hari,
        row.hari_kerja_efektif,
        row.kehadiran,
        row.dinas_luar,
        row.sakit,
        row.izin_cuti,
        row.kehadiran + row.izin_sah,
        row.keterlambatan,
        row.mendahului,
        row.piket,
        `${row.persen_kehadiran}%`
      ]);
    });

    // Summary Footer Row
    exportRows.push([]);
    exportRows.push([
      '',
      '',
      'TOTAL KESELURUHAN',
      '',
      '',
      '',
      stats.totalKehadiran,
      stats.totalDL,
      stats.totalSakit,
      stats.totalIzinCuti,
      stats.totalKehadiran + stats.totalIzinSah,
      stats.totalTerlambat,
      stats.totalMendahului,
      stats.totalPiket,
      `Rata-rata: ${stats.avgPersen}%`
    ]);

    const worksheet = xlsx.utils.aoa_to_sheet(exportRows);

    // Column widths
    worksheet['!cols'] = [
      { wch: 6 },  // NO
      { wch: 24 }, // NIP
      { wch: 34 }, // NAMA
      { wch: 28 }, // UNIT KERJA
      { wch: 14 }, // TOTAL HARI
      { wch: 20 }, // HARI KERJA EFEKTIF
      { wch: 16 }, // KEHADIRAN FISIK
      { wch: 16 }, // DINAS LUAR (DL)
      { wch: 12 }, // SAKIT (S)
      { wch: 12 }, // IZIN/CUTI
      { wch: 14 }, // TOTAL SAH
      { wch: 16 }, // KETERLAMBATAN
      { wch: 15 }, // MENDAHULUI
      { wch: 12 }, // PIKET
      { wch: 16 }  // % AKUNTABILITAS
    ];

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, `Rekap_${namaBulanStr}_${tahun}`);

    const fileName = `Rekap_Kehadiran_PPPK_Setda_${namaBulanStr}_${tahun}.xlsx`;
    xlsx.writeFile(workbook, fileName);
  };

  // Open Detailed Logs for a Specific Employee
  const handleOpenDetailModal = async (emp: EmployeeRecapRow) => {
    setSelectedEmployee(emp);
    setLoadingModalLogs(true);
    setEmployeeDailyLogs([]);

    try {
      const prefix = `${tahun}-${String(bulan).padStart(2, '0')}`;
      const daysInMonth = new Date(tahun, bulan, 0).getDate();
      const startDate = `${prefix}-01`;
      const endDate = `${prefix}-${String(daysInMonth).padStart(2, '0')}`;

      // Fetch Work Hours Settings
      let defaultMasukSec = 7 * 3600 + 30 * 60;
      let defaultPulangSec = 16 * 3600;
      let defaultPulangJumatSec = 15 * 3600;
      let schedulesList: any[] = [];

      try {
        const whSnap = await getDoc(doc(db, 'settings', 'work_hours'));
        if (whSnap.exists()) {
          const d = whSnap.data();
          if (Array.isArray(d.schedules)) {
            schedulesList = d.schedules;
            const active = d.schedules.find((s: any) => s.is_active) || d.schedules[0];
            if (active) {
              defaultMasukSec = parseTimeToSeconds(active.jam_masuk) ?? defaultMasukSec;
              defaultPulangSec = parseTimeToSeconds(active.jam_pulang) ?? defaultPulangSec;
              defaultPulangJumatSec = parseTimeToSeconds(active.jam_pulang_jumat) ?? defaultPulangJumatSec;
            }
          }
        }
      } catch (_) {}

      // Fetch Holidays
      const holidaysMap: Record<string, string> = {};
      try {
        const holSnap = await getDocs(collection(db, 'holidays'));
        holSnap.forEach(d => {
          const data = d.data();
          if (data.tanggal && data.tanggal.startsWith(prefix)) {
            holidaysMap[data.tanggal] = data.nama || 'Hari Libur';
          }
        });
      } catch (_) {}

      // Fetch Attendances for this Employee
      const qAtt = query(
        collection(db, 'attendances'),
        where('nip', '==', emp.nip),
        where('tanggal', '>=', startDate),
        where('tanggal', '<=', endDate)
      );
      const attSnap = await getDocs(qAtt);
      const attMap: Record<string, any> = {};
      attSnap.forEach(d => {
        const data = d.data();
        if (data.tanggal) attMap[data.tanggal] = data;
      });

      // Fetch Permits for this Employee
      const permitMap: Record<string, PermitItem> = {};
      try {
        const qPerm = query(
          collection(db, 'permits'),
          where('nip', '==', emp.nip),
          where('status', '==', 'approved')
        );
        const pSnap = await getDocs(qPerm);
        pSnap.forEach(d => {
          const p = { id: d.id, ...(d.data() as Omit<PermitItem, 'id'>) };
          if (p.tanggal_mulai && p.tanggal_selesai) {
            const sDate = new Date(p.tanggal_mulai);
            const eDate = new Date(p.tanggal_selesai);
            for (let dt = new Date(sDate); dt <= eDate; dt.setDate(dt.getDate() + 1)) {
              const dtISO = dt.toISOString().split('T')[0];
              if (dtISO >= startDate && dtISO <= endDate) {
                permitMap[dtISO] = p;
              }
            }
          }
        });
      } catch (_) {}

      // Build daily records
      const logs: DailyLogItem[] = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const dayStr = String(day).padStart(2, '0');
        const dateStr = `${prefix}-${dayStr}`;
        const dateObj = new Date(tahun, bulan - 1, day);
        const dayIdx = dateObj.getDay();
        const hari = HARI_NAMES[dayIdx];
        const isWeekend = dayIdx === 0 || dayIdx === 6;
        const isFriday = dayIdx === 5;
        const holidayName = holidaysMap[dateStr];
        const isHoliday = !!holidayName;
        const dayPermit = permitMap[dateStr];

        let dayMasukSec = defaultMasukSec;
        let dayPulangSec = isFriday ? defaultPulangJumatSec : defaultPulangSec;
        if (Array.isArray(schedulesList)) {
          const matched = schedulesList.find((s: any) =>
            s.is_date_range && s.start_date && s.end_date && dateStr >= s.start_date && dateStr <= s.end_date
          );
          if (matched) {
            dayMasukSec = parseTimeToSeconds(matched.jam_masuk) ?? dayMasukSec;
            dayPulangSec = parseTimeToSeconds(isFriday ? matched.jam_pulang_jumat : matched.jam_pulang) ?? dayPulangSec;
          }
        }

        const att = attMap[dateStr];
        const waktu_masuk = att?.waktu_masuk && att.waktu_masuk !== '--:--' ? att.waktu_masuk : '-';
        const waktu_keluar = att?.waktu_keluar && att.waktu_keluar !== '--:--' ? att.waktu_keluar : '-';
        const hasFinger = waktu_masuk !== '-' || waktu_keluar !== '-';

        let isLate = false;
        let isEarly = false;
        let isPiket = false;
        let catatan = '-';

        if (hasFinger) {
          if (isWeekend || isHoliday) {
            isPiket = true;
            catatan = isHoliday ? `Piket (${holidayName})` : 'Piket Akhir Pekan';
          } else {
            catatan = 'Hadir Lengkap';
            if (waktu_masuk !== '-') {
              const masukSec = parseTimeToSeconds(waktu_masuk);
              if (masukSec !== null && masukSec > dayMasukSec) {
                isLate = true;
              }
            }
            if (waktu_keluar !== '-') {
              const pulangSec = parseTimeToSeconds(waktu_keluar);
              if (pulangSec !== null && pulangSec < dayPulangSec) {
                isEarly = true;
              }
            }
          }
        } else if (!isWeekend && !isHoliday && dayPermit) {
          const typeLabel = PERMIT_TYPES[dayPermit.jenis]?.label || dayPermit.jenis;
          catatan = `${typeLabel}: ${dayPermit.keterangan || (dayPermit.nomor_surat ? `No. ${dayPermit.nomor_surat}` : 'Sah')}`;
        } else {
          if (isHoliday) {
            catatan = holidayName;
          } else if (isWeekend) {
            catatan = 'Libur Akhir Pekan';
          } else {
            catatan = 'Tidak Ada Data Absensi';
          }
        }

        logs.push({
          tanggal: `${dayStr}/${String(bulan).padStart(2, '0')}/${tahun}`,
          hari,
          isWeekend,
          isHoliday,
          holidayName,
          waktu_masuk,
          waktu_keluar,
          isLate,
          isEarly,
          isPiket,
          catatan,
          permit: dayPermit
        });
      }

      setEmployeeDailyLogs(logs);
    } catch (err) {
      console.error('Error fetching employee daily log:', err);
    } finally {
      setLoadingModalLogs(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Rekap Kehadiran Seluruh Pegawai
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Sekretariat Daerah Kabupaten Demak • Portal PPPK Paruh Waktu
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            title="Muat ulang data terbaru"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            <span>Segarkan</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={loading || filteredData.length === 0}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Filter & Selector Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3 items-end">
          {/* Bulan */}
          <div className="md:col-span-3">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Bulan
            </label>
            <div className="relative">
              <select
                value={bulan}
                onChange={e => {
                  setLoading(true);
                  setBulan(Number(e.target.value));
                }}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 hover:bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
              >
                {NAMA_BULAN.map((nama, idx) => (
                  <option key={idx + 1} value={idx + 1}>
                    {idx + 1} - {nama}
                  </option>
                ))}
              </select>
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Tahun */}
          <div className="md:col-span-2">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Tahun
            </label>
            <select
              value={tahun}
              onChange={e => {
                setLoading(true);
                setTahun(Number(e.target.value));
              }}
              className="w-full px-3 py-2 bg-slate-50 hover:bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
            >
              {[2024, 2025, 2026, 2027, 2028].map(yr => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          {/* Bagian / Unit Kerja */}
          <div className="md:col-span-3">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Unit Kerja / Bagian
            </label>
            <div className="relative">
              <select
                value={unitKerjaFilter}
                onChange={e => setUnitKerjaFilter(e.target.value)}
                className="w-full pl-8 pr-4 py-2 bg-slate-50 hover:bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer truncate"
              >
                <option value="all">Semua Bagian / Unit Kerja</option>
                {availableUnits.map(unit => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
              <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            </div>
          </div>

          {/* Search Box */}
          <div className="md:col-span-4">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Pencarian Pegawai
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Ketik nama atau NIP pegawai..."
                className="w-full pl-8 pr-8 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Informative Ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">
              Periode Terpilih:
            </span>
            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-semibold border border-blue-100">
              {NAMA_BULAN[bulan - 1]} {tahun}
            </span>
            <span className="text-slate-400">•</span>
            <span>
              Total Hari: <strong className="text-slate-800">{totalHariBulan}</strong> hari
            </span>
            <span className="text-slate-400">•</span>
            <span>
              Hari Kerja Efektif: <strong className="text-emerald-700 font-bold">{hariEfektifBulan}</strong> hari
            </span>
          </div>
          <div className="text-[11px] text-slate-400">
            Menampilkan <strong>{filteredData.length}</strong> dari {recapData.length} pegawai
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Pegawai</span>
            <Users className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="text-xl font-bold text-slate-900">{stats.totalPegawai}</div>
          <span className="text-[9px] text-slate-400 mt-0.5">Terdaftar</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Hari Efektif</span>
            <Calendar className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-emerald-700">{hariEfektifBulan}</div>
          <span className="text-[9px] text-slate-400 mt-0.5">Dari {totalHariBulan} hr</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Hadir Fisik</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-slate-900">{stats.totalKehadiran}</div>
          <span className="text-[9px] text-slate-400 mt-0.5">Finger scan</span>
        </div>

        <div className="bg-white rounded-xl border border-indigo-100 bg-indigo-50/20 p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-indigo-500 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Dinas Luar</span>
            <Building2 className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="text-xl font-bold text-indigo-700">{stats.totalDL}</div>
          <span className="text-[9px] text-indigo-600/80 mt-0.5">SPT Resmi</span>
        </div>

        <div className="bg-white rounded-xl border border-rose-100 bg-rose-50/20 p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-rose-500 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Sakit / Izin</span>
            <FileText className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div className="text-xl font-bold text-rose-700">{stats.totalSakit + stats.totalIzinCuti}</div>
          <span className="text-[9px] text-rose-600/80 mt-0.5">SKD &amp; Izin sah</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Terlambat</span>
            <Clock className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className={`text-xl font-bold ${stats.totalTerlambat > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
            {stats.totalTerlambat}
          </div>
          <span className="text-[9px] text-slate-400 mt-0.5">Kasus telat</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Mendahului</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div className={`text-xl font-bold ${stats.totalMendahului > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
            {stats.totalMendahului}
          </div>
          <span className="text-[9px] text-slate-400 mt-0.5">Pulang cepat</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Piket Libur</span>
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="text-xl font-bold text-indigo-700">{stats.totalPiket}</div>
          <span className="text-[9px] text-slate-400 mt-0.5">Weekend/libur</span>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3 text-slate-400">
            <RefreshCw className="w-7 h-7 animate-spin text-blue-600" />
            <p className="text-xs font-semibold text-slate-600">
              Menghitung rekapitulasi kehadiran seluruh pegawai bulan {NAMA_BULAN[bulan - 1]} {tahun}...
            </p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              Tidak Ada Data yang Sesuai Filter
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Belum ada data pegawai atau data absensi yang tersimpan untuk kriteria pencarian ini.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider select-none">
                  <th className="py-3.5 px-3 text-center w-12 border-r border-slate-200/60">
                    NO
                  </th>
                  <th
                    onClick={() => handleSort('nip')}
                    className="py-3.5 px-4 cursor-pointer hover:text-blue-600 transition-colors border-r border-slate-200/60"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>NIP</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('nama')}
                    className="py-3.5 px-4 cursor-pointer hover:text-blue-600 transition-colors border-r border-slate-200/60"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>NAMA</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3.5 px-3 text-center border-r border-slate-200/60">
                    HARI EFEKTIF
                  </th>
                  <th
                    onClick={() => handleSort('kehadiran')}
                    className="py-3.5 px-3 text-center cursor-pointer hover:text-blue-600 transition-colors border-r border-slate-200/60"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>HADIR FISIK</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('izin_sah')}
                    className="py-3.5 px-3 text-center cursor-pointer hover:text-blue-600 transition-colors border-r border-slate-200/60"
                    title="Dinas Luar, Sakit (SKD), Izin/Cuti Sah"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>IZIN SAH</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('persen_kehadiran')}
                    className="py-3.5 px-3 text-center cursor-pointer hover:text-blue-600 transition-colors border-r border-slate-200/60"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>% AKUNTABILITAS</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('keterlambatan')}
                    className="py-3.5 px-3 text-center cursor-pointer hover:text-blue-600 transition-colors border-r border-slate-200/60"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>TERLAMBAT</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('mendahului')}
                    className="py-3.5 px-3 text-center cursor-pointer hover:text-blue-600 transition-colors border-r border-slate-200/60"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>MENDAHULUI</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('piket')}
                    className="py-3.5 px-3 text-center cursor-pointer hover:text-blue-600 transition-colors border-r border-slate-200/60"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>PIKET</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="py-3.5 px-3 text-center w-24">
                    AKSI
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-normal">
                {sortedData.map((row, index) => (
                  <tr
                    key={row.nip}
                    className="hover:bg-blue-50/40 transition-colors group"
                  >
                    {/* NO */}
                    <td className="py-3.5 px-3 text-center font-semibold text-slate-400 border-r border-slate-100">
                      {index + 1}
                    </td>

                    {/* NIP */}
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-700 border-r border-slate-100 whitespace-nowrap">
                      {row.nip}
                    </td>

                    {/* NAMA */}
                    <td className="py-3.5 px-4 border-r border-slate-100">
                      <div className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                        {row.nama}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <span>{row.unit_kerja}</span>
                        {row.jabatan && row.jabatan !== '-' && (
                          <>
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-400">{row.jabatan}</span>
                          </>
                        )}
                      </div>
                    </td>

                    {/* HARI KERJA EFEKTIF */}
                    <td className="py-3.5 px-3 text-center font-mono font-semibold text-slate-700 border-r border-slate-100">
                      {row.hari_kerja_efektif}
                    </td>

                    {/* HADIR FISIK */}
                    <td className="py-3.5 px-3 text-center border-r border-slate-100 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold text-xs bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                        <span>{row.kehadiran}</span>
                        <span className="text-[10px] text-emerald-600 font-normal">hari</span>
                      </div>
                    </td>

                    {/* IZIN SAH (DL, S, I) */}
                    <td className="py-3.5 px-3 text-center border-r border-slate-100 whitespace-nowrap">
                      {row.izin_sah > 0 ? (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          <span>{row.izin_sah} hr</span>
                          <span className="text-[10px] text-indigo-500 font-normal">
                            ({row.dinas_luar > 0 ? `DL:${row.dinas_luar} ` : ''}{row.sakit > 0 ? `S:${row.sakit} ` : ''}{row.izin_cuti > 0 ? `I:${row.izin_cuti}` : ''})
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-300 font-mono">-</span>
                      )}
                    </td>

                    {/* % AKUNTABILITAS */}
                    <td className="py-3.5 px-3 text-center border-r border-slate-100 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                        row.persen_kehadiran >= 90
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : row.persen_kehadiran >= 75
                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}>
                        {row.persen_kehadiran}%
                      </span>
                    </td>

                    {/* KETERLAMBATAN */}
                    <td className="py-3.5 px-3 text-center border-r border-slate-100 whitespace-nowrap">
                      {row.keterlambatan > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          {row.keterlambatan} kali
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">0</span>
                      )}
                    </td>

                    {/* MENDAHULUI */}
                    <td className="py-3.5 px-3 text-center border-r border-slate-100 whitespace-nowrap">
                      {row.mendahului > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          {row.mendahului} kali
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono">0</span>
                      )}
                    </td>

                    {/* PIKET */}
                    <td className="py-3.5 px-3 text-center border-r border-slate-100 whitespace-nowrap">
                      {row.piket > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {row.piket} hari
                        </span>
                      ) : (
                        <span className="text-slate-300 font-mono">-</span>
                      )}
                    </td>

                    {/* AKSI */}
                    <td className="py-3.5 px-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => handleOpenDetailModal(row)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:text-white bg-blue-50 hover:bg-blue-600 border border-blue-200 hover:border-blue-600 rounded-md transition-all inline-flex items-center gap-1 cursor-pointer"
                        title="Lihat Log Kehadiran Harian"
                      >
                        <span>Detail</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Aggregation Footer */}
              <tfoot>
                <tr className="bg-slate-50/90 border-t-2 border-slate-300 font-bold text-xs text-slate-800">
                  <td colSpan={3} className="py-4 px-4 text-right uppercase tracking-wider text-[11px] border-r border-slate-200">
                    TOTAL KESELURUHAN ({filteredData.length} Pegawai) :
                  </td>
                  <td className="py-4 px-3 text-center font-mono text-emerald-800 border-r border-slate-200">
                    {hariEfektifBulan}
                  </td>
                  <td className="py-4 px-3 text-center font-mono text-blue-800 border-r border-slate-200">
                    {stats.totalKehadiran}
                  </td>
                  <td className="py-4 px-3 text-center font-mono text-indigo-700 border-r border-slate-200">
                    {stats.totalIzinSah}
                  </td>
                  <td className="py-4 px-3 text-center font-mono text-emerald-800 border-r border-slate-200">
                    {stats.avgPersen}%
                  </td>
                  <td className="py-4 px-3 text-center font-mono text-amber-700 border-r border-slate-200">
                    {stats.totalTerlambat}
                  </td>
                  <td className="py-4 px-3 text-center font-mono text-rose-700 border-r border-slate-200">
                    {stats.totalMendahului}
                  </td>
                  <td className="py-4 px-3 text-center font-mono text-indigo-700 border-r border-slate-200">
                    {stats.totalPiket}
                  </td>
                  <td className="py-4 px-3 text-center">
                    -
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Helpful Technical / Government Notes */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 text-xs text-slate-600 space-y-2">
        <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wider">
          <Info className="w-4 h-4 text-blue-600" />
          Keterangan Perhitungan Kolom Rekapitulasi:
        </h4>
        <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
          <li>
            <strong className="text-slate-800">TOTAL HARI:</strong> Jumlah seluruh hari kalender dalam bulan terpilih ({totalHariBulan} hari).
          </li>
          <li>
            <strong className="text-slate-800">HARI KERJA EFEKTIF:</strong> Jumlah hari kerja resmi yang wajib masuk, dihitung dari total hari kalender dikurangi hari Sabtu, Minggu, serta Libur Nasional &amp; Cuti Bersama resmi SKB ({hariEfektifBulan} hari).
          </li>
          <li>
            <strong className="text-slate-800">KEHADIRAN:</strong> Total hari di mana pegawai melakukan absensi / ketukan fingerprint pada mesin.
          </li>
          <li>
            <strong className="text-slate-800">KETERLAMBATAN:</strong> Frekuensi pegawai melakukan scan masuk melebihi batas jam kerja masuk resmi (misal &gt; 07:30 atau batas toleransi kedinasan).
          </li>
          <li>
            <strong className="text-slate-800">MENDAHULUI:</strong> Frekuensi pegawai melakukan scan pulang sebelum jam operasional kantor berakhir (misal &lt; 16:00 atau Jumat &lt; 15:00).
          </li>
          <li>
            <strong className="text-slate-800">PIKET:</strong> Jumlah kehadiran pegawai yang masuk bertugas pada hari libur akhir pekan (Sabtu/Minggu) maupun hari libur nasional resmi (misal petugas pengamanan atau shift dinas).
          </li>
        </ul>
      </div>

      {/* Modal Detail Log Harian Pegawai */}
      {selectedEmployee && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                  {selectedEmployee.nama.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white tracking-tight">
                    Rincian Kehadiran: {selectedEmployee.nama}
                  </h3>
                  <p className="text-xs text-slate-300 font-mono mt-0.5">
                    NIP: {selectedEmployee.nip} • {selectedEmployee.unit_kerja}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmployee(null)}
                className="text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                aria-label="Tutup modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Summary Ribbon */}
            <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
              <div className="flex items-center gap-4">
                <span>
                  Periode: <strong>{NAMA_BULAN[bulan - 1]} {tahun}</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span>
                  Kehadiran: <strong className="text-emerald-700">{selectedEmployee.kehadiran} Hari</strong> ({selectedEmployee.persen_kehadiran}%)
                </span>
                <span className="text-slate-300">|</span>
                <span>
                  Terlambat: <strong className={selectedEmployee.keterlambatan > 0 ? 'text-amber-600' : 'text-slate-700'}>{selectedEmployee.keterlambatan}x</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span>
                  Mendahului: <strong className={selectedEmployee.mendahului > 0 ? 'text-rose-600' : 'text-slate-700'}>{selectedEmployee.mendahului}x</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span>
                  Piket: <strong className="text-indigo-700">{selectedEmployee.piket} Hari</strong>
                </span>
              </div>

              <Link
                href={`/?nip=${selectedEmployee.nip}&bulan=${bulan}&tahun=${tahun}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
              >
                <span>Buka Lembar Rekap Lengkap</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            {/* Modal Body: Scrollable Log Table */}
            <div className="p-6 overflow-y-auto overscroll-contain flex-1">
              {loadingModalLogs ? (
                <div className="p-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                  <span className="text-xs">Memuat log tanggal...</span>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase">
                        <th className="py-2.5 px-3">Tanggal</th>
                        <th className="py-2.5 px-3">Hari</th>
                        <th className="py-2.5 px-3 text-center">Scan Masuk</th>
                        <th className="py-2.5 px-3 text-center">Scan Pulang</th>
                        <th className="py-2.5 px-3">Status / Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {employeeDailyLogs.map((log, idx) => {
                        const isHighlightRed = log.isWeekend || log.isHoliday;
                        return (
                          <tr
                            key={idx}
                            className={`transition-colors ${
                              isHighlightRed ? 'bg-rose-50/30' : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-2 px-3 font-mono font-medium text-slate-700">
                              {log.tanggal}
                            </td>
                            <td className="py-2 px-3 font-medium text-slate-600">
                              {log.hari}
                            </td>
                            <td className="py-2 px-3 text-center font-mono">
                              {log.waktu_masuk !== '-' ? (
                                <span className={`font-semibold ${log.isLate ? 'text-amber-600 underline decoration-amber-300' : 'text-emerald-700'}`}>
                                  {log.waktu_masuk}
                                </span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center font-mono">
                              {log.waktu_keluar !== '-' ? (
                                <span className={`font-semibold ${log.isEarly ? 'text-rose-600 underline decoration-rose-300' : 'text-blue-700'}`}>
                                  {log.waktu_keluar}
                                </span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {log.isPiket && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                                    Piket Libur
                                  </span>
                                )}
                                {log.isLate && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                    Terlambat
                                  </span>
                                )}
                                {log.isEarly && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                                    Mendahului
                                  </span>
                                )}
                                {log.permit && (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${PERMIT_TYPES[log.permit.jenis]?.badgeClass || 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                      {PERMIT_TYPES[log.permit.jenis]?.shortCode || 'IZIN'}: {PERMIT_TYPES[log.permit.jenis]?.label}
                                    </span>
                                    {log.permit.is_susulan && (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                        Susulan {log.permit.selisih_hari_susulan ? `(+${log.permit.selisih_hari_susulan} hari)` : ''}
                                      </span>
                                    )}
                                    {log.permit.nomor_surat && (
                                      <span className="text-[10px] text-slate-500 font-mono">
                                        [{log.permit.nomor_surat}]
                                      </span>
                                    )}
                                  </div>
                                )}
                                <span className="text-slate-600 text-[11px]">
                                  {log.catatan}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setSelectedEmployee(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
