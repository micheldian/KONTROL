'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { audit } from '@/lib/audit';
import { normalisePhone } from '@/lib/auth';

const ouvrierSchema = z.object({
  nom: z.string().trim().min(1),
  prenom: z.string().trim().min(1),
  telephone: z.string().trim().min(6),
  langue: z.enum(['FR', 'RO', 'ES']),
  role: z.enum(['OUVRIER', 'CHEF_EQUIPE']),
  statutProfil: z.enum(['ACTIF', 'INACTIF', 'VIVIER']),
  tauxHoraire: z.string().optional(),
  iban: z.string().trim().optional(),
  pin: z.string().optional(),
  notesInternes: z.string().trim().optional()
});

export async function saveOuvrier(formData: FormData) {
  const user = await requireAdmin();
  const id = (formData.get('id') as string) || null;
  const parsed = ouvrierSchema.parse(Object.fromEntries(formData.entries()));

  if (parsed.pin && !/^\d{4}$/.test(parsed.pin)) {
    throw new Error('Le PIN doit faire exactement 4 chiffres');
  }

  const telephone = normalisePhone(parsed.telephone);
  const conflit = await prisma.user.findFirst({
    where: { telephone, ...(id ? { NOT: { id } } : {}) }
  });
  if (conflit) throw new Error('Ce numéro de téléphone existe déjà (clé unique du profil)');

  const data = {
    nom: parsed.nom,
    prenom: parsed.prenom,
    telephone,
    langue: parsed.langue,
    role: parsed.role,
    statutProfil: parsed.statutProfil,
    estChefEquipe: parsed.role === 'CHEF_EQUIPE',
    tauxHoraire: parsed.tauxHoraire ? Number(parsed.tauxHoraire) : null,
    iban: parsed.iban || null,
    notesInternes: parsed.notesInternes || null,
    actif: parsed.statutProfil === 'ACTIF',
    ...(parsed.pin ? { pinHash: await bcrypt.hash(parsed.pin, 10) } : {})
  };

  let ouvrierId = id;
  if (id) {
    const existing = await prisma.user.findFirst({
      where: { id, organisationId: user.organisationId }
    });
    if (!existing) throw new Error('Ouvrier introuvable');
    await prisma.user.update({ where: { id }, data });
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'ouvrier.update',
      entite: 'User',
      entiteId: id,
      avant: { ...existing, pinHash: undefined, motDePasseHash: undefined },
      apres: { ...data, pinHash: data.pinHash ? '(modifié)' : undefined }
    });
  } else {
    if (!parsed.pin) throw new Error('PIN obligatoire à la création');
    const created = await prisma.user.create({
      data: { ...data, organisationId: user.organisationId, source: 'MANUEL' }
    });
    ouvrierId = created.id;
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'ouvrier.create',
      entite: 'User',
      entiteId: created.id,
      apres: { ...data, pinHash: '(défini)' }
    });
  }
  revalidatePath('/admin/ouvriers');
  redirect(`/admin/ouvriers/${ouvrierId}`);
}

/** Débloque immédiatement un PIN rate-limité. */
export async function debloquerPin(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const ouvrier = await prisma.user.findFirst({
    where: { id, organisationId: user.organisationId }
  });
  if (!ouvrier) throw new Error('Ouvrier introuvable');
  await prisma.user.update({
    where: { id },
    data: { pinEchecs: 0, pinBloqueJusqua: null }
  });
  revalidatePath(`/admin/ouvriers/${id}`);
}
