'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireAdminStrict } from '@/lib/session';
import { audit } from '@/lib/audit';
import { todayParis, dateFromYMD } from '@/lib/dates';
import {
  TelegramChannel,
  WhatsAppLinkChannel,
  envoyerEtJournaliser,
  telegramToken
} from '@/lib/messaging/channel';

/** Note 5★ unique — modifiable UNIQUEMENT par ADMIN, jamais visible par l'ouvrier (règle 13). */
export async function noterProfil(formData: FormData) {
  const user = await requireAdminStrict();
  const id = formData.get('id') as string;
  const note = Number(formData.get('note'));
  const commentaire = ((formData.get('noteCommentaire') as string) || '').trim();
  if (note && (note < 1 || note > 5)) throw new Error('Note entre 1 et 5');

  const profil = await prisma.user.findFirst({
    where: { id, organisationId: user.organisationId }
  });
  if (!profil) throw new Error('Profil introuvable');

  await prisma.user.update({
    where: { id },
    data: { note: note || null, noteCommentaire: commentaire || null }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'vivier.noter',
    entite: 'User',
    entiteId: id,
    avant: { note: profil.note },
    apres: { note: note || null }
  });
  revalidatePath(`/admin/vivier/${id}`);
}

/** Tags de compétences du profil. */
export async function majTagsProfil(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const tagIds = formData.getAll('tagIds').map(String);

  const profil = await prisma.user.findFirst({
    where: { id, organisationId: user.organisationId }
  });
  if (!profil) throw new Error('Profil introuvable');

  const tagsValides = await prisma.competenceTag.findMany({
    where: { id: { in: tagIds }, organisationId: user.organisationId }
  });

  await prisma.userCompetence.deleteMany({ where: { userId: id } });
  await prisma.userCompetence.createMany({
    data: tagsValides.map((t) => ({ userId: id, tagId: t.id }))
  });
  revalidatePath(`/admin/vivier/${id}`);
}

export async function majNotesInternes(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const notesInternes = ((formData.get('notesInternes') as string) || '').trim();

  const profil = await prisma.user.findFirst({
    where: { id, organisationId: user.organisationId }
  });
  if (!profil) throw new Error('Profil introuvable');

  await prisma.user.update({
    where: { id },
    data: { notesInternes: notesInternes || null }
  });
  revalidatePath(`/admin/vivier/${id}`);
}

/**
 * Réactivation en un clic : VIVIER/INACTIF → ACTIF, historique conservé (règle 14).
 * PIN : conservé s'il existe ; sinon un PIN à définir sur la fiche ouvrier.
 */
export async function reactiverProfil(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const pin = ((formData.get('pin') as string) || '').trim();

  const profil = await prisma.user.findFirst({
    where: {
      id,
      organisationId: user.organisationId,
      statutProfil: { in: ['VIVIER', 'INACTIF'] }
    }
  });
  if (!profil) throw new Error('Profil introuvable ou non réactivable');
  if (pin && !/^\d{4}$/.test(pin)) throw new Error('PIN : 4 chiffres');
  if (!profil.pinHash && !pin) {
    throw new Error('Ce profil n’a pas de PIN — saisissez-en un pour activer l’accès');
  }

  await prisma.user.update({
    where: { id },
    data: {
      statutProfil: 'ACTIF',
      actif: true,
      ...(pin ? { pinHash: await bcrypt.hash(pin, 10) } : {}),
      pinEchecs: 0,
      pinBloqueJusqua: null
    }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'vivier.reactiver',
    entite: 'User',
    entiteId: id,
    avant: { statutProfil: profil.statutProfil },
    apres: { statutProfil: 'ACTIF', pinChange: !!pin }
  });
  revalidatePath('/admin/vivier');
  revalidatePath(`/admin/vivier/${id}`);
}

/**
 * Fin de mission : ACTIF → retour au VIVIER (historique conservé, PIN gardé
 * pour une future réactivation, accès portail coupé). Bloqué si l'ouvrier a
 * encore des affectations aujourd'hui ou à venir.
 */
