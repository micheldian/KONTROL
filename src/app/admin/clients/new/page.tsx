import { requireAdmin } from '@/lib/session';
import ClientForm from '../client-form';

export const dynamic = 'force-dynamic';

export default async function NewClientPage() {
  await requireAdmin();
  return <ClientForm />;
}
