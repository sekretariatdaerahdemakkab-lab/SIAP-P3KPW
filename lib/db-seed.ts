import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import { handleFirestoreError, OperationType } from './firestore-error';
import { ensureAtasanInFirestore } from './permits';

export const SAMPLE_EMPLOYEE_NIP = '199001012025211001';
export const SAMPLE_PERMIT_DOC_ID = 'sample_permit_template';

export interface CollectionFieldSpec {
  field: string;
  type: string;
  required: boolean;
  description: string;
}

export interface CollectionSchemaSpec {
  id: string;
  title: string;
  category: 'inti' | 'transaksi';
  docIdPattern: string;
  description: string;
  fields: CollectionFieldSpec[];
}

export const DEFAULT_WORK_SCHEDULES = [
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

export const DEFAULT_HOLIDAYS_2025 = [
  { tanggal: '2025-01-01', nama: 'Tahun Baru 2025 Masehi', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-01-27', nama: 'Isra Mikraj Nabi Muhammad SAW', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-01-28', nama: 'Cuti Bersama Tahun Baru Imlek 2576', jenis: 'cuti_bersama', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-01-29', nama: 'Tahun Baru Imlek 2576 Kongzili', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-03-28', nama: 'Hari Jadi Kabupaten Demak ke-522', jenis: 'libur_nasional', keterangan: 'Hari Libur Daerah Kabupaten Demak' },
  { tanggal: '2025-03-29', nama: 'Hari Suci Nyepi (Tahun Baru Saka 1947)', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-03-31', nama: 'Idul Fitri 1446 H (Hari Pertama)', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-04-01', nama: 'Idul Fitri 1446 H (Hari Kedua)', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-04-02', nama: 'Cuti Bersama Idul Fitri 1446 H', jenis: 'cuti_bersama', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-04-03', nama: 'Cuti Bersama Idul Fitri 1446 H', jenis: 'cuti_bersama', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-04-04', nama: 'Cuti Bersama Idul Fitri 1446 H', jenis: 'cuti_bersama', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-04-07', nama: 'Cuti Bersama Idul Fitri 1446 H', jenis: 'cuti_bersama', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-04-18', nama: 'Wafat Yesus Kristus', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-04-20', nama: 'Kebangkitan Yesus Kristus (Paskah)', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-05-01', nama: 'Hari Buruh Internasional', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-05-12', nama: 'Hari Raya Waisak 2569 BE', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-05-13', nama: 'Cuti Bersama Hari Raya Waisak', jenis: 'cuti_bersama', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-05-29', nama: 'Kenaikan Yesus Kristus', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-05-30', nama: 'Cuti Bersama Kenaikan Yesus Kristus', jenis: 'cuti_bersama', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-06-01', nama: 'Hari Lahir Pancasila', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-06-06', nama: 'Hari Raya Idul Adha 1446 H', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-06-09', nama: 'Cuti Bersama Idul Adha 1446 H', jenis: 'cuti_bersama', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-06-27', nama: '1 Muharam Tahun Baru Islam 1447 H', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-08-17', nama: 'Proklamasi Kemerdekaan RI ke-80', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-09-05', nama: 'Maulid Nabi Muhammad SAW', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-12-25', nama: 'Kelahiran Yesus Kristus (Natal)', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2025-12-26', nama: 'Cuti Bersama Hari Raya Natal', jenis: 'cuti_bersama', keterangan: 'SKB 3 Menteri' }
] as const;

export const DEFAULT_HOLIDAYS_2026 = [
  { tanggal: '2026-01-01', nama: 'Tahun Baru 2026 Masehi', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2026-01-16', nama: 'Isra Mikraj Nabi Muhammad SAW 1447 H', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2026-02-17', nama: 'Tahun Baru Imlek 2577 Kongzili', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2026-03-19', nama: 'Hari Suci Nyepi (Tahun Baru Saka 1948)', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2026-03-20', nama: 'Idul Fitri 1447 H (Hari Pertama)', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2026-03-21', nama: 'Idul Fitri 1447 H (Hari Kedua)', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2026-03-23', nama: 'Cuti Bersama Idul Fitri 1447 H', jenis: 'cuti_bersama', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2026-03-24', nama: 'Cuti Bersama Idul Fitri 1447 H', jenis: 'cuti_bersama', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2026-03-28', nama: 'Hari Jadi Kabupaten Demak ke-523', jenis: 'libur_nasional', keterangan: 'Hari Libur Daerah Kabupaten Demak' },
  { tanggal: '2026-04-03', nama: 'Wafat Yesus Kristus', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2026-05-01', nama: 'Hari Buruh Internasional', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2026-05-14', nama: 'Kenaikan Yesus Kristus', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2026-05-27', nama: 'Hari Raya Idul Adha 1447 H', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2026-05-31', nama: 'Hari Raya Waisak 2570 BE', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2026-06-01', nama: 'Hari Lahir Pancasila', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2026-06-16', nama: 'Tahun Baru Islam 1448 H', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2026-08-17', nama: 'Proklamasi Kemerdekaan RI ke-81', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2026-08-25', nama: 'Maulid Nabi Muhammad SAW', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2026-12-25', nama: 'Kelahiran Yesus Kristus (Natal)', jenis: 'libur_nasional', keterangan: 'SKB 3 Menteri' },
  { tanggal: '2026-12-26', nama: 'Cuti Bersama Hari Raya Natal', jenis: 'cuti_bersama', keterangan: 'SKB 3 Menteri' }
] as const;

export const FIRESTORE_COLLECTIONS_SCHEMA: CollectionSchemaSpec[] = [
  {
    id: 'admins',
    title: 'Akun Administrator',
    category: 'inti',
    docIdPattern: '{uid} (Firebase Auth UID)',
    description: 'Metadata akun admin yang memiliki hak akses penuh pengelolaan aplikasi.',
    fields: [
      { field: 'email', type: 'string', required: true, description: 'Email administrator terdaftar' },
      { field: 'role', type: 'string', required: true, description: "Peran akses (nilai standar: 'admin')" },
      { field: 'created_at', type: 'string (ISO)', required: false, description: 'Waktu registrasi akun' }
    ]
  },
  {
    id: 'settings',
    title: 'Pengaturan Jam Kerja',
    category: 'inti',
    docIdPattern: 'work_hours',
    description: 'Menyimpan profil jam kerja aktif (Reguler, Ramadhan, Khusus) serta toleransi keterlambatan.',
    fields: [
      { field: 'active_id', type: 'string', required: true, description: 'ID jadwal kerja yang sedang aktif' },
      { field: 'jam_masuk', type: 'string (HH:mm)', required: true, description: 'Jam masuk standar' },
      { field: 'jam_pulang', type: 'string (HH:mm)', required: true, description: 'Jam pulang Senin - Kamis' },
      { field: 'jam_pulang_jumat', type: 'string (HH:mm)', required: true, description: 'Jam pulang khusus hari Jumat' },
      { field: 'toleransi_menit', type: 'number', required: true, description: 'Toleransi keterlambatan (menit)' },
      { field: 'schedules', type: 'array<object>', required: true, description: 'Daftar profil jadwal kerja tersimpan' },
      { field: 'updated_at', type: 'string (ISO)', required: false, description: 'Waktu pembaruan terakhir' }
    ]
  },
  {
    id: 'atasan_users',
    title: 'Pejabat & Atasan Langsung',
    category: 'inti',
    docIdPattern: '{nip}',
    description: 'Master data 9 Kepala Bagian / Pejabat Penyetuju Izin beserta PIN autentikasi 6 digit.',
    fields: [
      { field: 'nip', type: 'string', required: true, description: 'NIP Pejabat / Atasan Langsung' },
      { field: 'nama', type: 'string', required: true, description: 'Nama pejabat atau jabatan pimpinan' },
      { field: 'jabatan', type: 'string', required: true, description: 'Jabatan struktural' },
      { field: 'unit_kerja', type: 'string', required: true, description: 'Bagian / Unit Kerja yang dipimpin' },
      { field: 'pin', type: 'string', required: true, description: 'PIN 6 digit untuk login persetujuan izin' },
      { field: 'updated_at', type: 'string (ISO)', required: false, description: 'Waktu pembaruan terakhir' }
    ]
  },
  {
    id: 'holidays',
    title: 'Hari Libur Nasional & Cuti Bersama',
    category: 'inti',
    docIdPattern: '{tanggal} (YYYY-MM-DD)',
    description: 'Kalender hari libur nasional SKB 3 Menteri, hari jadi daerah, dan cuti bersama.',
    fields: [
      { field: 'tanggal', type: 'string (YYYY-MM-DD)', required: true, description: 'Tanggal hari libur' },
      { field: 'nama', type: 'string', required: true, description: 'Nama hari libur atau cuti bersama' },
      { field: 'jenis', type: 'enum', required: true, description: "'libur_nasional' atau 'cuti_bersama'" },
      { field: 'keterangan', type: 'string', required: false, description: 'Dasar surat keputusan / catatan' },
      { field: 'updated_at', type: 'string (ISO)', required: false, description: 'Waktu pembaruan terakhir' }
    ]
  },
  {
    id: 'employees',
    title: 'Master Data Pegawai PPPK',
    category: 'transaksi',
    docIdPattern: '{nip}',
    description: 'Daftar induk seluruh pegawai PPPK Paruh Waktu Setda Kabupaten Demak.',
    fields: [
      { field: 'nip', type: 'string', required: true, description: 'NIP Pegawai (18 digit)' },
      { field: 'nama', type: 'string', required: true, description: 'Nama lengkap beserta gelar' },
      { field: 'jabatan', type: 'string', required: true, description: 'Jabatan pegawai' },
      { field: 'unit_kerja', type: 'string', required: true, description: 'Unit Kerja / Bagian di Setda Demak' }
    ]
  },
  {
    id: 'employee_auth',
    title: 'Kredensial PIN Pegawai',
    category: 'transaksi',
    docIdPattern: '{nip}',
    description: 'Menyimpan PIN pribadi pegawai untuk masuk ke portal pengajuan izin (akses list dikunci demi privasi PIN).',
    fields: [
      { field: 'nip', type: 'string', required: true, description: 'NIP Pegawai' },
      { field: 'pin', type: 'string', required: true, description: 'PIN akses 6 digit pegawai' },
      { field: 'updated_at', type: 'string (ISO)', required: false, description: 'Waktu ubah PIN terakhir' }
    ]
  },
  {
    id: 'attendances',
    title: 'Log Kehadiran Fingerprint',
    category: 'transaksi',
    docIdPattern: '{nip}_{tanggal}',
    description: 'Catatan absensi harian hasil import file Excel mesin fingerprint.',
    fields: [
      { field: 'nip', type: 'string', required: true, description: 'NIP Pegawai' },
      { field: 'tanggal', type: 'string (YYYY-MM-DD)', required: true, description: 'Tanggal absensi' },
      { field: 'waktu_masuk', type: 'string (HH:mm)', required: false, description: 'Jam tap masuk' },
      { field: 'waktu_keluar', type: 'string (HH:mm)', required: false, description: 'Jam tap pulang' },
      { field: 'status', type: 'string', required: false, description: 'Status kehadiran (Hadir, Terlambat, dll.)' },
      { field: 'total_jam', type: 'number', required: false, description: 'Total jam kerja efektif harian' },
      { field: 'updated_at', type: 'string (ISO)', required: false, description: 'Waktu import atau pembaruan' }
    ]
  },
  {
    id: 'permits',
    title: 'Pengajuan Izin, DL, Cuti & WFH',
    category: 'transaksi',
    docIdPattern: '{autoId}',
    description: 'Dokumen permohonan izin pegawai (Dinas Luar, Sakit, Cuti, WFH) beserta bukti dukung dan riwayat persetujuan.',
    fields: [
      { field: 'nip', type: 'string', required: true, description: 'NIP Pengaju' },
      { field: 'nama', type: 'string', required: true, description: 'Nama Pengaju' },
      { field: 'unit_kerja', type: 'string', required: false, description: 'Bagian pengaju' },
      { field: 'jenis', type: 'enum', required: true, description: "'dinas_luar' | 'sakit' | 'izin' | 'cuti' | 'wfh'" },
      { field: 'tanggal_mulai', type: 'string (YYYY-MM-DD)', required: true, description: 'Tanggal awal izin' },
      { field: 'tanggal_selesai', type: 'string (YYYY-MM-DD)', required: true, description: 'Tanggal akhir izin' },
      { field: 'jumlah_hari', type: 'number', required: true, description: 'Jumlah hari pengajuan' },
      { field: 'keterangan', type: 'string', required: true, description: 'Alasan atau tujuan kegiatan' },
      { field: 'nomor_surat', type: 'string', required: false, description: 'Nomor SPT / SKD / Surat WFH' },
      { field: 'lampiran_url', type: 'string', required: false, description: 'Data URI gambar/PDF maks 200 KB' },
      { field: 'lampiran_nama', type: 'string', required: false, description: 'Nama berkas lampiran' },
      { field: 'is_susulan', type: 'boolean', required: true, description: 'Penanda izin susulan' },
      { field: 'selisih_hari_susulan', type: 'number', required: false, description: 'Selisih hari keterlambatan pengajuan' },
      { field: 'status', type: 'enum', required: true, description: "'pending' | 'approved' | 'rejected'" },
      { field: 'catatan_admin', type: 'string', required: false, description: 'Catatan verifikator' },
      { field: 'approved_by', type: 'string', required: false, description: 'Nama/email penyetuju' },
      { field: 'approved_by_role', type: 'enum', required: false, description: "'admin' | 'atasan'" },
      { field: 'approved_by_nip', type: 'string', required: false, description: 'NIP atasan penyetuju' },
      { field: 'approved_by_jabatan', type: 'string', required: false, description: 'Jabatan atasan penyetuju' },
      { field: 'approved_at', type: 'string (ISO)', required: false, description: 'Waktu persetujuan' },
      { field: 'created_at', type: 'string (ISO)', required: true, description: 'Waktu pengajuan dibuat' }
    ]
  }
];

export interface CollectionStatusItem {
  id: string;
  count: number | null;
  status: 'ready' | 'empty' | 'restricted_ok' | 'error';
  note?: string;
}

export interface CoreSeedResult {
  adminsCreated: boolean;
  settingsCreated: boolean;
  atasanCount: number;
  holidaysCreated: number;
}

export interface SampleSeedResult {
  employeesCreated: boolean;
  employeeAuthCreated: boolean;
  attendancesCreated: boolean;
  permitsCreated: boolean;
}

/**
 * Restores core configuration collections (admins, settings, atasan_users, holidays)
 * without overwriting existing records.
 */
export async function seedCoreCollections(adminUid: string, adminEmail: string): Promise<CoreSeedResult> {
  const result: CoreSeedResult = {
    adminsCreated: false,
    settingsCreated: false,
    atasanCount: 0,
    holidaysCreated: 0
  };

  // 1. admins/{uid}
  try {
    const adminRef = doc(db, 'admins', adminUid);
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists()) {
      await setDoc(
        adminRef,
        {
          email: adminEmail,
          role: 'admin',
          created_at: new Date().toISOString()
        },
        { merge: true }
      );
      result.adminsCreated = true;
    }
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.WRITE, `admins/${adminUid}`);
    }
    throw err;
  }

  // 2. settings/work_hours
  try {
    const settingsRef = doc(db, 'settings', 'work_hours');
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
      const active = DEFAULT_WORK_SCHEDULES[0];
      await setDoc(settingsRef, {
        active_id: active.id,
        jam_masuk: active.jam_masuk,
        jam_pulang: active.jam_pulang,
        jam_pulang_jumat: active.jam_pulang_jumat,
        toleransi_menit: active.toleransi_menit,
        schedules: DEFAULT_WORK_SCHEDULES,
        updated_at: new Date().toISOString()
      });
      result.settingsCreated = true;
    }
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.WRITE, 'settings/work_hours');
    }
    throw err;
  }

  // 3. atasan_users
  const atasanList = await ensureAtasanInFirestore();
  result.atasanCount = atasanList.length;

  // 4. holidays (only if collection is completely empty)
  try {
    const existingHolidays = await getDocs(query(collection(db, 'holidays'), limit(1)));
    if (existingHolidays.empty) {
      const allHolidays = [...DEFAULT_HOLIDAYS_2025, ...DEFAULT_HOLIDAYS_2026];
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      for (const h of allHolidays) {
        const ref = doc(db, 'holidays', h.tanggal);
        batch.set(ref, {
          tanggal: h.tanggal,
          nama: h.nama,
          jenis: h.jenis,
          keterangan: h.keterangan,
          updated_at: now
        });
      }
      await batch.commit();
      result.holidaysCreated = allHolidays.length;
    }
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.WRITE, 'holidays');
    }
    throw err;
  }

  return result;
}

