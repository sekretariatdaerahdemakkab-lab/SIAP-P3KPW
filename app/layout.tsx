import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'SIAP PPPK Paruh Waktu Setda Demak',
  description: 'Sistem Informasi Presensi dan Pengaturan Jam Kerja PPPK Paruh Waktu Sekretariat Daerah Kabupaten Demak',
  openGraph: {
    title: 'SIAP PPPK Paruh Waktu Setda Demak',
    description: 'Sistem Informasi Presensi dan Pengaturan Jam Kerja PPPK Paruh Waktu Sekretariat Daerah Kabupaten Demak',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SIAP PPPK Paruh Waktu Setda Demak',
    description: 'Sistem Informasi Presensi dan Pengaturan Jam Kerja PPPK Paruh Waktu Sekretariat Daerah Kabupaten Demak',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
