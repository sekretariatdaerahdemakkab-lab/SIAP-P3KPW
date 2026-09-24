'use client';

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  onSnapshot,
  deleteDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PermitItem, PERMIT_TYPES } from '@/lib/permits';
import PermitFormModal from '@/components/PermitFormModal';
import {
  FileText,
  ShieldCheck,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  LogOut,
  Plus,
  Search,
  Filter,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  AlertCircle,
  FileSpreadsheet,
  ArrowLeft,
  User,
  Building2,
  Briefcase,
  Paperclip,
  ExternalLink,
  Trash2,
  RefreshCw,
  HelpCircle,
  Check,
  UserCheck
} from 'lucide-react';

interface EmployeeSession {
  nip: string;
  nama: string;
  jabatan: string;
  unit_kerja: string;
}

function PortalIzinContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const nipParam = searchParams.get('nip') || '';

  // Authentication states - ALWAYS null on initial load so PIN is always required
  const [employee, setEmployee] = useState<EmployeeSession | null>(null);

  // Target employee info (if passed from URL or chosen)
  const [targetEmployee, setTargetEmployee] = useState<{
    nip: string;
    nama: string;
    jabatan?: string;
    unit_kerja?: string;
  } | null>(null);

  // Form login states - PIN ALWAYS starts empty as requested
  const [loginPin, setLoginPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Optional picker states for choosing employee if not in URL
  const [allEmployeesList, setAllEmployeesList] = useState<{ nip: string; nama: string; jabatan?: string }[]>([]);
  const [showEmployeePicker, setShowEmployeePicker] = useState(!nipParam);
  const [pickerSearch, setPickerSearch] = useState('');
  const [loadingAllEmps, setLoadingAllEmps] = useState(false);

  // Permits states
  const [permits, setPermits] = useState<PermitItem[]>([]);
  const [loadingPermits, setLoadingPermits] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [jenisFilter, setJenisFilter] = useState<string>('all');

  // Permit Modal
  const [isPermitModalOpen, setIsPermitModalOpen] = useState(false);

  // Change PIN Modal
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinChangeLoading, setPinChangeLoading] = useState(false);
  const [pinChangeError, setPinChangeError] = useState<string | null>(null);
  const [pinChangeSuccess, setPinChangeSuccess] = useState(false);

  // Delete pending permit modal
  const [deleteTargetPermit, setDeleteTargetPermit] = useState<PermitItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Notice about default PIN
  const [isUsingDefaultPin, setIsUsingDefaultPin] = useState(false);

  // Load target employee if nipParam is present in URL
  useEffect(() => {
    const clean = nipParam.trim();
    if (!clean) return;

    let isMounted = true;
    const docRef = doc(db, 'employees', clean);
    getDoc(docRef)
      .then((snapshot) => {
        if (!isMounted) return;
        if (snapshot.exists()) {
          const data = snapshot.data();
          setTargetEmployee({
            nip: clean,
            nama: data.nama || 'Pegawai Setda Demak',
            jabatan: data.jabatan || 'PPPK Paruh Waktu',
            unit_kerja: data.unit_kerja || 'Sekretariat Daerah Kabupaten Demak'
          });
        } else {
          setTargetEmployee({
            nip: clean,
            nama: 'Pegawai Setda Demak',
            jabatan: 'PPPK Paruh Waktu',
            unit_kerja: 'Sekretariat Daerah Kabupaten Demak'
          });
        }
      })
      .catch((err) => {
        console.error('Error fetching target employee:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [nipParam]);

  // Fetch full employee list for search modal if needed
  const fetchAllEmployees = useCallback(async () => {
    if (allEmployeesList.length > 0) return;
    setLoadingAllEmps(true);
    try {
      const snap = await getDocs(collection(db, 'employees'));
      const list = snap.docs.map((d) => ({
        nip: d.id,
        nama: d.data().nama || 'Pegawai Setda Demak',
        jabatan: d.data().jabatan || 'PPPK Paruh Waktu'
      }));
      list.sort((a, b) => a.nama.localeCompare(b.nama));
      setAllEmployeesList(list);
    } catch (e) {
      console.error('Error fetching employee list:', e);
    } finally {
      setLoadingAllEmps(false);
    }
  }, [allEmployeesList.length]);

  // If no NIP parameter provided in URL, prefetch employee list in background so user can search immediately
  useEffect(() => {
    if (nipParam) return;
    let isMounted = true;
    getDocs(collection(db, 'employees'))
      .then((snap) => {
        if (!isMounted) return;
        const list = snap.docs.map((d) => ({
          nip: d.id,
          nama: d.data().nama || 'Pegawai Setda Demak',
          jabatan: d.data().jabatan || 'PPPK Paruh Waktu'
        }));
        list.sort((a, b) => a.nama.localeCompare(b.nama));
        setAllEmployeesList(list);
      })
      .catch((e) => {
        console.error('Error prefetching employee list:', e);
      });

    return () => {
      isMounted = false;
    };
  }, [nipParam]);

  // Listen to employee permits when authenticated
  useEffect(() => {
    if (!employee?.nip) return;

    const q = query(
      collection(db, 'permits'),
      where('nip', '==', employee.nip.trim())
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: PermitItem[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PermitItem, 'id'>)
        }));

        list.sort(
          (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
        setPermits(list);
        setLoadingPermits(false);
      },
      (err) => {
        console.error('Error listening to permits:', err);
        setLoadingPermits(false);
      }
    );

    return () => unsub();
  }, [employee?.nip]);

  // Handle Login Authentication with PIN Only (6 digit terakhir NIP)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const cleanPin = loginPin.trim();

    if (!cleanPin) {
      setLoginError('Silakan masukkan PIN Anda.');
      return;
    }

    setLoginLoading(true);

    try {
      // Skenario 1: Pegawai target sudah ditentukan (dari parameter URL atau dipilih dari daftar)
      if (targetEmployee?.nip) {
        const targetNip = targetEmployee.nip;
        const authDocRef = doc(db, 'employee_auth', targetNip);
        const authDoc = await getDoc(authDocRef);

        let pinMatches = false;
        let usingDefault = false;

        if (authDoc.exists()) {
          const authData = authDoc.data();
          if (authData.pin === cleanPin) {
            pinMatches = true;
          }
        } else {
          // PIN standar adalah 6 angka belakang NIP
          const defaultPin = targetNip.length >= 6 ? targetNip.slice(-6) : targetNip;
          if (cleanPin === defaultPin) {
            pinMatches = true;
            usingDefault = true;
          }
        }

        if (!pinMatches) {
          setLoginError('PIN tidak sesuai. Masukkan 6 angka belakang pada NIP Anda.');
          setLoginLoading(false);
          return;
        }

        const sessionData: EmployeeSession = {
          nip: targetNip,
          nama: targetEmployee.nama,
          jabatan: targetEmployee.jabatan || 'PPPK Paruh Waktu',
          unit_kerja: targetEmployee.unit_kerja || 'Sekretariat Daerah Kabupaten Demak'
        };

        setIsUsingDefaultPin(usingDefault);
        setEmployee(sessionData);
        setLoginPin('');
        setLoginLoading(false);
        return;
      }

      // Skenario 2: Jika pegawai belum dipilih, minta pilih nama terlebih dahulu
      setLoginError('Silakan pilih nama pegawai Anda terlebih dahulu sebelum memasukkan PIN.');
      setShowEmployeePicker(true);
      fetchAllEmployees();
      setLoginLoading(false);
    } catch (err) {
      console.error('Login error:', err);
      setLoginError('Terjadi kesalahan saat otentikasi. Silakan coba beberapa saat lagi.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle Logout
  const handleLogout = () => {
    setEmployee(null);
    setLoginPin('');
    setPermits([]);
  };

  // Handle PIN Change
  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinChangeError(null);
    setPinChangeSuccess(false);

    if (!employee?.nip) return;

    if (!currentPinInput.trim()) {
      setPinChangeError('Masukkan PIN saat ini.');
      return;
    }
    if (newPinInput.trim().length < 4) {
      setPinChangeError('PIN baru minimal harus 4 karakter.');
      return;
    }
    if (newPinInput.trim() !== confirmPinInput.trim()) {
      setPinChangeError('Konfirmasi PIN baru tidak cocok.');
      return;
    }

    setPinChangeLoading(true);

    try {
      const authDocRef = doc(db, 'employee_auth', employee.nip);
      const authDoc = await getDoc(authDocRef);

      const defaultPin = employee.nip.length >= 6 ? employee.nip.slice(-6) : employee.nip;
      const actualPin = authDoc.exists() ? authDoc.data().pin : defaultPin;

      if (currentPinInput.trim() !== actualPin) {
        setPinChangeError('PIN saat ini yang Anda masukkan salah.');
        setPinChangeLoading(false);
        return;
      }

      // Update PIN
      await setDoc(authDocRef, {
        nip: employee.nip,
        pin: newPinInput.trim(),
        updated_at: new Date().toISOString()
      }, { merge: true });

      setPinChangeSuccess(true);
      setIsUsingDefaultPin(false);
      setTimeout(() => {
        setIsPinModalOpen(false);
        setCurrentPinInput('');
        setNewPinInput('');
        setConfirmPinInput('');
        setPinChangeSuccess(false);
      }, 1500);
    } catch (err) {
      console.error('Error changing PIN:', err);
      setPinChangeError('Gagal mengubah PIN. Pastikan koneksi internet stabil.');
    } finally {
      setPinChangeLoading(false);
    }
  };

  // Handle Cancel/Delete Pending Permit
  const handleDeletePermit = async () => {
    if (!deleteTargetPermit) return;

    setDeleteLoading(true);
    try {
      await deleteDoc(doc(db, 'permits', deleteTargetPermit.id));
      setDeleteTargetPermit(null);
    } catch (err) {
      console.error('Error deleting permit:', err);
      alert('Gagal membatalkan pengajuan izin. Pastikan pengajuan masih berstatus menunggu verifikasi.');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Stats calculation
  const totalSubmissions = permits.length;
  const pendingCount = permits.filter((p) => p.status === 'pending').length;
  const approvedCount = permits.filter((p) => p.status === 'approved').length;
  const rejectedCount = permits.filter((p) => p.status === 'rejected').length;
  const dlDays = permits
    .filter((p) => p.status === 'approved' && p.jenis === 'dinas_luar')
    .reduce((acc, curr) => acc + (curr.jumlah_hari || 1), 0);

  // Filtered permits
  const filteredPermits = permits.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (jenisFilter !== 'all' && item.jenis !== jenisFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchKeterangan = (item.keterangan || '').toLowerCase().includes(q);
      const matchNomor = (item.nomor_surat || '').toLowerCase().includes(q);
      const matchJenis = (PERMIT_TYPES[item.jenis]?.label || '').toLowerCase().includes(q);
      const matchTanggal = `${item.tanggal_mulai} ${item.tanggal_selesai}`.includes(q);
      if (!matchKeterangan && !matchNomor && !matchJenis && !matchTanggal) return false;
    }

    return true;
  });

  // ==========================================
  // VIEW 1: AUTHENTICATION SCREEN (NOT LOGGED IN)
  // ==========================================
  if (!employee) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans text-slate-800">
        {/* Top Header */}
        <header className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 tracking-tight">SIAP PPPK Paruh Waktu</h1>
              <p className="text-[11px] text-slate-500 font-medium">Sekretariat Daerah Kabupaten Demak</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Presensi</span>
            </Link>
          </div>
        </header>

        {/* Auth Form Container */}
        <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            {/* Card Header */}
            <div className="p-6 bg-gradient-to-b from-blue-50/70 to-white border-b border-slate-100 text-center">
              <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-3 shadow-xs">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Pengajuan Izin &amp; Dinas Luar Pegawai</h2>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                Masukkan PIN untuk mengakses formulir dan riwayat permohonan izin pribadi Anda.
              </p>
            </div>

            {/* Error Message */}
            {loginError && (
              <div className="mx-6 mt-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <strong className="font-semibold block">Gagal Masuk</strong>
                  <span>{loginError}</span>
                </div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLogin} className="p-6 space-y-4">
              {/* Target Employee Info or Selector */}
              {targetEmployee ? (
                <div className="p-3.5 bg-blue-50/90 border border-blue-200 rounded-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                      {targetEmployee.nama.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate">{targetEmployee.nama}</h4>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetEmployee(null);
                      setLoginPin('');
                      setLoginError(null);
                    }}
                    className="text-[11px] text-blue-700 hover:text-blue-900 font-semibold px-2 py-1 bg-white hover:bg-blue-100/80 border border-blue-200 rounded-md transition-colors shrink-0 cursor-pointer shadow-2xs"
                  >
                    Ganti Pegawai
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {showEmployeePicker ? (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Pilih Nama Pegawai
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowEmployeePicker(false)}
                          className="text-[11px] text-slate-500 hover:text-slate-700 underline cursor-pointer"
                        >
                          Tutup
                        </button>
                      </div>
                      <input
                        type="text"
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        placeholder="Cari nama atau NIP..."
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                        {loadingAllEmps ? (
                          <div className="p-3 text-center text-xs text-slate-400">Memuat data pegawai...</div>
                        ) : (
                          allEmployeesList
                            .filter(
                              (emp) =>
                                emp.nama.toLowerCase().includes(pickerSearch.toLowerCase()) ||
                                emp.nip.includes(pickerSearch)
                            )
                            .slice(0, 10)
                            .map((emp) => (
                              <button
                                key={emp.nip}
                                type="button"
                                onClick={() => {
                                  setTargetEmployee(emp);
                                  setShowEmployeePicker(false);
                                  setLoginPin('');
                                  setLoginError(null);
                                }}
                                className="w-full p-2 text-left hover:bg-blue-50 transition-colors flex items-center justify-between cursor-pointer"
                              >
                                <span className="text-xs font-semibold text-slate-800">{emp.nama}</span>
                                <span className="text-[11px] font-mono text-slate-400">{emp.nip}</span>
                              </button>
                            ))
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs pb-1">
                      <span className="text-slate-500">Akses langsung dengan PIN:</span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowEmployeePicker(true);
                          fetchAllEmployees();
                        }}
                        className="text-blue-600 hover:text-blue-800 hover:underline font-semibold text-[11px] cursor-pointer"
                      >
                        Pilih dari Nama Pegawai
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* PIN Input Only - Always Empty On Open */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Masukkan PIN
                  </label>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginPin}
                    onChange={(e) => setLoginPin(e.target.value)}
                    placeholder="Masukkan PIN"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono tracking-widest text-center text-base font-bold"
                    required
                    maxLength={8}
                    autoComplete="off"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showPassword ? 'Sembunyikan' : 'Tampilkan'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold text-sm rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer mt-3"
              >
                {loginLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Memverifikasi Identitas...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Buka Pengajuan Izin</span>
                  </>
                )}
              </button>
            </form>

            {/* (Privacy note removed as requested) */}
          </div>
        </main>

        {/* Footer */}
        <footer className="py-4 text-center text-xs text-slate-400 border-t border-slate-200/60">
          Bagian Umum — Sekretariat Daerah Kabupaten Demak
        </footer>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: AUTHENTICATED EMPLOYEE DASHBOARD
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      {/* Top Navbar */}
      <header className="px-6 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shadow-xs">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-900 tracking-tight">Pengajuan Izin &amp; Dinas Luar</h1>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full border border-emerald-200">
                Sesi Aman
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">PPPK Paruh Waktu Setda Demak</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/"
            className="px-3 py-1.5 text-slate-600 hover:text-blue-600 hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold transition-colors hidden sm:flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
            <span>Lihat Presensi Publik</span>
          </Link>
          <button
            onClick={() => setIsPinModalOpen(true)}
            className="px-3 py-1.5 text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Ubah PIN Pengaman Pribadi Anda"
          >
            <KeyRound className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden md:inline">Ubah PIN</span>
          </button>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Keluar dari sesi akun pegawai"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Banner Default PIN Warning (if active) */}
        {isUsingDefaultPin && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-800 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Saran Keamanan:</strong> Anda saat ini menggunakan PIN bawaan (6 digit terakhir NIP). Segera ubah PIN pribadi Anda agar tidak dapat dibuka oleh orang lain.
              </span>
            </div>
            <button
              onClick={() => setIsPinModalOpen(true)}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-semibold text-xs shrink-0 cursor-pointer shadow-2xs"
            >
              Ubah PIN Sekarang
            </button>
          </div>
        )}

        {/* Profile Card & Main Call to Action */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-xs shrink-0">
              {employee.nama.charAt(0).toUpperCase()}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">{employee.nama}</h2>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-[11px] font-mono font-medium">
                  NIP: {employee.nip}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                  <span>{employee.jabatan || 'PPPK Paruh Waktu'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>{employee.unit_kerja || 'Sekretariat Daerah Kabupaten Demak'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 self-stretch sm:self-auto">
            <button
              type="button"
              onClick={() => setIsPermitModalOpen(true)}
              className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Buat Pengajuan Izin / Dinas Luar Baru</span>
            </button>
          </div>
        </div>

        {/* Quick KPI Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Pengajuan</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-slate-800">{totalSubmissions}</span>
              <span className="text-xs text-slate-400">Berkas</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Seluruh izin &amp; dinas luar</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">Menunggu Verifikasi</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-amber-600">{pendingCount}</span>
              <span className="text-xs text-slate-400">Berkas</span>
            </div>
            <p className="text-[11px] text-amber-700/80 mt-1">Belum ditinjau admin</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Disetujui (Sah)</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-emerald-600">{approvedCount}</span>
              <span className="text-xs text-slate-400">Berkas</span>
            </div>
            <p className="text-[11px] text-emerald-700/80 mt-1">Terhitung ke rekapitulasi</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">Dinas Luar (SPT)</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-indigo-600">{dlDays}</span>
              <span className="text-xs text-slate-400">Hari</span>
            </div>
            <p className="text-[11px] text-indigo-700/80 mt-1">Disetujui dengan surat tugas</p>
          </div>
        </div>

        {/* Permits History Table Container */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Header & Filter Bar */}
          <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/60">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Histori Permohonan Izin &amp; Dinas Luar Saya
              </h3>
              <p className="text-xs text-slate-500">
                Menampilkan seluruh permohonan yang diajukan atas nama NIP {employee.nip}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari permohonan / SPT..."
                  className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-44 sm:w-56"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    statusFilter === 'all' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Semua
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('pending')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                    statusFilter === 'pending' ? 'bg-amber-500 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span>Menunggu</span>
                  {pendingCount > 0 && <span className="text-[10px] font-bold">({pendingCount})</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('approved')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    statusFilter === 'approved' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Disetujui
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('rejected')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    statusFilter === 'rejected' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Ditolak
                </button>
              </div>

              {/* Jenis Filter Dropdown */}
              <select
                value={jenisFilter}
                onChange={(e) => setJenisFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="all">Semua Kategori</option>
                <option value="dinas_luar">Dinas Luar (DL)</option>
                <option value="sakit">Sakit (S)</option>
                <option value="cuti">Cuti (C)</option>
              </select>
            </div>
          </div>

          {/* List content */}
          {loadingPermits ? (
            <div className="p-12 text-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-2" />
              <p className="text-xs font-medium">Memuat daftar permohonan izin...</p>
            </div>
          ) : filteredPermits.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-2">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                <FileText className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-slate-700">Belum Ada Riwayat Permohonan Izin</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {searchQuery || statusFilter !== 'all' || jenisFilter !== 'all'
                  ? 'Tidak ada permohonan yang sesuai dengan kriteria filter pencarian.'
                  : 'Anda belum memiliki riwayat pengajuan izin atau dinas luar.'}
              </p>
              <button
                type="button"
                onClick={() => setIsPermitModalOpen(true)}
                className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Pengajuan Pertama</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredPermits.map((item) => {
                const typeConfig = PERMIT_TYPES[item.jenis] || {
                  label: item.jenis,
                  badgeClass: 'bg-slate-100 text-slate-700 border-slate-200'
                };

                return (
                  <div key={item.id} className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                      {/* Left: Type, Status, and Date Details */}
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${typeConfig.badgeClass}`}>
                            {typeConfig.label}
                          </span>

                          {item.status === 'pending' && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1 animate-pulse">
                              <Clock className="w-3 h-3 text-amber-600" />
                              Menunggu Verifikasi Admin
                            </span>
                          )}
                          {item.status === 'approved' && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Disetujui
                            </span>
                          )}
                          {item.status === 'rejected' && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1">
                              <XCircle className="w-3 h-3 text-rose-600" />
                              Ditolak
                            </span>
                          )}

                          {item.is_susulan && (
                            <span
                              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-300 flex items-center gap-1"
                              title="Diajukan setelah tanggal pelaksanaan"
                            >
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              Susulan ({item.selisih_hari_susulan || 1} hari lalu)
                            </span>
                          )}
                        </div>

                        {/* Date Range & Duration */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700">
                          <div className="flex items-center gap-1.5 font-semibold">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {item.tanggal_mulai === item.tanggal_selesai
                                ? item.tanggal_mulai
                                : `${item.tanggal_mulai} s.d. ${item.tanggal_selesai}`}
                            </span>
                          </div>
                          <span className="text-slate-400">•</span>
                          <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            Durasi: {item.jumlah_hari || 1} Hari Kerja
                          </span>
                          {item.nomor_surat && (
                            <>
                              <span className="text-slate-400">•</span>
                              <span className="text-slate-600 font-mono">
                                No: <strong>{item.nomor_surat}</strong>
                              </span>
                            </>
                          )}
                        </div>

                        {/* Description */}
                        <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
                          {item.keterangan || '-'}
                        </p>

                        {/* Admin Notes if Approved or Rejected */}
                        {item.catatan_admin && (
                          <div className="mt-2 p-2.5 rounded-lg bg-slate-100/90 border border-slate-200 text-xs text-slate-700 flex items-start gap-2">
                            <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold text-slate-800">Catatan Verifikator: </span>
                              <span>{item.catatan_admin}</span>
                              {item.approved_at && (
                                <span className="text-[10px] text-slate-400 block mt-0.5">
                                  Ditinjau pada: {new Date(item.approved_at).toLocaleString('id-ID')}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right: Attachment & Cancel Action */}
                      <div className="flex md:flex-col items-end justify-between md:justify-start gap-2 shrink-0 pt-2 md:pt-0">
                        {item.lampiran_url && (
                          <a
                            href={item.lampiran_url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-200"
                          >
                            <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                            <span>Lihat Bukti Lampiran</span>
                            <ExternalLink className="w-3 h-3 text-slate-400" />
                          </a>
                        )}

                        {item.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => setDeleteTargetPermit(item)}
                            className="px-2.5 py-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                            title="Batalkan permohonan ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Batalkan</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Modal: Change PIN (Scrollable Modal) */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full my-auto max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 px-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-800">Ubah PIN Pengaman Pribadi</h3>
              </div>
              <button
                onClick={() => setIsPinModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleChangePin} className="p-5 space-y-3.5 overflow-y-auto flex-1 overscroll-contain">
              {pinChangeError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{pinChangeError}</span>
                </div>
              )}

              {pinChangeSuccess && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>PIN berhasil diperbarui!</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">PIN Saat Ini</label>
                <input
                  type="password"
                  value={currentPinInput}
                  onChange={(e) => setCurrentPinInput(e.target.value)}
                  placeholder="PIN saat ini (atau 6 digit akhir NIP)"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">PIN Baru (Min. 4 Karakter)</label>
                <input
                  type="password"
                  value={newPinInput}
                  onChange={(e) => setNewPinInput(e.target.value)}
                  placeholder="Masukkan PIN baru"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Konfirmasi PIN Baru</label>
                <input
                  type="password"
                  value={confirmPinInput}
                  onChange={(e) => setConfirmPinInput(e.target.value)}
                  placeholder="Ulangi PIN baru"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={pinChangeLoading}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  {pinChangeLoading ? 'Menyimpan...' : 'Simpan PIN Baru'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete Pending Permit (Scrollable Modal) */}
      {deleteTargetPermit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full my-auto max-h-[90vh] flex flex-col p-5 space-y-4 overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Batalkan Pengajuan Izin?</h4>
                <p className="text-xs text-slate-500">Tindakan ini tidak dapat dibatalkan.</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-1 font-medium">
              <p>
                Kategori:{' '}
                <strong>
                  {PERMIT_TYPES[deleteTargetPermit.jenis]?.label || deleteTargetPermit.jenis}
                </strong>
              </p>
              <p>
                Periode:{' '}
                <strong>
                  {deleteTargetPermit.tanggal_mulai} s.d. {deleteTargetPermit.tanggal_selesai}
                </strong>
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTargetPermit(null)}
                disabled={deleteLoading}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={handleDeletePermit}
                disabled={deleteLoading}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {deleteLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Ya, Batalkan Permohonan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Permit Form (Strictly Prefilled & Locked to this Authenticated Employee) */}
      <PermitFormModal
        isOpen={isPermitModalOpen}
        onClose={() => setIsPermitModalOpen(false)}
        prefilledNip={employee.nip}
        prefilledNama={employee.nama}
        defaultUnitKerja={employee.unit_kerja}
        onSuccess={() => {
          setIsPermitModalOpen(false);
        }}
      />
    </div>
  );
}

export default function PortalIzinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="flex items-center gap-3 text-slate-600">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-sm font-medium">Memuat Pengajuan Izin Pegawai...</span>
          </div>
        </div>
      }
    >
      <PortalIzinContent />
    </Suspense>
  );
}
