'use client';

import { useState, useEffect } from 'react';
import * as xlsx from 'xlsx';
import { collection, writeBatch, doc, getDocs, limit, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
  Eye,
  RefreshCw,
  FileDown,
  Info
} from 'lucide-react';

interface AttendanceRow {
  nip: string;
  nama?: string;
  unit_kerja?: string;
  tanggal: string;
  waktu_masuk: string;
  waktu_keluar: string;
  status: string;
  total_jam: number;
}

export default function AdminImportExcel() {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<AttendanceRow[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Master employee map for instant lookup (NIP -> { nama, unit_kerja, jabatan })
  const [employeeMap, setEmployeeMap] = useState<Record<string, { nama: string; unit_kerja: string; jabatan: string }>>({});

  useEffect(() => {
    getDocs(collection(db, 'employees'))
      .then(snap => {
        const map: Record<string, { nama: string; unit_kerja: string; jabatan: string }> = {};
        snap.forEach(d => {
          const data = d.data();
          const cleanNip = String(data.nip || d.id || '').trim();
          if (cleanNip) {
            map[cleanNip] = {
              nama: String(data.nama || '').trim(),
              unit_kerja: String(data.unit_kerja || '').trim(),
              jabatan: String(data.jabatan || '').trim()
            };
          }
        });
        setEmployeeMap(map);
      })
      .catch(err => {
        console.warn('Gagal memuat master data pegawai untuk penyesuaian import:', err);
      });
  }, []);

  // Helper date parsing from various Excel formats (supports ISO, DD/MM/YYYY, Excel serial date, immune to timezone drift)
  const formatDateValue = (val: any): string => {
    if (!val && val !== 0) return '';

    // 1. If it's a number (Excel serial date number, e.g. 46024 for 2026-01-02)
    if (typeof val === 'number') {
      if (val > 1000) {
        const parsed = xlsx.SSF.parse_date_code(val);
        if (parsed && parsed.y && parsed.m && parsed.d) {
          const year = parsed.y;
          const month = String(parsed.m).padStart(2, '0');
          const day = String(parsed.d).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
      }
    }

    // 2. If it is a Date instance (e.g. from any other parser or library)
    if (val instanceof Date) {
      // Add 12 hours before reading UTC to neutralize any historical timezone drift (such as Asia/Jakarta 7-min offset bug)
      const safeDate = new Date(val.getTime() + 12 * 60 * 60 * 1000);
      const year = safeDate.getUTCFullYear();
      const month = String(safeDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(safeDate.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    const str = String(val).trim();
    if (!str) return '';

    // 3. String that is pure numeric Excel serial code, e.g. '46024'
    if (/^\d{5}(\.\d+)?$/.test(str)) {
      const num = parseFloat(str);
      const parsed = xlsx.SSF.parse_date_code(num);
      if (parsed && parsed.y && parsed.m && parsed.d) {
        const year = parsed.y;
        const month = String(parsed.m).padStart(2, '0');
        const day = String(parsed.d).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }

    // 4. Format YYYY-MM-DD or YYYY/MM/DD
    const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymdMatch) {
      const year = ymdMatch[1];
      const month = ymdMatch[2].padStart(2, '0');
      const day = ymdMatch[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // 5. Format DD/MM/YYYY or DD-MM-YYYY (Standar Format Indonesia)
    const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      return `${year}-${month}-${day}`;
    }

    return str;
  };

  // Helper time parsing (supports "07:30", "07:30:00", Excel time fraction, handles "-" / "--:--")
  const formatTimeValue = (val: any): string => {
    if (!val && val !== 0) return '';
    const str = String(val).trim();
    if (str === '-' || str === '--:--' || str === '-.--' || str.toLowerCase() === 'n/a' || str.toLowerCase() === 'null') {
      return '';
    }
    if (typeof val === 'number' && val < 1 && val >= 0) {
      const totalMinutes = Math.round(val * 24 * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    const match = str.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      return `${match[1].padStart(2, '0')}:${match[2]}`;
    }
    return '';
  };

  const calculateHours = (masuk: string, keluar: string) => {
    if (!masuk || !keluar) return 0;
    const parseTime = (timeStr: string) => {
      const parts = timeStr.split(':').map(Number);
      if (parts.length >= 2) {
        return parts[0] + parts[1] / 60;
      }
      return 0;
    };

    const masukHrs = parseTime(masuk);
    const keluarHrs = parseTime(keluar);
    const diff = keluarHrs - masukHrs;
    return diff > 0 ? parseFloat(diff.toFixed(2)) : 0;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setMessage(null);
      setParsedRows([]);
      setShowPreview(false);

      try {
        const buffer = await selectedFile.arrayBuffer();
        // Gunakan cellDates: false untuk menjaga nilai serial/teks tanggal murni tanpa distorsi zona waktu
        const workbook = xlsx.read(buffer, { type: 'array', cellDates: false });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[] = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

        if (rawJson.length === 0) {
          setMessage({ type: 'error', text: 'File Excel kosong atau tidak memiliki baris data.' });
          return;
        }

        const parsed: AttendanceRow[] = [];
        for (const row of rawJson) {
          const keys = Object.keys(row);
          const findKey = (patterns: RegExp[]) => {
            for (const pattern of patterns) {
              const found = keys.find(k => pattern.test(k.trim().toLowerCase()));
              if (found) return row[found];
            }
            return '';
          };

          // 1. NIP Resolver
          const rawNip = findKey([
            /^nip$/,
            /^nomor.*induk.*pegawai$/,
            /^no.*induk/,
            /^pin$/,
            /^id.*pegawai$/,
            /^user.*id$/,
            /^nik$/
          ]);

          // 2. Nama Resolver (opsional)
          const rawNama = findKey([
            /^nama.*pegawai$/,
            /^nama.*lengkap$/,
            /^nama$/,
            /^pegawai$/
          ]);

          // 3. Tanggal Resolver
          const rawTanggal = findKey([
            /^tanggal$/,
            /^tgl$/,
            /^date$/,
            /^tgl.*presensi$/,
            /^hari.*tanggal$/
          ]);

          // 4. Jam Masuk Resolver
          // PRIORITY 1: Absensi/Scan masuk riil (format baru)
          // PRIORITY 2: Jam masuk (format lama/alternatif)
          const rawMasuk = findKey([
            /^absensi.*masuk$/,
            /^scan.*masuk$/,
            /^finger.*masuk$/,
            /^waktu.*masuk$/,
            /^jam.*scan.*masuk$/,
            /^jam.*finger.*masuk$/,
            /^jam.*masuk$/,
            /^masuk$/,
            /^check.*in$/,
            /^in$/
          ]);

          // 5. Jam Pulang/Keluar Resolver
          // PRIORITY 1: Absensi/Scan pulang riil (format baru)
          // PRIORITY 2: Jam pulang/keluar (format lama/alternatif)
          const rawKeluar = findKey([
            /^absensi.*pulang$/,
            /^scan.*pulang$/,
            /^finger.*pulang$/,
            /^waktu.*pulang$/,
            /^absensi.*keluar$/,
            /^scan.*keluar$/,
            /^finger.*keluar$/,
            /^waktu.*keluar$/,
            /^jam.*scan.*pulang$/,
            /^jam.*finger.*pulang$/,
            /^jam.*pulang$/,
            /^jam.*keluar$/,
            /^pulang$/,
            /^keluar$/,
            /^check.*out$/,
            /^out$/
          ]);

          // 6. Status / Keterangan Resolver
          const rawStatus = findKey([
            /^status$/,
            /^keterangan$/,
            /^catatan$/,
            /^ket$/
          ]);

          if (!rawNip || !rawTanggal) continue;

          const nip = String(rawNip).replace(/['"\s]/g, '').trim();
          const tanggal = formatDateValue(rawTanggal);
          const waktu_masuk = formatTimeValue(rawMasuk);
          const waktu_keluar = formatTimeValue(rawKeluar);

          // Tentukan status kehadiran
          let status = 'Hadir';
          const statusStr = String(rawStatus || '').trim();
          if (statusStr && !/^(hadir|lengkap|tepat waktu|terlambat|mendahului)/i.test(statusStr)) {
            status = statusStr;
          } else if (waktu_masuk || waktu_keluar) {
            status = 'Hadir';
          } else {
            status = statusStr || 'Tidak Hadir';
          }

          // Abaikan baris placeholder kalender libur/akhir pekan yang tidak memiliki jam scan riil
          if (!waktu_masuk && !waktu_keluar) {
            if (/libur|akhir pekan|minggu|sabtu|tidak finger/i.test(statusStr)) {
              continue; // Lewati baris kalender libur tanpa jam finger
            }
          }

          const total_jam = calculateHours(waktu_masuk, waktu_keluar);

          // Lookup nama & unit kerja jika ada
          const matchedEmployee = employeeMap[nip];
          const nama = String(rawNama || matchedEmployee?.nama || '').trim();
          const unit_kerja = matchedEmployee?.unit_kerja || '';

          parsed.push({
            nip,
            nama,
            unit_kerja,
            tanggal,
            waktu_masuk,
            waktu_keluar,
            status,
            total_jam
          });
        }

        if (parsed.length === 0) {
          setMessage({
            type: 'error',
            text: 'Tidak ada baris data valid yang ditemukan. Pastikan file memiliki kolom NIP/Nomor Induk dan Tanggal.'
          });
        } else {
          setParsedRows(parsed);
          setShowPreview(true);
        }
      } catch (err: any) {
        console.error('Error parsing file:', err);
        setMessage({ type: 'error', text: 'Gagal membaca format file Excel: ' + err.message });
      }
    }
  };

  const handleUpload = async () => {
    if (parsedRows.length === 0) {
      setMessage({ type: 'error', text: 'Pilih file Excel yang memiliki data valid terlebih dahulu.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const attendanceRef = collection(db, 'attendances');
      const CHUNK_SIZE = 400; // Batch write limit is 500
      let totalCommitted = 0;

      for (let i = 0; i < parsedRows.length; i += CHUNK_SIZE) {
        const chunk = parsedRows.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        for (const row of chunk) {
          // Use deterministic ID ${nip}_${tanggal} to prevent duplicate entries on re-import
          const docId = `${row.nip}_${row.tanggal}`;
          const docRef = doc(attendanceRef, docId);
          batch.set(
            docRef,
            {
              nip: row.nip,
              tanggal: row.tanggal,
              waktu_masuk: row.waktu_masuk,
              waktu_keluar: row.waktu_keluar,
              status: row.status,
              total_jam: row.total_jam,
              updated_at: new Date().toISOString()
            },
            { merge: true }
          );
        }

        await batch.commit();
        totalCommitted += chunk.length;
      }

      setMessage({
        type: 'success',
        text: `Berhasil menyimpan & memperbarui ${totalCommitted} data kehadiran fingerprint ke database.`
      });
      setFile(null);
      setParsedRows([]);
      setShowPreview(false);
    } catch (error: any) {
      console.error('Error importing attendance:', error);
      if (error.code === 'permission-denied') {
        handleFirestoreError(error, OperationType.WRITE, 'attendances');
      } else {
        setMessage({
          type: 'error',
          text: error.message || 'Terjadi kesalahan saat menyimpan data ke database.'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // 1. Download Template Excel Fingerprint (Sesuai Format Baru Rekapitulasi)
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        NIP: '197008262025211018',
        Nama_Pegawai: 'SUWONDO',
        Tanggal: '2026-09-01',
        Absensi_Masuk: '07:15',
        Absensi_Pulang: '16:05',
        Status: 'Hadir'
      },
      {
        NIP: '197008262025211018',
        Nama_Pegawai: 'SUWONDO',
        Tanggal: '2026-09-02',
        Absensi_Masuk: '07:35',
        Absensi_Pulang: '16:00',
        Status: 'Hadir'
      },
      {
        NIP: '197105182025211031',
        Nama_Pegawai: 'AGUS ANTO',
        Tanggal: '2026-09-01',
        Absensi_Masuk: '07:22',
        Absensi_Pulang: '16:10',
        Status: 'Hadir'
      },
      {
        NIP: '197105182025211031',
        Nama_Pegawai: 'AGUS ANTO',
        Tanggal: '2026-09-02',
        Absensi_Masuk: '',
        Absensi_Pulang: '',
        Status: 'Izin'
      },
      {
        NIP: '197106102025211030',
        Nama_Pegawai: 'ABDULLAH, S.AG',
        Tanggal: '2026-09-01',
        Absensi_Masuk: '07:10',
        Absensi_Pulang: '16:15',
        Status: 'Hadir'
      }
    ];

    const worksheet = xlsx.utils.json_to_sheet(templateData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Data_Fingerprint');

    worksheet['!cols'] = [
      { wch: 24 }, // NIP
      { wch: 28 }, // Nama_Pegawai
      { wch: 15 }, // Tanggal
      { wch: 16 }, // Absensi_Masuk
      { wch: 16 }, // Absensi_Pulang
      { wch: 15 }  // Status
    ];

    // Sheet 2: Petunjuk Format & Kolom Rekapitulasi
    const petunjukData = [
      {
        NO: 1,
        KOLOM: 'NIP',
        KETERANGAN: 'Wajib diisi. 18 digit Nomor Induk Pegawai PPPK Paruh Waktu.',
        CONTOH: '197008262025211018'
      },
      {
        NO: 2,
        KOLOM: 'Nama_Pegawai',
        KETERANGAN: 'Opsional / Pelengkap identitas pegawai untuk kemudahan verifikasi data.',
        CONTOH: 'SUWONDO'
      },
      {
        NO: 3,
        KOLOM: 'Tanggal',
        KETERANGAN: 'Wajib diisi. Format YYYY-MM-DD (2026-09-01) atau DD/MM/YYYY (01/09/2026).',
        CONTOH: '2026-09-01'
      },
      {
        NO: 4,
        KOLOM: 'Absensi_Masuk',
        KETERANGAN: 'Waktu scan ketukan masuk riil dari mesin fingerprint (format HH:mm). Jika tidak finger/libur, kosongkan.',
        CONTOH: '07:15'
      },
      {
        NO: 5,
        KOLOM: 'Absensi_Pulang',
        KETERANGAN: 'Waktu scan ketukan pulang riil dari mesin fingerprint (format HH:mm). Jika tidak finger/libur, kosongkan.',
        CONTOH: '16:05'
      },
      {
        NO: 6,
        KOLOM: 'Status',
        KETERANGAN: 'Status kehadiran: Hadir / Izin / Sakit / Cuti / Tugas Luar. Otomatis "Hadir" jika waktu scan terisi.',
        CONTOH: 'Hadir'
      },
      {
        NO: 7,
        KOLOM: 'Catatan Sistem',
        KETERANGAN: 'Kolom jadwal masuk (07:30), jadwal pulang (16:00/15:00 atau sesuai jadwal aktif), keterlambatan, mendahului, dan keterangan libur otomatis dikalkulasi sistem rekapitulasi.',
        CONTOH: 'Otomatis'
      }
    ];

    const petunjukSheet = xlsx.utils.json_to_sheet(petunjukData);
    xlsx.utils.book_append_sheet(workbook, petunjukSheet, 'Petunjuk_Pengisian');
    petunjukSheet['!cols'] = [
      { wch: 6 },
      { wch: 18 },
      { wch: 70 },
      { wch: 25 }
    ];

    xlsx.writeFile(workbook, 'Template_Fingerprint_Kehadiran_Setda.xlsx');
  };

  // 2. Export All Current Attendances (Dengan Nama Pegawai & Unit Kerja Lengkap)
  const handleExportExisting = async () => {
    setExporting(true);
    try {
      const q = query(collection(db, 'attendances'), limit(5000));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        alert('Belum ada data kehadiran yang tersimpan di database.');
        return;
      }

      const rows = snapshot.docs.map(docSnap => {
        const d = docSnap.data();
        const cleanNip = String(d.nip || '').trim();
        const emp = employeeMap[cleanNip];
        return {
          NIP: cleanNip,
          'Nama Pegawai': emp?.nama || '-',
          'Unit Kerja': emp?.unit_kerja || '-',
          Tanggal: d.tanggal || '',
          'Absensi Masuk': d.waktu_masuk || '-',
          'Absensi Pulang': d.waktu_keluar || '-',
          'Total Jam Kerja': d.total_jam ? `${d.total_jam} Jam` : '-',
          Status: d.status || 'Hadir'
        };
      });

      rows.sort((a, b) => b.Tanggal.localeCompare(a.Tanggal));

      const worksheet = xlsx.utils.json_to_sheet(rows);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Data_Kehadiran');

      worksheet['!cols'] = [
        { wch: 24 }, // NIP
        { wch: 28 }, // Nama Pegawai
        { wch: 32 }, // Unit Kerja
        { wch: 15 }, // Tanggal
        { wch: 16 }, // Absensi Masuk
        { wch: 16 }, // Absensi Pulang
        { wch: 16 }, // Total Jam Kerja
        { wch: 15 }  // Status
      ];

      xlsx.writeFile(workbook, `Rekap_Kehadiran_Fingerprint_Setda_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err: any) {
      console.error('Error exporting attendances:', err);
      alert('Gagal mengekspor data: ' + (err.message || ''));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            Import Data Log Fingerprint
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Unggah file presensi mesin fingerprint harian untuk disinkronkan dengan tabel rekapitulasi.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="px-3.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Unduh Template Excel
          </button>
          <button
            type="button"
            onClick={handleExportExisting}
            disabled={exporting}
            className="px-3.5 py-1.5 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" />
            {exporting ? 'Mengekspor...' : 'Export Data (.xlsx)'}
          </button>
        </div>
      </div>

      <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center bg-slate-50 hover:bg-slate-100/70 transition-colors">
        <input
          type="file"
          accept=".xlsx, .xls, .csv"
          onChange={handleFileChange}
          className="hidden"
          id="excel-upload"
        />
        <label
          htmlFor="excel-upload"
          className="cursor-pointer flex flex-col items-center justify-center gap-3"
        >
          <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center shadow-xs">
            <Upload className="w-6 h-6" />
          </div>
          <div>
            <p className="font-semibold text-slate-800">Klik untuk memilih file Excel Fingerprint</p>
            <p className="text-xs text-slate-500 mt-1">Mendukung format: .xlsx, .xls, .csv (Sesuai template atau format log mesin)</p>
          </div>
        </label>

        {file && (
          <div className="mt-4 p-3 bg-white border border-emerald-200 rounded-lg inline-flex items-center gap-2.5 text-sm font-medium text-emerald-800 shadow-xs">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>{file.name}</span>
            <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
              {parsedRows.length} baris siap diimpor
            </span>
          </div>
        )}
      </div>

      {/* Preview Table if rows parsed */}
      {showPreview && parsedRows.length > 0 && (
        <div className="mt-5 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Eye className="w-4 h-4 text-slate-600" />
              Pratinjau Data Fingerprint ({parsedRows.length} baris terdeteksi)
            </div>
            <span className="text-xs text-slate-500">Menampilkan 5 baris pertama</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs text-left text-slate-600">
              <thead className="bg-slate-100 text-slate-700 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-3 py-2.5">NIP</th>
                  <th className="px-3 py-2.5">Nama Pegawai</th>
                  <th className="px-3 py-2.5">Tanggal</th>
                  <th className="px-3 py-2.5">Absensi Masuk</th>
                  <th className="px-3 py-2.5">Absensi Pulang</th>
                  <th className="px-3 py-2.5">Jam Kerja</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {parsedRows.slice(0, 5).map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono font-medium text-slate-900">{row.nip}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{row.nama || '-'}</td>
                    <td className="px-3 py-2">{row.tanggal}</td>
                    <td className="px-3 py-2 font-mono font-semibold text-emerald-700">{row.waktu_masuk || '-'}</td>
                    <td className="px-3 py-2 font-mono font-semibold text-blue-700">{row.waktu_keluar || '-'}</td>
                    <td className="px-3 py-2 font-semibold text-slate-700">
                      {row.total_jam > 0 ? `${row.total_jam} jam` : '-'}
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {message && (
        <div
          className={`mt-4 p-4 rounded-xl flex items-start gap-3 text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 text-red-600" />
          )}
          <p>{message.text}</p>
        </div>
      )}

      <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <span className="text-xs text-slate-400">
          *Absensi Masuk & Pulang diinput dari ketukan mesin. Keterlambatan, jam kerja, dan toleransi otomatis dikalkulasi sistem.
        </span>
        <button
          onClick={handleUpload}
          disabled={parsedRows.length === 0 || loading}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-xs cursor-pointer"
        >
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Menyimpan ({parsedRows.length} data)...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Simpan & Proses ke Database
            </>
          )}
        </button>
      </div>

      <div className="mt-6 border-t border-slate-100 pt-5">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-blue-600" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Ketentuan & Kompatibilitas Kolom Excel:
          </h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs text-slate-600">
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
            <span className="font-mono font-semibold text-slate-800">NIP</span>
            <p className="text-[11px] text-slate-500">18 Digit NIP Pegawai (Wajib)</p>
          </div>
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
            <span className="font-mono font-semibold text-slate-800">Nama_Pegawai</span>
            <p className="text-[11px] text-slate-500">Nama staf (Opsional / Verifikasi)</p>
          </div>
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
            <span className="font-mono font-semibold text-slate-800">Tanggal</span>
            <p className="text-[11px] text-slate-500">YYYY-MM-DD atau DD/MM/YYYY (Wajib)</p>
          </div>
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
            <span className="font-mono font-semibold text-slate-800">Absensi_Masuk</span>
            <p className="text-[11px] text-slate-500">Jam scan masuk riil (HH:mm) / Jam_Masuk</p>
          </div>
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
            <span className="font-mono font-semibold text-slate-800">Absensi_Pulang</span>
            <p className="text-[11px] text-slate-500">Jam scan pulang riil (HH:mm) / Jam_Keluar</p>
          </div>
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
            <span className="font-mono font-semibold text-slate-800">Status</span>
            <p className="text-[11px] text-slate-500">Hadir / Izin / Sakit / Cuti (Opsional)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

