'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  getDocs
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AtasanUser, ensureAtasanInFirestore, DEFAULT_ATASAN_LIST } from '@/lib/permits';
import {
  UserCheck,
  Search,
  Plus,
  Edit2,
  Trash2,
  Lock,
  KeyRound,
  ShieldCheck,
  Building,
  RefreshCw,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  X,
  Info
} from 'lucide-react';

interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  message: string;
}

interface DeleteTarget {
  nip: string;
  nama: string;
  jabatan: string;
  unit_kerja: string;
}

export default function AdminAtasanManagement() {
  const [atasanList, setAtasanList] = useState<AtasanUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [unitFilter, setUnitFilter] = useState('all');
  const [showPinNip, setShowPinNip] = useState<Record<string, boolean>>({});

  // Toast State
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success', title?: string) => {
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 6);
      setToasts((prev) => [...prev, { id, type, title, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Modal Form State (Add / Edit)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNip, setEditingNip] = useState<string | null>(null);
  const [formNip, setFormNip] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formJabatan, setFormJabatan] = useState('');
  const [formUnitKerja, setFormUnitKerja] = useState('Bagian Umum');
  const [formPin, setFormPin] = useState('123456');
  const [isSaving, setIsSaving] = useState(false);

  // Delete Confirmation Modal State
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Seed & Listen to Firestore 'atasan_users'
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        await ensureAtasanInFirestore();
      } catch (err) {
        console.warn('Initial atasan seed warning:', err);
      }
    };

    init();

    const unsub = onSnapshot(
      collection(db, 'atasan_users'),
      (snapshot) => {
        if (!isMounted) return;
        const list: AtasanUser[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            nip: d.id,
            nama: data.nama || '',
            jabatan: data.jabatan || '',
            unit_kerja: data.unit_kerja || '',
            pin: data.pin || '123456'
          };
        });

        // Sort by Unit Kerja then Nama
        list.sort(
          (a, b) =>
            (a.unit_kerja || '').localeCompare(b.unit_kerja || '') ||
            (a.nama || '').localeCompare(b.nama || '')
        );

        setAtasanList(list);
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to atasan_users in Firestore:', error);
        setLoading(false);
      }
    );

    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  // Unique Unit Kerja options
  const unitOptions = useMemo(() => {
    const set = new Set<string>();
    atasanList.forEach((a) => {
      if (a.unit_kerja) set.add(a.unit_kerja);
    });
    // Add standard sections if not present
    [
      'Bagian Umum',
      'Bagian Hukum',
      'Bagian Organisasi',
      'Bagian Perekonomian & SDA',
      'Bagian Administrasi Pembangunan',
      'Bagian Pengadaan Barang & Jasa',
      'Bagian Pemerintahan',
      'Bagian Kesejahteraan Rakyat',
      'Bagian Protokol & Komunikasi Pimpinan'
    ].forEach((u) => set.add(u));

    return Array.from(set).sort();
  }, [atasanList]);

  // Filtered List
  const filteredList = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return atasanList.filter((item) => {
      const matchSearch =
        !q ||
        (item.nama && item.nama.toLowerCase().includes(q)) ||
        (item.nip && item.nip.includes(q)) ||
        (item.jabatan && item.jabatan.toLowerCase().includes(q)) ||
        (item.unit_kerja && item.unit_kerja.toLowerCase().includes(q));

      const matchUnit = unitFilter === 'all' || item.unit_kerja === unitFilter;

      return matchSearch && matchUnit;
    });
  }, [atasanList, searchQuery, unitFilter]);

  // Actions
  const handleOpenAdd = () => {
    setEditingNip(null);
    setFormNip('');
    setFormNama('');
    setFormJabatan('');
    setFormUnitKerja('Bagian Umum');
    setFormPin('123456');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: AtasanUser) => {
    setEditingNip(item.nip);
    setFormNip(item.nip);
    setFormNama(item.nama);
    setFormJabatan(item.jabatan);
    setFormUnitKerja(item.unit_kerja);
    setFormPin(item.pin || '123456');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNip = formNip.trim();
    const cleanNama = formNama.trim();
    const cleanJabatan = formJabatan.trim() || `Kepala ${formUnitKerja.trim()}`;
    const cleanUnit = formUnitKerja.trim();
    const cleanPin = formPin.trim() || '123456';

    if (!cleanNip || !cleanNama || !cleanUnit) {
      showToast('NIP, Nama Pejabat, dan Unit Kerja wajib diisi.', 'warning', 'Form Belum Lengkap');
      return;
    }

    setIsSaving(true);
    try {
      const docData = {
        nip: cleanNip,
        nama: cleanNama,
        jabatan: cleanJabatan,
        unit_kerja: cleanUnit,
        pin: cleanPin,
        updated_at: new Date().toISOString()
      };

      await setDoc(doc(db, 'atasan_users', cleanNip), docData);

      const isEdit = !!editingNip;
      showToast(
        isEdit
          ? `Data pejabat "${cleanNama}" berhasil diperbarui di database Firestore.`
          : `Pejabat baru "${cleanNama}" berhasil ditambahkan ke database Firestore.`,
        'success',
        isEdit ? 'Pejabat Diperbarui' : 'Pejabat Ditambahkan'
      );
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error saving atasan to Firestore:', err);
      showToast(
        `Gagal menyimpan data: ${err?.message || 'Periksa koneksi'}`,
        'error',
        'Gagal Menyimpan'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = (item: AtasanUser) => {
    setDeleteTarget({
      nip: item.nip,
      nama: item.nama,
      jabatan: item.jabatan,
      unit_kerja: item.unit_kerja
    });
  };

  const handleExecuteDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'atasan_users', deleteTarget.nip));
      showToast(
        `Data pejabat "${deleteTarget.nama}" (${deleteTarget.nip}) berhasil dihapus dari database Firestore.`,
        'success',
        'Pejabat Dihapus'
      );
      setDeleteTarget(null);
    } catch (err: any) {
      console.error('Error deleting atasan:', err);
      showToast(
        `Gagal menghapus data: ${err?.message || 'Periksa koneksi'}`,
        'error',
        'Gagal Menghapus'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleForceSync = async () => {
    setLoading(true);
    try {
      const seeded = await ensureAtasanInFirestore();
      showToast(
        `Berhasil menyinkronkan ${seeded.length} data pejabat master ke Firestore.`,
        'success',
        'Sinkronisasi Database'
      );
    } catch (err: any) {
      showToast(
        `Gagal sinkronisasi: ${err?.message || 'Periksa koneksi'}`,
        'error',
        'Gagal Sinkronisasi'
      );
    } finally {
      setLoading(false);
    }
  };

  const togglePinVisibility = (nip: string) => {
    setShowPinNip((prev) => ({ ...prev, [nip]: !prev[nip] }));
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <UserCheck className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Kelola Pejabat &amp; PIN Atasan Langsung
            </h1>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
            Data pejabat struktural / Kepala Bagian di lingkungan Sekretariat Daerah Kabupaten Demak yang berwenang memberikan pengesahan izin sakit, cuti, dan dinas luar. Seluruh data tersimpan permanen di database <strong>Firestore</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleForceSync}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Sinkronisasi & Verifikasi Database Firestore"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            <span>Sinkronkan Database</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Pejabat Baru</span>
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Total Pejabat Terdaftar</p>
            <p className="text-xl font-bold text-slate-900">{atasanList.length} Orang</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Building className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Bagian / Unit Kerja</p>
            <p className="text-xl font-bold text-slate-900">{unitOptions.length} Bagian</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">Status Penyimpanan</p>
            <p className="text-sm font-bold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>Database Firestore Cloud</span>
            </p>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari berdasarkan Nama, NIP, Jabatan, atau Bagian..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500 shrink-0">Filter Bagian:</label>
          <select
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none text-slate-700 max-w-xs"
          >
            <option value="all">Semua Bagian ({atasanList.length})</option>
            {unitOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4 w-12 text-center">No</th>
                <th className="py-3.5 px-4">Nama Pejabat &amp; NIP</th>
                <th className="py-3.5 px-4">Jabatan Struktural</th>
                <th className="py-3.5 px-4">Bagian / Unit Kerja</th>
                <th className="py-3.5 px-4 w-32 text-center">PIN Otorisasi</th>
                <th className="py-3.5 px-4 w-28 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
                    <span>Memuat data pejabat dari database Firestore...</span>
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <UserCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600">Tidak ada data pejabat yang cocok</p>
                    <p className="text-[11px] text-slate-400 mt-1">Coba kata kunci pencarian atau filter bagian lain.</p>
                  </td>
                </tr>
              ) : (
                filteredList.map((item, idx) => {
                  const isPinVisible = !!showPinNip[item.nip];
                  return (
                    <tr key={item.nip} className="hover:bg-blue-50/40 transition-colors group">
                      <td className="py-3.5 px-4 text-center text-slate-400 font-mono text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {item.nama}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          NIP: {item.nip}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800">
                        {item.jabatan}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          <Building className="w-3 h-3 text-slate-500" />
                          <span>{item.unit_kerja}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs">
                          <Lock className="w-3 h-3 text-slate-400" />
                          <span>{isPinVisible ? item.pin || '123456' : '••••••'}</span>
                          <button
                            type="button"
                            onClick={() => togglePinVisibility(item.nip)}
                            className="text-slate-400 hover:text-slate-600 p-0.5 ml-1 transition-colors cursor-pointer"
                            title={isPinVisible ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                          >
                            {isPinVisible ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit Data & PIN Pejabat"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConfirmDelete(item)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Hapus Pejabat dari Database"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: ADD / EDIT PEJABAT (Scrollable Modal) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-100 overflow-hidden my-auto flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/10 text-blue-300 flex items-center justify-center">
                  {editingNip ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {editingNip ? 'Edit Data Pejabat & PIN' : 'Tambah Pejabat Baru'}
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Penyimpanan langsung ke database Firestore Cloud
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="flex flex-col min-h-0 flex-1 overflow-hidden">
              <div className="p-6 space-y-4 text-xs overflow-y-auto flex-1 overscroll-contain">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                  NIP Pejabat (18 Digit) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formNip}
                  onChange={(e) => setFormNip(e.target.value)}
                  disabled={!!editingNip}
                  placeholder="Contoh: 197505121998031002"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  required
                />
                {editingNip && (
                  <p className="text-[10px] text-slate-400 mt-1">NIP tidak dapat diubah saat mode edit (Primary Key database).</p>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                  Nama Lengkap &amp; Gelar <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  placeholder="Contoh: Drs. H. Ahmad Sudrajat, M.Si."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                  Bagian / Unit Kerja <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formUnitKerja}
                  onChange={(e) => setFormUnitKerja(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                  required
                >
                  {unitOptions.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                  Jabatan Struktural
                </label>
                <input
                  type="text"
                  value={formJabatan}
                  onChange={(e) => setFormJabatan(e.target.value)}
                  placeholder={`Contoh: Kepala ${formUnitKerja}`}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1.5">
                  PIN Otorisasi (6 Digit) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formPin}
                    onChange={(e) => setFormPin(e.target.value)}
                    maxLength={10}
                    placeholder="123456"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                    required
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Digunakan oleh pejabat saat login di Satu Pintu Login untuk mengakses persetujuan izin. Default: 123456.
                </p>
              </div>

              </div>

              {/* Modal Footer (Pinned) */}
              <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan ke Firestore...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{editingNip ? 'Simpan Perubahan' : 'Tambah ke Firestore'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION (Scrollable Modal) */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 overflow-hidden my-auto flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150">
            <div className="p-5 bg-gradient-to-r from-rose-900 to-rose-950 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/10 text-rose-300 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Konfirmasi Hapus Pejabat</h3>
                  <p className="text-[11px] text-rose-200">Tindakan ini permanen di Firestore</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs overflow-y-auto flex-1 overscroll-contain">
              <p className="text-slate-600">
                Apakah Anda yakin ingin menghapus data pejabat ini dari database Firestore? Pejabat ini tidak akan dapat login lagi untuk menyetujui izin.
              </p>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 font-medium text-slate-700">
                <div className="flex justify-between">
                  <span className="text-slate-400">Nama Pejabat:</span>
                  <span className="font-bold text-slate-900">{deleteTarget.nama}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">NIP:</span>
                  <span className="font-mono">{deleteTarget.nip}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Bagian:</span>
                  <span>{deleteTarget.unit_kerja}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Jabatan:</span>
                  <span>{deleteTarget.jabatan}</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                disabled={isDeleting}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Permanen</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          const isWarning = toast.type === 'warning';
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto p-3.5 rounded-xl border shadow-lg flex items-start gap-3 transition-all animate-in slide-in-from-bottom-2 ${
                isSuccess
                  ? 'bg-white border-emerald-200 text-slate-800 shadow-emerald-500/10'
                  : isError
                  ? 'bg-white border-rose-200 text-slate-800 shadow-rose-500/10'
                  : isWarning
                  ? 'bg-white border-amber-200 text-slate-800 shadow-amber-500/10'
                  : 'bg-white border-blue-200 text-slate-800 shadow-blue-500/10'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  isSuccess
                    ? 'bg-emerald-100 text-emerald-600'
                    : isError
                    ? 'bg-rose-100 text-rose-600'
                    : isWarning
                    ? 'bg-amber-100 text-amber-600'
                    : 'bg-blue-100 text-blue-600'
                }`}
              >
                {isSuccess && <CheckCircle2 className="w-4 h-4" />}
                {isError && <AlertCircle className="w-4 h-4" />}
                {isWarning && <AlertTriangle className="w-4 h-4" />}
                {toast.type === 'info' && <Info className="w-4 h-4" />}
              </div>

              <div className="flex-1 min-w-0 pt-0.5">
                {toast.title && (
                  <p className="text-xs font-bold text-slate-900 leading-tight mb-0.5">
                    {toast.title}
                  </p>
                )}
                <p className="text-xs text-slate-600 leading-relaxed break-words">
                  {toast.message}
                </p>
              </div>

              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
