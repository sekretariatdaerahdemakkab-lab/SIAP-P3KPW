'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import * as xlsx from 'xlsx';
import {
  Calendar,
  Clock,
  Search,
  Download,
  Printer,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  CalendarDays,
  FileSpreadsheet,
  Info,
  ChevronDown,
  X,
  Check,
  UserX,
  RefreshCw,
  Moon
} from 'lucide-react';

interface HolidayItem {
  tanggal: string; // YYYY-MM-DD
  nama: string;
  jenis: 'libur_nasional' | 'cuti_bersama';
  keterangan?: string;
}

interface EmployeeInfo {
  nip: string;
  nama: string;
  jabatan?: string;
  unit_kerja?: string;
}

interface ActiveWorkHours {
  jam_masuk: string;
  jam_pulang: string;
  jam_pulang_jumat: string;
  toleransi_menit: number;
  profile_name?: string;
}

const extractActiveWorkHours = (d: any): ActiveWorkHours => {
  if (!d) {
    return {
      jam_masuk: '07:30',
      jam_pulang: '16:00',
      jam_pulang_jumat: '15:00',
      toleransi_menit: 0,
      profile_name: 'Jam Kerja Reguler'
    };
  }
  const activeSchedule = Array.isArray(d.schedules)
    ? (d.schedules.find((s: any) => s.is_active) || d.schedules.find((s: any) => s.id === d.active_id) || d.schedules[0])
    : null;

  return {
    jam_masuk: activeSchedule?.jam_masuk || d.jam_masuk || '07:30',
    jam_pulang: activeSchedule?.jam_pulang || d.jam_pulang || '16:00',
    jam_pulang_jumat: activeSchedule?.jam_pulang_jumat || d.jam_pulang_jumat || '15:00',
    toleransi_menit: activeSchedule?.toleransi_menit !== undefined 
      ? Number(activeSchedule.toleransi_menit) 
      : (d.toleransi_menit !== undefined ? Number(d.toleransi_menit) : 0),
    profile_name: activeSchedule?.nama || d.profile_name || 'Jam Kerja Reguler'
  };
};

interface CalendarRecapRow {
  hari: string;
  tanggalFormat: string; // DD/MM/YYYY
  tanggalISO: string; // YYYY-MM-DD
  dayNumber: number;
  isWeekend: boolean;
  isJumat: boolean;
  holiday: HolidayItem | null;
  jamMasuk: string;
  absensiMasuk: string;
  keterlambatan: string;
  catatanMasuk: string;
  isLate: boolean;
  jamPulang: string;
  absensiPulang: string;
  mendahului: string;
  catatanPulang: string;
  isEarly: boolean;
  keterangan: string;
  totalJam: number | null;
  hasDutyAttendance: boolean; // Attendance on weekend or holiday (e.g. security guard)
  isSpecialRange?: boolean;
  specialScheduleName?: string;
}

interface SpecialRangeNotice {
  nama: string;
  startDate: string;
  endDate: string;
  dateRangeText: string;
}

