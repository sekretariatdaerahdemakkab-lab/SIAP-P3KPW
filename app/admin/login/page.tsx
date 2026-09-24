'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { ensureAtasanInFirestore, AtasanUser } from '@/lib/permits';
import { ShieldCheck, Lock, User, AlertCircle, ArrowLeft, CheckCircle2, UserCheck, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function UnifiedLoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const router = useRouter();

  // Ensure Atasan are seeded to Firestore and check active sessions
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        await ensureAtasanInFirestore();
      } catch (e) {
        console.warn('Could not verify atasan firestore seed:', e);
      }

      const unsubscribe = onAuthStateChanged(auth, (user) => {
        if (!isMounted) return;
        if (user) {
          router.push('/admin/dashboard');
        } else {
          setInitializing(false);
        }
      });

      return () => unsubscribe();
    };

    init();
    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanId = identifier.trim();
    const cleanPass = password.trim();

    if (!cleanId || !cleanPass) {
      setError('Harap masukkan identitas akun / NIP dan kata sandi / PIN.');
      return;
    }

    setLoading(true);

    try {
      // 1. If it looks like an email or standard admin account, try Firebase Auth first
      const isEmail = cleanId.includes('@');
      let adminSuccess = false;

      if (isEmail) {
        try {
          await signInWithEmailAndPassword(auth, cleanId, cleanPass);
          sessionStorage.removeItem('siap_approval_atasan');
          adminSuccess = true;
          router.push('/admin/dashboard');
          return;
        } catch (authErr: any) {
          // If explicitly wrong password or credential, record it
          if (authErr.code === 'auth/wrong-password' || authErr.code === 'auth/invalid-credential') {
            setError('Email atau kata sandi Administrator salah. Silakan periksa kembali.');
            setLoading(false);
            return;
          }
          // If user not found, fall through to check if it's an Atasan
        }
      }

      // 2. Check if the identifier matches an Atasan Langsung in Firestore (atasan_users)
      try {
        let matchedAtasan: AtasanUser | null = null;

        // Try direct document lookup by NIP
        const atasanDoc = await getDoc(doc(db, 'atasan_users', cleanId));
        if (atasanDoc.exists()) {
          const data = atasanDoc.data();
          matchedAtasan = {
            nip: atasanDoc.id,
            nama: data.nama || '',
            jabatan: data.jabatan || '',
            unit_kerja: data.unit_kerja || '',
            pin: data.pin || '123456'
          };
        } else {
          // Scan collection for matching NIP or username
          const allAtasanSnap = await getDocs(collection(db, 'atasan_users'));
          for (const d of allAtasanSnap.docs) {
            const data = d.data();
            if (
              d.id === cleanId ||
              (data.nip && data.nip.trim() === cleanId) ||
              (data.nama && data.nama.toLowerCase() === cleanId.toLowerCase())
            ) {
              matchedAtasan = {
                nip: d.id,
                nama: data.nama || '',
                jabatan: data.jabatan || '',
                unit_kerja: data.unit_kerja || '',
                pin: data.pin || '123456'
              };
              break;
            }
          }
        }

        if (matchedAtasan) {
          // Compare PIN
          const expectedPin = matchedAtasan.pin ? matchedAtasan.pin.trim() : '123456';
          if (cleanPass === expectedPin) {
            // SUCCESSFUL ATASAN LOGIN
            const sessionPayload = {
              role: 'atasan',
              nip: matchedAtasan.nip,
              nama: matchedAtasan.nama,
              jabatan: matchedAtasan.jabatan,
              unit_kerja: matchedAtasan.unit_kerja
            };
            sessionStorage.setItem('siap_approval_atasan', JSON.stringify(sessionPayload));
            router.push('/persetujuan-izin');
            return;
          } else {
            setError(
              'PIN Atasan tidak sesuai. Silakan gunakan 6 digit PIN pejabat yang terdaftar atau hubungi Administrator.'
            );
            setLoading(false);
            return;
          }
        }
      } catch (firestoreErr) {
        console.warn('Error verifying atasan against Firestore:', firestoreErr);
      }

      // 3. If not an email and not matched as Atasan, attempt Firebase Auth as fallback (e.g. admin username)
      if (!isEmail) {
        try {
          await signInWithEmailAndPassword(auth, cleanId, cleanPass);
          sessionStorage.removeItem('siap_approval_atasan');
          router.push('/admin/dashboard');
          return;
        } catch {
          // Ignore and show generic error
        }
      }

      setError(
        'Akun atau kata sandi/PIN tidak ditemukan. Pastikan Anda memasukkan Email Administrator yang valid atau NIP & PIN Pejabat Atasan Langsung.'
      );
    } catch (err: any) {
      console.error('Unified login error:', err);
      setError(err.message || 'Terjadi gangguan saat memproses login.');
    } finally {
      setLoading(false);
    }
  };

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-medium">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
          <span>Memverifikasi portal masuk...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans text-slate-800">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 px-6 py-8 text-center text-white relative">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-12 h-12 bg-blue-600/30 border border-blue-400/40 rounded-2xl flex items-center justify-center shadow-inner">
              <ShieldCheck className="w-6 h-6 text-blue-400" />
            </div>
            <div className="w-12 h-12 bg-emerald-600/30 border border-emerald-400/40 rounded-2xl flex items-center justify-center shadow-inner">
              <UserCheck className="w-6 h-6 text-emerald-400" />
            </div>
          </div>
          <h1 className="text-xl font-bold tracking-tight mb-1">
            Login Aplikasi
          </h1>
          <p className="text-slate-300 text-xs max-w-xs mx-auto leading-relaxed">
            Apliaksi Absensi PPPK Paruh Waktu
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-[11px] font-medium text-slate-200 border border-white/10">
            <span>Setda Kabupaten Demak</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 md:p-8">
          {error && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-700 text-xs leading-relaxed animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Email atau NIP
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <User className="w-4 h-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-400"
                  placeholder="Email atau NIP"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Kata Sandi atau PIN
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="w-4 h-4 text-slate-400" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-400"
                  placeholder="Kata sandi atau PIN"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-60 flex items-center justify-center gap-2 mt-2 cursor-pointer text-sm"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                  <span>Memverifikasi Otorisasi...</span>
                </>
              ) : (
                <>
                  <span>Masuk ke Sistem</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-5 text-center border-t border-slate-100 pt-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Halaman Publik Absensi</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
