'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireWorker } from '@/lib/session';

/** Confirmation « J'y serai » d'une affectation par l'ouvrier connecté. */
export async function confirmerPresence(formData: FormData) {
  const user = await requireWorker();
  const affectationOuvrierId = formData.get('affectationOuvrierId') as string;

  const lien = await prisma.affectationOuvrier.findFirst({
    where: {
      id: affectationOuvrierId,
      userId: user.userId,
      affectation: { organisationId: user.organisationId, publieAt: { not: null } }
    }
  });
  if (!lien) throw new Error('Affectation introuvable');
  if (lien.confirme) return;

  await prisma.affectationOuvrier.update({
    where: { id: lien.id },
    data: { confirme: true, confirmeAt: new Date() }
  });
  revalidatePath('/app');
}
