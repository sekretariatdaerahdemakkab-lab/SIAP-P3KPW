import PermitApprovalPortal from '@/components/PermitApprovalPortal';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Persetujuan Izin & Dinas Luar (Atasan & Admin) | SIAP PPPK Setda Demak',
  description: 'Halaman persetujuan dan pengesahan permohonan izin sakit, dinas luar, dan cuti pegawai PPPK Paruh Waktu khusus Atasan dan Admin'
};

export default function PersetujuanIzinPage() {
  return <PermitApprovalPortal />;
}
