import PermitApprovalPortal from '@/components/PermitApprovalPortal';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Approve Izin & Dinas Luar (Atasan & Admin) | SIAP PPPK Setda Demak',
  description: 'Halaman approve dan persetujuan izin pegawai PPPK Paruh Waktu khusus Atasan Langsung dan Administrator'
};

export default function ApproveIzinPage() {
  return <PermitApprovalPortal />;
}
