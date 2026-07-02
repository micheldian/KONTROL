import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import MissionForm from '../mission-form';

export const dynamic = 'force-dynamic';

export default async function NewMissionPage() {
  const user = await requireAdmin();
  const clients = await prisma.client.findMany({
    where: { organisationId: user.organisationId },
    orderBy: { nom: 'asc' }
  });
  return (
    <div className="max-w-[760px]">
      <h1 className="mb-5 text-[21px] font-bold">Nouvelle mission</h1>
      <MissionForm clients={clients} />
    </div>
  );
}
