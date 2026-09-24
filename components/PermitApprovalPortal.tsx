'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection,
  query,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  getDocs,
  setDoc
} from 'firebase/firestore';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import {
  PermitItem,
  PERMIT_TYPES,
  AtasanUser,
  DEFAULT_ATASAN_LIST,
  ensureAtasanInFirestore
} from '@/lib/permits';
import * as xlsx from 'xlsx';
import Link from 'next/link';
import DocumentViewerModal from '@/components/DocumentViewerModal';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
  Search,
  Filter,
  UserCheck,
  Building,
  User,
  Calendar,
  Eye,
  Check,
  X,
  RefreshCw,
  LogOut,
  Lock,
  Mail,
  AlertCircle,
  ExternalLink,
  Download,
  ArrowLeft,
  ChevronRight,
  Settings,
  KeyRound,
  Edit2,
  Plus,
  Trash2,
  Info
} from 'lucide-react';

interface ApprovalSession {
  role: 'atasan' | 'admin';
  nip?: string;
  nama: string;
  jabatan: string;
  unit_kerja?: string;
  email?: string;
}

interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  message: string;
}

interface DeleteConfirmTarget {
  type: 'atasan' | 'permit';
  id: string;
  title: string;
  subtitle: string;
  extraDetails?: { label: string; value: string }[];
}

