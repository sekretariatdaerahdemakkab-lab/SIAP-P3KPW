import EmployeeFilter from '@/components/EmployeeFilter';
import Link from 'next/link';
import { ShieldCheck, UserCheck, FileText } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-800" style={{ backgroundColor: '#F8FAFC' }}>
      <nav className="flex items-center justify-between px-4 sm:px-8 h-16 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
          </div>
          <span className="font-bold text-lg tracking-tight text-slate-900">SIAP PPPK <span className="text-blue-600">Paruh Waktu</span></span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/portal-izin"
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
            title="Formulir permohonan izin pribadi pegawai"
          >
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">Ajukan Izin</span>
          </Link>
          <Link
            href="/persetujuan-izin"
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
            title="Panel persetujuan izin khusus Atasan & Admin"
          >
            <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Approve Izin</span>
          </Link>
          <Link
            href="/admin/login"
            className="px-3.5 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Admin</span>
          </Link>
        </div>
      </nav>

      <main className="flex-1 p-4 md:p-6 overflow-y-auto">
        <div className="max-w-7xl mx-auto w-full pb-8">
          <EmployeeFilter />
        </div>
      </main>
    </div>
  );
}
