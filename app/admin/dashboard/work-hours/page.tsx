'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Clock,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Moon,
  Sun,
  CalendarClock,
  Calendar,
  Check,
  X,
  Sparkles,
  Info,
  RefreshCw,
  Power
} from 'lucide-react';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';

export interface WorkSchedule {
  id: string;
  nama: string;
  keterangan: string;
  jam_masuk: string;
  jam_pulang: string;
  jam_pulang_jumat: string;
  toleransi_menit: number;
  is_active: boolean;
  is_date_range?: boolean;
  start_date?: string; // Format: YYYY-MM-DD
  end_date?: string;   // Format: YYYY-MM-DD
  updated_at?: string;
}

const DEFAULT_SCHEDULES: WorkSchedule[] = [
  {
    id: 'reguler',
    nama: 'Jam Kerja Reguler / Standar Setda',
    keterangan: 'Jadwal operasional normal 5 hari kerja (Senin - Jumat) di lingkungan Setda Kabupaten Demak.',
    jam_masuk: '07:30',
    jam_pulang: '16:00',
    jam_pulang_jumat: '15:00',
    toleransi_menit: 0,
    is_active: true
  },
  {
    id: 'ramadhan',
    nama: 'Jam Kerja Bulan Suci Ramadhan',
    keterangan: 'Penyesuaian jam kerja selama bulan puasa Ramadhan sesuai Surat Edaran MenPAN-RB dan Bupati Demak.',
    jam_masuk: '08:00',
    jam_pulang: '15:00',
    jam_pulang_jumat: '14:30',
    toleransi_menit: 0,
    is_active: false,
    is_date_range: true,
    start_date: '2026-02-18',
    end_date: '2026-03-20'
  }
];

