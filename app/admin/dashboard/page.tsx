'use client';

import AdminImportExcel from '@/components/AdminImportExcel';
import { Users, Clock, FileSpreadsheet, Download, ArrowRight, ShieldCheck, Calendar, FileText } from 'lucide-react';
import Link from 'next/link';
import * as xlsx from 'xlsx';

export default function AdminDashboard() {
  const handleDownloadEmployeeTemplate = () => {
    const templateData = [
      {
        NIP: '199208152024211002',
        Nama: 'Ahmad Subardjo, S.Kom.',
        Jabatan: 'Pranata Komputer',
        Unit_Kerja: 'Bagian Umum'
      },
      {
        NIP: '199503122024212001',
        Nama: 'Siti Nurhaliza, S.E.',
        Jabatan: 'Pengadministrasi Perkantoran',
        Unit_Kerja: 'Bagian Hukum'
      },
      {
        NIP: '199004052024211003',
        Nama: 'Budi Santoso, A.Md.',
        Jabatan: 'Teknisi Sarana Prasarana',
        Unit_Kerja: 'Bagian Organisasi'
      }
    ];

    const worksheet = xlsx.utils.json_to_sheet(templateData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Master_Pegawai');

    worksheet['!cols'] = [
      { wch: 24 },
      { wch: 32 },
      { wch: 28 },
      { wch: 24 }
    ];

    xlsx.writeFile(workbook, 'Template_Data_Pegawai_PPPK.xlsx');
  };

  return (
    <>
      {/* Top Stat/Nav Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <Link
          href="/admin/dashboard/recap"
          className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 flex items-center gap-3.5 hover:border-emerald-300 hover:shadow-md transition-all group"
        >
          <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Rekapitulasi Absensi</p>
            <p className="text-sm font-bold text-slate-800">Rekap Seluruh</p>
          </div>
        </Link>

        <Link
          href="/admin/dashboard/permits"
          className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 flex items-center gap-3.5 hover:border-indigo-300 hover:shadow-md transition-all group"
        >
          <div className="w-11 h-11 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Verifikasi Izin/DL</p>
            <p className="text-sm font-bold text-slate-800">Persetujuan Izin</p>
          </div>
        </Link>

        <Link
          href="/admin/dashboard/employees"
          className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 flex items-center gap-3.5 hover:border-blue-300 hover:shadow-md transition-all group"
        >
          <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Kelola Pegawai</p>
            <p className="text-sm font-bold text-slate-800">Master Pegawai</p>
          </div>
        </Link>

        <Link
          href="/admin/dashboard/work-hours"
          className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 flex items-center gap-3.5 hover:border-amber-300 hover:shadow-md transition-all group"
        >
          <div className="w-11 h-11 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-amber-500 group-hover:text-white transition-colors">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Kelola Jam Kerja</p>
            <p className="text-sm font-bold text-slate-800">Aturan Jam</p>
          </div>
        </Link>

        <Link
          href="/admin/dashboard/holidays"
          className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 flex items-center gap-3.5 hover:border-rose-300 hover:shadow-md transition-all group"
        >
          <div className="w-11 h-11 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-rose-600 group-hover:text-white transition-colors">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Kalender & Libur</p>
            <p className="text-sm font-bold text-slate-800">Libur & Cuti</p>
          </div>
        </Link>
      </div>

      {/* Main Feature Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Import Fingerprint */}
        <div className="lg:col-span-7">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-800">Import Data Kehadiran Fingerprint</h2>
            <p className="text-sm text-slate-500 mt-1">
              Unggah file Excel hasil ekspor mesin absensi atau gunakan fasilitas template resmi untuk pengisian data absensi bulanan.
            </p>
          </div>
          <AdminImportExcel />
        </div>

        {/* Right Column: Quick Excel Pegawai Card & SOP */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base">Fasilitas Data Pegawai (Excel)</h3>
                <p className="text-xs text-slate-500">Master data PPPK Paruh Waktu Setda</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-5">
              Kelola daftar pegawai PPPK secara massal menggunakan file Excel (.xlsx). Anda dapat mengunduh format template resmi atau langsung masuk ke menu pengelolaan pegawai.
            </p>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleDownloadEmployeeTemplate}
                className="w-full px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                Unduh Template Excel Pegawai
              </button>

              <Link
                href="/admin/dashboard/employees"
                className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm shadow-blue-200"
              >
                Buka Menu Import & Data Pegawai
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 text-xs text-slate-600 space-y-3">
            <h4 className="font-bold uppercase tracking-wider text-slate-700 text-[11px]">
              Alur Sinkronisasi Data:
            </h4>
            <ol className="list-decimal pl-4 space-y-2 text-slate-600">
              <li>
                <strong className="text-slate-800">Master Pegawai:</strong> Pastikan NIP pegawai telah terdaftar di menu Data Pegawai agar rekapitulasi data nama & unit kerja akurat.
              </li>
              <li>
                <strong className="text-slate-800">Ekspor Fingerprint:</strong> Ekspor log mesin absensi ke format Excel, pastikan kolom NIP, Tanggal, Jam Masuk, dan Jam Keluar terisi.
              </li>
              <li>
                <strong className="text-slate-800">Import & Kalkulasi:</strong> Sistem otomatis menghitung total jam kerja efektif pegawai dan toleransi keterlambatan.
              </li>
              <li>
                <strong className="text-slate-800">Akses Pegawai:</strong> Pegawai dapat langsung melihat rekapitulasi jam kerja melalui halaman utama aplikasi dengan memasukkan NIP.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}
