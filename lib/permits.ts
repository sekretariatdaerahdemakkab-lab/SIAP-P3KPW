export interface PermitItem {
  id: string;
  nip: string;
  nama: string;
  unit_kerja?: string;
  jenis: 'dinas_luar' | 'sakit' | 'izin' | 'cuti';
  tanggal_mulai: string; // YYYY-MM-DD
  tanggal_selesai: string; // YYYY-MM-DD
  jumlah_hari: number;
  keterangan: string;
  nomor_surat?: string; // No. SPT / No. Surat Keterangan Dokter
  lampiran_url?: string;
  lampiran_nama?: string;
  is_susulan: boolean; // Flag retroactive submission
  selisih_hari_susulan?: number;
  status: 'pending' | 'approved' | 'rejected';
  catatan_admin?: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string; // ISO
}

export const PERMIT_TYPES = {
  dinas_luar: {
    label: 'Dinas Luar (DL)',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    shortCode: 'DL',
    description: 'Penugasan luar kantor dengan dasar Surat Perintah Tugas (SPT)',
    letterLabel: 'Nomor SPT / Surat Perintah Tugas',
    fileLabel: 'Unggah Foto/Scan SPT Resmi'
  },
  sakit: {
    label: 'Sakit (S)',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    shortCode: 'S',
    description: 'Izin istirahat sakit dengan Surat Keterangan Dokter (SKD)',
    letterLabel: 'Nomor Surat Keterangan Dokter / Faskes',
    fileLabel: 'Unggah Foto/Scan Surat Dokter (SKD)'
  },
  izin: {
    label: 'Izin Alasan Penting (I)',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    shortCode: 'I',
    description: 'Izin urusan mendesak / keluarga / kepentingan sah',
    letterLabel: 'Nomor Surat Permohonan (opsional)',
    fileLabel: 'Unggah Bukti Pendukung (opsional)'
  },
  cuti: {
    label: 'Cuti (C)',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    shortCode: 'C',
    description: 'Cuti tahunan / melahirkan / alasan penting yang disetujui',
    letterLabel: 'Nomor Surat Keputusan / Pengajuan Cuti',
    fileLabel: 'Unggah Berkas Formulir Cuti'
  }
} as const;

/**
 * Utility to calculate day difference between two dates
 */
export function calculateDateRangeDays(startISO: string, endISO: string): number {
  if (!startISO || !endISO) return 1;
  const s = new Date(startISO);
  const e = new Date(endISO);
  const diffTime = e.getTime() - s.getTime();
  if (diffTime < 0) return 1;
  return Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Checks if the start date is in the past compared to today (Retroactive / Susulan)
 */
export function checkIsSusulan(startDateISO: string): { isSusulan: boolean; diffDays: number } {
  if (!startDateISO) return { isSusulan: false, diffDays: 0 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(startDateISO);
  start.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  return {
    isSusulan: diffDays > 0,
    diffDays: Math.max(0, diffDays)
  };
}