const formatDateIndo = (dateStr?: string) => {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${day} ${months[monthIdx] || parts[1]} ${year}`;
};

export default function WorkHoursPage() {
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Delete Confirmation Modal State
  const [deleteTargetSchedule, setDeleteTargetSchedule] = useState<WorkSchedule | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<WorkSchedule>({
    id: '',
    nama: '',
    keterangan: '',
    jam_masuk: '07:30',
    jam_pulang: '16:00',
    jam_pulang_jumat: '15:00',
    toleransi_menit: 0,
    is_active: false,
    is_date_range: false,
    start_date: '',
    end_date: ''
  });

  // Save all schedules and synchronize root work_hours fields
  const saveAllSchedules = async (list: WorkSchedule[]) => {
    const activeItem = list.find(s => s.is_active) || list[0];
    await setDoc(doc(db, 'settings', 'work_hours'), {
      active_id: activeItem ? activeItem.id : '',
      jam_masuk: activeItem ? activeItem.jam_masuk : '07:30',
      jam_pulang: activeItem ? activeItem.jam_pulang : '16:00',
      jam_pulang_jumat: activeItem ? (activeItem.jam_pulang_jumat || '15:00') : '15:00',
      toleransi_menit: activeItem ? Number(activeItem.toleransi_menit) : 0,
      schedules: list,
      updated_at: new Date().toISOString()
    });
  };

  // Fetch or initialize schedules from Firestore
  const loadSettingsData = async () => {
    try {
      const docRef = doc(db, 'settings', 'work_hours');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data.schedules) && data.schedules.length > 0) {
          // Ensure at least one is active
          let loaded = data.schedules as WorkSchedule[];
          const hasActive = loaded.some(s => s.is_active);
          if (!hasActive && loaded.length > 0) {
            loaded[0].is_active = true;
          }
          setSchedules(loaded);
        } else {
          // Migrate old single work_hours format to list
          const initialSchedules: WorkSchedule[] = [
            {
              id: 'reguler',
              nama: 'Jam Kerja Reguler / Standar Setda',
              keterangan: 'Jadwal operasional normal 5 hari kerja di lingkungan Setda Kabupaten Demak.',
              jam_masuk: data.jam_masuk || '07:30',
              jam_pulang: data.jam_pulang || '16:00',
              jam_pulang_jumat: data.jam_pulang_jumat || '15:00',
              toleransi_menit: data.toleransi_menit !== undefined ? Number(data.toleransi_menit) : 0,
              is_active: true
            },
            { ...DEFAULT_SCHEDULES[1] }
          ];
          setSchedules(initialSchedules);
          // Persist the migrated format
          await saveAllSchedules(initialSchedules);
        }
      } else {
        // First time initialization
        setSchedules(DEFAULT_SCHEDULES);
        await saveAllSchedules(DEFAULT_SCHEDULES);
      }
    } catch (error: any) {
      console.error('Error fetching settings:', error);
      if (error.code === 'permission-denied') {
        handleFirestoreError(error, OperationType.GET, 'settings/work_hours');
      } else {
        setMessage({ type: 'error', text: 'Gagal memuat pengaturan: ' + (error.message || '') });
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = () => {
    setLoading(true);
    loadSettingsData();
  };

  useEffect(() => {
    let isMounted = true;
    const docRef = doc(db, 'settings', 'work_hours');
    getDoc(docRef)
      .then(async docSnap => {
        if (!isMounted) return;
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (Array.isArray(data.schedules) && data.schedules.length > 0) {
            let loaded = data.schedules as WorkSchedule[];
            const hasActive = loaded.some(s => s.is_active);
            if (!hasActive && loaded.length > 0) {
              loaded[0].is_active = true;
            }
            setSchedules(loaded);
          } else {
            const initialSchedules: WorkSchedule[] = [
              {
                id: 'reguler',
                nama: 'Jam Kerja Reguler / Standar Setda',
                keterangan: 'Jadwal operasional normal 5 hari kerja di lingkungan Setda Kabupaten Demak.',
                jam_masuk: data.jam_masuk || '07:30',
                jam_pulang: data.jam_pulang || '16:00',
                jam_pulang_jumat: data.jam_pulang_jumat || '15:00',
                toleransi_menit: data.toleransi_menit !== undefined ? Number(data.toleransi_menit) : 0,
                is_active: true
              },
              { ...DEFAULT_SCHEDULES[1] }
            ];
            setSchedules(initialSchedules);
            await saveAllSchedules(initialSchedules);
          }
        } else {
          setSchedules(DEFAULT_SCHEDULES);
          await saveAllSchedules(DEFAULT_SCHEDULES);
        }
        setLoading(false);
      })
      .catch(error => {
        if (!isMounted) return;
        console.error('Error fetching settings:', error);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Activate a specific schedule (and deactivate all others)
  const handleActivateSchedule = async (targetId: string) => {
    setActionLoading(true);
    setMessage(null);
    try {
      const updatedList = schedules.map(s => ({
        ...s,
        is_active: s.id === targetId
      }));

      const target = updatedList.find(s => s.id === targetId);
      await saveAllSchedules(updatedList);
      setSchedules(updatedList);

      setMessage({
        type: 'success',
        text: `Jadwal "${target?.nama}" telah berhasil diaktifkan sebagai jam kerja utama.`
      });
    } catch (error: any) {
      console.error('Error activating schedule:', error);
      if (error.code === 'permission-denied') {
        handleFirestoreError(error, OperationType.WRITE, 'settings/work_hours');
      } else {
        setMessage({ type: 'error', text: 'Gagal mengaktifkan jadwal: ' + error.message });
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle active/inactive
  const handleToggleActive = async (schedule: WorkSchedule) => {
    if (schedule.is_active) {
      // If user tries to turn off the currently active schedule, inform them
      setMessage({
        type: 'info',
        text: 'Jadwal ini sedang aktif. Untuk menonaktifkannya, silakan klik "Aktifkan" pada jadwal lain yang ingin Anda gunakan.'
      });
      return;
    }
    await handleActivateSchedule(schedule.id);
  };

  // Open modal for Add
  const handleOpenAdd = () => {
    setIsEditing(false);
    setFormData({
      id: `schedule_${Date.now()}`,
      nama: '',
      keterangan: '',
      jam_masuk: '07:30',
      jam_pulang: '16:00',
      jam_pulang_jumat: '15:00',
      toleransi_menit: 0,
      is_active: schedules.length === 0,
      is_date_range: false,
      start_date: '',
      end_date: ''
    });
    setShowModal(true);
  };

  // Open modal for Edit
  const handleOpenEdit = (schedule: WorkSchedule) => {
    setIsEditing(true);
    setFormData({
      ...schedule,
      is_date_range: schedule.is_date_range ?? false,
      start_date: schedule.start_date || '',
      end_date: schedule.end_date || ''
    });
    setShowModal(true);
  };

  // Apply Quick Template to form
  const handleApplyTemplate = (type: 'reguler' | 'ramadhan' | 'hari_pendek') => {
    if (type === 'reguler') {
      setFormData(prev => ({
        ...prev,
        nama: prev.nama || 'Jam Kerja Reguler (Standar Setda)',
        keterangan: prev.keterangan || 'Jadwal operasional normal hari kerja Senin s/d Jumat',
        jam_masuk: '07:30',
        jam_pulang: '16:00',
        jam_pulang_jumat: '15:00',
        toleransi_menit: 0,
        is_date_range: false,
        start_date: '',
        end_date: ''
      }));
    } else if (type === 'ramadhan') {
      setFormData(prev => ({
        ...prev,
        nama: prev.nama || 'Jam Kerja Bulan Ramadhan / Puasa',
        keterangan: prev.keterangan || 'Penyesuaian jam kerja selama bulan puasa Ramadhan sesuai Surat Edaran MenPAN-RB dan Bupati Demak',
        jam_masuk: '08:00',
        jam_pulang: '15:00',
        jam_pulang_jumat: '14:30',
        toleransi_menit: 0,
        is_date_range: true,
        start_date: prev.start_date || '2026-02-18',
        end_date: prev.end_date || '2026-03-20'
      }));
    } else if (type === 'hari_pendek') {
      setFormData(prev => ({
        ...prev,
        nama: prev.nama || 'Jam Kerja Khusus / Acara Kedinasan',
        keterangan: prev.keterangan || 'Jadwal khusus peringatan HUT / kegiatan kedinasan Setda',
        jam_masuk: '07:00',
        jam_pulang: '14:00',
        jam_pulang_jumat: '11:30',
        toleransi_menit: 15,
        is_date_range: false
      }));
    }
  };

  // Save Modal Form (Add or Edit)
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nama.trim()) {
      alert('Mohon isi nama pengaturan jam kerja.');
      return;
    }

    setActionLoading(true);
    setMessage(null);

    try {
      let updatedList: WorkSchedule[];

      if (isEditing) {
        updatedList = schedules.map(s => {
          if (s.id === formData.id) {
            return {
              ...formData,
              nama: formData.nama.trim(),
              keterangan: formData.keterangan.trim(),
              toleransi_menit: Number(formData.toleransi_menit) || 0,
              updated_at: new Date().toISOString()
            };
          }
          // If the edited schedule was set to active, deactivate others
          if (formData.is_active) {
            return { ...s, is_active: false };
          }
          return s;
        });
      } else {
        const newSchedule: WorkSchedule = {
          ...formData,
          nama: formData.nama.trim(),
          keterangan: formData.keterangan.trim(),
          toleransi_menit: Number(formData.toleransi_menit) || 0,
          updated_at: new Date().toISOString()
        };

        if (newSchedule.is_active) {
          updatedList = schedules.map(s => ({ ...s, is_active: false }));
          updatedList.push(newSchedule);
        } else {
          updatedList = [...schedules, newSchedule];
        }
      }

      await saveAllSchedules(updatedList);
      setSchedules(updatedList);
      setShowModal(false);

      setMessage({
        type: 'success',
        text: isEditing
          ? `Pengaturan "${formData.nama}" berhasil diperbarui.`
          : `Pengaturan baru "${formData.nama}" berhasil ditambahkan.`
      });
    } catch (error: any) {
      console.error('Error saving schedule item:', error);
      if (error.code === 'permission-denied') {
        handleFirestoreError(error, OperationType.WRITE, 'settings/work_hours');
      } else {
        setMessage({ type: 'error', text: 'Gagal menyimpan: ' + error.message });
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Delete schedule
  const handleDeleteSchedule = (schedule: WorkSchedule) => {
    if (schedule.is_active) {
      setMessage({
        type: 'error',
        text: 'Jadwal yang sedang AKTIF tidak dapat dihapus. Silakan aktifkan jadwal lain terlebih dahulu jika ingin menghapus jadwal ini.'
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (schedules.length <= 1) {
      setMessage({
        type: 'error',
        text: 'Minimal harus ada 1 pengaturan jam kerja di dalam sistem.'
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setDeleteTargetSchedule(schedule);
  };

  const handleConfirmDeleteSchedule = async () => {
    if (!deleteTargetSchedule) return;

    setActionLoading(true);
    try {
      const updatedList = schedules.filter(s => s.id !== deleteTargetSchedule.id);
      await saveAllSchedules(updatedList);
      setSchedules(updatedList);
      setMessage({
        type: 'success',
        text: `Pengaturan "${deleteTargetSchedule.nama}" berhasil dihapus.`
      });
      setDeleteTargetSchedule(null);
    } catch (error: any) {
      console.error('Error deleting schedule:', error);
      if (error.code === 'permission-denied') {
        handleFirestoreError(error, OperationType.WRITE, 'settings/work_hours');
      } else {
        setMessage({ type: 'error', text: 'Gagal menghapus: ' + error.message });
      }
    } finally {
      setActionLoading(false);
    }
  };

  const activeSchedule = schedules.find(s => s.is_active);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-slate-500 gap-2 font-medium">
        <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
        Memuat konfigurasi jam kerja...
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <Clock className="w-6 h-6 text-amber-500" />
            Pengaturan Profil Jam Kerja Paruh Waktu
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Kelola beberapa opsi jadwal kerja (Reguler, Bulan Ramadhan/Puasa, dsb.) dan aktifkan jadwal yang berlaku sesuai periode kalender.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm shadow-blue-200 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Tambah Pengaturan Baru
        </button>
      </div>

      {/* Notification Banner */}
      {message && (
        <div
          className={`p-4 rounded-xl flex items-start gap-3 text-sm animate-in fade-in duration-200 ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : message.type === 'error'
              ? 'bg-red-50 text-red-800 border border-red-200'
              : 'bg-blue-50 text-blue-800 border border-blue-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : message.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          ) : (
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 font-medium">{message.text}</div>
          <button
            onClick={() => setMessage(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Highlight Box: Currently Active Schedule */}
      {activeSchedule && (
        <div className="bg-gradient-to-br from-emerald-500/10 via-emerald-50/50 to-white rounded-2xl border-2 border-emerald-500/40 p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-emerald-100 mb-5">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                  <Check className="w-3.5 h-3.5" />
                  Jadwal Sedang Aktif Diterapkan
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  {activeSchedule.nama}
                </h3>
              </div>
            </div>

            <div className="text-xs text-slate-500 flex items-center gap-1.5 bg-white/80 px-3 py-1.5 rounded-lg border border-emerald-200/60 shadow-xs">
              <CalendarClock className="w-4 h-4 text-emerald-600" />
              <span>Digunakan untuk perhitungan absensi & scanner fingerprint saat ini</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-emerald-100/80 shadow-xs">
              <p className="text-[11px] font-semibold text-slate-400 uppercase">Jam Masuk</p>
              <p className="text-xl font-bold font-mono text-slate-900 mt-1">{activeSchedule.jam_masuk}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">WIB</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-100/80 shadow-xs">
              <p className="text-[11px] font-semibold text-slate-400 uppercase">Jam Pulang (Senin - Kamis)</p>
              <p className="text-xl font-bold font-mono text-slate-900 mt-1">{activeSchedule.jam_pulang}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">WIB</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-100/80 shadow-xs">
              <p className="text-[11px] font-semibold text-slate-400 uppercase">Jam Pulang (Jumat)</p>
              <p className="text-xl font-bold font-mono text-slate-900 mt-1">{activeSchedule.jam_pulang_jumat || '-'}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">WIB (Khusus Hari Jumat)</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-100/80 shadow-xs">
              <p className="text-[11px] font-semibold text-slate-400 uppercase">Toleransi Terlambat</p>
              <p className="text-xl font-bold font-mono text-emerald-700 mt-1">{activeSchedule.toleransi_menit} Menit</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Dari jam masuk</p>
            </div>
          </div>

          {activeSchedule.keterangan && (
            <p className="text-xs text-slate-600 mt-4 italic bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100">
              Catatan: {activeSchedule.keterangan}
            </p>
          )}
        </div>
      )}

      {/* Grid of All Work Schedules */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
            <span>Daftar Pilihan Pengaturan Jam Kerja</span>
            <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {schedules.length} Pilihan Tersimpan
            </span>
          </h3>
          <span className="text-xs text-slate-500">
            Klik tombol &quot;Aktifkan&quot; untuk langsung menerapkan jadwal terpilih
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {schedules.map(schedule => {
            const isRamadhan = schedule.nama.toLowerCase().includes('ramadhan') || schedule.nama.toLowerCase().includes('puasa');
            return (
              <div
                key={schedule.id}
                className={`rounded-xl border transition-all duration-200 flex flex-col justify-between overflow-hidden ${
                  schedule.is_active
                    ? 'border-emerald-500 ring-2 ring-emerald-100 bg-white shadow-md shadow-emerald-50'
                    : 'border-slate-200 bg-white hover:border-slate-300 shadow-sm'
                }`}
              >
                <div className="p-6">
                  {/* Top Bar: Title & Status Badge */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          schedule.is_active
                            ? 'bg-emerald-100 text-emerald-700'
                            : isRamadhan
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {isRamadhan ? (
                          <Moon className="w-5 h-5" />
                        ) : schedule.is_active ? (
                          <Sun className="w-5 h-5" />
                        ) : (
                          <Clock className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-base leading-snug">
                          {schedule.nama}
                        </h4>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {schedule.keterangan || 'Tidak ada catatan tambahan.'}
                        </p>
                      </div>
                    </div>

                    {/* Active Status Pill */}
                    {schedule.is_active ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 shrink-0">
                        <Check className="w-3 h-3" /> Aktif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500 shrink-0">
                        Nonaktif
                      </span>
                    )}
                  </div>

                  {/* Schedule Details Pills */}
                  <div className="grid grid-cols-2 gap-2.5 my-4 text-xs">
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Jam Masuk:</span>
                      <span className="font-bold font-mono text-slate-800 text-sm">{schedule.jam_masuk} WIB</span>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Jam Pulang:</span>
                      <span className="font-bold font-mono text-slate-800 text-sm">{schedule.jam_pulang} WIB</span>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Pulang Jumat:</span>
                      <span className="font-bold font-mono text-slate-800 text-sm">
                        {schedule.jam_pulang_jumat ? `${schedule.jam_pulang_jumat} WIB` : '-'}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Toleransi:</span>
                      <span className="font-bold font-mono text-slate-800 text-sm">{schedule.toleransi_menit} Menit</span>
                    </div>
                  </div>

                  {/* Automatic Date Range Indicator */}
                  {schedule.is_date_range && schedule.start_date && schedule.end_date && (() => {
                    const todayISO = new Date().toISOString().slice(0, 10);
                    const isCurrentlyInRange = todayISO >= schedule.start_date && todayISO <= schedule.end_date;
                    return (
                      <div className="mt-2.5 p-2.5 rounded-lg border bg-amber-50/90 border-amber-200 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-amber-600" />
                            Otomatis Rentang Tanggal:
                          </span>
                          {isCurrentlyInRange ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                              Aktif Hari Ini
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
                              Otomatis Berlaku
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-amber-950 font-mono flex items-center justify-between">
                          <span>{formatDateIndo(schedule.start_date)} — {formatDateIndo(schedule.end_date)}</span>
                          <span className="text-[10px] text-amber-700 font-sans">Tanpa Ganti Manual</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Card Action Footer */}
                <div className="px-6 py-3.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenEdit(schedule)}
                      disabled={actionLoading}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-blue-600 bg-white hover:bg-blue-50 border border-slate-200 rounded-lg flex items-center gap-1 transition-colors"
                      title="Ubah detail pengaturan ini"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Edit
                    </button>

                    <button
                      onClick={() => handleDeleteSchedule(schedule)}
                      disabled={schedule.is_active || actionLoading}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 bg-white hover:bg-red-50 border border-slate-200 rounded-lg flex items-center gap-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      title={schedule.is_active ? 'Jadwal aktif tidak dapat dihapus' : 'Hapus pengaturan ini'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Hapus
                    </button>
                  </div>

                  {/* Main Activate / Deactivate Toggle Button */}
                  {schedule.is_active ? (
                    <button
                      onClick={() => handleToggleActive(schedule)}
                      disabled={actionLoading}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white flex items-center gap-1.5 shadow-sm shadow-emerald-200 cursor-default"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Sedang Aktif
                    </button>
                  ) : (
                    <button
                      onClick={() => handleActivateSchedule(schedule.id)}
                      disabled={actionLoading}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-blue-600 text-slate-700 hover:text-white border border-slate-300 hover:border-blue-600 transition-all flex items-center gap-1.5 shadow-xs"
                    >
                      <Power className="w-3.5 h-3.5" />
                      Aktifkan Jadwal Ini
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh] my-auto animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-800 text-base">
                  {isEditing ? 'Ubah Pengaturan Jam Kerja' : 'Tambah Pengaturan Jam Kerja Baru'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body with Scrollable Area and Pinned Actions */}
            <form onSubmit={handleSaveModal} className="flex flex-col min-h-0 flex-1 overflow-hidden">
              <div className="p-6 space-y-5 overflow-y-auto flex-1 overscroll-contain">
                {/* Quick Template Picker (Only for Add or as convenience) */}
                <div className="bg-blue-50/60 border border-blue-200/80 rounded-xl p-3">
                <p className="text-[11px] font-bold uppercase text-blue-900 flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  Gunakan Template Cepat:
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate('reguler')}
                    className="px-2.5 py-1 bg-white hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-xs font-medium transition-colors"
                  >
                    Jam Reguler Setda (07:30 - 16:00)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate('ramadhan')}
                    className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                  >
                    <Moon className="w-3 h-3" />
                    Bulan Ramadhan (08:00 - 15:00)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyTemplate('hari_pendek')}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium transition-colors"
                  >
                    Hari Khusus / Kedinasan
                  </button>
                </div>
              </div>

              {/* Form Inputs */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">
                  Nama Pengaturan Jadwal <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Mis. Jam Kerja Bulan Ramadhan / Puasa"
                  value={formData.nama}
                  onChange={e => setFormData({ ...formData, nama: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">
                  Keterangan / Dasar Kebijakan (Opsional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Mis. Sesuai Surat Edaran Bupati Demak tentang Jam Kerja Pegawai ASN & PPPK selama Ramadhan"
                  value={formData.keterangan}
                  onChange={e => setFormData({ ...formData, keterangan: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">
                    Jam Masuk Standar <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    required
                    value={formData.jam_masuk}
                    onChange={e => setFormData({ ...formData, jam_masuk: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-base font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">Waktu mulai kerja harian</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">
                    Jam Pulang (Senin - Kamis) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    required
                    value={formData.jam_pulang}
                    onChange={e => setFormData({ ...formData, jam_pulang: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-base font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">Batas jam kepulangan reguler</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">
                    Jam Pulang Khusus Jumat
                  </label>
                  <input
                    type="time"
                    value={formData.jam_pulang_jumat}
                    onChange={e => setFormData({ ...formData, jam_pulang_jumat: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-base font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">Kepulangan hari Jumat (jika berbeda)</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">
                    Toleransi Terlambat (Menit) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="120"
                    required
                    value={formData.toleransi_menit}
                    onChange={e => setFormData({ ...formData, toleransi_menit: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-base font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <span className="text-[11px] text-slate-400 mt-1 block">Batas toleransi dari jam masuk</span>
                </div>
              </div>

              {/* Date Range Scheduling Section */}
              <div className="pt-3 border-t border-slate-100">
                <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-3.5 space-y-2.5">
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formData.is_date_range || false}
                      onChange={e => setFormData({ ...formData, is_date_range: e.target.checked })}
                      className="w-4 h-4 mt-0.5 text-amber-600 rounded border-amber-300 focus:ring-amber-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-amber-600" />
                        Otomatisasi Berdasarkan Rentang Tanggal (Bulan Ramadhan / Khusus)
                      </span>
                      <p className="text-[11px] text-amber-800/90 mt-0.5 leading-relaxed">
                        Jadwal ini otomatis diterapkan pada sistem saat tanggal kalender masuk rentang yang ditentukan, tanpa harus mengubah jadwal reguler secara manual.
                      </p>
                    </div>
                  </label>

                  {formData.is_date_range && (
                    <div className="pt-3 border-t border-amber-200/70 space-y-2.5 animate-in fade-in duration-150">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                            Tanggal Mulai Berlaku <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="date"
                            required={formData.is_date_range}
                            value={formData.start_date || ''}
                            onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                            className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                            Tanggal Selesai Berlaku <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="date"
                            required={formData.is_date_range}
                            value={formData.end_date || ''}
                            onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                            className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                      </div>

                      {/* Quick preset button for Ramadhan 2026 */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
                        <span className="text-amber-800 font-medium">Preset Cepat:</span>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, start_date: '2026-02-18', end_date: '2026-03-20' }))}
                          className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-md font-medium transition-colors flex items-center gap-1 shadow-2xs"
                        >
                          <Moon className="w-3 h-3 text-amber-700" />
                          Gunakan Rentang Ramadhan 2026 (18 Feb - 20 Mar 2026)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Checkbox Set As Active */}
              <div className="pt-3 border-t border-slate-100">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <span className="text-xs font-semibold text-slate-800">
                    Jadikan pengaturan ini sebagai jadwal AKTIF saat disimpan
                  </span>
                </label>
                <p className="text-[11px] text-slate-500 pl-7 mt-0.5">
                  Jika dicentang, jadwal ini langsung menggantikan jadwal aktif saat ini.
                </p>
              </div>
            </div>

            {/* Modal Actions (Pinned Footer) */}
            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm shadow-blue-200 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {actionLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    {isEditing ? 'Simpan Perubahan' : 'Simpan Pengaturan'}
                  </>
                )}
              </button>
            </div>
          </form>
          </div>
        </div>
      )}

      {/* Information / SOP Card */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 text-xs text-slate-600 space-y-2">
        <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wider">
          <Info className="w-4 h-4 text-blue-600" />
          Petunjuk Penggunaan Fitur Jam Kerja Dinamis:
        </h4>
        <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
          <li>
            <strong className="text-slate-800">Menjelang Bulan Puasa:</strong> Cukup klik tombol <strong>&quot;Aktifkan Jadwal Ini&quot;</strong> pada profil <em>Jam Kerja Bulan Suci Ramadhan</em>. Seluruh perhitungan batas keterlambatan dan jam pulang akan otomatis menyesuaikan.
          </li>
          <li>
            <strong className="text-slate-800">Setelah Bulan Puasa:</strong> Klik kembali tombol <strong>&quot;Aktifkan Jadwal Ini&quot;</strong> pada profil <em>Jam Kerja Reguler</em> untuk kembali ke jam kerja normal.
          </li>
          <li>
            <strong className="text-slate-800">Menambahkan Profil Khusus:</strong> Jika terdapat ketentuan jam kerja baru (misal instruksi kedinasan khusus atau event HUT Demak), gunakan tombol <strong>&quot;Tambah Pengaturan Baru&quot;</strong> di pojok kanan atas.
          </li>
          <li>
            <strong className="text-slate-800">Sinkronisasi Otomatis:</strong> Setiap pergantian jadwal aktif akan langsung tersinkronisasi ke basis data utama sehingga mesin kalkulasi absensi dan log kehadiran tetap akurat.
          </li>
        </ul>
      </div>

      {/* Modal Konfirmasi Hapus Jadwal Jam Kerja */}
      <DeleteConfirmModal
        isOpen={!!deleteTargetSchedule}
        onClose={() => {
          if (!actionLoading) setDeleteTargetSchedule(null);
        }}
        onConfirm={handleConfirmDeleteSchedule}
        title="Hapus Pengaturan Jam Kerja"
        message="Apakah Anda yakin ingin menghapus profil pengaturan jam kerja ini? Profil yang telah dihapus tidak dapat dipulihkan kembali."
        itemName={deleteTargetSchedule?.nama}
        itemDetail={deleteTargetSchedule ? `Jam Kerja: ${deleteTargetSchedule.jam_masuk} - ${deleteTargetSchedule.jam_pulang} (Jumat: ${deleteTargetSchedule.jam_pulang_jumat}) • Toleransi: ${deleteTargetSchedule.toleransi_menit} mnt` : undefined}
        confirmText="Ya, Hapus Pengaturan"
        loading={actionLoading}
      />
    </div>
  );
}
