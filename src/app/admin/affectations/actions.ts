'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { audit } from '@/lib/audit';
import { dateFromYMD, addDays } from '@/lib/dates';
import { envoyerPushAUtilisateur } from '@/lib/push';
import { PUSH_MESSAGES } from '@/lib/push-messages';

/** Push « affectation publiée » à chaque ouvrier, dans sa langue (best effort). */
async function pushAffectationPubliee(affectationIds: string[]) {
  const liens = await prisma.affectationOuvrier.findMany({
    where: { affectationId: { in: affectationIds } },
    include: { user: { select: { id: true, langue: true } } },
    distinct: ['userId']
  });
  await Promise.allSettled(
    liens.map((l) =>
      envoyerPushAUtilisateur(l.user.id, PUSH_MESSAGES.AFFECTATION_PUBLIEE[l.user.langue])
    )
  );
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const affectationSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  missionId: z.string().min(1),
  heureDebut: z.string().regex(HHMM, 'Heure début invalide (HH:MM)'),
  heureFinPrevue: z
    .string()
    .regex(HHMM, 'Heure fin invalide')
    .optional()
    .or(z.literal('')),
  pauseMinutesPrevue: z.coerce.number().int().min(0).max(480).optional(),
  chefEquipeId: z.string().optional(),
  instructions: z.string().trim().optional(),
  publier: z.string().optional()
});

export async function createAffectation(formData: FormData) {
  const user = await requireAdmin();
  const ouvrierIds = formData.getAll('ouvrierIds').map(String).filter(Boolean);
  const parcelleIds = formData.getAll('parcelleIds').map(String).filter(Boolean);
  const parsed = affectationSchema.parse(Object.fromEntries(formData.entries()));

  if (ouvrierIds.length === 0) throw new Error('Sélectionnez au moins un ouvrier');

  const mission = await prisma.mission.findFirst({
    where: { id: parsed.missionId, organisationId: user.organisationId }
  });
  if (!mission) throw new Error('Mission introuvable');

  // Multi-parcelles : elles doivent appartenir au client de la mission (règle 15)
  if (parcelleIds.length > 0) {
    const valides = await prisma.parcelle.count({
      where: {
        id: { in: parcelleIds },
        clientId: mission.clientId,
        organisationId: user.organisationId
      }
    });
    if (valides !== parcelleIds.length) {
      throw new Error('Une parcelle sélectionnée n’appartient pas au client de la mission');
    }
  }

  const ouvriers = await prisma.user.findMany({
    where: {
      id: { in: ouvrierIds },
      organisationId: user.organisationId,
      role: { in: ['OUVRIER', 'CHEF_EQUIPE'] },
      statutProfil: 'ACTIF'
    },
    select: { id: true }
  });
  if (ouvriers.length !== ouvrierIds.length) {
    throw new Error('Ouvrier invalide dans la sélection');
  }

  const chefEquipeId =
    parsed.chefEquipeId && ouvrierIds.includes(parsed.chefEquipeId)
      ? parsed.chefEquipeId
      : null;

  const affectation = await prisma.affectation.create({
    data: {
      organisationId: user.organisationId,
      date: dateFromYMD(parsed.date),
      missionId: mission.id,
      heureDebut: parsed.heureDebut,
      heureFinPrevue: parsed.heureFinPrevue || null,
      pauseMinutesPrevue: parsed.pauseMinutesPrevue ?? null,
      chefEquipeId,
      instructions: parsed.instructions || null,
      publieAt: parsed.publier === 'on' ? new Date() : null,
      ouvriers: { create: ouvrierIds.map((userId) => ({ userId })) },
      parcelles: { create: parcelleIds.map((parcelleId) => ({ parcelleId })) }
    }
  });

  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'affectation.create',
    entite: 'Affectation',
    entiteId: affectation.id,
    apres: { ...parsed, ouvrierIds, parcelleIds }
  });

  if (affectation.publieAt) await pushAffectationPubliee([affectation.id]);

  revalidatePath('/admin/affectations');
  redirect(`/admin/affectations?date=${parsed.date}`);
}

export async function deleteAffectation(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const date = formData.get('date') as string;
  const affectation = await prisma.affectation.findFirst({
    where: { id, organisationId: user.organisationId },
    include: { _count: { select: { creneaux: true } } }
  });
  if (!affectation) throw new Error('Affectation introuvable');
  if (affectation._count.creneaux > 0) {
    throw new Error('Impossible : des heures sont saisies sur cette affectation.');
  }
  await prisma.affectation.delete({ where: { id } });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'affectation.delete',
    entite: 'Affectation',
    entiteId: id,
    avant: affectation
  });
  revalidatePath('/admin/affectations');
  redirect(`/admin/affectations?date=${date}`);
}

/** Publie toutes les affectations non publiées du jour (visibles portail aussitôt). */
export async function publierJour(formData: FormData) {
  const user = await requireAdmin();
  const date = formData.get('date') as string;
  const aPublier = await prisma.affectation.findMany({
    where: {
      organisationId: user.organisationId,
      date: dateFromYMD(date),
      publieAt: null
    },
    select: { id: true }
  });
  await prisma.affectation.updateMany({
    where: { id: { in: aPublier.map((a) => a.id) } },
    data: { publieAt: new Date() }
  });
  await pushAffectationPubliee(aPublier.map((a) => a.id));
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'affectation.publierJour',
    entite: 'Affectation',
    entiteId: date
  });
  revalidatePath('/admin/affectations');
  redirect(`/admin/affectations?date=${date}`);
}

/** « Dupliquer hier » : copie les affectations de la veille vers le jour affiché. */
export async function dupliquerHier(formData: FormData) {
  const user = await requireAdmin();
  const date = formData.get('date') as string;
  const veille = addDays(date, -1);

  const sources = await prisma.affectation.findMany({
    where: { organisationId: user.organisationId, date: dateFromYMD(veille) },
    include: { ouvriers: true, parcelles: true }
  });
  if (sources.length === 0) {
    redirect(`/admin/affectations?date=${date}&info=rien-a-dupliquer`);
  }

  for (const src of sources) {
    await prisma.affectation.create({
      data: {
        organisationId: user.organisationId,
        date: dateFromYMD(date),
        missionId: src.missionId,
        heureDebut: src.heureDebut,
        heureFinPrevue: src.heureFinPrevue,
        pauseMinutesPrevue: src.pauseMinutesPrevue,
        chefEquipeId: src.chefEquipeId,
        instructions: src.instructions,
        publieAt: null, // à re-publier après contrôle
        ouvriers: {
          create: src.ouvriers.map((o) => ({ userId: o.userId }))
        },
        parcelles: {
          create: src.parcelles.map((p) => ({ parcelleId: p.parcelleId }))
        }
      }
    });
  }

  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'affectation.dupliquerHier',
    entite: 'Affectation',
    entiteId: date,
    apres: { copiees: sources.length, depuis: veille }
  });

  revalidatePath('/admin/affectations');
  redirect(`/admin/affectations?date=${date}`);
}
