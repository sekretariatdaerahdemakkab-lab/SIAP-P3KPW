'use client';

import { useState, useEffect } from 'react';
import * as xlsx from 'xlsx';
import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { handleFirestoreError, OperationType } from '@/lib/firestore-error';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import {
  Plus,
  Trash2,
  Edit2,
  X,
  Upload,
  Download,
  FileSpreadsheet,
  FileDown,
  CheckCircle2,
  AlertCircle,
  Eye,
  RefreshCw,
  Search,
  Users
} from 'lucide-react';

interface Employee {
  id: string; // NIP
  nama: string;
  jabatan: string;
  unit_kerja: string;
}

interface ParsedEmployeeRow {
  nip: string;
  nama: string;
  jabatan: string;
  unit_kerja: string;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Manual Form Modal/State
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ nip: '', nama: '', jabatan: '', unit_kerja: '' });
  const [isEdit, setIsEdit] = useState(false);

  // Excel Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedImportRows, setParsedImportRows] = useState<ParsedEmployeeRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Delete Confirmation Modal State
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadEmployeesData = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'employees'));
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
      data.sort((a, b) => a.nama.localeCompare(b.nama));
      setEmployees(data);
    } catch (error: any) {
      console.error('Error fetching employees:', error);
      if (error.code === 'permission-denied') {
        handleFirestoreError(error, OperationType.LIST, 'employees');
      } else if (error.code === 'unavailable') {
        alert('Tidak dapat terhubung ke database. Periksa koneksi internet Anda atau coba lagi nanti.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = () => {
    setLoading(true);
    loadEmployeesData();
  };

  useEffect(() => {
    let isMounted = true;
    getDocs(collection(db, 'employees'))
      .then(snapshot => {
        if (!isMounted) return;
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
        data.sort((a, b) => a.nama.localeCompare(b.nama));
        setEmployees(data);
        setLoading(false);
      })
      .catch(error => {
        if (!isMounted) return;
        console.error('Error fetching employees:', error);
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, 'employees', formData.nip.trim()), {
        nama: formData.nama.trim(),
        jabatan: formData.jabatan.trim(),
        unit_kerja: formData.unit_kerja.trim()
      });
      setShowForm(false);
      fetchEmployees();
    } catch (error: any) {
      console.error('Error saving employee:', error);
      if (error.code === 'permission-denied') {
        handleFirestoreError(error, OperationType.WRITE, `employees/${formData.nip}`);
      } else {
        alert('Gagal menyimpan data pegawai.');
      }
    }
  };

  const openDeleteModal = (emp: Employee) => {
    setDeleteTarget(emp);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const docId = deleteTarget.id;
      await deleteDoc(doc(db, 'employees', docId));
      setEmployees(prev => prev.filter(e => e.id !== docId));
      setDeleteTarget(null);
      fetchEmployees();
    } catch (error: any) {
      console.error('Error deleting employee:', error);
      if (error.code === 'permission-denied') {
        handleFirestoreError(error, OperationType.DELETE, `employees/${deleteTarget.id}`);
      } else {
        alert('Gagal menghapus data pegawai: ' + (error.message || ''));
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const openEdit = (emp: Employee) => {
    setFormData({ nip: emp.id, nama: emp.nama, jabatan: emp.jabatan, unit_kerja: emp.unit_kerja });
    setIsEdit(true);
    setShowForm(true);
  };

  const openAdd = () => {
    setFormData({ nip: '', nama: '', jabatan: '', unit_kerja: '' });
    setIsEdit(false);
    setShowForm(true);
  };

  // 1. Download Template Excel Pegawai
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        NIP: '199208152024211002',
        Nama: 'Ahmad Subardjo, S.Kom.',
        Jabatan: 'Pranata Komputer',
        Unit_Kerja: 'Bagian Umum'
      },
      {
        NIP: '199503122024212001',
        Nama: 'Siti Nurhaliza, S.E.',
        Jabatan: 'Pengadministrasi Perkantoran',
        Unit_Kerja: 'Bagian Hukum'
      },
      {
        NIP: '199004052024211003',
        Nama: 'Budi Santoso, A.Md.',
        Jabatan: 'Teknisi Sarana Prasarana',
        Unit_Kerja: 'Bagian Organisasi'
      }
    ];

    const worksheet = xlsx.utils.json_to_sheet(templateData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Master_Pegawai');

    worksheet['!cols'] = [
      { wch: 24 }, // NIP
      { wch: 32 }, // Nama
      { wch: 28 }, // Jabatan
      { wch: 24 }  // Unit_Kerja
    ];

    xlsx.writeFile(workbook, 'Template_Data_Pegawai_PPPK.xlsx');
  };

  // 2. Export Current Employees to Excel
  const handleExportEmployees = () => {
    if (employees.length === 0) {
      alert('Belum ada data pegawai untuk diekspor.');
      return;
    }

    const rows = employees.map(emp => ({
      NIP: emp.id,
      Nama: emp.nama,
      Jabatan: emp.jabatan,
      Unit_Kerja: emp.unit_kerja
    }));

    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Data_Pegawai');

    worksheet['!cols'] = [
      { wch: 24 },
      { wch: 32 },
      { wch: 28 },
      { wch: 24 }
    ];

    xlsx.writeFile(workbook, `Data_Pegawai_PPPK_Demak_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // 3. Handle File Selection for Pegawai Import
  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setImportFile(selectedFile);
      setImportMessage(null);
      setParsedImportRows([]);

      try {
        const buffer = await selectedFile.arrayBuffer();
        const workbook = xlsx.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[] = xlsx.utils.sheet_to_json(worksheet, { defval: '' });

        if (rawJson.length === 0) {
          setImportMessage({ type: 'error', text: 'File Excel kosong atau tidak memiliki baris data.' });
          return;
        }

        const parsed: ParsedEmployeeRow[] = [];
        for (const row of rawJson) {
          const keys = Object.keys(row);
          const getKey = (pattern: RegExp) => {
            const found = keys.find(k => pattern.test(k.trim().toLowerCase()));
            return found ? row[found] : '';
          };

          const rawNip = getKey(/^nip$|^nomor.*induk/);
          const rawNama = getKey(/^nama$|^nama.*lengkap$|^pegawai$/);
          const rawJabatan = getKey(/^jabatan$|^posisi$/);
          const rawUnit = getKey(/^unit.*kerja$|^unit$|^bagian$|^opd$/);

          if (!rawNip || !rawNama) continue;

          parsed.push({
            nip: String(rawNip).trim(),
            nama: String(rawNama).trim(),
            jabatan: String(rawJabatan || '-').trim(),
            unit_kerja: String(rawUnit || '-').trim()
          });
        }

        if (parsed.length === 0) {
          setImportMessage({
            type: 'error',
            text: 'Tidak ada baris data valid. Pastikan terdapat kolom NIP dan Nama.'
          });
        } else {
          setParsedImportRows(parsed);
        }
      } catch (err: any) {
        console.error('Error parsing employee excel:', err);
        setImportMessage({ type: 'error', text: 'Gagal membaca file: ' + err.message });
      }
    }
  };

  // 4. Save Parsed Employees to Firestore
  const handleProcessImport = async () => {
    if (parsedImportRows.length === 0) {
      setImportMessage({ type: 'error', text: 'Belum ada data pegawai yang valid untuk diimpor.' });
      return;
    }

    setImporting(true);
    setImportMessage(null);

    try {
      const CHUNK_SIZE = 400;
      let count = 0;

      for (let i = 0; i < parsedImportRows.length; i += CHUNK_SIZE) {
        const chunk = parsedImportRows.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        for (const emp of chunk) {
          const docRef = doc(db, 'employees', emp.nip);
          batch.set(docRef, {
            nama: emp.nama,
            jabatan: emp.jabatan,
            unit_kerja: emp.unit_kerja,
            updated_at: new Date().toISOString()
          });
        }

        await batch.commit();
        count += chunk.length;
      }

      setImportMessage({
        type: 'success',
        text: `Berhasil mengimpor ${count} data pegawai ke dalam sistem.`
      });
      setImportFile(null);
      setParsedImportRows([]);
      fetchEmployees();
    } catch (err: any) {
      console.error('Error saving employees batch:', err);
      if (err.code === 'permission-denied') {
        handleFirestoreError(err, OperationType.WRITE, 'employees');
      } else {
        setImportMessage({ type: 'error', text: 'Gagal menyimpan ke database: ' + err.message });
      }
    } finally {
      setImporting(false);
    }
  };

  const filteredEmployees = employees.filter(emp =>
    emp.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.id.includes(searchQuery) ||
    emp.jabatan.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.unit_kerja.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header & Main Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Data Pegawai PPPK Paruh Waktu
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Kelola master data pegawai di lingkungan Sekretariat Daerah Kabupaten Demak
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleDownloadTemplate}
            className="px-3.5 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Unduh format template Excel untuk data pegawai"
          >
            <Download className="w-4 h-4" />
            Unduh Template Excel
          </button>

          <button
            onClick={() => {
              setShowImportModal(!showImportModal);
              setImportMessage(null);
            }}
            className="px-3.5 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Upload className="w-4 h-4" />
            {showImportModal ? 'Tutup Form Import' : 'Import Excel Pegawai'}
          </button>

          <button
            onClick={handleExportEmployees}
            className="px-3.5 py-2 bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Ekspor seluruh data pegawai ke Excel"
          >
            <FileDown className="w-4 h-4" />
            Export Data (.xlsx)
          </button>

          <button
            onClick={openAdd}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold transition-colors shadow-sm shadow-blue-200"
          >
            <Plus className="w-4 h-4" /> Tambah Manual
          </button>
        </div>
      </div>

      {/* Import Pegawai Panel (Collapsible/Modal-style) */}
      {showImportModal && (
        <div className="bg-white p-6 rounded-xl border border-blue-200 shadow-sm animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-slate-800 text-base">Import Data Pegawai dari Excel</h3>
            </div>
            <button
              onClick={() => setShowImportModal(false)}
              className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5">
              <div className="border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-xl p-6 text-center bg-slate-50 hover:bg-blue-50/40 transition-colors">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleImportFileChange}
                  className="hidden"
                  id="excel-employee-upload"
                />
                <label
                  htmlFor="excel-employee-upload"
                  className="cursor-pointer flex flex-col items-center justify-center gap-2"
                >
                  <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">Pilih File Excel Pegawai</p>
                    <p className="text-xs text-slate-500 mt-0.5">Mendukung .xlsx, .xls, .csv</p>
                  </div>
                </label>
              </div>

              {importFile && (
                <div className="mt-3 p-2.5 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between text-xs font-medium text-blue-800">
                  <span className="truncate max-w-[200px]">{importFile.name}</span>
                  <span className="bg-blue-200 text-blue-900 px-2 py-0.5 rounded font-mono">
                    {parsedImportRows.length} baris
                  </span>
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={handleProcessImport}
                  disabled={parsedImportRows.length === 0 || importing}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm shadow-blue-200"
                >
                  {importing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Menyimpan ke Database...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Simpan {parsedImportRows.length > 0 ? `(${parsedImportRows.length} Pegawai)` : ''}
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="lg:col-span-7">
              {parsedImportRows.length > 0 ? (
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      Pratinjau {parsedImportRows.length} Pegawai (5 Baris Pertama)
                    </span>
                  </div>
                  <div className="overflow-x-auto max-h-56">
                    <table className="w-full text-xs text-left text-slate-600 bg-white border border-slate-200">
                      <thead className="bg-slate-100 text-slate-700 font-semibold text-[10px] uppercase">
                        <tr>
                          <th className="px-3 py-1.5">NIP</th>
                          <th className="px-3 py-1.5">Nama</th>
                          <th className="px-3 py-1.5">Jabatan</th>
                          <th className="px-3 py-1.5">Unit Kerja</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedImportRows.slice(0, 5).map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-1.5 font-mono text-slate-800">{r.nip}</td>
                            <td className="px-3 py-1.5 font-medium text-slate-900 uppercase">{r.nama}</td>
                            <td className="px-3 py-1.5">{r.jabatan}</td>
                            <td className="px-3 py-1.5">{r.unit_kerja}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs text-slate-600">
                  <p className="font-semibold text-slate-800 mb-1">Panduan Kolom Excel Pegawai:</p>
                  <ul className="list-disc pl-4 space-y-1 mt-2">
                    <li><strong className="text-slate-800">NIP</strong>: 18 digit Nomor Induk Pegawai (wajib)</li>
                    <li><strong className="text-slate-800">Nama</strong>: Nama lengkap beserta gelar (wajib)</li>
                    <li><strong className="text-slate-800">Jabatan</strong>: Nama jabatan formasi PPPK (mis. Pranata Komputer)</li>
                    <li><strong className="text-slate-800">Unit_Kerja</strong>: Bagian/OPD penugasan (mis. Bagian Umum)</li>
                  </ul>
                  <p className="mt-3 text-slate-500 text-[11px]">
                    Tip: Gunakan tombol <strong>&quot;Unduh Template Excel&quot;</strong> di pojok kanan atas untuk mendapatkan contoh berkas siap isi.
                  </p>
                </div>
              )}

              {importMessage && (
                <div
                  className={`mt-3 p-3 rounded-lg flex items-start gap-2 text-xs font-medium ${
                    importMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {importMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>{importMessage.text}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual Add / Edit Form */}
      {showForm && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative animate-in fade-in slide-in-from-top-4 duration-200">
          <button
            onClick={() => setShowForm(false)}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-1.5 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-semibold text-slate-800 mb-5">
            {isEdit ? 'Edit Data Pegawai' : 'Tambah Pegawai Baru'}
          </h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
                Nomor Induk Pegawai (NIP)
              </label>
              <input
                type="text"
                required
                value={formData.nip}
                onChange={e => setFormData({ ...formData, nip: e.target.value })}
                disabled={isEdit}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Mis. 199208152024211002"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
                Nama Lengkap
              </label>
              <input
                type="text"
                required
                value={formData.nama}
                onChange={e => setFormData({ ...formData, nama: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Mis. Ahmad Subardjo, S.Kom."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
                Jabatan
              </label>
              <input
                type="text"
                required
                value={formData.jabatan}
                onChange={e => setFormData({ ...formData, jabatan: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Mis. Pranata Komputer"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
                Unit Kerja / Bagian
              </label>
              <input
                type="text"
                required
                value={formData.unit_kerja}
                onChange={e => setFormData({ ...formData, unit_kerja: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Mis. Bagian Umum"
              />
            </div>
            <div className="md:col-span-2 mt-2 flex gap-3">
              <button
                type="submit"
                className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                {isEdit ? 'Simpan Perubahan' : 'Simpan Pegawai'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                Batal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari berdasarkan NIP, Nama, Jabatan, atau Bagian..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Total: <strong className="text-slate-800">{filteredEmployees.length}</strong> pegawai
          {searchQuery && ` (difilter dari ${employees.length})`}
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 font-medium flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
            Memuat data pegawai...
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            {searchQuery
              ? 'Tidak ada pegawai yang cocok dengan kata kunci pencarian.'
              : 'Belum ada data pegawai. Silakan tambah data baru atau import dari file Excel.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    NIP
                  </th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Nama Lengkap
                  </th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Jabatan & Unit Kerja
                  </th>
                  <th className="px-6 py-3.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredEmployees.map(emp => (
                  <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium text-slate-600">{emp.id}</td>
                    <td className="px-6 py-4 font-semibold text-slate-900 uppercase">{emp.nama}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">{emp.jabatan}</div>
                      <div className="text-slate-500 text-[11px] mt-0.5">{emp.unit_kerja}</div>
                    </td>
                    <td className="px-6 py-4 flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => openEdit(emp)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-md transition-all"
                        title="Edit Pegawai"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openDeleteModal(emp)}
                        className="p-1.5 text-slate-400 hover:text-red-600 bg-slate-50 hover:bg-red-50 border border-slate-200 rounded-md transition-all cursor-pointer"
                        title="Hapus Pegawai"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Konfirmasi Hapus Pegawai */}
      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => {
          if (!deleteLoading) setDeleteTarget(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Hapus Data Pegawai"
        message="Apakah Anda yakin ingin menghapus data pegawai berikut dari sistem? Data yang telah dihapus tidak dapat dipulihkan kembali."
        itemName={deleteTarget?.nama}
        itemDetail={deleteTarget ? `NIP: ${deleteTarget.id} • Jabatan: ${deleteTarget.jabatan || '-'} (${deleteTarget.unit_kerja || '-'})` : undefined}
        confirmText="Ya, Hapus Pegawai"
        loading={deleteLoading}
      />
    </div>
  );
}