export default function EmployeeFilter() {
  const [nip, setNip] = useState('');
  const [bulan, setBulan] = useState(new Date().getMonth() + 1);
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [employeeInfo, setEmployeeInfo] = useState<EmployeeInfo | null>(null);
  const [activeWorkHours, setActiveWorkHours] = useState<ActiveWorkHours>({
    jam_masuk: '07:30',
    jam_pulang: '16:00',
    jam_pulang_jumat: '15:00',
    toleransi_menit: 0,
    profile_name: 'Jam Kerja Reguler'
  });
  const [allSchedules, setAllSchedules] = useState<any[]>([]);
  const [specialScheduleNotice, setSpecialScheduleNotice] = useState<SpecialRangeNotice | null>(null);

  const [calendarRows, setCalendarRows] = useState<CalendarRecapRow[]>([]);

  // Master Employee List for Searchable Dropdown
  const [employees, setEmployees] = useState<EmployeeInfo[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [fetchEmployeesError, setFetchEmployeesError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Manual refresh handler
  const fetchEmployeesList = useCallback(async () => {
    setLoadingEmployees(true);
    setFetchEmployeesError(null);
    try {
      const snap = await getDocs(collection(db, 'employees'));
      const list: EmployeeInfo[] = snap.docs
        .map(d => {
          const data = d.data();
          const cleanNip = String(data.nip || d.id || '').trim();
          return {
            nip: cleanNip,
            nama: String(data.nama || '').trim(),
            jabatan: String(data.jabatan || '').trim(),
            unit_kerja: String(data.unit_kerja || '').trim()
          };
        })
        .filter(e => e.nip.length > 0);

      list.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
      setEmployees(list);
    } catch (err: any) {
      console.error('Gagal memuat master data pegawai untuk dropdown:', err);
      setFetchEmployeesError(err.message || 'Gagal terhubung ke database');
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  // Initial fetch on mount (Employees and Active Work Hours)
  useEffect(() => {
    let isMounted = true;

    // Fetch active work hours
    getDoc(doc(db, 'settings', 'work_hours'))
      .then(snap => {
        if (!isMounted || !snap.exists()) return;
        const d = snap.data();
        setActiveWorkHours(extractActiveWorkHours(d));
        if (Array.isArray(d.schedules)) {
          setAllSchedules(d.schedules);
        }
      })
      .catch(err => {
        console.warn('Gagal memuat pengaturan jam kerja saat awal:', err);
      });

    // Fetch master employees
    getDocs(collection(db, 'employees'))
      .then(snap => {
        if (!isMounted) return;
        const list: EmployeeInfo[] = snap.docs
          .map(d => {
            const data = d.data();
            const cleanNip = String(data.nip || d.id || '').trim();
            return {
              nip: cleanNip,
              nama: String(data.nama || '').trim(),
              jabatan: String(data.jabatan || '').trim(),
              unit_kerja: String(data.unit_kerja || '').trim()
            };
          })
          .filter(e => e.nip.length > 0);

        list.sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
        setEmployees(list);
        setLoadingEmployees(false);
      })
      .catch((err: any) => {
        if (!isMounted) return;
        console.error('Gagal memuat master data pegawai:', err);
        setFetchEmployeesError(err.message || 'Gagal terhubung ke database');
        setLoadingEmployees(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Filter employees based on search query
  const filteredEmployees = useMemo(() => {
    if (!dropdownSearch.trim()) return employees;
    const q = dropdownSearch.toLowerCase().trim();
    return employees.filter(emp =>
      emp.nama.toLowerCase().includes(q) ||
      emp.nip.toLowerCase().includes(q) ||
      (emp.unit_kerja && emp.unit_kerja.toLowerCase().includes(q)) ||
      (emp.jabatan && emp.jabatan.toLowerCase().includes(q))
    );
  }, [employees, dropdownSearch]);

  // Determine currently selected employee
  const selectedEmployee = useMemo(() => {
    if (!nip.trim()) return null;
    return employees.find(e => e.nip === nip.trim()) || null;
  }, [employees, nip]);

  const handleSelectEmployee = (emp: EmployeeInfo) => {
    setNip(emp.nip);
    setEmployeeInfo(emp);
    setIsDropdownOpen(false);
    setDropdownSearch('');
  };

  const months = [
    { value: 1, label: 'Januari' }, { value: 2, label: 'Februari' }, { value: 3, label: 'Maret' },
    { value: 4, label: 'April' }, { value: 5, label: 'Mei' }, { value: 6, label: 'Juni' },
    { value: 7, label: 'Juli' }, { value: 8, label: 'Agustus' }, { value: 9, label: 'September' },
    { value: 10, label: 'Oktober' }, { value: 11, label: 'November' }, { value: 12, label: 'Desember' }
  ];

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  // Helper: Convert "HH:mm" or "HH:mm:ss" to total seconds
  const parseTimeToSeconds = (timeStr: string | undefined): number | null => {
    if (!timeStr) return null;
    const parts = timeStr.trim().split(':');
    if (parts.length < 2) return null;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parts[2] ? parseInt(parts[2], 10) : 0;
    if (isNaN(h) || isNaN(m)) return null;
    return h * 3600 + m * 60 + s;
  };

  // Helper: Format difference in seconds into "X m Y d"
  const formatSecondsToMinSec = (sec: number): string => {
    if (sec <= 0) return '0.00';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (s === 0) return `${m} m 00 d`;
    return `${m} m ${String(s).padStart(2, '0')} d`;
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nip.trim()) {
      alert('Silakan masukkan Nomor Induk Pegawai (NIP).');
      return;
    }

    setLoading(true);
    setHasSearched(true);

    try {
      const cleanNip = nip.trim();
      const monthStr = bulan.toString().padStart(2, '0');
      const prefix = `${tahun}-${monthStr}`;
      const totalDays = new Date(tahun, bulan, 0).getDate();

      // 1. Fetch active work hours from Firestore
      let currentWH: ActiveWorkHours = activeWorkHours;
      let schedulesList: any[] = allSchedules;

      try {
        const whSnap = await getDoc(doc(db, 'settings', 'work_hours'));
        if (whSnap.exists()) {
          const d = whSnap.data();
          currentWH = extractActiveWorkHours(d);
          setActiveWorkHours(currentWH);
          if (Array.isArray(d.schedules)) {
            schedulesList = d.schedules;
            setAllSchedules(schedulesList);
          }
        }
      } catch (err) {
        console.warn('Unable to load work hours setting, using current/default:', err);
      }

      // Check if any date-range schedule applies to this month
      const monthStart = `${prefix}-01`;
      const monthEnd = `${prefix}-${String(totalDays).padStart(2, '0')}`;
      const matchingSpecial = schedulesList.find((s: any) => 
        s.is_date_range && 
        s.start_date && 
        s.end_date && 
        !(s.end_date < monthStart || s.start_date > monthEnd)
      );

      if (matchingSpecial) {
        setSpecialScheduleNotice({
          nama: matchingSpecial.nama || 'Jam Kerja Bulan Ramadhan',
          startDate: matchingSpecial.start_date,
          endDate: matchingSpecial.end_date,
          dateRangeText: `${matchingSpecial.start_date} s/d ${matchingSpecial.end_date}`
        });
      } else {
        setSpecialScheduleNotice(null);
      }

      // 2. Fetch employee profile
      try {
        const empSnap = await getDoc(doc(db, 'employees', cleanNip));
        if (empSnap.exists()) {
          const empData = empSnap.data();
          setEmployeeInfo({
            nip: cleanNip,
            nama: empData.nama || '',
            jabatan: empData.jabatan || '',
            unit_kerja: empData.unit_kerja || ''
          });
        } else {
          // Check query by field nip if doc id is different
          const qEmp = query(collection(db, 'employees'), where('nip', '==', cleanNip));
          const qSnap = await getDocs(qEmp);
          if (!qSnap.empty) {
            const empData = qSnap.docs[0].data();
            setEmployeeInfo({
              nip: cleanNip,
              nama: empData.nama || '',
              jabatan: empData.jabatan || '',
              unit_kerja: empData.unit_kerja || ''
            });
          } else {
            setEmployeeInfo({ nip: cleanNip, nama: '' });
          }
        }
      } catch (err) {
        console.warn('Could not load employee details:', err);
        setEmployeeInfo({ nip: cleanNip, nama: '' });
      }

      // 3. Fetch holidays for the selected month/year
      const holidaysMap: Record<string, HolidayItem> = {};
      try {
        const holidaySnap = await getDocs(collection(db, 'holidays'));
        holidaySnap.forEach(hDoc => {
          const hData = hDoc.data();
          if (hData.tanggal && hData.tanggal.startsWith(prefix)) {
            holidaysMap[hData.tanggal] = {
              tanggal: hData.tanggal,
              nama: hData.nama || '',
              jenis: hData.jenis === 'cuti_bersama' ? 'cuti_bersama' : 'libur_nasional',
              keterangan: hData.keterangan || ''
            };
          }
        });
      } catch (err) {
        console.warn('Could not load holidays:', err);
      }

      // 4. Fetch attendance records for this employee for the month
      const attendanceMap: Record<string, any> = {};
      try {
        const qAtt = query(
          collection(db, 'attendances'),
          where('nip', '==', cleanNip),
          where('tanggal', '>=', `${prefix}-01`),
          where('tanggal', '<=', `${prefix}-${String(totalDays).padStart(2, '0')}`)
        );

        const attSnap = await getDocs(qAtt);
        attSnap.forEach(aDoc => {
          const aData = aDoc.data();
          if (aData.tanggal) {
            attendanceMap[aData.tanggal] = aData;
          }
        });
      } catch (err) {
        console.error('Error querying attendances:', err);
      }

      // 5. Build full month calendar rows
      const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const builtRows: CalendarRecapRow[] = [];

      for (let day = 1; day <= totalDays; day++) {
        const dayStr = String(day).padStart(2, '0');
        const tanggalISO = `${prefix}-${dayStr}`;
        const tanggalFormat = `${dayStr}/${monthStr}/${tahun}`;

        const dateObj = new Date(tahun, bulan - 1, day);
        const dayIdx = dateObj.getDay();
        const hari = dayNames[dayIdx];
        const isWeekend = dayIdx === 0 || dayIdx === 6;
        const isJumat = dayIdx === 5;
        const holiday = holidaysMap[tanggalISO] || null;
        const isHolidayOrWeekend = isWeekend || !!holiday;

        // Determine effective work hours for this date (Date-range schedule overrides base schedule)
        let effectiveWH: ActiveWorkHours = currentWH;
        let isSpecialRange = false;
        let specialScheduleName = '';

        if (Array.isArray(schedulesList) && schedulesList.length > 0) {
          const matchedSchedule = schedulesList.find((s: any) => 
            s.is_date_range && 
            s.start_date && 
            s.end_date && 
            tanggalISO >= s.start_date && 
            tanggalISO <= s.end_date
          );

          if (matchedSchedule) {
            effectiveWH = {
              jam_masuk: matchedSchedule.jam_masuk || '08:00',
              jam_pulang: matchedSchedule.jam_pulang || '15:00',
              jam_pulang_jumat: matchedSchedule.jam_pulang_jumat || '14:30',
              toleransi_menit: matchedSchedule.toleransi_menit !== undefined 
                ? Number(matchedSchedule.toleransi_menit) 
                : 0,
              profile_name: matchedSchedule.nama || 'Jam Kerja Bulan Ramadhan'
            };
            isSpecialRange = true;
            specialScheduleName = matchedSchedule.nama || 'Ramadhan';
          }
        }

        // Schedule times
        const scheduledJamMasuk = effectiveWH.jam_masuk;
        const scheduledJamPulang = isJumat ? effectiveWH.jam_pulang_jumat : effectiveWH.jam_pulang;
        const scheduleMasukSec = parseTimeToSeconds(scheduledJamMasuk) ?? (7 * 3600 + 30 * 60);
        const schedulePulangSec = parseTimeToSeconds(scheduledJamPulang) ?? (isJumat ? 15 * 3600 : 16 * 3600);

        // Check attendance record
        const att = attendanceMap[tanggalISO];
        const hasMasuk = !!att?.waktu_masuk && att.waktu_masuk.trim() !== '' && att.waktu_masuk !== '--:--';
        const hasPulang = !!att?.waktu_keluar && att.waktu_keluar.trim() !== '' && att.waktu_keluar !== '--:--';
        const hasAnyAttendance = hasMasuk || hasPulang;
        const hasDutyAttendance = isHolidayOrWeekend && hasAnyAttendance;

        // --- Column calculations according to exact user specifications ---
        // 1. Jam Masuk
        let displayJamMasuk = scheduledJamMasuk;
        if (isWeekend || holiday) {
          displayJamMasuk = hasMasuk ? scheduledJamMasuk : '-';
        }

        // 2. Absensi Masuk
        const displayAbsensiMasuk = hasMasuk ? att.waktu_masuk : '-';

        // 3. Keterlambatan & 4. Catatan Masuk
        let keterlambatan = '-.--';
        let catatanMasuk = 'Tidak finger masuk';
        let isLate = false;

        if (hasMasuk) {
          const fingerMasukSec = parseTimeToSeconds(att.waktu_masuk);
          if (fingerMasukSec !== null) {
            if (fingerMasukSec <= scheduleMasukSec) {
              keterlambatan = '0.00';
              catatanMasuk = 'Tepat Waktu';
            } else {
              const diffSec = fingerMasukSec - scheduleMasukSec;
              keterlambatan = formatSecondsToMinSec(diffSec);
              catatanMasuk = 'Terlambat';
              isLate = true;
            }
          }
        } else {
          // No finger masuk
          if (isHolidayOrWeekend) {
            keterlambatan = '-.--';
            catatanMasuk = holiday ? (holiday.jenis === 'cuti_bersama' ? 'Cuti Bersama' : 'Libur Nasional') : 'Libur Akhir Pekan';
          } else {
            keterlambatan = '-.--';
            catatanMasuk = 'Tidak finger masuk';
          }
        }

        // 5. Jam Pulang
        let displayJamPulang = scheduledJamPulang;
        if (isWeekend || holiday) {
          displayJamPulang = hasPulang ? scheduledJamPulang : '-';
        }

        // 6. Absensi Pulang
        const displayAbsensiPulang = hasPulang ? att.waktu_keluar : '-';

        // 7. Mendahului & 8. Catatan Pulang
        let mendahului = '-.--';
        let catatanPulang = 'Tidak finger pulang';
        let isEarly = false;

        if (hasPulang) {
          const fingerPulangSec = parseTimeToSeconds(att.waktu_keluar);
          if (fingerPulangSec !== null) {
            if (fingerPulangSec < schedulePulangSec) {
              const diffSec = schedulePulangSec - fingerPulangSec;
              mendahului = formatSecondsToMinSec(diffSec);
              catatanPulang = 'Mendahului';
              isEarly = true;
            } else {
              mendahului = '0.00';
              catatanPulang = 'Sesuai Jam Pulang';
            }
          }
        } else {
          // No finger pulang
          if (isHolidayOrWeekend) {
            mendahului = '-.--';
            catatanPulang = holiday ? (holiday.jenis === 'cuti_bersama' ? 'Cuti Bersama' : 'Libur Nasional') : 'Libur Akhir Pekan';
          } else {
            mendahului = '-.--';
            catatanPulang = 'Tidak finger pulang';
          }
        }

        // 9. Keterangan
        let keterangan = '-';
        if (holiday) {
          const prefixLabel = holiday.jenis === 'cuti_bersama' ? 'Cuti Bersama' : 'Libur Nasional';
          keterangan = `${prefixLabel}: ${holiday.nama}`;
          if (hasDutyAttendance) {
            keterangan += ' (Petugas Keamanan / Piket Hadir)';
          }
        } else if (isWeekend) {
          keterangan = `Libur Akhir Pekan (${hari})`;
          if (hasDutyAttendance) {
            keterangan += ' (Petugas Keamanan / Piket Hadir)';
          }
        } else {
          if (hasMasuk && hasPulang) {
            keterangan = 'Hadir Lengkap';
          } else if (hasMasuk || hasPulang) {
            keterangan = 'Absensi Tidak Lengkap';
          } else {
            keterangan = 'Tidak Hadir';
          }
        }

        builtRows.push({
          hari,
          tanggalFormat,
          tanggalISO,
          dayNumber: day,
          isWeekend,
          isJumat,
          holiday,
          jamMasuk: displayJamMasuk,
          absensiMasuk: displayAbsensiMasuk,
          keterlambatan,
          catatanMasuk,
          isLate,
          jamPulang: displayJamPulang,
          absensiPulang: displayAbsensiPulang,
          mendahului,
          catatanPulang,
          isEarly,
          keterangan,
          totalJam: att?.total_jam ? Number(att.total_jam) : null,
          hasDutyAttendance,
          isSpecialRange,
          specialScheduleName
        });
      }

      setCalendarRows(builtRows);
    } catch (error) {
      console.error('Error fetching calendar attendance data: ', error);
      alert('Terjadi kesalahan saat memproses data absensi.');
    } finally {
      setLoading(false);
    }
  };

  // Calculation Metrics
  const totalDaysInMonth = calendarRows.length;
  const totalWorkdays = calendarRows.filter(r => !r.isWeekend && !r.holiday).length;
  const totalHadirDays = calendarRows.filter(r => r.absensiMasuk !== '-' || r.absensiPulang !== '-').length;
  const totalTerlambatCount = calendarRows.filter(r => r.isLate).length;
  const totalMendahuluiCount = calendarRows.filter(r => r.isEarly).length;
  const totalDutyWeekendCount = calendarRows.filter(r => r.hasDutyAttendance).length;
  const totalJamKerja = calendarRows.reduce((sum, r) => sum + (r.totalJam || 0), 0).toFixed(2);

  // Export to Excel
  const handleExportExcel = () => {
    if (calendarRows.length === 0) {
      alert('Tidak ada data absensi untuk diekspor.');
      return;
    }

    const monthLabel = months.find(m => m.value === bulan)?.label || bulan;
    const cleanNip = nip.trim();
    const namaPegawai = employeeInfo?.nama || selectedEmployee?.nama || '';

    // Sheet 1: Tabel Format Baru Rekapitulasi Presensi
    const dataForExport = calendarRows.map((r, idx) => ({
      No: idx + 1,
      Hari: r.hari,
      Tanggal: r.tanggalFormat,
      'Jam Masuk': r.jamMasuk,
      'Absensi Masuk': r.absensiMasuk,
      Keterlambatan: r.keterlambatan,
      'Catatan Masuk': r.catatanMasuk,
      'Jam Pulang': r.jamPulang,
      'Absensi Pulang': r.absensiPulang,
      Mendahului: r.mendahului,
      'Catatan Pulang': r.catatanPulang,
      'Total Jam': r.totalJam !== null ? `${r.totalJam} Jam` : '-',
      Keterangan: r.keterangan
    }));

    const worksheet = xlsx.utils.json_to_sheet(dataForExport);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, `Rekap_${monthLabel}`);

    worksheet['!cols'] = [
      { wch: 6 },  // No
      { wch: 12 }, // Hari
      { wch: 14 }, // Tanggal
      { wch: 12 }, // Jam Masuk (Jadwal)
      { wch: 15 }, // Absensi Masuk (Scan)
      { wch: 16 }, // Keterlambatan
      { wch: 22 }, // Catatan Masuk
      { wch: 12 }, // Jam Pulang (Jadwal)
      { wch: 15 }, // Absensi Pulang (Scan)
      { wch: 16 }, // Mendahului
      { wch: 22 }, // Catatan Pulang
      { wch: 14 }, // Total Jam
      { wch: 38 }  // Keterangan
    ];

    // Sheet 2: Format Data Log Fingerprint (Langsung kompatibel jika ingin di-import kembali ke sistem)
    const rawFingerprintData = calendarRows
      .filter(r => r.absensiMasuk !== '-' || r.absensiPulang !== '-' || (!r.isWeekend && !r.holiday))
      .map(r => ({
        NIP: cleanNip,
        Nama_Pegawai: namaPegawai,
        Tanggal: r.tanggalISO,
        Absensi_Masuk: r.absensiMasuk !== '-' ? r.absensiMasuk : '',
        Absensi_Pulang: r.absensiPulang !== '-' ? r.absensiPulang : '',
        Status: (r.absensiMasuk !== '-' || r.absensiPulang !== '-')
          ? 'Hadir'
          : (r.keterangan && r.keterangan !== '-' ? r.keterangan : 'Tidak Hadir')
      }));

    if (rawFingerprintData.length > 0) {
      const rawSheet = xlsx.utils.json_to_sheet(rawFingerprintData);
      xlsx.utils.book_append_sheet(workbook, rawSheet, 'Data_Fingerprint_Siap_Import');
      rawSheet['!cols'] = [
        { wch: 24 }, // NIP
        { wch: 28 }, // Nama_Pegawai
        { wch: 15 }, // Tanggal
        { wch: 16 }, // Absensi_Masuk
        { wch: 16 }, // Absensi_Pulang
        { wch: 16 }  // Status
      ];
    }

    const employeeSlug = (namaPegawai || cleanNip).replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Rekap_Absensi_${employeeSlug}_${monthLabel}_${tahun}.xlsx`;
    xlsx.writeFile(workbook, fileName);
  };

  // Print Handler
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Search & Filter Header Form */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              Rekapitulasi Presensi PPPK Paruh Waktu
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cek kehadiran kalender bulanan lengkap (termasuk Sabtu, Minggu, dan Hari Libur Nasional / Cuti Bersama).
            </p>
          </div>

          {hasSearched && calendarRows.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="Cetak Rekap Absensi"
              >
                <Printer className="w-4 h-4" />
                Cetak
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                title="Unduh file Excel"
              >
                <Download className="w-4 h-4" />
                Export Excel (.xlsx)
              </button>
            </div>
          )}
        </div>

        <form onSubmit={handleSearch} className="grid grid-cols-1 sm:grid-cols-12 gap-4">
          <div className="sm:col-span-5 relative" ref={dropdownRef}>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Nomor Induk Pegawai (NIP) / Nama <span className="text-red-500">*</span>
              </label>
              {loadingEmployees && (
                <span className="text-[10px] text-blue-600 flex items-center gap-1 font-medium">
                  <Clock className="w-3 h-3 animate-spin" /> Memuat daftar pegawai...
                </span>
              )}
            </div>

            <div>
              {/* Searchable Dropdown Button Trigger */}
              <button
                type="button"
                onClick={() => {
                  const nextState = !isDropdownOpen;
                  setIsDropdownOpen(nextState);
                  if (nextState) {
                    if (employees.length === 0 && !loadingEmployees) {
                      fetchEmployeesList();
                    }
                    setTimeout(() => searchInputRef.current?.focus(), 60);
                  }
                }}
                className={`w-full min-h-[42px] px-3 py-2 bg-slate-50 hover:bg-slate-100/80 border ${
                  isDropdownOpen ? 'border-blue-500 ring-2 ring-blue-500/20 bg-white' : 'border-slate-200'
                } rounded-lg text-left transition-all flex items-center justify-between gap-2`}
              >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 text-xs font-bold">
                      {selectedEmployee?.nama ? (
                        selectedEmployee.nama.charAt(0).toUpperCase()
                      ) : (
                        <UserCheck className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    {selectedEmployee ? (
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {selectedEmployee.nama}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="font-mono font-medium text-slate-700">
                            NIP: {selectedEmployee.nip}
                          </span>
                          {selectedEmployee.unit_kerja && (
                            <span className="truncate max-w-[150px] text-slate-400">
                              • {selectedEmployee.unit_kerja}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : nip ? (
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 truncate font-mono">
                          NIP: {nip}
                        </div>
                        <div className="text-[10px] text-slate-500">Pegawai Terpilih</div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium truncate">
                        <span>-- Pilih atau cari nama pegawai / NIP --</span>
                        {employees.length > 0 && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full shrink-0">
                            {employees.length} Pegawai
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {nip && (
                      <span
                        onClick={e => {
                          e.stopPropagation();
                          setNip('');
                          setEmployeeInfo(null);
                        }}
                        className="p-1 text-slate-400 hover:text-red-500 rounded-md transition-colors"
                        title="Kosongkan pilihan"
                      >
                        <X className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${
                        isDropdownOpen ? 'rotate-180 text-blue-600' : ''
                      }`}
                    />
                  </div>
                </button>

                {/* Hidden input */}
                <input
                  type="text"
                  className="sr-only"
                  value={nip}
                  onChange={() => {}}
                  tabIndex={-1}
                />

                {/* Searchable Dropdown Popup Menu */}
                {isDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-100">
                    {/* Search Input Box with Filter Count */}
                    <div className="p-2.5 bg-slate-50 border-b border-slate-100">
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={dropdownSearch}
                          onChange={e => setDropdownSearch(e.target.value)}
                          placeholder="Cari nama pegawai, NIP, atau unit kerja..."
                          className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        {dropdownSearch && (
                          <button
                            type="button"
                            onClick={() => setDropdownSearch('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 mt-1.5">
                        <span>Menampilkan {filteredEmployees.length} dari {employees.length} pegawai</span>
                        {nip && (
                          <button
                            type="button"
                            onClick={() => {
                              setNip('');
                              setEmployeeInfo(null);
                            }}
                            className="text-red-500 hover:text-red-700 font-medium"
                          >
                            Reset Pilihan
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Scrollable list */}
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                      {loadingEmployees ? (
                        <div className="py-8 text-center text-xs text-slate-500">
                          <Clock className="w-5 h-5 animate-spin mx-auto text-blue-600 mb-2" />
                          <span>Memuat master data pegawai...</span>
                        </div>
                      ) : fetchEmployeesError ? (
                        <div className="p-5 text-center text-xs text-red-600">
                          <AlertCircle className="w-7 h-7 mx-auto mb-1.5 text-red-500" />
                          <p className="font-semibold text-slate-800">Gagal Memuat Data Pegawai</p>
                          <p className="text-[11px] text-slate-500 mt-1 max-w-xs mx-auto">
                            {fetchEmployeesError}
                          </p>
                          <button
                            type="button"
                            onClick={() => fetchEmployeesList()}
                            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-xs font-semibold shadow-xs"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Coba Muat Ulang
                          </button>
                        </div>
                      ) : filteredEmployees.length === 0 ? (
                        <div className="p-5 text-center text-xs text-slate-500">
                          <UserX className="w-7 h-7 mx-auto mb-1.5 text-slate-300" />
                          <p className="font-semibold text-slate-700">Tidak ada pegawai yang sesuai</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Coba kata kunci lain atau gunakan input yang Anda ketik sebagai NIP.
                          </p>
                          {dropdownSearch.trim() && (
                            <button
                              type="button"
                              onClick={() => {
                                setNip(dropdownSearch.trim());
                                setIsDropdownOpen(false);
                              }}
                              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-semibold transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Pilih &quot;{dropdownSearch.trim()}&quot; sebagai NIP
                            </button>
                          )}
                        </div>
                      ) : (
                        filteredEmployees.map(emp => {
                          const isSelected = emp.nip === nip.trim();
                          return (
                            <button
                              key={emp.nip || emp.nama}
                              type="button"
                              onClick={() => handleSelectEmployee(emp)}
                              className={`w-full text-left px-3.5 py-2.5 hover:bg-blue-50/70 transition-colors flex items-center justify-between gap-3 ${
                                isSelected ? 'bg-blue-50/80 text-blue-950 font-semibold' : 'text-slate-800'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-bold text-slate-900 truncate">
                                  {emp.nama || 'Tanpa Nama'}
                                </div>
                                <div className="flex items-center flex-wrap gap-1.5 mt-0.5 text-[11px] text-slate-500">
                                  <span className="font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[10px] font-medium border border-slate-200/60">
                                    NIP: {emp.nip}
                                  </span>
                                  {emp.unit_kerja && (
                                    <span className="truncate max-w-[190px] text-slate-500">
                                      • {emp.unit_kerja}
                                    </span>
                                  )}
                                  {emp.jabatan && (
                                    <span className="text-slate-400 hidden md:inline truncate max-w-[150px]">
                                      ({emp.jabatan})
                                    </span>
                                  )}
                                </div>
                              </div>
                              {isSelected && (
                                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                                  <Check className="w-3 h-3 stroke-[3]" />
                                </span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>

                    {/* Dropdown Footer */}
                    <div className="p-2 bg-slate-50 text-[11px] flex items-center justify-between text-slate-500 px-3 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <span>Total {employees.length} pegawai terdaftar</span>
                        <button
                          type="button"
                          onClick={() => fetchEmployeesList()}
                          className="text-slate-400 hover:text-blue-600 p-1"
                          title="Segarkan daftar pegawai"
                        >
                          <RefreshCw className={`w-3 h-3 ${loadingEmployees ? 'animate-spin text-blue-600' : ''}`} />
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-400">Pilih dari master pegawai</span>
                    </div>
                  </div>
                )}
              </div>
          </div>

          <div className="sm:col-span-3">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Bulan
            </label>
            <select
              value={bulan}
              onChange={e => setBulan(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none cursor-pointer focus:ring-2 focus:ring-blue-500"
            >
              {months.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Tahun
            </label>
            <select
              value={tahun}
              onChange={e => setTahun(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none cursor-pointer focus:ring-2 focus:ring-blue-500"
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs transition-all shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50 h-[42px]"
            >
              {loading ? (
                <>
                  <Clock className="w-4 h-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Tampilkan
                </>
              )}
            </button>
          </div>
        </form>

        {/* Pegawai & Jadwal Info Banner */}
        {hasSearched && (
          <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                {employeeInfo?.nama ? employeeInfo.nama.charAt(0).toUpperCase() : 'P'}
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">
                  {employeeInfo?.nama || `Pegawai NIP. ${nip}`}
                </p>
                <p className="text-slate-500">
                  NIP: <span className="font-mono text-slate-700">{nip}</span>
                  {employeeInfo?.jabatan && ` • ${employeeInfo.jabatan}`}
                  {employeeInfo?.unit_kerja && ` (${employeeInfo.unit_kerja})`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-600 bg-slate-50 px-3.5 py-2 rounded-lg border border-slate-200">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>Jadwal Aktif: <strong className="text-slate-800">{activeWorkHours.profile_name}</strong></span>
              <span className="text-slate-300">|</span>
              <span>Masuk: <strong className="font-mono text-slate-800">{activeWorkHours.jam_masuk}</strong></span>
              <span className="text-slate-300">|</span>
              <span>Pulang (Senin-Kamis): <strong className="font-mono text-slate-800">{activeWorkHours.jam_pulang}</strong></span>
              <span className="text-slate-300">|</span>
              <span>Pulang (Jumat): <strong className="font-mono text-slate-800">{activeWorkHours.jam_pulang_jumat}</strong></span>
            </div>

            {/* Special Date Range Schedule Alert Banner */}
            {specialScheduleNotice && (
              <div className="w-full mt-2.5 p-3 bg-amber-50/90 border border-amber-200/90 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-amber-950">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-amber-200 text-amber-900 flex items-center justify-center shrink-0">
                    <Moon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-amber-950 block sm:inline">
                      Jadwal Khusus Kalender Diterapkan Otomatis: <strong>{specialScheduleNotice.nama}</strong>
                    </span>
                    <span className="text-amber-800 text-[11px] sm:ml-2">
                      (Rentang: {specialScheduleNotice.dateRangeText})
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900 shrink-0 self-start sm:self-auto flex items-center gap-1">
                  Otomatis Kalender
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary KPI Cards */}
      {hasSearched && calendarRows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <p className="text-[10px] uppercase font-bold text-slate-400">Total Hari</p>
            <p className="text-xl font-bold text-slate-800 mt-1">{totalDaysInMonth} <span className="text-xs font-normal text-slate-400">Hari</span></p>
            <p className="text-[10px] text-slate-400">1 Bulan Kalender</p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <p className="text-[10px] uppercase font-bold text-slate-400">Hari Kerja Efektif</p>
            <p className="text-xl font-bold text-blue-700 mt-1">{totalWorkdays} <span className="text-xs font-normal text-slate-400">Hari</span></p>
            <p className="text-[10px] text-slate-400">Senin - Jumat</p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <p className="text-[10px] uppercase font-bold text-slate-400">Kehadiran Finger</p>
            <p className="text-xl font-bold text-emerald-700 mt-1">{totalHadirDays} <span className="text-xs font-normal text-slate-400">Hari</span></p>
            <p className="text-[10px] text-slate-400">Ada Data Masuk/Pulang</p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <p className="text-[10px] uppercase font-bold text-slate-400">Keterlambatan</p>
            <p className="text-xl font-bold text-amber-600 mt-1">{totalTerlambatCount} <span className="text-xs font-normal text-slate-400">Kali</span></p>
            <p className="text-[10px] text-slate-400">Lebih Dari Jam Masuk</p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <p className="text-[10px] uppercase font-bold text-slate-400">Mendahului Pulang</p>
            <p className="text-xl font-bold text-orange-600 mt-1">{totalMendahuluiCount} <span className="text-xs font-normal text-slate-400">Kali</span></p>
            <p className="text-[10px] text-slate-400">Kurang Dari Jam Pulang</p>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
            <p className="text-[10px] uppercase font-bold text-slate-400">Piket / Keamanan</p>
            <p className="text-xl font-bold text-indigo-700 mt-1">{totalDutyWeekendCount} <span className="text-xs font-normal text-slate-400">Hari</span></p>
            <p className="text-[10px] text-slate-400">Hadir Weekend / Libur</p>
          </div>
        </div>
      )}

      {/* Main Table: Full Monthly Attendance Recap (11 Columns) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                Daftar Rekapitulasi Presensi Bulanan
              </h3>
              <p className="text-xs text-slate-500">
                Periode: {months.find(m => m.value === bulan)?.label} {tahun}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-rose-100 border border-rose-300"></span>
              <span className="text-slate-600 font-medium">Hari Libur / Akhir Pekan</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-emerald-100 border border-emerald-400"></span>
              <span className="text-slate-600 font-medium">Piket Keamanan Hadir</span>
            </div>
          </div>
        </div>

        {!hasSearched ? (
          <div className="p-16 text-center text-slate-400 text-sm space-y-2">
            <CalendarDays className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="font-semibold text-slate-600">Silakan masukkan NIP Pegawai dan klik Tampilkan.</p>
            <p className="text-xs text-slate-400">Semua tanggal dalam bulan kalender akan dimunculkan secara otomatis.</p>
          </div>
        ) : calendarRows.length === 0 ? (
          <div className="p-16 text-center text-slate-400 text-sm">
            <AlertCircle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
            <p>Tidak ada data untuk periode ini.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1050px]">
              <thead className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="px-3.5 py-3 border-r border-slate-200 w-24">Hari</th>
                  <th className="px-3.5 py-3 border-r border-slate-200 w-28">Tanggal</th>
                  <th className="px-3 py-3 border-r border-slate-200 w-24 text-center">Jam Masuk</th>
                  <th className="px-3 py-3 border-r border-slate-200 w-28 text-center">Absensi Masuk</th>
                  <th className="px-3 py-3 border-r border-slate-200 w-28 text-center">Keterlambatan</th>
                  <th className="px-3.5 py-3 border-r border-slate-200 w-36">Catatan Masuk</th>
                  <th className="px-3 py-3 border-r border-slate-200 w-24 text-center">Jam Pulang</th>
                  <th className="px-3 py-3 border-r border-slate-200 w-28 text-center">Absensi Pulang</th>
                  <th className="px-3 py-3 border-r border-slate-200 w-28 text-center">Mendahului</th>
                  <th className="px-3.5 py-3 border-r border-slate-200 w-36">Catatan Pulang</th>
                  <th className="px-4 py-3 min-w-[200px]">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-normal">
                {calendarRows.map((row, idx) => {
                  const isRedRow = row.isWeekend || !!row.holiday;

                  return (
                    <tr
                      key={idx}
                      className={`transition-colors ${
                        isRedRow
                          ? 'bg-rose-50/60 hover:bg-rose-100/60'
                          : idx % 2 === 1
                          ? 'bg-slate-50/40 hover:bg-slate-100/60'
                          : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      {/* 1. Hari */}
                      <td className="px-3.5 py-2.5 border-r border-slate-200/80 font-medium whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-semibold ${
                              isRedRow ? 'text-red-700' : 'text-slate-800'
                            }`}
                          >
                            {row.hari}
                          </span>
                          {row.isSpecialRange && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-0.5 shrink-0"
                              title={`Jadwal Khusus Rentang: ${row.specialScheduleName}`}
                            >
                              <Moon className="w-2.5 h-2.5 text-amber-700" />
                              Puasa
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2. Tanggal */}
                      <td className="px-3.5 py-2.5 border-r border-slate-200/80 font-mono whitespace-nowrap">
                        <span className={isRedRow ? 'text-red-700 font-bold' : 'text-slate-700'}>
                          {row.tanggalFormat}
                        </span>
                      </td>

                      {/* 3. Jam Masuk */}
                      <td className="px-3 py-2.5 border-r border-slate-200/80 text-center font-mono text-slate-700 whitespace-nowrap">
                        {row.jamMasuk}
                      </td>

                      {/* 4. Absensi Masuk */}
                      <td className="px-3 py-2.5 border-r border-slate-200/80 text-center font-mono whitespace-nowrap">
                        {row.absensiMasuk !== '-' ? (
                          <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                            {row.absensiMasuk}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* 5. Keterlambatan */}
                      <td className="px-3 py-2.5 border-r border-slate-200/80 text-center font-mono whitespace-nowrap">
                        {row.isLate ? (
                          <span className="font-bold text-red-600 bg-red-100/70 px-2 py-0.5 rounded">
                            {row.keterlambatan}
                          </span>
                        ) : row.keterlambatan === '0.00' ? (
                          <span className="text-emerald-700 font-semibold">0.00</span>
                        ) : (
                          <span className="text-slate-400">-.--</span>
                        )}
                      </td>

                      {/* 6. Catatan Masuk */}
                      <td className="px-3.5 py-2.5 border-r border-slate-200/80 whitespace-nowrap">
                        {row.catatanMasuk === 'Terlambat' ? (
                          <span className="inline-flex items-center gap-1 text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded-full border border-red-200 text-[11px]">
                            <AlertCircle className="w-3 h-3" />
                            Terlambat
                          </span>
                        ) : row.catatanMasuk === 'Tepat Waktu' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[11px]">
                            <CheckCircle2 className="w-3 h-3" />
                            Tepat Waktu
                          </span>
                        ) : row.catatanMasuk === 'Tidak finger masuk' ? (
                          <span className="text-slate-500 italic text-[11px]">
                            Tidak finger masuk
                          </span>
                        ) : (
                          <span className="text-rose-700 font-semibold text-[11px]">
                            {row.catatanMasuk}
                          </span>
                        )}
                      </td>

                      {/* 7. Jam Pulang */}
                      <td className="px-3 py-2.5 border-r border-slate-200/80 text-center font-mono text-slate-700 whitespace-nowrap">
                        {row.jamPulang}
                      </td>

                      {/* 8. Absensi Pulang */}
                      <td className="px-3 py-2.5 border-r border-slate-200/80 text-center font-mono whitespace-nowrap">
                        {row.absensiPulang !== '-' ? (
                          <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                            {row.absensiPulang}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* 9. Mendahului */}
                      <td className="px-3 py-2.5 border-r border-slate-200/80 text-center font-mono whitespace-nowrap">
                        {row.isEarly ? (
                          <span className="font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded">
                            {row.mendahului}
                          </span>
                        ) : row.mendahului === '0.00' ? (
                          <span className="text-emerald-700 font-semibold">0.00</span>
                        ) : (
                          <span className="text-slate-400">-.--</span>
                        )}
                      </td>

                      {/* 10. Catatan Pulang */}
                      <td className="px-3.5 py-2.5 border-r border-slate-200/80 whitespace-nowrap">
                        {row.catatanPulang === 'Mendahului' ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 text-[11px]">
                            <AlertTriangle className="w-3 h-3" />
                            Mendahului
                          </span>
                        ) : row.catatanPulang === 'Sesuai Jam Pulang' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[11px]">
                            <CheckCircle2 className="w-3 h-3" />
                            Sesuai Jam Pulang
                          </span>
                        ) : row.catatanPulang === 'Tidak finger pulang' ? (
                          <span className="text-slate-500 italic text-[11px]">
                            Tidak finger pulang
                          </span>
                        ) : (
                          <span className="text-rose-700 font-semibold text-[11px]">
                            {row.catatanPulang}
                          </span>
                        )}
                      </td>

                      {/* 11. Keterangan */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {row.holiday ? (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                                row.holiday.jenis === 'cuti_bersama'
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-rose-100 text-rose-900 border border-rose-300'
                              }`}
                            >
                              {row.keterangan}
                            </span>
                          ) : row.isWeekend ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100/70 text-red-800 border border-red-200">
                              {row.keterangan}
                            </span>
                          ) : (
                            <span
                              className={`text-[11px] font-medium ${
                                row.keterangan === 'Hadir Lengkap'
                                  ? 'text-emerald-700 font-semibold'
                                  : row.keterangan === 'Tidak Hadir'
                                  ? 'text-slate-400'
                                  : 'text-amber-700 font-semibold'
                              }`}
                            >
                              {row.keterangan}
                            </span>
                          )}

                          {row.hasDutyAttendance && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white shadow-2xs">
                              <ShieldCheck className="w-3 h-3 mr-1" />
                              Tugas / Piket Hadir
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-2">
          <div className="flex items-center gap-1.5">
            <Info className="w-4 h-4 text-blue-600" />
            <span>
              Perhitungan keterlambatan dan kepulangan mendahului disesuaikan dengan Jadwal Jam Kerja aktif Setda Demak.
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span>Total Efektif: <strong className="text-slate-800">{totalJamKerja} Jam</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}
