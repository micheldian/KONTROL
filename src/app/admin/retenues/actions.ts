'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { audit } from '@/lib/audit';
import { dateFromYMD } from '@/lib/dates';

const retenueSchema = z.object({
  ouvrierId: z.string().min(1),
  libelle: z.string().trim().min(1),
  montant: z.coerce.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().optional()
});

/** Ligne de retenue libre (transport, repas, matériel…) — apparaît dans « Mon argent ». */
export async function creerRetenue(formData: FormData) {
  const user = await requireAdmin();
  const parsed = retenueSchema.parse(Object.fromEntries(formData.entries()));

  const ouvrier = await prisma.user.findFirst({
    where: { id: parsed.ouvrierId, organisationId: user.organisationId }
  });
  if (!ouvrier) throw new Error('Ouvrier introuvable');

  const retenue = await prisma.retenue.create({
    data: {
      organisationId: user.organisationId,
      userId: parsed.ouvrierId,
      libelle: parsed.libelle,
      montant: parsed.montant,
      date: dateFromYMD(parsed.date),
      note: parsed.note || null
    }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'retenue.create',
    entite: 'Retenue',
    entiteId: retenue.id,
    apres: parsed
  });
  revalidatePath('/admin/retenues');
}

export async function supprimerRetenue(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const retenue = await prisma.retenue.findFirst({
    where: { id, organisationId: user.organisationId }
  });
  if (!retenue) throw new Error('Retenue introuvable');
  await prisma.retenue.delete({ where: { id } });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'retenue.delete',
    entite: 'Retenue',
    entiteId: id,
    avant: retenue
  });
  revalidatePath('/admin/retenues');
}