export async function remettreAuVivier(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;

  const profil = await prisma.user.findFirst({
    where: { id, organisationId: user.organisationId, statutProfil: 'ACTIF' }
  });
  if (!profil) throw new Error('Profil introuvable ou déjà hors des actifs');

  const affectationsAVenir = await prisma.affectationOuvrier.count({
    where: {
      userId: id,
      affectation: { organisationId: user.organisationId, date: { gte: dateFromYMD(todayParis()) } }
    }
  });
  if (affectationsAVenir > 0) {
    throw new Error(
      `Impossible : ${profil.prenom} ${profil.nom} a encore ${affectationsAVenir} affectation(s) aujourd’hui ou à venir — retirez-le d’abord du planning.`
    );
  }

  await prisma.user.update({
    where: { id },
    data: { statutProfil: 'VIVIER', actif: false }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'vivier.remettre',
    entite: 'User',
    entiteId: id,
    avant: { statutProfil: 'ACTIF' },
    apres: { statutProfil: 'VIVIER' }
  });
  revalidatePath('/admin/vivier');
  revalidatePath(`/admin/vivier/${id}`);
  revalidatePath('/admin/ouvriers');
}

// Variantes pour appel depuis les listes (client components) : en production,
// Next masque les messages des actions qui « throw » — ici on RETOURNE l'erreur.
export async function reactiverProfilDepuisListe(
  formData: FormData
): Promise<{ ok: boolean; erreur?: string }> {
  try {
    await reactiverProfil(formData);
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : 'Erreur' };
  }
}

export async function remettreAuVivierDepuisListe(
  formData: FormData
): Promise<{ ok: boolean; erreur?: string }> {
  try {
    await remettreAuVivier(formData);
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : 'Erreur' };
  }
}

/** Mise en liste noire — motif OBLIGATOIRE, date et auteur tracés (règle 12). */
export async function mettreListeNoire(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const motif = ((formData.get('motif') as string) || '').trim();
  if (!motif) throw new Error('Motif obligatoire pour la liste noire');

  const profil = await prisma.user.findFirst({
    where: { id, organisationId: user.organisationId }
  });
  if (!profil) throw new Error('Profil introuvable');

  await prisma.user.update({
    where: { id },
    data: {
      statutProfil: 'LISTE_NOIRE',
      actif: false,
      listeNoireMotif: motif,
      listeNoireAt: new Date(),
      listeNoireParId: user.userId
    }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'vivier.listeNoire',
    entite: 'User',
    entiteId: id,
    apres: { motif }
  });
  revalidatePath('/admin/vivier');
  revalidatePath(`/admin/vivier/${id}`);
}

/** Sortie de liste noire — ADMIN uniquement, tracé (règle 12). */
export async function sortirListeNoire(formData: FormData) {
  const user = await requireAdminStrict();
  const id = formData.get('id') as string;

  const profil = await prisma.user.findFirst({
    where: { id, organisationId: user.organisationId, statutProfil: 'LISTE_NOIRE' }
  });
  if (!profil) throw new Error('Profil introuvable');

  await prisma.user.update({
    where: { id },
    data: {
      statutProfil: 'VIVIER',
      listeNoireMotif: null,
      listeNoireAt: null,
      listeNoireParId: null
    }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'vivier.sortirListeNoire',
    entite: 'User',
    entiteId: id,
    avant: { motif: profil.listeNoireMotif }
  });
  revalidatePath(`/admin/vivier/${id}`);
}

const contactSchema = z.object({
  userId: z.string().min(1),
  canal: z.enum(['TELEGRAM', 'WHATSAPP']),
  contenu: z.string().trim().min(1).max(2000)
});

/** Contact depuis le vivier (individuel ou groupé) — envois journalisés (EnvoiMessage). */
export async function contacterProfil(input: unknown) {
  const user = await requireAdmin();
  const parsed = contactSchema.parse(input);

  const profil = await prisma.user.findFirst({
    where: { id: parsed.userId, organisationId: user.organisationId },
    include: { organisation: true }
  });
  if (!profil) throw new Error('Profil introuvable');
  if (profil.statutProfil === 'LISTE_NOIRE') {
    throw new Error('Profil en liste noire — contact bloqué');
  }

  const resultat = await envoyerEtJournaliser({
    organisationId: user.organisationId,
    canal: parsed.canal,
    contexte: 'VIVIER',
    destinataire: {
      id: profil.id,
      telephone: profil.telephone,
      telegramChatId: profil.telegramChatId
    },
    contenu: parsed.contenu,
    channel:
      parsed.canal === 'TELEGRAM'
        ? new TelegramChannel(telegramToken(profil.organisation.parametres))
        : new WhatsAppLinkChannel()
  });
  return resultat;
}
