import { requireAdmin } from '@/lib/session';
import LogementForm from '../logement-form';

export const dynamic = 'force-dynamic';

export default async function NewLogementPage() {
  await requireAdmin();
  return <LogementForm />;
}
