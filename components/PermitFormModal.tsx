'use client';

import { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  PermitItem,
  PERMIT_TYPES,
  FORM_PERMIT_TYPES,
  FormPermitType,
  calculateDateRangeDays,
  checkIsSusulan
} from '@/lib/permits';
import {
  FileText,
  Calendar,
  AlertTriangle,
  Upload,
  CheckCircle2,
  X,
  AlertCircle,
  Briefcase,
  HeartPulse,
  Clock,
  Send,
  Eye,
  Trash2
} from 'lucide-react';
import { validateAndCompressAttachment } from '@/lib/document-utils';
import DocumentViewerModal from '@/components/DocumentViewerModal';

interface PermitFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultNip?: string;
  defaultNama?: string;
  prefilledNip?: string;
  prefilledNama?: string;
  defaultUnitKerja?: string;
  onSuccess: () => void;
}

export default function PermitFormModal({
  isOpen,
  onClose,
  defaultNip,
  defaultNama,
  prefilledNip,
  prefilledNama,
  defaultUnitKerja = 'Sekretariat Daerah',
  onSuccess
}: PermitFormModalProps) {
  const effectiveNip = defaultNip || prefilledNip || '';
  const effectiveNama = defaultNama || prefilledNama || '';
  const [jenis, setJenis] = useState<FormPermitType>('dinas_luar');
  const todayISO = new Date().toISOString().split('T')[0];
  const [tanggalMulai, setTanggalMulai] = useState<string>(todayISO);
  const [tanggalSelesai, setTanggalSelesai] = useState<string>(todayISO);
  const [keterangan, setKeterangan] = useState<string>('');
  const [nomorSurat, setNomorSurat] = useState<string>('');
  
  // File upload state (Max 200 KB)
  const [fileBase64, setFileBase64] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [fileSizeKB, setFileSizeKB] = useState<number>(0);
  const [fileError, setFileError] = useState<string>('');
  const [fileNotice, setFileNotice] = useState<string>('');
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  if (!isOpen) return null;

  // Real-time analysis for retroactive / susulan
  const { isSusulan, diffDays } = checkIsSusulan(tanggalMulai);
  const jumlahHari = calculateDateRangeDays(tanggalMulai, tanggalSelesai);
  const currentConfig = PERMIT_TYPES[jenis];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError('');
    setFileNotice('');
    if (!file) return;

    setIsProcessingFile(true);
    try {
      // Validate and compress up to max 200 KB
      const res = await validateAndCompressAttachment(file, 200);
      setFileBase64(res.dataUrl);
      setFileName(res.filename);
      setFileSizeKB(res.sizeKB);

      if (res.wasCompressed) {
        setFileNotice(
          `Foto berhasil dioptimasi & dikompresi otomatis dari ${res.originalSizeKB} KB menjadi ${res.sizeKB} KB (maksimal 200 KB).`
        );
      } else {
        setFileNotice(`Berkas siap (${res.sizeKB} KB, maks 200 KB).`);
      }
    } catch (err: any) {
      setFileBase64('');
      setFileName('');
      setFileSizeKB(0);
      setFileError(err?.message || 'Gagal memproses file. Pastikan ukuran di bawah 200 KB.');
    } finally {
      setIsProcessingFile(false);
      // Reset input value so same file can be selected again if needed
      e.target.value = '';
    }
  };

  const handleRemoveFile = () => {
    setFileBase64('');
    setFileName('');
    setFileSizeKB(0);
    setFileError('');
    setFileNotice('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!effectiveNip) {
      setErrorMessage('NIP pegawai tidak terdeteksi.');
      return;
    }
    if (!tanggalMulai || !tanggalSelesai) {
      setErrorMessage('Tanggal mulai dan selesai wajib diisi.');
      return;
    }
    if (tanggalSelesai < tanggalMulai) {
      setErrorMessage('Tanggal selesai tidak boleh sebelum tanggal mulai.');
      return;
    }
    if (!keterangan.trim()) {
      setErrorMessage('Uraian keterangan/keperluan wajib diisi.');
      return;
    }

    // Required letter number check for DL / Sakit
    if (jenis === 'dinas_luar' && !nomorSurat.trim()) {
      setErrorMessage('Nomor Surat Perintah Tugas (SPT) wajib dicantumkan untuk Dinas Luar.');
      return;
    }

    setSubmitting(true);
    try {
      const newPermit: Omit<PermitItem, 'id'> = {
        nip: effectiveNip.trim(),
        nama: effectiveNama.trim() || effectiveNip.trim(),
        unit_kerja: defaultUnitKerja,
        jenis,
        tanggal_mulai: tanggalMulai,
        tanggal_selesai: tanggalSelesai,
        jumlah_hari: jumlahHari,
        keterangan: keterangan.trim(),
        nomor_surat: nomorSurat.trim() || undefined,
        lampiran_url: fileBase64 || undefined,
        lampiran_nama: fileName || undefined,
        is_susulan: isSusulan,
        selisih_hari_susulan: isSusulan ? diffDays : 0,
        status: 'pending',
        created_at: new Date().toISOString()
      };

      await addDoc(collection(db, 'permits'), newPermit);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error submitting permit:', err);
      setErrorMessage('Terjadi kendala saat mengirim pengajuan: ' + (err?.message || 'Koneksi error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden my-auto flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
          {/* Modal Header (Pinned) */}
          <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-blue-300" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base tracking-tight">
                  Form Permohonan Izin / Dinas Luar
                </h3>
                <p className="text-[11px] text-blue-200">
                  Sekretariat Daerah Kabupaten Demak
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Pegawai Info Banner (Pinned) */}
          <div className="bg-slate-50 border-b border-slate-200 px-6 py-2.5 flex items-center justify-between text-xs shrink-0">
            <div className="truncate mr-2">
              <span className="text-slate-500">Pegawai:</span>{' '}
              <strong className="text-slate-800 font-semibold">{effectiveNama || effectiveNip}</strong>
            </div>
            <span className="font-mono text-[11px] text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200 shrink-0">
              NIP: {effectiveNip}
            </span>
          </div>

          {/* Scrollable Form Body */}
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1 overflow-hidden">
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 overscroll-contain">
              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Pemilihan Jenis Izin */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Jenis Pengajuan <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {FORM_PERMIT_TYPES.map((t) => {
                    const cfg = PERMIT_TYPES[t];
                    const isSelected = jenis === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setJenis(t)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20 text-blue-900'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cfg.badgeClass}`}
                          >
                            {cfg.shortCode}
                          </span>
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />}
                        </div>
                        <span className="text-xs font-semibold leading-tight line-clamp-2">
                          {cfg.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                  {currentConfig.description}
                </p>
              </div>

              {/* Rentang Tanggal Mulai s.d Selesai */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Mulai <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={tanggalMulai}
                    onChange={(e) => {
                      setTanggalMulai(e.target.value);
                      if (e.target.value > tanggalSelesai) {
                        setTanggalSelesai(e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Selesai <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={tanggalSelesai}
                    min={tanggalMulai}
                    onChange={(e) => setTanggalSelesai(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden transition-all"
                    required
                  />
                </div>
              </div>

              {/* Indikator Durasi & Warning Susulan (Retroactive) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs px-3.5 py-2 bg-blue-50/70 border border-blue-200/70 rounded-lg text-blue-900">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    Durasi Pengajuan:
                  </span>
                  <strong className="font-bold text-blue-700">{jumlahHari} Hari Kalender</strong>
                </div>

                {isSusulan && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold block text-amber-900">
                        Pengajuan Susulan Terdeteksi ({diffDays} hari yang lalu)
                      </strong>
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        Sistem mencatat pengajuan ini sebagai susulan tanggal lampau. Pastikan bukti surat fisik (Surat Dokter / SPT) terlampir jelas untuk mempermudah verifikasi atasan dan admin.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Nomor Dokumen / SPT */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {currentConfig.letterLabel}{' '}
                  {jenis === 'dinas_luar' ? (
                    <span className="text-red-500">*</span>
                  ) : (
                    <span className="text-slate-400 font-normal">(opsional)</span>
                  )}
                </label>
                <input
                  type="text"
                  value={nomorSurat}
                  onChange={(e) => setNomorSurat(e.target.value)}
                  placeholder={
                    jenis === 'dinas_luar'
                      ? 'Contoh: 090/124/SETDA/2026'
                      : 'Contoh: 440/12/Pusk.Demak/2026'
                  }
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden transition-all"
                />
              </div>

              {/* Keterangan / Keperluan */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Uraian Keperluan / Catatan Alasan <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  placeholder={
                    jenis === 'dinas_luar'
                      ? 'Contoh: Mengikuti Rapat Koordinasi Penataan Tenaga Non-ASN di BKD Provinsi Jawa Tengah, Semarang'
                      : jenis === 'sakit'
                      ? 'Contoh: Istirahat rawat jalan demam tinggi sesuai anjuran dokter Puskesmas Demak 1'
                      : 'Contoh: Pengajuan cuti tahunan / bersalin sesuai ketentuan yang berlaku'
                  }
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden transition-all resize-none"
                  required
                />
              </div>

              {/* Upload Bukti / Lampiran (Dibatasi Maksimal 200 KB, Gambar atau PDF) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    {currentConfig.fileLabel}
                  </label>
                  <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    Maks. 200 KB (PDF / Gambar)
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="cursor-pointer px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors shadow-xs">
                      <Upload className="w-3.5 h-3.5 text-blue-600" />
                      {fileBase64 ? 'Ganti File Berkas' : 'Pilih File Bukti Dukung'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
                        onChange={handleFileChange}
                        disabled={isProcessingFile}
                        className="hidden"
                      />
                    </label>

                    {isProcessingFile && (
                      <span className="text-xs text-blue-600 flex items-center gap-1.5 font-medium">
                        <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        Mengoptimasi berkas (maks 200 KB)...
                      </span>
                    )}

                    {fileName && !isProcessingFile && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setIsPreviewOpen(true)}
                          className="px-2.5 py-1.5 bg-blue-100/70 hover:bg-blue-100 text-blue-800 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Lihat Pratinjau Berkas"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-600" />
                          <span className="truncate max-w-[150px] sm:max-w-[200px]">{fileName}</span>
                          <span className="text-[10px] font-mono text-blue-600">({fileSizeKB} KB)</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleRemoveFile}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Hapus Lampiran"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {fileNotice && (
                    <p className="text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      {fileNotice}
                    </p>
                  )}

                  {fileError && (
                    <p className="text-[11px] text-red-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                      {fileError}
                    </p>
                  )}

                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Keterangan: Format yang didukung berupa <strong>PDF</strong> atau <strong>Foto/Scan (JPG, JPEG, PNG, WebP)</strong> dengan batas ukuran maksimal <strong>200 KB</strong>. Foto yang sedikit lebih besar akan dioptimasi secara otomatis.
                  </p>
                </div>
              </div>
            </div>

            {/* Pinned Action Buttons Footer */}
            <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting || isProcessingFile}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-200 flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Mengirim...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Kirim Permohonan Izin</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Pratinjau Dokumen Lampiran Mandiri */}
      <DocumentViewerModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        documentUrl={fileBase64 || null}
        documentTitle={`Pratinjau Dokumen: ${currentConfig.label}`}
        fileName={fileName || 'Lampiran_Izin'}
      />
    </>
  );
}
