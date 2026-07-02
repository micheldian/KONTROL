import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import LogementForm from '../logement-form';

export const dynamic = 'force-dynamic';

export default async function EditLogementPage({
  params
}: {
  params: { id: string };
}) {
  const user = await requireAdmin();
  const logement = await prisma.logement.findFirst({
    where: { id: params.id, organisationId: user.organisationId }
  });
  if (!logement) notFound();
  return <LogementForm logement={logement} />;
}
