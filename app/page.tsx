import EmployeeFilter from '@/components/EmployeeFilter';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-800" style={{ backgroundColor: '#F8FAFC' }}>
      <nav className="flex items-center justify-between px-8 h-16 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
          </div>
          <span className="font-bold text-lg tracking-tight text-slate-900">SIAP PPPK <span className="text-blue-600">Paruh Waktu</span></span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/admin/login" className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 transition-colors flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Login
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
