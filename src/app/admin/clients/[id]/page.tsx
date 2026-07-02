import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import ClientForm from '../client-form';

export const dynamic = 'force-dynamic';

export default async function EditClientPage({
  params
}: {
  params: { id: string };
}) {
  const user = await requireAdmin();
  const client = await prisma.client.findFirst({
    where: { id: params.id, organisationId: user.organisationId }
  });
  if (!client) notFound();
  return <ClientForm client={client} />;
}
