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
  Send
} from 'lucide-react';

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
  
  // File upload state
  const [fileBase64, setFileBase64] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [fileError, setFileError] = useState<string>('');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  if (!isOpen) return null;

  // Real-time analysis for retroactive / susulan
  const { isSusulan, diffDays } = checkIsSusulan(tanggalMulai);
  const jumlahHari = calculateDateRangeDays(tanggalMulai, tanggalSelesai);
  const currentConfig = PERMIT_TYPES[jenis];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError('');
    if (!file) return;

    // Max 1.5MB to fit cleanly in Firestore document or storage
    if (file.size > 1.5 * 1024 * 1024) {
      setFileError('Ukuran file maksimal 1.5 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setFileBase64(reader.result as string);
      setFileName(file.name);
    };
    reader.onerror = () => {
      setFileError('Gagal membaca file berkas.');
    };
    reader.readAsDataURL(file);
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
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-slate-900 text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h3 className="font-bold text-base tracking-tight">Form Permohonan Izin / Dinas Luar</h3>
              <p className="text-xs text-blue-200">Sekretariat Daerah Kabupaten Demak</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pegawai Info Banner */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-500">Pegawai:</span>{' '}
            <strong className="text-slate-800 font-semibold">{effectiveNama || effectiveNip}</strong>
          </div>
          <div className="text-slate-500">
            NIP: <span className="font-mono text-slate-700 font-medium">{effectiveNip}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Jenis Izin Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Jenis Permohonan <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {FORM_PERMIT_TYPES.map((key) => {
                const cfg = PERMIT_TYPES[key];
                const active = jenis === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setJenis(key)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all text-center flex flex-col items-center justify-center gap-1 ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs shadow-blue-200 ring-2 ring-blue-500/20'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span>{cfg.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 italic">
              {currentConfig.description}
            </p>
          </div>

          {/* Rentang Tanggal */}
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
                    Sistem mencatat pengajuan ini sebagai susulan tanggal lampau. Pastikan bukti surat fisik (Surat Dokter / SPT) terlampir jelas untuk mempermudah verifikasi admin.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Nomor Dokumen / SPT */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {currentConfig.letterLabel}{' '}
              {jenis === 'dinas_luar' ? <span className="text-red-500">*</span> : <span className="text-slate-400 font-normal">(opsional)</span>}
            </label>
            <input
              type="text"
              value={nomorSurat}
              onChange={(e) => setNomorSurat(e.target.value)}
              placeholder={jenis === 'dinas_luar' ? 'Contoh: 090/124/SETDA/2026' : 'Contoh: 440/12/Pusk.Demak/2026'}
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

          {/* Upload Bukti / Lampiran */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {currentConfig.fileLabel} <span className="text-slate-400 font-normal">(Foto/Scan JPG/PNG/PDF, maks 1.5MB)</span>
            </label>
            <div className="mt-1 flex items-center gap-3">
              <label className="cursor-pointer px-3.5 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors">
                <Upload className="w-3.5 h-3.5 text-slate-600" />
                Pilih File Berkas
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              {fileName && (
                <span className="text-xs text-emerald-700 font-medium truncate max-w-xs flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  {fileName}
                </span>
              )}
            </div>
            {fileError && <p className="text-[11px] text-red-600 mt-1">{fileError}</p>}
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
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
  );
}
