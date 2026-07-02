'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { audit } from '@/lib/audit';

const clientSchema = z.object({
  nom: z.string().trim().min(1),
  contact: z.string().trim().optional(),
  telephone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  adresse: z.string().trim().optional(),
  pennylaneCustomerId: z.string().trim().optional(),
  notes: z.string().trim().optional()
});

export async function saveClient(formData: FormData) {
  const user = await requireAdmin();
  const id = (formData.get('id') as string) || null;
  const parsed = clientSchema.parse(Object.fromEntries(formData.entries()));
  const data = {
    nom: parsed.nom,
    contact: parsed.contact || null,
    telephone: parsed.telephone || null,
    email: parsed.email || null,
    adresse: parsed.adresse || null,
    pennylaneCustomerId: parsed.pennylaneCustomerId || null,
    notes: parsed.notes || null
  };

  if (id) {
    const existing = await prisma.client.findFirst({
      where: { id, organisationId: user.organisationId }
    });
    if (!existing) throw new Error('Client introuvable');
    await prisma.client.update({ where: { id }, data });
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'client.update',
      entite: 'Client',
      entiteId: id,
      avant: existing,
      apres: data
    });
  } else {
    const created = await prisma.client.create({
      data: { ...data, organisationId: user.organisationId }
    });
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'client.create',
      entite: 'Client',
      entiteId: created.id,
      apres: data
    });
  }
  revalidatePath('/admin/clients');
  redirect('/admin/clients');
}

export async function deleteClient(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const client = await prisma.client.findFirst({
    where: { id, organisationId: user.organisationId },
    include: { _count: { select: { missions: true } } }
  });
  if (!client) throw new Error('Client introuvable');
  if (client._count.missions > 0) {
    throw new Error('Impossible : ce client a des missions.');
  }
  await prisma.client.delete({ where: { id } });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'client.delete',
    entite: 'Client',
    entiteId: id,
    avant: client
  });
  revalidatePath('/admin/clients');
  redirect('/admin/clients');
}
