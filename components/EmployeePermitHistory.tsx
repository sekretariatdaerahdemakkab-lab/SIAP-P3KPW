'use client';

import { useState } from 'react';
import { PermitItem, PERMIT_TYPES } from '@/lib/permits';
import DocumentViewerModal from '@/components/DocumentViewerModal';
import {
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Calendar,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  Eye,
  X
} from 'lucide-react';

interface EmployeePermitHistoryProps {
  permits: PermitItem[];
  loading: boolean;
  onRefresh: () => void;
  onOpenForm: () => void;
}

export default function EmployeePermitHistory({
  permits,
  loading,
  onRefresh,
  onOpenForm
}: EmployeePermitHistoryProps) {
  const [selectedPermit, setSelectedPermit] = useState<PermitItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewName, setPreviewName] = useState('');

  const getStatusBadge = (status: PermitItem['status']) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Disetujui
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Ditolak
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Menunggu Verifikasi
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header Bar */}
      <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600" />
            Histori Permohonan Izin & Dinas Luar Saya
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Daftar pengajuan izin, sakit, dan penugasan luar kantor yang diajukan oleh NIP Anda
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-white border border-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Muat Ulang
          </button>
          <button
            onClick={onOpenForm}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-xs shadow-blue-200 flex items-center gap-1.5 cursor-pointer"
          >
            + Ajukan Permohonan Baru
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {loading ? (
          <div className="py-10 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>Memuat histori izin...</span>
          </div>
        ) : permits.length === 0 ? (
          <div className="text-center py-10 px-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
              <FileText className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-700">Belum Ada Pengajuan Izin / Dinas Luar</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              Jika Anda memerlukan izin sakit, surat tugas dinas luar (SPT), atau izin kepentingan dinas, klik tombol di bawah untuk membuat permohonan mandiri.
            </p>
            <button
              onClick={onOpenForm}
              className="px-4 py-2 text-xs font-semibold text-blue-600 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              + Buat Pengajuan Sekarang
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className="py-3 px-3 font-semibold w-10 text-center">NO</th>
                  <th className="py-3 px-3 font-semibold">JENIS IZIN</th>
                  <th className="py-3 px-3 font-semibold">TANGGAL IZIN</th>
                  <th className="py-3 px-3 font-semibold text-center">DURASI</th>
                  <th className="py-3 px-3 font-semibold">DASAR / NO. SURAT</th>
                  <th className="py-3 px-3 font-semibold">KETERANGAN / TUJUAN</th>
                  <th className="py-3 px-3 font-semibold text-center">STATUS</th>
                  <th className="py-3 px-3 font-semibold text-center">DETAIL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {permits.map((item, idx) => {
                  const cfg = PERMIT_TYPES[item.jenis] || PERMIT_TYPES.izin;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 text-center text-slate-500 font-medium">{idx + 1}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-md font-semibold border ${cfg.badgeClass}`}>
                            {cfg.label}
                          </span>
                          {item.is_susulan && (
                            <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              Susulan
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono font-medium text-slate-800">
                        {item.tanggal_mulai === item.tanggal_selesai ? (
                          item.tanggal_mulai
                        ) : (
                          <span>
                            {item.tanggal_mulai} <span className="text-slate-400">s/d</span> {item.tanggal_selesai}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-semibold text-slate-700">
                        {item.jumlah_hari} Hari
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        {item.nomor_surat ? (
                          <span className="font-mono text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded-xs">
                            {item.nomor_surat}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-700 max-w-xs truncate" title={item.keterangan}>
                        {item.keterangan}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {getStatusBadge(item.status)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => setSelectedPermit(item)}
                          className="px-2.5 py-1 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-md border border-slate-200 transition-colors inline-flex items-center gap-1 font-semibold cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-600" />
                          Rincian
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Detail & Review Note (Scrollable Modal) */}
      {selectedPermit && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden my-auto flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-blue-400" />
                <h4 className="font-bold text-sm">Rincian Pengajuan Izin</h4>
              </div>
              <button
                onClick={() => setSelectedPermit(null)}
                className="text-slate-400 hover:text-white p-1 rounded-md cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs overflow-y-auto flex-1 overscroll-contain">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <span className="text-slate-500 block">Jenis Permohonan</span>
                  <span className="font-bold text-sm text-slate-900 mt-0.5 block">
                    {PERMIT_TYPES[selectedPermit.jenis]?.label || selectedPermit.jenis}
                  </span>
                </div>
                <div>{getStatusBadge(selectedPermit.status)}</div>
              </div>

              {selectedPermit.is_susulan && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block text-amber-900">Pengajuan Susulan (Tanggal Lampau)</span>
                    <p className="text-[11px] text-amber-700">
                      Diajukan {selectedPermit.selisih_hari_susulan || 0} hari setelah tanggal izin dimulai.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-500 block mb-0.5">Tanggal Permohonan:</span>
                  <span className="font-bold text-slate-800 font-mono">
                    {selectedPermit.tanggal_mulai === selectedPermit.tanggal_selesai
                      ? selectedPermit.tanggal_mulai
                      : `${selectedPermit.tanggal_mulai} s/d ${selectedPermit.tanggal_selesai}`}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-500 block mb-0.5">Total Durasi:</span>
                  <span className="font-bold text-blue-600 text-sm">
                    {selectedPermit.jumlah_hari} Hari Kalender
                  </span>
                </div>
              </div>

              {selectedPermit.nomor_surat && (
                <div>
                  <span className="text-slate-500 block mb-0.5 font-medium">Nomor Surat / SPT:</span>
                  <span className="font-mono bg-slate-100 px-2 py-1 rounded-md text-slate-800 inline-block font-semibold">
                    {selectedPermit.nomor_surat}
                  </span>
                </div>
              )}

              <div>
                <span className="text-slate-500 block mb-0.5 font-medium">Uraian / Alasan:</span>
                <p className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-slate-700 leading-relaxed">
                  {selectedPermit.keterangan}
                </p>
              </div>

              {/* Catatan Admin jika ada */}
              {selectedPermit.catatan_admin && (
                <div className={`p-3 rounded-xl border ${selectedPermit.status === 'rejected' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
                  <span className="font-bold block mb-0.5">
                    Catatan Verifikator ({selectedPermit.approved_by || 'Admin Setda'}):
                  </span>
                  <p className="text-[11px] leading-relaxed">{selectedPermit.catatan_admin}</p>
                </div>
              )}

              {/* Lampiran Dokumen */}
              {selectedPermit.lampiran_url && (
                <div className="pt-2">
                  <span className="text-slate-500 block mb-1.5 font-medium">Berkas Pendukung / Surat Bukti:</span>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                    <span className="font-semibold text-slate-700 truncate max-w-xs">
                      {selectedPermit.lampiran_nama || 'Dokumen_Lampiran.pdf'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewUrl(selectedPermit.lampiran_url || null);
                        setPreviewTitle(`Lampiran: ${selectedPermit.nama}`);
                        setPreviewName(selectedPermit.lampiran_nama || 'Dokumen_Lampiran');
                      }}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Buka Dokumen
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedPermit(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pratinjau Dokumen Aman (PDF & Gambar) */}
      <DocumentViewerModal
        isOpen={!!previewUrl}
        onClose={() => setPreviewUrl(null)}
        documentUrl={previewUrl}
        documentTitle={previewTitle}
        fileName={previewName}
      />
    </div>
  );
}
