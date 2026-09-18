import { redirect } from 'next/navigation';

export default async function IzinPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const nip = params?.nip;
  if (nip && typeof nip === 'string') {
    redirect(`/portal-izin?nip=${encodeURIComponent(nip)}`);
  }
  redirect('/portal-izin');
}
