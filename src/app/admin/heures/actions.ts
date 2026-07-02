'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { audit } from '@/lib/audit';
import { creerCreneaux } from '@/lib/heures';
import { dureeHeures } from '@/lib/dates';

/** Valide un créneau EN_ATTENTE. */
export async function validerCreneau(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const creneau = await prisma.creneauHeures.findFirst({
    where: { id, organisationId: user.organisationId }
  });
  if (!creneau) throw new Error('Créneau introuvable');
  if (creneau.statut !== 'EN_ATTENTE') return;

  await prisma.creneauHeures.update({
    where: { id },
    data: { statut: 'VALIDE', valideParId: user.userId, valideAt: new Date() }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'heures.valider',
    entite: 'CreneauHeures',
    entiteId: id
  });
  revalidatePath('/admin/heures');
}

/** Validation en masse de tous les créneaux EN_ATTENTE listés. */
export async function validerEnMasse(formData: FormData) {
  const user = await requireAdmin();
  const ids = formData.getAll('ids').map(String);
  if (ids.length === 0) return;

  const result = await prisma.creneauHeures.updateMany({
    where: {
      id: { in: ids },
      organisationId: user.organisationId,
      statut: 'EN_ATTENTE'
    },
    data: { statut: 'VALIDE', valideParId: user.userId, valideAt: new Date() }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'heures.validerEnMasse',
    entite: 'CreneauHeures',
    entiteId: `${result.count} créneaux`,
    apres: { ids }
  });
  revalidatePath('/admin/heures');
}

const correctionSchema = z.object({
  id: z.string().min(1),
  heureDebut: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  heureFin: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  pauseMinutes: z.coerce.number().int().min(0).max(480),
  commentaire: z.string().trim().optional()
});

/** Correction tracée : nouvelles heures + statut CORRIGE + audit avant/après. */
export async function corrigerCreneau(formData: FormData) {
  const user = await requireAdmin();
  const parsed = correctionSchema.parse(Object.fromEntries(formData.entries()));

  const creneau = await prisma.creneauHeures.findFirst({
    where: { id: parsed.id, organisationId: user.organisationId }
  });
  if (!creneau) throw new Error('Créneau introuvable');

  const heures = dureeHeures(parsed.heureDebut, parsed.heureFin, parsed.pauseMinutes);
  if (heures <= 0) throw new Error('Durée invalide');

  await prisma.creneauHeures.update({
    where: { id: parsed.id },
    data: {
      heureDebut: parsed.heureDebut,
      heureFin: parsed.heureFin,
      pauseMinutes: parsed.pauseMinutes,
      heuresCalculees: heures,
      statut: 'CORRIGE',
      valideParId: user.userId,
      valideAt: new Date(),
      commentaire: parsed.commentaire || creneau.commentaire
    }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'heures.corriger',
    entite: 'CreneauHeures',
    entiteId: parsed.id,
    avant: {
      heureDebut: creneau.heureDebut,
      heureFin: creneau.heureFin,
      pauseMinutes: creneau.pauseMinutes,
      heuresCalculees: creneau.heuresCalculees
    },
    apres: {
      heureDebut: parsed.heureDebut,
      heureFin: parsed.heureFin,
      pauseMinutes: parsed.pauseMinutes,
      heuresCalculees: heures,
      commentaire: parsed.commentaire
    }
  });
  revalidatePath('/admin/heures');
}

const saisieAdminSchema = z.object({
  ouvrierId: z.string().min(1),
  missionId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  heureDebut: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  heureFin: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  pauseMinutes: z.coerce.number().int().min(0).max(480)
});

/** Saisie manuelle par l'admin — directement VALIDE. */
export async function saisieManuelle(formData: FormData) {
  const user = await requireAdmin();
  const parsed = saisieAdminSchema.parse(Object.fromEntries(formData.entries()));

  const ouvrier = await prisma.user.findFirst({
    where: { id: parsed.ouvrierId, organisationId: user.organisationId }
  });
  if (!ouvrier) throw new Error('Ouvrier introuvable');

  const crees = await creerCreneaux({
    organisationId: user.organisationId,
    ouvrierId: parsed.ouvrierId,
    date: parsed.date,
    saisiParId: user.userId,
    statut: 'VALIDE',
    valideParId: user.userId,
    creneaux: [
      {
        missionId: parsed.missionId,
        heureDebut: parsed.heureDebut,
        heureFin: parsed.heureFin,
        pauseMinutes: parsed.pauseMinutes
      }
    ]
  });
  if (crees.length > 0) {
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'heures.saisieManuelle',
      entite: 'CreneauHeures',
      entiteId: crees[0].id,
      apres: parsed
    });
  }
  revalidatePath('/admin/heures');
}
