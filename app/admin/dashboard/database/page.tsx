'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Database,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Trash2,
  Server,
  Layers,
  KeyRound,
  Table2,
  ArrowRight,
  Info,
  ShieldCheck,
  FileSpreadsheet,
  Users,
  X
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import firebaseConfig from '@/firebase-applet-config.json';
import {
  FIRESTORE_COLLECTIONS_SCHEMA,
  CollectionStatusItem,
  getDatabaseCollectionStats,
  seedCoreCollections,
  seedSampleTransactionalCollections,
  cleanupSampleTransactionalCollections
} from '@/lib/db-seed';

export default function DatabaseStructurePage() {
  const [stats, setStats] = useState<Record<string, CollectionStatusItem>>({});
  const [hasSampleDocs, setHasSampleDocs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'inti' | 'transaksi'>('all');
  const [expandedCol, setExpandedCol] = useState<string>('admins');
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDatabaseCollectionStats();
      setStats(res.stats);
      setHasSampleDocs(res.hasSampleDocs);
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: 'Gagal memeriksa status koleksi Firestore: ' + (err?.message || 'Kesalahan jaringan')
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    getDatabaseCollectionStats()
      .then((res) => {
        if (!isMounted) return;
        setStats(res.stats);
        setHasSampleDocs(res.hasSampleDocs);
        setLoading(false);
      })
      .catch((err: any) => {
        if (!isMounted) return;
        setBanner({
          type: 'error',
          text: 'Gagal memeriksa status koleksi Firestore: ' + (err?.message || 'Kesalahan jaringan')
        });
        setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSeedCore = async () => {
    const user = auth.currentUser;
    if (!user) {
      setBanner({
        type: 'error',
        text: 'Sesi admin tidak ditemukan. Silakan login ulang di portal admin.'
      });
      return;
    }

    setActionLoading('core');
    setBanner(null);
    try {
      const res = await seedCoreCollections(user.uid, user.email || '');
      const parts: string[] = [];
      if (res.adminsCreated) parts.push('admins (1 akun)');
      if (res.settingsCreated) parts.push('settings/work_hours (jadwal Reguler & Ramadhan)');
      parts.push(`atasan_users (${res.atasanCount} pejabat & PIN)`);
      if (res.holidaysCreated > 0) parts.push(`holidays (${res.holidaysCreated} hari libur 2025-2026)`);

      setBanner({
        type: 'success',
        text: `Pemulihan struktur & data master inti selesai: ${parts.join(', ')}. Data eksisting tetap aman dan tidak ditimpa.`
      });
      await loadStats();
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: 'Gagal memulihkan data inti: ' + (err?.message || 'Terjadi kesalahan sistem')
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSeedSamples = async () => {
    setActionLoading('sample');
    setBanner(null);
    try {
      const res = await seedSampleTransactionalCollections();
      const created: string[] = [];
      if (res.employeesCreated) created.push('employees');
      if (res.employeeAuthCreated) created.push('employee_auth');
      if (res.attendancesCreated) created.push('attendances');
      if (res.permitsCreated) created.push('permits');

      if (created.length === 0) {
        setBanner({
          type: 'info',
          text: 'Seluruh koleksi transaksi sudah memiliki dokumen sehingga tidak perlu membuat dokumen contoh.'
        });
      } else {
        setBanner({
          type: 'success',
          text: `Berhasil membuat dokumen contoh struktur pada koleksi: ${created.join(', ')}. Sekarang seluruh 8 koleksi terlihat di Firebase Console.`
        });
      }
      await loadStats();
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: 'Gagal membuat dokumen contoh transaksi: ' + (err?.message || 'Terjadi kesalahan sistem')
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCleanupSamples = async () => {
    setActionLoading('cleanup');
    setBanner(null);
    try {
      const removed = await cleanupSampleTransactionalCollections();
      setBanner({
        type: 'success',
        text:
          removed > 0
            ? `Berhasil menghapus ${removed} dokumen contoh tanpa memengaruhi data pegawai atau absensi riil.`
            : 'Tidak ada dokumen contoh yang perlu dihapus.'
      });
      await loadStats();
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: 'Gagal menghapus dokumen contoh: ' + (err?.message || 'Terjadi kesalahan sistem')
      });
    } finally {
      setActionLoading(null);
    }
  };

  const filteredSchemas = FIRESTORE_COLLECTIONS_SCHEMA.filter(
    (item) => selectedCategory === 'all' || item.category === selectedCategory
  );

  const readyCount = Object.values(stats).filter((s) => s.status === 'ready').length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
            <Database className="w-6 h-6 text-blue-600" />
            Struktur &amp; Pemulihan Database Firestore
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Pantau status 8 koleksi database aplikasi dan pulihkan struktur tabel maupun data master inti setelah reset database.
          </p>
        </div>

        <button
          onClick={loadStats}
          disabled={loading || actionLoading !== null}
          className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-xs disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          Segarkan Status Koleksi
        </button>
      </div>

      {/* Environment Info Card */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
              <Server className="w-5 h-5 text-blue-300" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-300">
                  Instance Cloud Firestore Aktif
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Terhubung ({readyCount}/8 Koleksi Terisi)
                </span>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-300 font-mono">
                <span>
                  Project ID: <strong className="text-white">{firebaseConfig.projectId}</strong>
                </span>
                <span>
                  Database ID: <strong className="text-white">{firebaseConfig.firestoreDatabaseId}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-300 bg-slate-800/80 px-3.5 py-2 rounded-xl border border-slate-700 max-w-md">
            <strong className="text-amber-300">Catatan Firestore (NoSQL):</strong> Koleksi baru muncul di Firebase Console setelah memiliki minimal 1 dokumen.
          </div>
        </div>
      </div>

      {/* Notification Banner */}
      {banner && (
        <div
          className={`p-4 rounded-xl flex items-start gap-3 text-sm ${
            banner.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              : banner.type === 'error'
              ? 'bg-red-50 text-red-900 border border-red-200'
              : 'bg-blue-50 text-blue-900 border border-blue-200'
          }`}
        >
          {banner.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : banner.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          ) : (
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 font-medium text-xs sm:text-sm leading-relaxed">{banner.text}</div>
          <button
            onClick={() => setBanner(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
            aria-label="Tutup pesan"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Action Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-slate-900 text-base">Pemulihan Cepat Struktur &amp; Data Master</h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Gunakan tombol di bawah untuk memulihkan koleksi konfigurasi utama secara otomatis tanpa menimpa data yang sudah ada.
          </p>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              onClick={handleSeedCore}
              disabled={actionLoading !== null}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm shadow-blue-200 disabled:opacity-50"
            >
              {actionLoading === 'core' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              Pulihkan Struktur &amp; Data Master Inti
            </button>

            <button
              onClick={handleSeedSamples}
              disabled={actionLoading !== null}
              className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'sample' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Layers className="w-4 h-4" />
              )}
              Buat Contoh Struktur Koleksi Transaksi
            </button>

            {hasSampleDocs && (
              <button
                onClick={handleCleanupSamples}
                disabled={actionLoading !== null}
                className="px-3.5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {actionLoading === 'cleanup' ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Hapus Dokumen Contoh
              </button>
            )}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-[11px] text-slate-600 space-y-1">
            <p>
              <strong className="text-slate-800">1. Data Master Inti:</strong> Memulihkan{' '}
              <code className="text-blue-700">admins</code>, <code className="text-blue-700">settings/work_hours</code>,{' '}
              <code className="text-blue-700">atasan_users</code> (9 Pejabat Setda), dan{' '}
              <code className="text-blue-700">holidays</code> (Libur Nasional &amp; Cuti Bersama 2025–2026).
            </p>
            <p>
              <strong className="text-slate-800">2. Koleksi Transaksi Contoh:</strong> Membuat 1 dokumen templat di{' '}
              <code className="text-indigo-700">employees</code>, <code className="text-indigo-700">employee_auth</code>,{' '}
              <code className="text-indigo-700">attendances</code>, dan <code className="text-indigo-700">permits</code>{' '}
              hanya jika koleksi tersebut masih kosong.
            </p>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              Pemulihan Data Riil Pegawai &amp; Absensi
            </h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Setelah struktur inti dipulihkan, unggah kembali data induk pegawai PPPK dan log mesin fingerprint melalui file Excel (.xlsx) agar data riil langsung terisi penuh.
            </p>
          </div>

          <div className="space-y-2.5">
            <Link
              href="/admin/dashboard/employees"
              className="w-full px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Import Excel Master Data Pegawai
              </span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/admin/dashboard"
              className="w-full px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                Import Excel Log Kehadiran Fingerprint
              </span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Live Collection Status Grid */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
            <Table2 className="w-5 h-5 text-slate-600" />
            Status Langsung 8 Koleksi Firestore
          </h3>
          <div className="flex items-center gap-1.5 text-xs">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                selectedCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              Semua (8)
            </button>
            <button
              onClick={() => setSelectedCategory('inti')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                selectedCategory === 'inti' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              Master &amp; Konfigurasi (4)
            </button>
            <button
              onClick={() => setSelectedCategory('transaksi')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                selectedCategory === 'transaksi' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              Pegawai &amp; Transaksi (4)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {filteredSchemas.map((col) => {
            const st = stats[col.id];
            const isSelected = expandedCol === col.id;
            return (
              <button
                key={col.id}
                type="button"
                onClick={() => setExpandedCol(col.id)}
                className={`text-left p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-100 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                }`}
              >
                <div className="flex items-start justify-between gap-2 w-full">
                  <div>
                    <code className="text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                      {col.id}
                    </code>
                    <p className="text-xs font-semibold text-slate-700 mt-1.5">{col.title}</p>
                  </div>
                  {st?.status === 'ready' ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 shrink-0">
                      {st.count} Dok
                    </span>
                  ) : st?.status === 'restricted_ok' ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 shrink-0">
                      Privat
                    </span>
                  ) : st?.status === 'error' ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 shrink-0">
                      Error
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 shrink-0">
                      Kosong (0)
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between w-full text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                  <span className="font-mono truncate">ID: {col.docIdPattern}</span>
                  <span className="text-blue-600 font-semibold shrink-0 ml-2">Skema &rarr;</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detailed Schema Inspector */}
      {(() => {
        const activeSchema =
          FIRESTORE_COLLECTIONS_SCHEMA.find((c) => c.id === expandedCol) || FIRESTORE_COLLECTIONS_SCHEMA[0];
        const activeStat = stats[activeSchema.id];

        return (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <KeyRound className="w-4 h-4 text-blue-600" />
                  <h4 className="font-bold text-slate-900 text-base">
                    Skema Koleksi: <code className="text-blue-700">/{activeSchema.id}/&#123;docId&#125;</code>
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                    Document ID: {activeSchema.docIdPattern}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1">{activeSchema.description}</p>
                {activeStat?.note && (
                  <p className="text-[11px] text-amber-700 mt-1 font-medium">{activeStat.note}</p>
                )}
              </div>
              <div className="text-xs text-slate-500 font-medium shrink-0">
                {activeSchema.fields.length} Field Terdefinisi
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50/70 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Nama Field
                    </th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Tipe Data
                    </th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Keterangan
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeSchema.fields.map((f) => (
                    <tr key={f.field} className="hover:bg-slate-50/60">
                      <td className="px-6 py-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {f.field}
                      </td>
                      <td className="px-6 py-3 font-mono text-indigo-700 whitespace-nowrap">{f.type}</td>
                      <td className="px-6 py-3 whitespace-nowrap">
                        {f.required ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            Wajib
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600">
                            Opsional
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-slate-600">{f.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
