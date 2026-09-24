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
  approved_by_role?: 'admin' | 'atasan';
  approved_by_nip?: string;
  approved_by_jabatan?: string;
  approved_at?: string;
  created_at: string; // ISO
}

export interface AtasanUser {
  nip: string;
  nama: string;
  jabatan: string;
  unit_kerja: string;
  pin?: string;
}

/**
 * Daftar resmi 9 Bagian di lingkungan Sekretariat Daerah Kabupaten Demak
 */
export const SETDA_BAGIAN_LIST = [
  'Bagian Umum',
  'Bagian Hukum',
  'Bagian Organisasi',
  'Bagian Perekonomian & SDA',
  'Bagian Administrasi Pembangunan',
  'Bagian Pengadaan Barang & Jasa',
  'Bagian Pemerintahan',
  'Bagian Kesejahteraan Rakyat',
  'Bagian Protokol & Komunikasi Pimpinan'
] as const;

export const DEFAULT_ATASAN_LIST: AtasanUser[] = [
  {
    nip: '197505121998031002',
    nama: 'Kepala Bagian Umum',
    jabatan: 'Kepala Bagian Umum',
    unit_kerja: 'Bagian Umum',
    pin: '123456'
  },
  {
    nip: '197803152002121004',
    nama: 'Kepala Bagian Hukum',
    jabatan: 'Kepala Bagian Hukum',
    unit_kerja: 'Bagian Hukum',
    pin: '123456'
  },
  {
    nip: '198006202005012008',
    nama: 'Kepala Bagian Organisasi',
    jabatan: 'Kepala Bagian Organisasi',
    unit_kerja: 'Bagian Organisasi',
    pin: '123456'
  },
  {
    nip: '197609142000031001',
    nama: 'Kepala Bagian Perekonomian & SDA',
    jabatan: 'Kepala Bagian Perekonomian & SDA',
    unit_kerja: 'Bagian Perekonomian & SDA',
    pin: '123456'
  },
  {
    nip: '197904082003121003',
    nama: 'Kepala Bagian Administrasi Pembangunan',
    jabatan: 'Kepala Bagian Administrasi Pembangunan',
    unit_kerja: 'Bagian Administrasi Pembangunan',
    pin: '123456'
  },
  {
    nip: '198111052006041005',
    nama: 'Kepala Bagian Pengadaan Barang & Jasa',
    jabatan: 'Kepala Bagian Pengadaan Barang & Jasa',
    unit_kerja: 'Bagian Pengadaan Barang & Jasa',
    pin: '123456'
  },
  {
    nip: '197408101997031002',
    nama: 'Kepala Bagian Tata Pemerintahan',
    jabatan: 'Kepala Bagian Tata Pemerintahan',
    unit_kerja: 'Bagian Tata Pemerintahan',
    pin: '123456'
  },
  {
    nip: '197702182001121002',
    nama: 'Kepala Bagian Kesejahteraan Rakyat',
    jabatan: 'Kepala Bagian Kesejahteraan Rakyat',
    unit_kerja: 'Bagian Kesejahteraan Rakyat',
    pin: '123456'
  },
  {
    nip: '198307222008011006',
    nama: 'Kepala Bagian Protokol & Komunikasi Pimpinan',
    jabatan: 'Kepala Bagian Protokol & Komunikasi Pimpinan',
    unit_kerja: 'Bagian Protokol & Komunikasi Pimpinan',
    pin: '123456'
  }
];

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
    description: 'Cuti tahunan / bersalin yang disetujui',
    letterLabel: 'Nomor Surat Keputusan / Pengajuan Cuti',
    fileLabel: 'Unggah Berkas Formulir Cuti'
  }
} as const;

/**
 * Daftar jenis izin resmi yang berlaku pada formulir pengajuan
 */
export const FORM_PERMIT_TYPES = ['dinas_luar', 'sakit', 'cuti'] as const;
export type FormPermitType = typeof FORM_PERMIT_TYPES[number];

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

import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Ensures all standard Atasan and Pejabat data are physically present in the Firestore database (atasan_users collection).
 * If the collection is empty, automatically seeds it from DEFAULT_ATASAN_LIST so data is never purely in memory.
 */
export async function ensureAtasanInFirestore(): Promise<AtasanUser[]> {
  try {
    const snap = await getDocs(collection(db, 'atasan_users'));
    if (snap.empty) {
      const batch = writeBatch(db);
      for (const item of DEFAULT_ATASAN_LIST) {
        const ref = doc(db, 'atasan_users', item.nip);
        batch.set(ref, {
          nip: item.nip,
          nama: item.nama,
          jabatan: item.jabatan,
          unit_kerja: item.unit_kerja,
          pin: item.pin || '123456',
          updated_at: new Date().toISOString()
        });
      }
      await batch.commit();
      return DEFAULT_ATASAN_LIST;
    } else {
      const list: AtasanUser[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          nip: d.id,
          nama: data.nama || '',
          jabatan: data.jabatan || '',
          unit_kerja: data.unit_kerja || '',
          pin: data.pin || '123456'
        };
      });
      return list;
    }
  } catch (err) {
    console.warn('Error syncing atasan to firestore:', err);
    return DEFAULT_ATASAN_LIST;
  }
}

