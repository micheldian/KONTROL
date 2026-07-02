'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { audit } from '@/lib/audit';

const logementSchema = z.object({
  nom: z.string().trim().min(1),
  adresse: z.string().trim().optional(),
  capacite: z.coerce.number().int().min(1),
  tarifJour: z.coerce.number().min(0)
});

export async function saveLogement(formData: FormData) {
  const user = await requireAdmin();
  const id = (formData.get('id') as string) || null;
  const parsed = logementSchema.parse(Object.fromEntries(formData.entries()));
  const data = {
    nom: parsed.nom,
    adresse: parsed.adresse || null,
    capacite: parsed.capacite,
    tarifJour: parsed.tarifJour
  };

  if (id) {
    const existing = await prisma.logement.findFirst({
      where: { id, organisationId: user.organisationId }
    });
    if (!existing) throw new Error('Logement introuvable');
    await prisma.logement.update({ where: { id }, data });
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'logement.update',
      entite: 'Logement',
      entiteId: id,
      avant: existing,
      apres: data
    });
  } else {
    const created = await prisma.logement.create({
      data: { ...data, organisationId: user.organisationId }
    });
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'logement.create',
      entite: 'Logement',
      entiteId: created.id,
      apres: data
    });
  }
  revalidatePath('/admin/logements');
  redirect('/admin/logements');
}

export async function deleteLogement(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const logement = await prisma.logement.findFirst({
    where: { id, organisationId: user.organisationId },
    include: { _count: { select: { sejours: true } } }
  });
  if (!logement) throw new Error('Logement introuvable');
  if (logement._count.sejours > 0) {
    throw new Error('Impossible : des séjours existent pour ce logement.');
  }
  await prisma.logement.delete({ where: { id } });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'logement.delete',
    entite: 'Logement',
    entiteId: id,
    avant: logement
  });
  revalidatePath('/admin/logements');
  redirect('/admin/logements');
}
