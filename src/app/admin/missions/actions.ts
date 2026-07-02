'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { audit } from '@/lib/audit';
import { dateFromYMD } from '@/lib/dates';

const missionSchema = z.object({
  clientId: z.string().min(1),
  libelle: z.string().trim().min(1),
  typeTravaux: z.string().trim().optional(),
  modeFacturation: z.enum(['HEURE', 'TACHE']),
  tauxClient: z.string().optional(),
  montantForfait: z.string().optional(),
  dateDebut: z.string().min(10),
  dateFin: z.string().optional(),
  statut: z.enum(['ACTIVE', 'TERMINEE']).default('ACTIVE'),
  notes: z.string().trim().optional()
});

export async function saveMission(formData: FormData) {
  const user = await requireAdmin();
  const id = (formData.get('id') as string) || null;
  const parsed = missionSchema.parse(Object.fromEntries(formData.entries()));

  // Le client doit appartenir à l'organisation
  const client = await prisma.client.findFirst({
    where: { id: parsed.clientId, organisationId: user.organisationId }
  });
  if (!client) throw new Error('Client introuvable');

  const data = {
    clientId: parsed.clientId,
    libelle: parsed.libelle,
    typeTravaux: parsed.typeTravaux || null,
    modeFacturation: parsed.modeFacturation,
    tauxClient: parsed.tauxClient ? Number(parsed.tauxClient) : null,
    montantForfait: parsed.montantForfait ? Number(parsed.montantForfait) : null,
    dateDebut: dateFromYMD(parsed.dateDebut),
    dateFin: parsed.dateFin ? dateFromYMD(parsed.dateFin) : null,
    statut: parsed.statut,
    notes: parsed.notes || null
  };

  let missionId = id;
  if (id) {
    const existing = await prisma.mission.findFirst({
      where: { id, organisationId: user.organisationId }
    });
    if (!existing) throw new Error('Mission introuvable');
    await prisma.mission.update({ where: { id }, data });
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'mission.update',
      entite: 'Mission',
      entiteId: id,
      avant: existing,
      apres: data
    });
  } else {
    const created = await prisma.mission.create({
      data: { ...data, organisationId: user.organisationId }
    });
    missionId = created.id;
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'mission.create',
      entite: 'Mission',
      entiteId: created.id,
      apres: data
    });
  }
  revalidatePath('/admin/missions');
  redirect(`/admin/missions/${missionId}`);
}

export async function deleteMission(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const mission = await prisma.mission.findFirst({
    where: { id, organisationId: user.organisationId },
    include: { _count: { select: { affectations: true, creneaux: true, factures: true } } }
  });
  if (!mission) throw new Error('Mission introuvable');
  if (
    mission._count.affectations > 0 ||
    mission._count.creneaux > 0 ||
    mission._count.factures > 0
  ) {
    throw new Error('Impossible : la mission a des affectations, heures ou factures.');
  }
  await prisma.mission.delete({ where: { id } });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'mission.delete',
    entite: 'Mission',
    entiteId: id,
    avant: mission
  });
  revalidatePath('/admin/missions');
  redirect('/admin/missions');
}

export async function addParcelle(formData: FormData) {
  const user = await requireAdmin();
  const missionId = formData.get('missionId') as string;
  const adresse = ((formData.get('adresse') as string) || '').trim();
  const instructions = ((formData.get('instructions') as string) || '').trim();
  if (!adresse) throw new Error('Adresse obligatoire');

  const mission = await prisma.mission.findFirst({
    where: { id: missionId, organisationId: user.organisationId }
  });
  if (!mission) throw new Error('Mission introuvable');

  await prisma.parcelle.create({
    data: { missionId, adresse, instructions: instructions || null }
  });
  revalidatePath(`/admin/missions/${missionId}`);
}

export async function deleteParcelle(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const parcelle = await prisma.parcelle.findFirst({
    where: { id, mission: { organisationId: user.organisationId } },
    include: { _count: { select: { affectations: true } } }
  });
  if (!parcelle) throw new Error('Parcelle introuvable');
  if (parcelle._count.affectations > 0) {
    throw new Error('Impossible : des affectations utilisent cette parcelle.');
  }
  await prisma.parcelle.delete({ where: { id } });
  revalidatePath(`/admin/missions/${parcelle.missionId}`);
}
