'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireWorker } from '@/lib/session';
import { creerCreneaux, type SaisieCreneau } from '@/lib/heures';
import { todayParis, dateFromYMD } from '@/lib/dates';

/** Saisie des heures du jour par l'ouvrier connecté (cas standard : 1 tap). */
export async function envoyerMesHeures(creneaux: SaisieCreneau[]) {
  const user = await requireWorker();
  await creerCreneaux({
    organisationId: user.organisationId,
    ouvrierId: user.userId,
    date: todayParis(),
    saisiParId: user.userId,
    creneaux
  });
  revalidatePath('/app/heures');
}

/**
 * Saisie groupée par le chef d'équipe pour son équipe du jour (règle 7 :
 * uniquement les ouvriers de SES affectations du jour).
 */
export async function envoyerHeuresEquipe(
  affectationId: string,
  lignes: { userId: string; heureDebut: string; heureFin: string; pauseMinutes: number }[]
) {
  const user = await requireWorker();
  const today = todayParis();

  const affectation = await prisma.affectation.findFirst({
    where: {
      id: affectationId,
      organisationId: user.organisationId,
      date: dateFromYMD(today),
      chefEquipeId: user.userId
    },
    include: { ouvriers: true }
  });
  if (!affectation) throw new Error('Vous n’êtes pas chef de cette équipe aujourd’hui');

  const membres = new Set(affectation.ouvriers.map((o) => o.userId));
  for (const ligne of lignes) {
    if (!membres.has(ligne.userId)) throw new Error('Ouvrier hors équipe');
    await creerCreneaux({
      organisationId: user.organisationId,
      ouvrierId: ligne.userId,
      date: today,
      saisiParId: user.userId,
      creneaux: [
        {
          affectationId,
          missionId: affectation.missionId,
          heureDebut: ligne.heureDebut,
          heureFin: ligne.heureFin,
          pauseMinutes: ligne.pauseMinutes
        }
      ]
    });
  }
  revalidatePath('/app/heures');
}
