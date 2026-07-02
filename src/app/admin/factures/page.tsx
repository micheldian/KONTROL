import { requireAdmin } from '@/lib/session';
import Placeholder from '@/components/admin/Placeholder';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireAdmin();
  return <Placeholder titre="Facturation Pennylane" phase={10} />;
}
