import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { todayParis, addDays } from '@/lib/dates';
import CarteLoader from './carte-loader';

export const dynamic = 'force-dynamic';

export default async function CartePage() {
  const user = await requireAdmin();
  const clients = await prisma.client.findMany({
    where: { organisationId: user.organisationId },
    select: { id: true, nom: true, couleur: true },
    orderBy: { nom: 'asc' }
  });

  return (
    <div className="-mx-4 -my-6">
      <CarteLoader clients={clients} dateAffectation={addDays(todayParis(), 1)} />
    </div>
  );
}