/**
 * Creates 1 non-destructive template document in any empty transactional collection
 * (employees, employee_auth, attendances, permits) so all 8 collection structures
 * are immediately visible in Firebase Console.
 */
export async function seedSampleTransactionalCollections(): Promise<SampleSeedResult> {
  const result: SampleSeedResult = {
    employeesCreated: false,
    employeeAuthCreated: false,
    attendancesCreated: false,
    permitsCreated: false
  };

  const now = new Date().toISOString();
  const todayISO = now.slice(0, 10);

  // 1. employees
  try {
    const empCheck = await getDocs(query(collection(db, 'employees'), limit(1)));
    if (empCheck.empty) {
      await setDoc(doc(db, 'employees', SAMPLE_EMPLOYEE_NIP), {
        nip: SAMPLE_EMPLOYEE_NIP,
        nama: 'Contoh Pegawai PPPK Setda',
        jabatan: 'Pengadministrasi Perkantoran',
        unit_kerja: 'Bagian Umum'
      });
      result.employeesCreated = true;
    }
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.WRITE, `employees/${SAMPLE_EMPLOYEE_NIP}`);
    }
    throw err;
  }

  // 2. employee_auth (check single doc via getDoc because list is intentionally disabled in rules)
  try {
    const authRef = doc(db, 'employee_auth', SAMPLE_EMPLOYEE_NIP);
    const authSnap = await getDoc(authRef);
    if (!authSnap.exists()) {
      await setDoc(authRef, {
        nip: SAMPLE_EMPLOYEE_NIP,
        pin: '251001',
        updated_at: now
      });
      result.employeeAuthCreated = true;
    }
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.WRITE, `employee_auth/${SAMPLE_EMPLOYEE_NIP}`);
    }
    throw err;
  }

  // 3. attendances
  try {
    const attCheck = await getDocs(query(collection(db, 'attendances'), limit(1)));
    if (attCheck.empty) {
      const attId = `${SAMPLE_EMPLOYEE_NIP}_${todayISO}`;
      await setDoc(doc(db, 'attendances', attId), {
        nip: SAMPLE_EMPLOYEE_NIP,
        tanggal: todayISO,
        waktu_masuk: '07:25',
        waktu_keluar: '16:05',
        status: 'Hadir',
        total_jam: 8.67,
        updated_at: now
      });
      result.attendancesCreated = true;
    }
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.WRITE, 'attendances');
    }
    throw err;
  }

  // 4. permits
  try {
    const permCheck = await getDocs(query(collection(db, 'permits'), limit(1)));
    if (permCheck.empty) {
      await setDoc(doc(db, 'permits', SAMPLE_PERMIT_DOC_ID), {
        nip: SAMPLE_EMPLOYEE_NIP,
        nama: 'Contoh Pegawai PPPK Setda',
        unit_kerja: 'Bagian Umum',
        jenis: 'wfh',
        tanggal_mulai: todayISO,
        tanggal_selesai: todayISO,
        jumlah_hari: 1,
        keterangan: 'Contoh dokumen struktur izin WFH (dapat dihapus setelah data riil diinput).',
        nomor_surat: '000/WFH-CONTOH/2026',
        lampiran_url: '',
        lampiran_nama: '',
        is_susulan: false,
        selisih_hari_susulan: 0,
        status: 'pending',
        catatan_admin: '',
        created_at: now
      });
      result.permitsCreated = true;
    }
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      handleFirestoreError(err, OperationType.WRITE, `permits/${SAMPLE_PERMIT_DOC_ID}`);
    }
    throw err;
  }

  return result;
}

