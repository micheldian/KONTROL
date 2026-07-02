'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireWorker } from '@/lib/session';
import { todayParis, dateFromYMD } from '@/lib/dates';

/** Demande d'acompte depuis le portail (montant + motif optionnel) → à traiter par l'admin. */
export async function demanderAcompte(montant: number, motif?: string) {
  const user = await requireWorker();
  const m = Math.round(Number(montant) * 100) / 100;
  if (!m || m <= 0 || m > 10000) throw new Error('Montant invalide');

  const dejaEnAttente = await prisma.acompte.findFirst({
    where: {
      organisationId: user.organisationId,
      userId: user.userId,
      statut: 'DEMANDE'
    }
  });
  if (dejaEnAttente) throw new Error('Une demande est déjà en attente');

  await prisma.acompte.create({
    data: {
      organisationId: user.organisationId,
      userId: user.userId,
      montant: m,
      date: dateFromYMD(todayParis()),
      note: motif?.trim() || null,
      statut: 'DEMANDE',
      demandeAt: new Date()
    }
  });
  revalidatePath('/app/argent');
}
