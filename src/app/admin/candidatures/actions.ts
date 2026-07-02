'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { audit } from '@/lib/audit';
import { mettreListeNoire } from '../vivier/actions';

/** Approuve une candidature → profil VIVIER (disponible pour embauche). */
export async function approuverCandidature(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;

  const candidature = await prisma.candidature.findFirst({
    where: { id, organisationId: user.organisationId, statut: 'EN_ATTENTE' },
    include: { user: true }
  });
  if (!candidature) throw new Error('Candidature introuvable');

  await prisma.candidature.update({
    where: { id },
    data: { statut: 'APPROUVEE', traiteParId: user.userId, traiteAt: new Date() }
  });
  // Un profil déjà ACTIF/VIVIER conserve son statut ; un CANDIDAT passe au vivier
  if (candidature.user.statutProfil === 'CANDIDAT') {
    await prisma.user.update({
      where: { id: candidature.userId },
      data: { statutProfil: 'VIVIER' }
    });
  }
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'candidature.approuver',
    entite: 'Candidature',
    entiteId: id
  });
  revalidatePath('/admin/candidatures');
}

/** Refuse une candidature (motif optionnel) — le profil reste CANDIDAT (historisé). */
export async function refuserCandidature(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const motif = ((formData.get('motif') as string) || '').trim();

  const candidature = await prisma.candidature.findFirst({
    where: { id, organisationId: user.organisationId, statut: 'EN_ATTENTE' }
  });
  if (!candidature) throw new Error('Candidature introuvable');

  await prisma.candidature.update({
    where: { id },
    data: {
      statut: 'REFUSEE',
      motifRefus: motif || null,
      traiteParId: user.userId,
      traiteAt: new Date()
    }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'candidature.refuser',
    entite: 'Candidature',
    entiteId: id,
    apres: { motif }
  });
  revalidatePath('/admin/candidatures');
}

/** Liste noire directement depuis la file (motif obligatoire) + refus de la candidature. */
export async function listeNoireCandidature(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;

  const candidature = await prisma.candidature.findFirst({
    where: { id, organisationId: user.organisationId, statut: 'EN_ATTENTE' }
  });
  if (!candidature) throw new Error('Candidature introuvable');

  const fd = new FormData();
  fd.set('id', candidature.userId);
  fd.set('motif', (formData.get('motif') as string) || '');
  await mettreListeNoire(fd);

  await prisma.candidature.update({
    where: { id },
    data: {
      statut: 'REFUSEE',
      motifRefus: 'Liste noire',
      traiteParId: user.userId,
      traiteAt: new Date()
    }
  });
  revalidatePath('/admin/candidatures');
}
