import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import OuvrierForm from '../ouvrier-form';

export const dynamic = 'force-dynamic';

export default async function NewOuvrierPage() {
  await requireAdmin();
  return (
    <div className="max-w-[760px]">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[21px] font-bold">Nouvel ouvrier</h1>
        <Link href="/admin/ouvriers" className="btn-sm btn-outline">
          ← Retour
        </Link>
      </div>
      <OuvrierForm />
    </div>
  );
}
