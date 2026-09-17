'use client';

import { useState, useEffect } from 'react';
import { collection, query, updateDoc, doc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { PermitItem, PERMIT_TYPES } from '@/lib/permits';
import {
  FileText,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Eye,
  Check,
  X,
  MessageSquare,
  Building,
  User,
  Calendar,
  AlertCircle
} from 'lucide-react';

export default function AdminPermitsManagement() {
  const [permits, setPermits] = useState<PermitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Modal Review/Approval
  const [reviewModalPermit, setReviewModalPermit] = useState<PermitItem | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Real-time synchronization of permits
  useEffect(() => {
    const q = query(collection(db, 'permits'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: PermitItem[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PermitItem, 'id'>)
        }));
        list.sort(
          (a, b) =>
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
        setPermits(list);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to permits:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const handleManualRefresh = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
    }, 400);
  };

  // Handle Approve or Reject
  const handleReviewAction = async (newStatus: 'approved' | 'rejected') => {
    if (!reviewModalPermit) return;
    setActionLoading(true);
    setActionSuccess(null);

    try {
      const permitRef = doc(db, 'permits', reviewModalPermit.id);
      const currentAdminEmail = auth.currentUser?.email || 'admin.setda@demakkab.go.id';

      const updateData = {
        status: newStatus,
        catatan_admin: adminNote.trim() || (newStatus === 'approved' ? 'Disetujui oleh Administrator Setda' : 'Permohonan ditolak oleh Administrator'),
        approved_by: currentAdminEmail,
        approved_at: new Date().toISOString()
      };

      await updateDoc(permitRef, updateData);

      // Update local state
      setPermits(prev =>
        prev.map(p =>
          p.id === reviewModalPermit.id
            ? { ...p, ...updateData }
            : p
        )
      );

      setActionSuccess(`Permohonan berhasil ${newStatus === 'approved' ? 'disetujui' : 'ditolak'}!`);
      setTimeout(() => {
        setReviewModalPermit(null);
        setAdminNote('');
        setActionSuccess(null);
      }, 1000);
    } catch (err: any) {
      console.error('Error updating permit status:', err);
      alert('Gagal memperbarui status izin: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Delete permit handler
  const handleDeletePermit = async (permitId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus data permohonan izin ini?')) return;
    try {
      await deleteDoc(doc(db, 'permits', permitId));
      setPermits(prev => prev.filter(p => p.id !== permitId));
      if (reviewModalPermit?.id === permitId) setReviewModalPermit(null);
    } catch (err: any) {
      alert('Gagal menghapus permohonan: ' + err.message);
    }
  };

  // Filter calculations
  const filteredPermits = permits.filter(p => {
    const matchesSearch =
      p.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.nip.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.keterangan || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.nomor_surat || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.unit_kerja || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchesType = typeFilter === 'all' || p.jenis === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  const countPending = permits.filter(p => p.status === 'pending').length;
  const countApproved = permits.filter(p => p.status === 'approved').length;
  const countRejected = permits.filter(p => p.status === 'rejected').length;
  const countSusulan = permits.filter(p => p.is_susulan).length;

  return (
    <div className="space-y-6">
      {/* Top Header & Metrics */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-blue-600" />
            Persetujuan Izin, Sakit & Dinas Luar (Permit Verification)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Panel verifikasi dan pengesahan permohonan dinas luar (SPT), izin istirahat sakit (SKD), dan izin mandiri pegawai PPPK Paruh Waktu Setda Demak.
          </p>
        </div>
        <button
          onClick={handleManualRefresh}
          className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-xs self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          Segarkan Data
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div
          onClick={() => setStatusFilter('pending')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'pending'
              ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/20'
              : 'bg-white border-slate-200 hover:border-amber-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Menunggu Verifikasi</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-amber-700 mt-2">{countPending}</p>
          <p className="text-[11px] text-amber-600/80 mt-0.5">Perlu tindakan persetujuan</p>
        </div>

        <div
          onClick={() => setStatusFilter('approved')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'approved'
              ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-400/20'
              : 'bg-white border-slate-200 hover:border-emerald-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Telah Disetujui</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-2">{countApproved}</p>
          <p className="text-[11px] text-emerald-600/80 mt-0.5">Masuk perhitungan rekap</p>
        </div>

        <div
          onClick={() => setStatusFilter('rejected')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            statusFilter === 'rejected'
              ? 'bg-rose-50/80 border-rose-300 ring-2 ring-rose-400/20'
              : 'bg-white border-slate-200 hover:border-rose-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Ditolak</span>
            <XCircle className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-bold text-rose-700 mt-2">{countRejected}</p>
          <p className="text-[11px] text-rose-600/80 mt-0.5">Berkas tidak sah / ditolak</p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Izin Susulan (Backdate)</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">{countSusulan}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Diajukan setelah tanggal izin</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cari nama pegawai, NIP, no. surat, atau bagian..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-hidden cursor-pointer focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Semua Status</option>
            <option value="pending">Menunggu Verifikasi</option>
            <option value="approved">Disetujui</option>
            <option value="rejected">Ditolak</option>
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-hidden cursor-pointer focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Semua Jenis Izin</option>
            <option value="dinas_luar">Dinas Luar (DL)</option>
            <option value="sakit">Sakit (S)</option>
            <option value="izin">Izin Alasan Penting (I)</option>
            <option value="cuti">Cuti (C)</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-3 w-10 text-center">NO</th>
                <th className="py-3.5 px-4">PEGAWAI</th>
                <th className="py-3.5 px-3">JENIS & STATUS</th>
                <th className="py-3.5 px-3">TANGGAL IZIN</th>
                <th className="py-3.5 px-3 text-center">DURASI</th>
                <th className="py-3.5 px-4">DASAR / NO. SURAT</th>
                <th className="py-3.5 px-4">URAIAN KEPERLUAN</th>
                <th className="py-3.5 px-4 text-center">AKSI VERIFIKASI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <span>Memuat data permohonan izin...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredPermits.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                      <FileText className="w-6 h-6" />
                    </div>
                    <p className="font-semibold text-slate-700">Tidak ada data permohonan ditemukan</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
                        ? 'Coba sesuaikan kata kunci pencarian atau filter status Anda'
                        : 'Belum ada pengajuan izin dari pegawai'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredPermits.map((item, idx) => {
                  const cfg = PERMIT_TYPES[item.jenis] || PERMIT_TYPES.izin;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 text-center text-slate-400 font-medium">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-bold text-slate-900 leading-snug">{item.nama}</p>
                          <p className="font-mono text-slate-500 text-[11px]">NIP. {item.nip}</p>
                          {item.unit_kerja && (
                            <p className="text-[10px] text-slate-400 mt-0.5">{item.unit_kerja}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-md font-semibold border text-[11px] ${cfg.badgeClass}`}>
                              {cfg.label}
                            </span>
                            {item.is_susulan && (
                              <span
                                className="px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300"
                                title={`Diajukan susulan ${item.selisih_hari_susulan || 0} hari setelah tanggal pelaksanaan`}
                              >
                                Susulan ({item.selisih_hari_susulan || 0}h)
                              </span>
                            )}
                          </div>

                          <div>
                            {item.status === 'approved' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                Disetujui
                              </span>
                            ) : item.status === 'rejected' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700">
                                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                                Ditolak
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 animate-pulse">
                                <Clock className="w-3.5 h-3.5 text-amber-600" />
                                Menunggu
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono font-medium text-slate-800">
                        {item.tanggal_mulai === item.tanggal_selesai ? (
                          item.tanggal_mulai
                        ) : (
                          <div>
                            <span>{item.tanggal_mulai}</span>
                            <span className="text-slate-400 block text-[10px]">s/d {item.tanggal_selesai}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-slate-700">
                        {item.jumlah_hari} Hari
                      </td>
                      <td className="py-3 px-4">
                        {item.nomor_surat ? (
                          <span className="font-mono bg-slate-100 text-slate-800 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                            {item.nomor_surat}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">-</span>
                        )}
                        {item.lampiran_url && (
                          <a
                            href={item.lampiran_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 hover:underline font-semibold"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Lihat Lampiran
                          </a>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700 max-w-xs truncate" title={item.keterangan}>
                        {item.keterangan}
                        {item.catatan_admin && (
                          <p className="text-[10px] text-slate-500 italic mt-0.5">
                            Catatan: &ldquo;{item.catatan_admin}&rdquo;
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setReviewModalPermit(item);
                              setAdminNote(item.catatan_admin || '');
                            }}
                            className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Periksa
                          </button>
                          {item.status === 'pending' && (
                            <>
                              <button
                                onClick={async () => {
                                  setReviewModalPermit(item);
                                  setAdminNote('Disetujui langsung oleh Admin');
                                  // Quick approve
                                  try {
                                    const permitRef = doc(db, 'permits', item.id);
                                    await updateDoc(permitRef, {
                                      status: 'approved',
                                      approved_by: auth.currentUser?.email || 'admin.setda@demakkab.go.id',
                                      approved_at: new Date().toISOString(),
                                      catatan_admin: 'Disetujui oleh Admin Setda'
                                    });
                                    setPermits(prev =>
                                      prev.map(p =>
                                        p.id === item.id
                                          ? { ...p, status: 'approved', approved_by: 'admin', catatan_admin: 'Disetujui oleh Admin Setda' }
                                          : p
                                      )
                                    );
                                  } catch (err: any) {
                                    alert(err.message);
                                  }
                                }}
                                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                                title="Setujui Langsung"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
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

      {/* Modal Review Detail & Persetujuan */}
      {reviewModalPermit && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-blue-400" />
                <h4 className="font-bold text-sm">Verifikasi Permohonan Izin / Dinas Luar</h4>
              </div>
              <button
                onClick={() => setReviewModalPermit(null)}
                className="text-slate-400 hover:text-white p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 text-xs">
              {actionSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{actionSuccess}</span>
                </div>
              )}

              {/* Pegawai Info */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Pegawai Pemohon</span>
                  <p className="font-bold text-sm text-slate-900 mt-0.5">{reviewModalPermit.nama}</p>
                  <p className="text-slate-500 font-mono text-[11px]">NIP: {reviewModalPermit.nip}</p>
                  {reviewModalPermit.unit_kerja && (
                    <p className="text-slate-500 text-[11px] mt-0.5">{reviewModalPermit.unit_kerja}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Status Saat Ini</span>
                  <div className="mt-1">
                    {reviewModalPermit.status === 'approved' ? (
                      <span className="px-2.5 py-1 rounded-full font-bold bg-emerald-100 text-emerald-800 text-[11px]">
                        Disetujui
                      </span>
                    ) : reviewModalPermit.status === 'rejected' ? (
                      <span className="px-2.5 py-1 rounded-full font-bold bg-rose-100 text-rose-800 text-[11px]">
                        Ditolak
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full font-bold bg-amber-100 text-amber-800 text-[11px]">
                        Menunggu Persetujuan
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Susulan Alert if applicable */}
              {reviewModalPermit.is_susulan && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Peringatan: Pengajuan Susulan (Tanggal Lampau)</span>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Pengajuan diajukan <strong>{reviewModalPermit.selisih_hari_susulan || 0} hari</strong> setelah tanggal izin berjalan. Mohon periksa keabsahan surat pendukung fisik (SPT / Surat Sakit Puskesmas/Dokter).
                    </p>
                  </div>
                </div>
              )}

              {/* Rincian Permohonan Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 font-medium block mb-0.5">Jenis Izin:</span>
                  <span className="font-bold text-slate-800 text-sm">
                    {PERMIT_TYPES[reviewModalPermit.jenis]?.label || reviewModalPermit.jenis}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 font-medium block mb-0.5">Durasi Waktu:</span>
                  <span className="font-bold text-blue-600 text-sm">
                    {reviewModalPermit.jumlah_hari} Hari Kalender
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Rentang Tanggal:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {reviewModalPermit.tanggal_mulai} s/d {reviewModalPermit.tanggal_selesai}
                  </span>
                </div>
                {reviewModalPermit.nomor_surat && (
                  <div className="flex justify-between border-t border-slate-200/60 pt-2">
                    <span className="text-slate-500">Nomor Surat / SPT:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {reviewModalPermit.nomor_surat}
                    </span>
                  </div>
                )}
                <div className="border-t border-slate-200/60 pt-2">
                  <span className="text-slate-500 block mb-1">Keperluan / Keterangan:</span>
                  <p className="text-slate-800 font-medium leading-relaxed bg-white p-2.5 rounded-lg border border-slate-200">
                    {reviewModalPermit.keterangan}
                  </p>
                </div>
              </div>

              {/* Berkas Bukti / Lampiran */}
              {reviewModalPermit.lampiran_url && (
                <div>
                  <span className="text-slate-500 block mb-1 font-medium">Lampiran Berkas:</span>
                  <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl flex items-center justify-between">
                    <span className="font-semibold text-slate-700 truncate max-w-xs">
                      {reviewModalPermit.lampiran_nama || 'Berkas_Bukti_Surat.pdf'}
                    </span>
                    <a
                      href={reviewModalPermit.lampiran_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold inline-flex items-center gap-1 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Buka Dokumen
                    </a>
                  </div>
                </div>
              )}

              {/* Input Catatan Admin / Alasan Penolakan */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Admin / Verifikator (opsional jika setuju, wajib jika ditolak):
                </label>
                <textarea
                  rows={2}
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  placeholder="Contoh: Disetujui sesuai SPT No. 090/124 atau Mohon perbarui scan surat dokter yang jelas..."
                  className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden transition-all resize-none"
                />
              </div>

              {/* Review History if existing */}
              {reviewModalPermit.approved_by && (
                <div className="text-[11px] text-slate-400 italic">
                  Terakhir ditinjau oleh {reviewModalPermit.approved_by} pada{' '}
                  {reviewModalPermit.approved_at
                    ? new Date(reviewModalPermit.approved_at).toLocaleString('id-ID')
                    : '-'}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleDeletePermit(reviewModalPermit.id)}
                className="text-xs text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
              >
                Hapus Pengajuan
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleReviewAction('rejected')}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <X className="w-4 h-4 text-rose-600" />
                  Tolak Permohonan
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleReviewAction('approved')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs shadow-emerald-200 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  Setujui Permohonan (Sah)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