export default function PermitApprovalPortal() {
  // Session State
  const [session, setSession] = useState<ApprovalSession | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedAtasan = sessionStorage.getItem('siap_approval_atasan');
        if (savedAtasan) {
          return JSON.parse(savedAtasan);
        }
      } catch (_) {}
    }
    return null;
  });
  const [sessionLoading, setSessionLoading] = useState(true);

  // Toast notifications state
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<DeleteConfirmTarget | null>(null);
  const [deleteExecuting, setDeleteExecuting] = useState(false);

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

  // Login Gate State (when not logged in)
  const [activeTab, setActiveTab] = useState<'atasan' | 'admin'>('atasan');
  
  // Atasan Login Form State
  const [atasanList, setAtasanList] = useState<AtasanUser[]>(DEFAULT_ATASAN_LIST);
  const [selectedAtasanNip, setSelectedAtasanNip] = useState<string>('');
  const [atasanPinInput, setAtasanPinInput] = useState('');
  const [atasanLoginError, setAtasanLoginError] = useState('');
  const [atasanLoginLoading, setAtasanLoginLoading] = useState(false);

  // Admin Login Form State
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminLoginError, setAdminLoginError] = useState('');
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);

  // Permits Data State
  const [permits, setPermits] = useState<PermitItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [unitKerjaFilter, setUnitKerjaFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedAtasan = sessionStorage.getItem('siap_approval_atasan');
        if (savedAtasan) {
          const parsed = JSON.parse(savedAtasan);
          if (parsed.unit_kerja) return parsed.unit_kerja;
        }
      } catch (_) {}
    }
    return 'all';
  });
  const [susulanOnly, setSusulanOnly] = useState<boolean>(false);

  // Review & Approval Modal State
  const [selectedPermit, setSelectedPermit] = useState<PermitItem | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Document Lightbox Preview Modal
  const [previewAttachmentUrl, setPreviewAttachmentUrl] = useState<string | null>(null);
  const [previewAttachmentTitle, setPreviewAttachmentTitle] = useState<string>('');
  const [previewAttachmentFileName, setPreviewAttachmentFileName] = useState<string>('Lampiran_Dokumen');

  // Atasan Management Modal State (Add/Edit supervisor names, PINs, and units)
  const [showManageAtasanModal, setShowManageAtasanModal] = useState(false);
  const [searchAtasanQuery, setSearchAtasanQuery] = useState('');
  const [editingAtasanNip, setEditingAtasanNip] = useState<string | null>(null);
  const [formAtasanNip, setFormAtasanNip] = useState('');
  const [formAtasanNama, setFormAtasanNama] = useState('');
  const [formAtasanJabatan, setFormAtasanJabatan] = useState('');
  const [formAtasanUnitKerja, setFormAtasanUnitKerja] = useState('Bagian Umum');
  const [formAtasanPin, setFormAtasanPin] = useState('123456');
  const [savingAtasan, setSavingAtasan] = useState(false);
  const [manageAtasanMsg, setManageAtasanMsg] = useState<string | null>(null);

  // Load / Refresh Atasan List directly from Firestore database
  const loadAtasanData = useCallback(async () => {
    try {
      // 1. Ensure initial master atasan data is seeded to Firestore if empty
      await ensureAtasanInFirestore();

      // 2. Read directly and permanently from Firestore collection atasan_users
      const customSnap = await getDocs(collection(db, 'atasan_users'));
      const atasanMap = new Map<string, AtasanUser>();

      customSnap.docs.forEach((docSnap) => {
        const d = docSnap.data();
        atasanMap.set(docSnap.id, {
          nip: docSnap.id,
          nama: d.nama || '',
          jabatan: d.jabatan || '',
          unit_kerja: d.unit_kerja || '',
          pin: d.pin || '123456'
        });
      });

      const combined = Array.from(atasanMap.values());
      // Sort nicely by Unit Kerja then Nama
      combined.sort((a, b) =>
        (a.unit_kerja || '').localeCompare(b.unit_kerja || '') ||
        (a.nama || '').localeCompare(b.nama || '')
      );
      setAtasanList(combined);
    } catch (err) {
      console.warn('Error loading atasan list from Firestore:', err);
    }
  }, []);

  // 1. Listen to Firebase Auth for Admin & load potential supervisors
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const adminSession: ApprovalSession = {
          role: 'admin',
          nama: 'Administrator Setda',
          jabatan: 'Pengelola Kepegawaian Setda Demak',
          email: user.email || 'admin@demakkab.go.id',
          unit_kerja: 'Sekretariat Daerah Kabupaten Demak'
        };
        setSession(adminSession);
      }
      setSessionLoading(false);
    });

    // Real-time listener for atasan_users collection
    const unsubAtasan = onSnapshot(
      collection(db, 'atasan_users'),
      () => {
        loadAtasanData();
      },
      (err) => {
        console.warn('Note on atasan listener:', err);
      }
    );

    return () => {
      unsubAuth();
      unsubAtasan();
    };
  }, [loadAtasanData]);

  // 2. Real-time Permits Listener
  useEffect(() => {
    const q = query(collection(db, 'permits'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: PermitItem[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PermitItem, 'id'>)
        }));
        list.sort(
          (a, b) =>
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
        setPermits(list);
        setLoadingData(false);
      },
      (err) => {
        console.error('Error listening to permits in approval portal:', err);
        setLoadingData(false);
      }
    );

    return () => unsub();
  }, []);

  // List of unique unit kerja from permits and atasan
  const availableUnitKerja = useMemo(() => {
    const set = new Set<string>();
    permits.forEach((p) => {
      if (p.unit_kerja) set.add(p.unit_kerja);
    });
    atasanList.forEach((a) => {
      if (a.unit_kerja) set.add(a.unit_kerja);
    });
    return Array.from(set).sort();
  }, [permits, atasanList]);

  // Handle Atasan Login
  const handleAtasanLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAtasanLoginError('');

    if (!selectedAtasanNip) {
      setAtasanLoginError('Silakan pilih nama pejabat / atasan Anda.');
      return;
    }

    const targetAtasan = atasanList.find((a) => a.nip === selectedAtasanNip);
    if (!targetAtasan) {
      setAtasanLoginError('Data atasan tidak ditemukan.');
      return;
    }

    const cleanPin = atasanPinInput.trim();
    if (!cleanPin) {
      setAtasanLoginError('Silakan masukkan PIN Otorisasi Anda.');
      return;
    }

    setAtasanLoginLoading(true);

    // Verification logic:
    // 1. Custom PIN defined in targetAtasan
    // 2. Default PIN: last 6 digits of NIP
    // 3. Master PIN: '123456' or 'demak2026' for Setda officials
    const defaultPin = targetAtasan.nip.length >= 6 ? targetAtasan.nip.slice(-6) : targetAtasan.nip;
    const isPinMatch =
      cleanPin === targetAtasan.pin ||
      cleanPin === defaultPin ||
      cleanPin === '123456' ||
      cleanPin === 'demak2026';

    if (!isPinMatch) {
      setAtasanLoginError(
        'PIN salah. Gunakan 6 digit angka belakang NIP Anda atau hubungi Admin Kepegawaian.'
      );
      setAtasanLoginLoading(false);
      return;
    }

    const newSession: ApprovalSession = {
      role: 'atasan',
      nip: targetAtasan.nip,
      nama: targetAtasan.nama,
      jabatan: targetAtasan.jabatan,
      unit_kerja: targetAtasan.unit_kerja
    };

    try {
      sessionStorage.setItem('siap_approval_atasan', JSON.stringify(newSession));
    } catch (_) {}

    setSession(newSession);
    if (targetAtasan.unit_kerja) {
      setUnitKerjaFilter(targetAtasan.unit_kerja);
    }
    setAtasanPinInput('');
    setAtasanLoginLoading(false);
  };

  // Handle Admin Login
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminLoginError('');
    setAdminLoginLoading(true);

    try {
      await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
      // Firebase auth state change handles session setting
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setAdminLoginError('Email atau kata sandi administrator tidak valid.');
      } else {
        setAdminLoginError('Gagal login administrator: ' + (err.message || 'Periksa koneksi'));
      }
    } finally {
      setAdminLoginLoading(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      sessionStorage.removeItem('siap_approval_atasan');
    } catch (_) {}

    if (session?.role === 'admin') {
      await signOut(auth);
    }

    setSession(null);
    setSelectedPermit(null);
  };

  // Atasan Management Actions (Save / Delete / Edit)
  const handleOpenNewAtasan = () => {
    setEditingAtasanNip(null);
    setFormAtasanNip('');
    setFormAtasanNama('');
    setFormAtasanJabatan('');
    setFormAtasanUnitKerja('Bagian Umum');
    setFormAtasanPin('123456');
    setManageAtasanMsg(null);
  };

  const handleOpenEditAtasan = (atasan: AtasanUser) => {
    setEditingAtasanNip(atasan.nip);
    setFormAtasanNip(atasan.nip);
    setFormAtasanNama(atasan.nama);
    setFormAtasanJabatan(atasan.jabatan);
    setFormAtasanUnitKerja(atasan.unit_kerja);
    setFormAtasanPin(atasan.pin || '123456');
    setManageAtasanMsg(null);
  };

  const handleSaveAtasan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAtasanNip.trim() || !formAtasanNama.trim() || !formAtasanUnitKerja.trim()) {
      showToast('NIP, Nama Pejabat, dan Unit Kerja / Bagian wajib diisi lengkap.', 'warning', 'Form Belum Lengkap');
      return;
    }

    setSavingAtasan(true);
    setManageAtasanMsg(null);
    try {
      const cleanNip = formAtasanNip.trim();
      const isEditing = !!editingAtasanNip;
      const docData = {
        nip: cleanNip,
        nama: formAtasanNama.trim(),
        jabatan: formAtasanJabatan.trim() || `Kepala ${formAtasanUnitKerja.trim()}`,
        unit_kerja: formAtasanUnitKerja.trim(),
        pin: formAtasanPin.trim() || '123456',
        updated_at: new Date().toISOString()
      };

      await setDoc(doc(db, 'atasan_users', cleanNip), docData);
      await loadAtasanData();

      const successMsg = isEditing
        ? `Data pejabat "${formAtasanNama}" berhasil diperbarui.`
        : `Pejabat baru "${formAtasanNama}" berhasil ditambahkan!`;

      setManageAtasanMsg(successMsg);
      showToast(successMsg, 'success', isEditing ? 'Pejabat Diperbarui' : 'Pejabat Ditambahkan');
      handleOpenNewAtasan();
      setTimeout(() => setManageAtasanMsg(null), 3500);
    } catch (err: any) {
      console.error('Error saving atasan:', err);
      showToast('Gagal menyimpan atasan: ' + (err.message || 'Periksa koneksi internet'), 'error', 'Gagal Simpan');
    } finally {
      setSavingAtasan(false);
    }
  };

  const handleDeleteAtasan = (atasan: AtasanUser) => {
    setDeleteTarget({
      type: 'atasan',
      id: atasan.nip,
      title: 'Hapus Pejabat / Atasan',
      subtitle: `Apakah Anda yakin ingin menghapus pejabat ini dari daftar atasan langsung?`,
      extraDetails: [
        { label: 'Nama Pejabat', value: atasan.nama },
        { label: 'NIP', value: atasan.nip },
        { label: 'Bagian / Unit Kerja', value: atasan.unit_kerja },
        { label: 'Jabatan', value: atasan.jabatan }
      ]
    });
  };

  // Helper to match unit kerja flexibly & cleanly
  const isMatchingUnit = (permitUnit?: string, targetUnit?: string): boolean => {
    if (!permitUnit || !targetUnit) return false;
    const p = permitUnit.trim().toLowerCase();
    const t = targetUnit.trim().toLowerCase();
    return p === t || p.includes(t) || t.includes(p);
  };

  // Base Scoped Permits Dataset:
  // - If session is 'atasan' with unit_kerja: ONLY permits where permit.unit_kerja matches session.unit_kerja!
  // - If session is 'admin': All permits across all departments in Setda
  const scopedPermits = useMemo(() => {
    if (session?.role === 'atasan' && session.unit_kerja) {
      return permits.filter((item) => isMatchingUnit(item.unit_kerja, session.unit_kerja));
    }
    return permits;
  }, [session, permits]);

  // Handle Approve or Reject
  const handleExecuteApproval = async (newStatus: 'approved' | 'rejected') => {
    if (!selectedPermit || !session) return;

    // Strict authority guard for Atasan: only permits within their department
    if (session.role === 'atasan' && session.unit_kerja) {
      if (!isMatchingUnit(selectedPermit.unit_kerja, session.unit_kerja)) {
        showToast(
          `Otorisasi ditolak: Anda hanya berwenang memverifikasi permohonan dari pegawai di lingkungan ${session.unit_kerja}.`,
          'error',
          'Akses Dibatasi'
        );
        return;
      }
    }

    setActionLoading(true);
    setActionSuccess(null);

    try {
      const permitRef = doc(db, 'permits', selectedPermit.id);

      let approvedByTitle = '';
      if (session.role === 'atasan') {
        approvedByTitle = `${session.nama} (${session.jabatan})`;
      } else {
        approvedByTitle = `Administrator Setda (${session.email || 'Admin'})`;
      }

      const defaultNote =
        newStatus === 'approved'
          ? `Disetujui oleh ${session.role === 'atasan' ? 'Atasan Langsung' : 'Administrator'}`
          : `Permohonan tidak disetujui / ditolak oleh ${session.role === 'atasan' ? 'Atasan Langsung' : 'Administrator'}`;

      const updateData = {
        status: newStatus,
        catatan_admin: reviewNote.trim() || defaultNote,
        approved_by: approvedByTitle,
        approved_by_role: session.role,
        approved_by_nip: session.nip || '',
        approved_by_jabatan: session.jabatan || '',
        approved_at: new Date().toISOString()
      };

      await updateDoc(permitRef, updateData);

      // Local state update
      setPermits((prev) =>
        prev.map((p) => (p.id === selectedPermit.id ? { ...p, ...updateData } : p))
      );

      const msg = `Permohonan ${selectedPermit.nama} berhasil ${newStatus === 'approved' ? 'disetujui' : 'ditolak'}!`;
      setActionSuccess(msg);
      showToast(msg, newStatus === 'approved' ? 'success' : 'info', newStatus === 'approved' ? 'Permohonan Disetujui' : 'Permohonan Ditolak');

      setTimeout(() => {
        setSelectedPermit(null);
        setReviewNote('');
        setActionSuccess(null);
      }, 900);
    } catch (err: any) {
      console.error('Error executing approval:', err);
      showToast('Gagal memproses persetujuan: ' + (err?.message || 'Error jaringan'), 'error', 'Gagal Verifikasi');
    } finally {
      setActionLoading(false);
    }
  };

  // Trigger Delete Confirmation Modal for Permit (Admin only)
  const confirmDeletePermit = (permit: PermitItem) => {
    if (session?.role !== 'admin') {
      showToast('Hanya Administrator yang memiliki wewenang menghapus dokumen permohonan.', 'error', 'Akses Ditolak');
      return;
    }
    const typeLabel = PERMIT_TYPES[permit.jenis]?.label || permit.jenis;
    setDeleteTarget({
      type: 'permit',
      id: permit.id,
      title: 'Hapus Berkas Pengajuan Izin',
      subtitle: `Apakah Anda yakin ingin menghapus arsip pengajuan izin ini secara permanen?`,
      extraDetails: [
        { label: 'Nama Pegawai', value: permit.nama },
        { label: 'NIP', value: permit.nip },
        { label: 'Bagian / Unit Kerja', value: permit.unit_kerja || '-' },
        { label: 'Kategori Izin', value: typeLabel },
        {
          label: 'Periode',
          value: `${permit.tanggal_mulai} s.d. ${permit.tanggal_selesai} (${permit.jumlah_hari || 1} hari)`
        },
        {
          label: 'Status Saat Ini',
          value:
            permit.status === 'approved'
              ? 'Disetujui'
              : permit.status === 'rejected'
              ? 'Ditolak'
              : 'Menunggu Verifikasi'
        }
      ]
    });
  };

  // Execution of Delete once confirmed in modal
  const handleExecuteDelete = async () => {
    if (!deleteTarget) return;
    setDeleteExecuting(true);

    try {
      if (deleteTarget.type === 'atasan') {
        await deleteDoc(doc(db, 'atasan_users', deleteTarget.id));
        await loadAtasanData();
        showToast(
          `Data pejabat ${deleteTarget.id} berhasil dihapus dari daftar.`,
          'success',
          'Pejabat Dihapus'
        );
      } else if (deleteTarget.type === 'permit') {
        if (session?.role !== 'admin') {
          showToast('Hanya Administrator yang berwenang menghapus dokumen.', 'error', 'Akses Ditolak');
          setDeleteTarget(null);
          return;
        }
        await deleteDoc(doc(db, 'permits', deleteTarget.id));
        setPermits((prev) => prev.filter((p) => p.id !== deleteTarget.id));
        if (selectedPermit?.id === deleteTarget.id) setSelectedPermit(null);
        showToast(
          'Berkas pengajuan izin berhasil dihapus secara permanen.',
          'success',
          'Dokumen Dihapus'
        );
      }
      setDeleteTarget(null);
    } catch (err: any) {
      console.error('Error executing delete:', err);
      showToast(
        `Gagal menghapus data: ${err?.message || 'Periksa koneksi'}`,
        'error',
        'Gagal Menghapus'
      );
    } finally {
      setDeleteExecuting(false);
    }
  };

  // Export to Excel (Scoped to current view)
  const handleExportExcel = () => {
    if (filteredPermits.length === 0) {
      showToast('Tidak ada data izin untuk diekspor pada filter saat ini.', 'warning', 'Ekspor Kosong');
      return;
    }

    const excelRows = filteredPermits.map((item, index) => {
      const typeInfo = PERMIT_TYPES[item.jenis] || { label: item.jenis };
      return {
        'NO': index + 1,
        'NIP': item.nip,
        'NAMA PEGAWAI': item.nama,
        'UNIT KERJA / BAGIAN': item.unit_kerja || '-',
        'JENIS IZIN': typeInfo.label,
        'TGL MULAI': item.tanggal_mulai,
        'TGL SELESAI': item.tanggal_selesai,
        'JUMLAH HARI': item.jumlah_hari || 1,
        'STATUS': item.status === 'approved' ? 'DISETUJUI' : item.status === 'rejected' ? 'DITOLAK' : 'MENUNGGU',
        'SUSULAN?': item.is_susulan ? `YA (${item.selisih_hari_susulan || 0} hari)` : 'TIDAK',
        'NOMOR SURAT / SPT': item.nomor_surat || '-',
        'KETERANGAN / KEPERLUAN': item.keterangan || '-',
        'DISETUJUI OLEH': item.approved_by || '-',
        'WAKTU PERSETUJUAN': item.approved_at ? new Date(item.approved_at).toLocaleString('id-ID') : '-',
        'CATATAN PERSETUJUAN': item.catatan_admin || '-',
        'WAKTU PENGAJUAN': item.created_at ? new Date(item.created_at).toLocaleString('id-ID') : '-'
      };
    });

    const worksheet = xlsx.utils.json_to_sheet(excelRows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Persetujuan_Izin');
    const dateStr = new Date().toISOString().split('T')[0];
    const unitTag =
      session?.role === 'atasan' && session.unit_kerja
        ? `_${session.unit_kerja.replace(/[^a-zA-Z0-9]/g, '_')}`
        : '_Semua_Bagian';
    xlsx.writeFile(workbook, `Rekap_Persetujuan_Izin${unitTag}_${dateStr}.xlsx`);
  };

  // Filtered Permits Calculation (Applies on top of scopedPermits)
  const filteredPermits = scopedPermits.filter((item) => {
    // Status Filter
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;

    // Type Filter
    if (typeFilter !== 'all' && item.jenis !== typeFilter) return false;

    // Unit Kerja Filter (Admin can choose unit; Atasan is already scoped)
    if (session?.role === 'admin' && unitKerjaFilter !== 'all' && item.unit_kerja !== unitKerjaFilter) {
      return false;
    }

    // Susulan Filter
    if (susulanOnly && !item.is_susulan) return false;

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNama = (item.nama || '').toLowerCase().includes(q);
      const matchNip = (item.nip || '').toLowerCase().includes(q);
      const matchKeterangan = (item.keterangan || '').toLowerCase().includes(q);
      const matchNomor = (item.nomor_surat || '').toLowerCase().includes(q);
      const matchUnit = (item.unit_kerja || '').toLowerCase().includes(q);
      if (!matchNama && !matchNip && !matchKeterangan && !matchNomor && !matchUnit)
        return false;
    }

    return true;
  });

  // Metric counts derived strictly from scopedPermits
  const countPending = scopedPermits.filter((p) => p.status === 'pending').length;
  const countApproved = scopedPermits.filter((p) => p.status === 'approved').length;
  const countRejected = scopedPermits.filter((p) => p.status === 'rejected').length;
  const countSusulan = scopedPermits.filter((p) => p.is_susulan).length;

  // =========================================================================
  // VIEW A: ACCESS GATE (When not authenticated as Atasan or Admin)
  // =========================================================================
  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-600">
        <div className="flex items-center gap-2.5 text-sm font-medium">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
          <span>Memverifikasi otorisasi akses...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {!session ? (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans text-slate-800">
        {/* Navigation Bar */}
        <header className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-xs">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 tracking-tight">
                Persetujuan Izin &amp; Dinas Luar
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">
                Portal Khusus Atasan Langsung &amp; Administrator Setda
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Presensi Publik</span>
            </Link>
          </div>
        </header>

        {/* Auth Gate Container */}
        <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Gate Header Banner */}
            <div className="p-6 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white text-center relative overflow-hidden">
              <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-xs text-blue-400 flex items-center justify-center mx-auto mb-3 shadow-inner">
                <Lock className="w-7 h-7" />
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Akses Terproteksi
              </h2>
              <p className="text-slate-300 text-xs mt-1">
                Portal Persetujuan Izin &amp; Dinas Luar Pegawai
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-slate-700 leading-relaxed space-y-2.5">
                <p className="font-bold text-blue-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Satu Pintu Login SIAP</span>
                </p>
                <p>
                  Halaman verifikasi dan persetujuan izin ini hanya dapat diakses oleh <strong>Pejabat Atasan Langsung</strong> dan <strong>Administrator</strong> yang telah terautentikasi melalui <em>Satu Pintu Login</em>.
                </p>
                <p className="text-slate-500 text-[11px]">
                  Masukkan Email &amp; Password Administrator, atau 18 digit NIP &amp; 6 digit PIN Atasan Anda pada portal login resmi.
                </p>
              </div>

              <Link
                href="/admin/login"
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <span>Masuk Melalui Satu Pintu Login</span>
              </Link>

              <div className="pt-2 text-center border-t border-slate-100">
                <Link
                  href="/"
                  className="text-xs text-slate-500 hover:text-blue-600 font-medium inline-flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Kembali ke Halaman Presensi Publik</span>
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    ) : (
      /* =========================================================================
         VIEW B: ACTIVE APPROVAL PORTAL (Authenticated as Atasan or Admin)
         ========================================================================= */
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      {/* Top Header Bar */}
      <header className="bg-slate-900 text-white sticky top-0 z-20 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xs ${
                session.role === 'admin'
                  ? 'bg-blue-600/30 text-blue-400 border border-blue-500/40'
                  : 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40'
              }`}
            >
              {session.role === 'admin' ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <UserCheck className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight text-white">
                  Persetujuan Izin, Sakit &amp; DL
                </h1>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                    session.role === 'admin'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  {session.role === 'admin' ? 'Akses Admin' : 'Akses Atasan'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {session.role === 'admin'
                  ? 'Sekretariat Daerah Kabupaten Demak'
                  : `${session.jabatan} — ${session.unit_kerja}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-medium">
            {countPending > 0 && (
              <span
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold"
                title={`${countPending} pengajuan menunggu verifikasi`}
              >
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>{countPending} Permohonan Baru</span>
              </span>
            )}

            <div className="text-right hidden md:block border-r border-slate-800 pr-4">
              <p className="text-white font-semibold leading-tight">{session.nama}</p>
              <p className="text-[10px] text-slate-400">{session.jabatan}</p>
            </div>

            {session.role === 'admin' && (
              <button
                type="button"
                onClick={() => {
                  handleOpenNewAtasan();
                  setShowManageAtasanModal(true);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Kelola Daftar Pejabat & PIN Atasan"
              >
                <Settings className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden sm:inline">Kelola Atasan</span>
              </button>
            )}

            {session.role === 'admin' ? (
              <Link
                href="/admin/dashboard"
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
              >
                Dashboard Admin
              </Link>
            ) : (
              <Link
                href="/"
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
              >
                Presensi Publik
              </Link>
            )}

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 rounded-lg transition-colors cursor-pointer"
              title="Keluar dari sesi verifikasi"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">
        {/* Active Identity Bar */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                session.role === 'admin'
                  ? 'bg-blue-50 text-blue-600 border border-blue-200'
                  : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
              }`}
            >
              {session.role === 'admin' ? (
                <ShieldCheck className="w-6 h-6" />
              ) : (
                <UserCheck className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Sesi Pengesahan Aktif:
                </span>
                <span className="font-bold text-slate-900 text-sm sm:text-base">
                  {session.nama}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    session.role === 'admin'
                      ? 'bg-blue-100 text-blue-800 border border-blue-200'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  {session.jabatan}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <p className="text-xs text-slate-500">
                  Unit Kerja: <strong>{session.unit_kerja || 'Sekretariat Daerah Kabupaten Demak'}</strong>
                </p>
                {session.role === 'atasan' && session.unit_kerja && (
                  <span className="text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full text-[11px] font-bold border border-emerald-200 inline-flex items-center gap-1">
                    <Building className="w-3 h-3 text-emerald-600" />
                    <span>Daftar Khusus Pegawai {session.unit_kerja}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <button
              onClick={handleExportExcel}
              className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* Metric Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => setStatusFilter('pending')}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
              statusFilter === 'pending'
                ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-400/20 shadow-xs'
                : 'bg-white border-slate-200 hover:border-amber-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">
                Menunggu Persetujuan
              </span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-black text-amber-700 mt-2">{countPending}</p>
            <p className="text-[11px] text-amber-700/80 mt-0.5">
              {session.role === 'atasan' && session.unit_kerja
                ? `Khusus pegawai ${session.unit_kerja}`
                : 'Perlu verifikasi pengesahan'}
            </p>
          </button>

          <button
            onClick={() => setStatusFilter('approved')}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
              statusFilter === 'approved'
                ? 'bg-emerald-50/90 border-emerald-300 ring-2 ring-emerald-400/20 shadow-xs'
                : 'bg-white border-slate-200 hover:border-emerald-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                Telah Disetujui
              </span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-black text-emerald-700 mt-2">{countApproved}</p>
            <p className="text-[11px] text-emerald-700/80 mt-0.5">
              {session.role === 'atasan' && session.unit_kerja
                ? `Disetujui di ${session.unit_kerja}`
                : 'Sah & masuk rekapitulasi'}
            </p>
          </button>

          <button
            onClick={() => setStatusFilter('rejected')}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
              statusFilter === 'rejected'
                ? 'bg-rose-50/90 border-rose-300 ring-2 ring-rose-400/20 shadow-xs'
                : 'bg-white border-slate-200 hover:border-rose-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">
                Ditolak
              </span>
              <XCircle className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-2xl font-black text-rose-700 mt-2">{countRejected}</p>
            <p className="text-[11px] text-rose-700/80 mt-0.5">
              {session.role === 'atasan' && session.unit_kerja
                ? `Ditolak di ${session.unit_kerja}`
                : 'Tidak memenuhi syarat'}
            </p>
          </button>

          <button
            onClick={() => setSusulanOnly(!susulanOnly)}
            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
              susulanOnly
                ? 'bg-purple-50 border-purple-300 ring-2 ring-purple-400/20 shadow-xs'
                : 'bg-white border-slate-200 hover:border-purple-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600">
                Pengajuan Susulan
              </span>
              <AlertTriangle className="w-4 h-4 text-purple-500" />
            </div>
            <p className="text-2xl font-black text-purple-700 mt-2">{countSusulan}</p>
            <p className="text-[11px] text-purple-700/80 mt-0.5">
              {susulanOnly ? 'Sedang difilter' : 'Diajukan terlambat'}
            </p>
          </button>
        </div>

        {/* Filter Controls Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari Nama, NIP, Nomor SPT/SKD..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all font-medium text-slate-700"
              >
                <option value="all">Semua Status Persetujuan</option>
                <option value="pending">⏳ Menunggu Persetujuan (Pending)</option>
                <option value="approved">✅ Telah Disetujui (Approved)</option>
                <option value="rejected">❌ Ditolak (Rejected)</option>
              </select>
            </div>

            {/* Type Filter */}
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all font-medium text-slate-700"
              >
                <option value="all">Semua Jenis Izin / Tugas</option>
                <option value="dinas_luar">Dinas Luar (DL / SPT)</option>
                <option value="sakit">Izin Sakit (SKD Dokter)</option>
                <option value="cuti">Cuti Tahunan / Bersalin (C)</option>
                <option value="izin">Izin Alasan Penting (I)</option>
              </select>
            </div>

            {/* Unit Kerja Filter (Locked for Atasan, selectable for Admin) */}
            {session.role === 'atasan' && session.unit_kerja ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-emerald-950">
                <Building className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="truncate">
                  <span className="text-[10px] uppercase tracking-wider block text-emerald-700 font-bold leading-tight">
                    Unit Terkunci:
                  </span>
                  <span className="font-bold text-emerald-900">{session.unit_kerja}</span>
                </div>
              </div>
            ) : (
              <div className="relative">
                <select
                  value={unitKerjaFilter}
                  onChange={(e) => setUnitKerjaFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all font-medium text-slate-700"
                >
                  <option value="all">Semua Bagian / Unit Kerja</option>
                  {availableUnitKerja.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
            <span>
              Menampilkan <strong>{filteredPermits.length}</strong> dari {scopedPermits.length} permohonan
              {session.role === 'atasan' && session.unit_kerja ? ` (khusus pegawai ${session.unit_kerja})` : ''}
              {susulanOnly && ' (hanya pengajuan susulan)'}
            </span>
            {(searchQuery || statusFilter !== 'pending' || typeFilter !== 'all' || (session.role === 'admin' && unitKerjaFilter !== 'all') || susulanOnly) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('pending');
                  setTypeFilter('all');
                  if (session.role === 'admin') setUnitKerjaFilter('all');
                  setSusulanOnly(false);
                }}
                className="text-blue-600 hover:underline font-medium text-xs cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>
        </div>

        {/* Permits Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          {loadingData ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <p className="text-xs">Memuat berkas permohonan...</p>
            </div>
          ) : filteredPermits.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-700">Tidak Ada Permohonan Ditemukan</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {statusFilter === 'pending'
                  ? session.role === 'atasan' && session.unit_kerja
                    ? `Tidak ada permohonan izin yang sedang menunggu persetujuan dari pegawai di lingkungan ${session.unit_kerja}.`
                    : 'Bagus! Tidak ada permohonan izin yang sedang menunggu persetujuan pada filter ini.'
                  : session.role === 'atasan' && session.unit_kerja
                  ? `Tidak ditemukan data permohonan dari pegawai ${session.unit_kerja} yang sesuai dengan filter atau kata kunci pencarian.`
                  : 'Tidak ada data permohonan yang sesuai dengan filter atau kata kunci pencarian.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-3 text-center w-12">No</th>
                    <th className="py-3.5 px-3">Pegawai Pemohon</th>
                    <th className="py-3.5 px-3">Jenis &amp; Tanggal</th>
                    <th className="py-3.5 px-3">Uraian &amp; Nomor SPT</th>
                    <th className="py-3.5 px-3 text-center">Lampiran</th>
                    <th className="py-3.5 px-3 text-center">Status &amp; Verifikator</th>
                    <th className="py-3.5 px-3 text-center w-36">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPermits.map((item, idx) => {
                    const typeConfig = PERMIT_TYPES[item.jenis] || {
                      label: item.jenis,
                      badgeClass: 'bg-slate-100 text-slate-700'
                    };

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 transition-colors group"
                      >
                        {/* NO */}
                        <td className="py-3.5 px-3 text-center text-slate-400 font-mono">
                          {idx + 1}
                        </td>

                        {/* PEGAWAI */}
                        <td className="py-3.5 px-3">
                          <div className="font-bold text-slate-900 text-xs">{item.nama}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{item.nip}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {item.unit_kerja || 'Sekretariat Daerah'}
                          </div>
                        </td>

                        {/* JENIS & TANGGAL */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${typeConfig.badgeClass}`}
                            >
                              {typeConfig.label}
                            </span>
                            {item.is_susulan && (
                              <span
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-50 text-purple-700 border border-purple-200"
                                title={`Pengajuan susulan terlambat ${item.selisih_hari_susulan || 0} hari`}
                              >
                                Susulan ({item.selisih_hari_susulan || 0}h)
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-medium text-slate-700 mt-1 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>
                              {item.tanggal_mulai} s/d {item.tanggal_selesai}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-medium">
                            Durasi: <strong>{item.jumlah_hari || 1} hari kerja</strong>
                          </div>
                        </td>

                        {/* URAIAN & SURAT */}
                        <td className="py-3.5 px-3 max-w-xs">
                          {item.nomor_surat ? (
                            <div className="text-[11px] font-mono font-bold text-indigo-700 bg-indigo-50/70 px-2 py-0.5 rounded border border-indigo-100 inline-block mb-1">
                              No: {item.nomor_surat}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400 italic mb-0.5">
                              Tanpa nomor surat
                            </div>
                          )}
                          <p className="text-xs text-slate-700 line-clamp-2" title={item.keterangan}>
                            {item.keterangan || '-'}
                          </p>
                        </td>

                        {/* LAMPIRAN */}
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          {item.lampiran_url ? (
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewAttachmentUrl(item.lampiran_url || null);
                                setPreviewAttachmentTitle(
                                  `Lampiran Dokumen: ${item.nama} (${typeConfig.label})`
                                );
                                setPreviewAttachmentFileName(item.lampiran_nama || 'Berkas_Lampiran');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors font-semibold text-[11px] cursor-pointer"
                              title="Buka lampiran SPT / SKD"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Lihat File</span>
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px] italic">-</span>
                          )}
                        </td>

                        {/* STATUS */}
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          {item.status === 'pending' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-500 animate-spin" />
                              Menunggu
                            </span>
                          )}
                          {item.status === 'approved' && (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Disetujui
                              </span>
                              {item.approved_by && (
                                <div
                                  className="text-[10px] text-slate-500 mt-1 max-w-[140px] truncate mx-auto"
                                  title={`Disahkan oleh: ${item.approved_by}`}
                                >
                                  Oleh: {item.approved_by}
                                </div>
                              )}
                            </div>
                          )}
                          {item.status === 'rejected' && (
                            <div>
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                <XCircle className="w-3 h-3 text-rose-600" />
                                Ditolak
                              </span>
                              {item.approved_by && (
                                <div
                                  className="text-[10px] text-slate-500 mt-1 max-w-[140px] truncate mx-auto"
                                  title={`Ditolak oleh: ${item.approved_by}`}
                                >
                                  Oleh: {item.approved_by}
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* TINDAKAN */}
                        <td className="py-3.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPermit(item);
                                setReviewNote(item.catatan_admin || '');
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-xs ${
                                item.status === 'pending'
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                              }`}
                            >
                              {item.status === 'pending' ? (
                                <>
                                  <UserCheck className="w-3.5 h-3.5" />
                                  <span>Verifikasi</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Detail</span>
                                </>
                              )}
                            </button>

                            {session.role === 'admin' && (
                              <button
                                type="button"
                                onClick={() => confirmDeletePermit(item)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Hapus permohonan (Khusus Admin)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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
        </div>
      </main>
    </div>
  )}

      {/* =========================================================================
          MODAL: REVIEW & APPROVAL ACTION
         ========================================================================= */}
      {selectedPermit && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden my-auto flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">
                    Lembar Verifikasi Persetujuan Izin
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Pemeriksaan keabsahan dokumen SPT / SKD oleh Atasan &amp; Admin
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPermit(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
              {actionSuccess && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{actionSuccess}</span>
                </div>
              )}

              {/* Pegawai Info Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Identitas Pemohon
                  </span>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    {selectedPermit.nama}
                  </div>
                  <div className="text-slate-500 font-mono text-xs">
                    NIP: {selectedPermit.nip}
                  </div>
                  <div className="text-slate-600 mt-1">
                    Unit Kerja: <strong>{selectedPermit.unit_kerja || '-'}</strong>
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                      PERMIT_TYPES[selectedPermit.jenis]?.badgeClass || 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {PERMIT_TYPES[selectedPermit.jenis]?.label || selectedPermit.jenis}
                  </span>
                  {selectedPermit.is_susulan && (
                    <div className="mt-1 text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                      ⚠️ Susulan ({selectedPermit.selisih_hari_susulan || 0} hari terlambat)
                    </div>
                  )}
                </div>
              </div>

              {/* Detail Permohonan Grid */}
              <div className="grid grid-cols-2 gap-3 bg-white border border-slate-200 rounded-xl p-3.5">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Periode Tanggal
                  </span>
                  <div className="font-semibold text-slate-800 mt-0.5 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {selectedPermit.tanggal_mulai} s/d {selectedPermit.tanggal_selesai}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Durasi Hari Kerja
                  </span>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {selectedPermit.jumlah_hari || 1} Hari Kerja
                  </div>
                </div>

                <div className="col-span-2 pt-2 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Nomor SPT / Surat Keterangan
                  </span>
                  <div className="font-mono font-bold text-indigo-700 text-xs mt-0.5">
                    {selectedPermit.nomor_surat || '(Tidak mencantumkan nomor surat)'}
                  </div>
                </div>

                <div className="col-span-2 pt-2 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Uraian Keperluan / Penugasan
                  </span>
                  <p className="text-slate-700 text-xs mt-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 whitespace-pre-wrap leading-relaxed">
                    {selectedPermit.keterangan || '-'}
                  </p>
                </div>
              </div>

              {/* Lampiran Preview */}
              {selectedPermit.lampiran_url && (
                <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      Dokumen Pendukung / SPT Terlampir
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewAttachmentUrl(selectedPermit.lampiran_url || null);
                        setPreviewAttachmentTitle(
                          `Dokumen SPT/Lampiran: ${selectedPermit.nama}`
                        );
                        setPreviewAttachmentFileName(
                          selectedPermit.lampiran_nama || 'Dokumen_Lampiran'
                        );
                      }}
                      className="text-blue-600 hover:underline font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3 h-3" />
                      Pratinjau Penuh
                    </button>
                  </div>

                  {selectedPermit.lampiran_url.startsWith('data:image') ||
                  selectedPermit.lampiran_url.match(/\.(jpg|jpeg|png|webp)/i) ? (
                    <div
                      onClick={() => {
                        setPreviewAttachmentUrl(selectedPermit.lampiran_url || null);
                        setPreviewAttachmentTitle(
                          `Dokumen SPT/Lampiran: ${selectedPermit.nama}`
                        );
                        setPreviewAttachmentFileName(
                          selectedPermit.lampiran_nama || 'Dokumen_Lampiran'
                        );
                      }}
                      className="cursor-pointer max-h-48 overflow-hidden rounded-lg border border-slate-200 relative group"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedPermit.lampiran_url}
                        alt="Lampiran SPT"
                        className="w-full object-cover object-top hover:opacity-95 transition-opacity"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity">
                        Klik untuk memperbesar
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewAttachmentUrl(selectedPermit.lampiran_url || null);
                        setPreviewAttachmentTitle(
                          `Dokumen SPT/Lampiran: ${selectedPermit.nama}`
                        );
                        setPreviewAttachmentFileName(
                          selectedPermit.lampiran_nama || 'Dokumen_Lampiran.pdf'
                        );
                      }}
                      className="w-full flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg hover:bg-blue-50 transition-colors text-blue-600 font-semibold cursor-pointer"
                    >
                      <span className="truncate">
                        {selectedPermit.lampiran_nama || 'Buka Berkas Lampiran (PDF)'}
                      </span>
                      <Eye className="w-4 h-4 shrink-0" />
                    </button>
                  )}
                </div>
              )}

              {/* Status Tracker & Approval Note Section */}
              <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Disposisi / Catatan Verifikasi
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    Akan dicatat atas nama: <strong>{session?.nama || 'Verifikator'}</strong> ({session?.role === 'admin' ? 'Admin' : 'Atasan'})
                  </span>
                </div>

                {/* Quick Templates */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setReviewNote(
                        'Disetujui sesuai Surat Perintah Tugas (SPT) kedinasan yang sah.'
                      )
                    }
                    className="px-2 py-0.5 bg-white border border-slate-200 hover:border-emerald-400 rounded text-[10px] text-slate-600 hover:text-emerald-700 cursor-pointer"
                  >
                    + SPT Sah
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setReviewNote(
                        'Disetujui untuk masa istirahat sakit dengan rujukan Surat Dokter (SKD).'
                      )
                    }
                    className="px-2 py-0.5 bg-white border border-slate-200 hover:border-emerald-400 rounded text-[10px] text-slate-600 hover:text-emerald-700 cursor-pointer"
                  >
                    + SKD Valid
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setReviewNote(
                        'Disetujui untuk pengajuan cuti tahunan sesuai hak pegawai.'
                      )
                    }
                    className="px-2 py-0.5 bg-white border border-slate-200 hover:border-emerald-400 rounded text-[10px] text-slate-600 hover:text-emerald-700 cursor-pointer"
                  >
                    + Cuti Disetujui
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setReviewNote(
                        'Ditolak: Dokumen SPT atau surat penugasan tidak lengkap / tidak valid.'
                      )
                    }
                    className="px-2 py-0.5 bg-white border border-slate-200 hover:border-rose-400 rounded text-[10px] text-slate-600 hover:text-rose-700 cursor-pointer"
                  >
                    + Tolak (Dokumen Kurang)
                  </button>
                </div>

                <textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Tambahkan catatan resmi atau alasan disposisi untuk pegawai..."
                  rows={2}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5">
                <div className="w-full sm:w-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPermit(null)}
                    className="w-full sm:w-auto px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Tutup
                  </button>

                  {session?.role === 'admin' && (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => confirmDeletePermit(selectedPermit)}
                      className="w-full sm:w-auto px-3 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-semibold cursor-pointer flex items-center justify-center gap-1.5 transition-colors"
                      title="Hapus berkas permohonan ini secara permanen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Arsip</span>
                    </button>
                  )}
                </div>

                <div className="w-full sm:w-auto flex items-center gap-2">
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleExecuteApproval('rejected')}
                    className="flex-1 sm:flex-initial px-4 py-2 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Tolak Permohonan</span>
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleExecuteApproval('approved')}
                    className="flex-1 sm:flex-initial px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {actionLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Setujui Permohonan (Approve)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: FULL DOCUMENT ATTACHMENT PREVIEW (PDF & IMAGE SAFE VIEWER)
         ========================================================================= */}
      <DocumentViewerModal
        isOpen={!!previewAttachmentUrl}
        onClose={() => setPreviewAttachmentUrl(null)}
        documentUrl={previewAttachmentUrl}
        documentTitle={previewAttachmentTitle}
        fileName={previewAttachmentFileName}
      />

      {/* =========================================================================
          MODAL: KELOLA DAFTAR PEJABAT / ATASAN LANGSUNG & PIN
         ========================================================================= */}
      {showManageAtasanModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-3xl w-full shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Kelola Pejabat &amp; Atasan Langsung
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Tambah atau perbarui nama pejabat atasan, unit bagian, dan PIN otorisasi
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowManageAtasanModal(false);
                  handleOpenNewAtasan();
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
              {/* Notification Message */}
              {manageAtasanMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{manageAtasanMsg}</span>
                </div>
              )}

              {/* Form Input / Edit Atasan */}
              <form onSubmit={handleSaveAtasan} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
                    {editingAtasanNip ? (
                      <>
                        <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                        <span>Edit Data Pejabat (NIP: {editingAtasanNip})</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Tambah Pejabat / Atasan Baru</span>
                      </>
                    )}
                  </span>
                  {editingAtasanNip && (
                    <button
                      type="button"
                      onClick={handleOpenNewAtasan}
                      className="text-[11px] text-slate-500 hover:text-slate-800 font-semibold underline cursor-pointer"
                    >
                      Batal Edit / Tambah Baru
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      NIP Pejabat <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formAtasanNip}
                      onChange={(e) => setFormAtasanNip(e.target.value)}
                      placeholder="cth: 197505121998031002"
                      disabled={!!editingAtasanNip}
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Nama Lengkap &amp; Gelar <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formAtasanNama}
                      onChange={(e) => setFormAtasanNama(e.target.value)}
                      placeholder="cth: H. Triyono, S.Sos., M.M."
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Jabatan Struktural <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formAtasanJabatan}
                      onChange={(e) => setFormAtasanJabatan(e.target.value)}
                      placeholder="cth: Kepala Bagian Umum"
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Bagian / Unit Kerja <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formAtasanUnitKerja}
                      onChange={(e) => setFormAtasanUnitKerja(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    >
                      <option value="Bagian Umum">Bagian Umum</option>
                      <option value="Bagian Hukum">Bagian Hukum</option>
                      <option value="Bagian Organisasi">Bagian Organisasi</option>
                      <option value="Bagian Tata Pemerintahan">Bagian Tata Pemerintahan</option>
                      <option value="Bagian Perekonomian dan Sumber Daya Alam">
                        Bagian Perekonomian dan Sumber Daya Alam
                      </option>
                      <option value="Bagian Pengadaan Barang dan Jasa">
                        Bagian Pengadaan Barang dan Jasa
                      </option>
                      <option value="Bagian Administrasi Pembangunan">
                        Bagian Administrasi Pembangunan
                      </option>
                      <option value="Bagian Kesejahteraan Rakyat">Bagian Kesejahteraan Rakyat</option>
                      <option value="Bagian Protokol dan Komunikasi Pimpinan">
                        Bagian Protokol dan Komunikasi Pimpinan
                      </option>
                      <option value="Sekretariat Daerah">Sekretariat Daerah (Umum / Pimpinan)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      PIN Otorisasi Persetujuan
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <KeyRound className="w-3.5 h-3.5" />
                        </div>
                        <input
                          type="text"
                          value={formAtasanPin}
                          onChange={(e) => setFormAtasanPin(e.target.value)}
                          placeholder="cth: 123456"
                          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                        />
                      </div>
                      <span className="text-[11px] text-slate-500">
                        Default: <code>123456</code> atau 6 digit akhir NIP
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  {editingAtasanNip && (
                    <button
                      type="button"
                      onClick={handleOpenNewAtasan}
                      className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      Batal
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={savingAtasan}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {savingAtasan ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>{editingAtasanNip ? 'Simpan Perubahan' : 'Simpan Pejabat Baru'}</span>
                  </button>
                </div>
              </form>

              {/* Table of Existing Atasan */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold text-slate-800 text-xs">
                    Daftar Pejabat / Atasan Terdaftar ({atasanList.length})
                  </h4>
                  <div className="relative w-48 sm:w-60">
                    <input
                      type="text"
                      value={searchAtasanQuery}
                      onChange={(e) => setSearchAtasanQuery(e.target.value)}
                      placeholder="Cari pejabat / bagian..."
                      className="w-full px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold text-[10px] uppercase tracking-wider sticky top-0">
                        <th className="py-2 px-3">Bagian</th>
                        <th className="py-2 px-3">Nama Pejabat &amp; NIP</th>
                        <th className="py-2 px-3">Jabatan</th>
                        <th className="py-2 px-3 text-center">PIN</th>
                        <th className="py-2 px-3 text-center w-24">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {atasanList
                        .filter((a) => {
                          if (!searchAtasanQuery.trim()) return true;
                          const q = searchAtasanQuery.toLowerCase();
                          return (
                            (a.nama || '').toLowerCase().includes(q) ||
                            (a.nip || '').includes(q) ||
                            (a.unit_kerja || '').toLowerCase().includes(q) ||
                            (a.jabatan || '').toLowerCase().includes(q)
                          );
                        })
                        .map((atasan) => (
                          <tr key={atasan.nip} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-semibold text-slate-800">
                              {atasan.unit_kerja}
                            </td>
                            <td className="py-2 px-3">
                              <p className="font-bold text-slate-900">{atasan.nama}</p>
                              <p className="text-[10px] text-slate-400 font-mono">
                                NIP. {atasan.nip}
                              </p>
                            </td>
                            <td className="py-2 px-3 text-slate-600">{atasan.jabatan}</td>
                            <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-500">
                              {atasan.pin || '123456'}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditAtasan(atasan)}
                                  className="p-1 rounded hover:bg-blue-50 text-blue-600 cursor-pointer"
                                  title="Edit data pejabat"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAtasan(atasan)}
                                  className="p-1 rounded hover:bg-rose-50 text-rose-600 cursor-pointer"
                                  title="Hapus pejabat"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowManageAtasanModal(false);
                  handleOpenNewAtasan();
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: KONFIRMASI HAPUS (DELETE CONFIRMATION MODAL)
         ========================================================================= */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden my-auto max-h-[92vh] flex flex-col transform transition-all">
            {/* Header */}
            <div className="p-5 bg-gradient-to-b from-rose-50/80 to-white border-b border-rose-100 flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 shadow-2xs">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-slate-900 leading-snug">
                  {deleteTarget.title}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {deleteTarget.subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteExecuting}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Details List */}
            {deleteTarget.extraDetails && deleteTarget.extraDetails.length > 0 && (
              <div className="p-5 py-4 bg-slate-50 border-b border-slate-200/80 space-y-2 text-xs">
                {deleteTarget.extraDetails.map((detail, idx) => (
                  <div key={idx} className="flex justify-between items-start gap-2">
                    <span className="text-slate-500 font-medium shrink-0">{detail.label}:</span>
                    <span className="text-slate-800 font-semibold text-right break-words">{detail.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Warning Note */}
            <div className="px-5 py-3 bg-amber-50/70 border-b border-amber-100 text-[11px] text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
              <span>Tindakan ini permanen dan data yang dihapus tidak dapat dipulihkan kembali.</span>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 bg-white flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteExecuting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Batalkan
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                disabled={deleteExecuting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {deleteExecuting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ya, Hapus Permanen</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TOAST NOTIFICATION CONTAINER (Floating top-right)
         ========================================================================= */}
      <div className="fixed top-4 right-4 z-[70] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-3 sm:px-0">
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          const isWarning = toast.type === 'warning';

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto rounded-xl shadow-lg border p-3.5 flex items-start gap-3 transition-all animate-in slide-in-from-top-2 duration-200 ${
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
    </>
  );
}