/**
 * Deletes only the generated sample/template records without touching real data.
 */
export async function cleanupSampleTransactionalCollections(): Promise<number> {
  let deleted = 0;

  const empRef = doc(db, 'employees', SAMPLE_EMPLOYEE_NIP);
  const empSnap = await getDoc(empRef);
  if (empSnap.exists()) {
    await deleteDoc(empRef);
    deleted++;
  }

  const authRef = doc(db, 'employee_auth', SAMPLE_EMPLOYEE_NIP);
  const authSnap = await getDoc(authRef);
  if (authSnap.exists()) {
    await deleteDoc(authRef);
    deleted++;
  }

  const attSnap = await getDocs(
    query(collection(db, 'attendances'), where('nip', '==', SAMPLE_EMPLOYEE_NIP))
  );
  for (const d of attSnap.docs) {
    await deleteDoc(d.ref);
    deleted++;
  }

  const permRef = doc(db, 'permits', SAMPLE_PERMIT_DOC_ID);
  const permSnap = await getDoc(permRef);
  if (permSnap.exists()) {
    await deleteDoc(permRef);
    deleted++;
  }

  return deleted;
}

/**
 * Checks document presence across all 8 Firestore collections safely.
 */
export async function getDatabaseCollectionStats(): Promise<{
  stats: Record<string, CollectionStatusItem>;
  hasSampleDocs: boolean;
}> {
  const stats: Record<string, CollectionStatusItem> = {};
  let hasSampleDocs = false;

  const listableCollections = [
    'admins',
    'settings',
    'atasan_users',
    'holidays',
    'employees',
    'attendances',
    'permits'
  ];

  await Promise.all(
    listableCollections.map(async (colName) => {
      try {
        const snap = await getDocs(collection(db, colName));
        stats[colName] = {
          id: colName,
          count: snap.size,
          status: snap.size > 0 ? 'ready' : 'empty'
        };
      } catch (err: any) {
        stats[colName] = {
          id: colName,
          count: null,
          status: 'error',
          note: err?.message || 'Gagal membaca koleksi'
        };
      }
    })
  );

  // employee_auth disallows list queries in firestore.rules to protect PINs; check sample doc via getDoc
  try {
    const sampleAuth = await getDoc(doc(db, 'employee_auth', SAMPLE_EMPLOYEE_NIP));
    const sampleEmp = await getDoc(doc(db, 'employees', SAMPLE_EMPLOYEE_NIP));
    const samplePermit = await getDoc(doc(db, 'permits', SAMPLE_PERMIT_DOC_ID));
    hasSampleDocs = sampleAuth.exists() || sampleEmp.exists() || samplePermit.exists();

    stats['employee_auth'] = {
      id: 'employee_auth',
      count: sampleAuth.exists() ? 1 : null,
      status: sampleAuth.exists() ? 'ready' : 'restricted_ok',
      note: sampleAuth.exists()
        ? 'Dokumen contoh PIN aktif (list dikunci demi keamanan PIN)'
        : 'Koleksi aktif & dibuat otomatis saat pegawai login/ubah PIN (list dikunci demi keamanan)'
    };
  } catch (err: any) {
    stats['employee_auth'] = {
      id: 'employee_auth',
      count: null,
      status: 'error',
      note: err?.message || 'Gagal memeriksa employee_auth'
    };
  }

  return { stats, hasSampleDocs };
}
