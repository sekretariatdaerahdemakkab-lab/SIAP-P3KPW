'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { ShieldCheck, LogOut } from 'lucide-react';
import Link from 'next/link';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push('/admin/login');
      } else {
        setUserEmail(user.email);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/');
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-medium">Memverifikasi sesi...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-slate-900 text-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-blue-400" />
            <h1 className="text-xl font-bold tracking-tight">Admin Dasbor</h1>
          </div>
          <div className="flex items-center gap-6 text-sm font-medium">
            <span className="text-slate-400 hidden md:inline-block">{userEmail}</span>
            <Link href="/" className="text-slate-300 hover:text-white transition-colors">Portal Publik</Link>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-md transition-colors text-red-400 hover:text-red-300"
            >
              <LogOut className="w-4 h-4" />
              Keluar
            </button>
          </div>
        </div>
      </header>
      
      <div className="bg-white border-b border-slate-200 sticky top-16 z-10">
        <div className="max-w-6xl mx-auto px-6 h-12 flex items-center gap-8 text-sm font-medium text-slate-500">
          <Link 
            href="/admin/dashboard" 
            className={`hover:text-blue-600 transition-colors h-full flex items-center border-b-2 ${pathname === '/admin/dashboard' ? 'text-blue-600 border-blue-600' : 'border-transparent'}`}
          >
            Ringkasan
          </Link>
          <Link 
            href="/admin/dashboard/employees" 
            className={`hover:text-blue-600 transition-colors h-full flex items-center border-b-2 ${pathname === '/admin/dashboard/employees' ? 'text-blue-600 border-blue-600' : 'border-transparent'}`}
          >
            Data Pegawai
          </Link>
          <Link 
            href="/admin/dashboard/work-hours" 
            className={`hover:text-blue-600 transition-colors h-full flex items-center border-b-2 ${pathname === '/admin/dashboard/work-hours' ? 'text-blue-600 border-blue-600' : 'border-transparent'}`}
          >
            Jam Kerja
          </Link>
          <Link 
            href="/admin/dashboard/holidays" 
            className={`hover:text-blue-600 transition-colors h-full flex items-center border-b-2 ${pathname === '/admin/dashboard/holidays' ? 'text-blue-600 border-blue-600' : 'border-transparent'}`}
          >
            Hari Libur & Cuti
          </Link>
        </div>
      </div>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        {children}
      </main>
    </div>
  );
}
