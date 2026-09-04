'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireAdminStrict } from '@/lib/session';
import { audit } from '@/lib/audit';
import { todayParis, dateFromYMD } from '@/lib/dates';
import { randomInt } from 'crypto';
import {
  SmsChannel,
  TelegramChannel,
  WhatsAppLinkChannel,
  assurerEnumsSms,
  configSms,
  envoyerEtJournaliser,
  lienSms,
  lienWaMe,
  telegramToken
} from '@/lib/messaging/channel';
import { lienConnexion } from '@/lib/messaging/templates';
import { dossierBloquant, manquants, LIBELLES_CHECKLIST } from '@/lib/embauche';

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
async function reactiverCoeur(formData: FormData) {
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

  // Verrou de complétude (phase 18, règle 5) : un dossier d'embauche en cours
  // et incomplet bloque le passage en ACTIF — activation depuis le dossier.
  const bloquant = await dossierBloquant(user.organisationId, id);
  if (bloquant) {
    throw new Error(
      `Dossier d'embauche incomplet (${manquants(bloquant.checklist)
        .map((m) => LIBELLES_CHECKLIST[m])
        .join(', ')}) — activez depuis le dossier ou forcez (ADMIN)`
    );
  }

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
async function remettreAuVivierCoeur(formData: FormData) {
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


/** Message d'erreur lisible : catch → redirect ?erreur= (les throw sont masqués en prod). */
function messageErreur(e: unknown): string {
  return e instanceof Error ? e.message : 'Erreur inattendue';
}

/** Form action fiche/listes : VIVIER/INACTIF → ACTIF, erreurs en bannière. */
export async function reactiverProfil(formData: FormData) {
  const id = formData.get('id') as string;
  let erreur: string | null = null;
  try {
    await reactiverCoeur(formData);
  } catch (e) {
    erreur = messageErreur(e);
  }
  if (erreur) redirect(`/admin/vivier/${id}?erreur=${encodeURIComponent(erreur)}`);
}

/** Form action fiche/liste ouvriers : ACTIF → VIVIER, erreurs en bannière. */
export async function remettreAuVivier(formData: FormData) {
  const id = formData.get('id') as string;
  const retour = (formData.get('retour') as string) || `/admin/vivier/${id}`;
  let erreur: string | null = null;
  try {
    await remettreAuVivierCoeur(formData);
  } catch (e) {
    erreur = messageErreur(e);
  }
  if (erreur) redirect(`${retour}?erreur=${encodeURIComponent(erreur)}`);
}

// Variantes pour appel depuis les listes (client components) : en production,
// Next masque les messages des actions qui « throw » — ici on RETOURNE l'erreur.
export async function reactiverProfilDepuisListe(
  formData: FormData
): Promise<{ ok: boolean; erreur?: string }> {
  try {
    await reactiverCoeur(formData);
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : 'Erreur' };
  }
}

export async function remettreAuVivierDepuisListe(
  formData: FormData
): Promise<{ ok: boolean; erreur?: string }> {
  try {
    await remettreAuVivierCoeur(formData);
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

const smsConnexionSchema = z.object({
  userId: z.string().min(1),
  contenu: z.string().trim().min(1).max(1000),
  // SERVEUR : envoi Twilio (simulation si non configuré) ; LIEN : ouvre l'app SMS de l'admin ;
  // WHATSAPP : lien wa.me pré-rempli (comme le message mission)
  mode: z.enum(['SERVEUR', 'LIEN', 'WHATSAPP'])
});

export type ResultatSmsConnexion = {
  ok: boolean;
  erreur?: string;
  statut?: 'ENVOYE' | 'SIMULE' | 'ECHEC' | 'LIEN_GENERE';
  detail?: string;
  pin?: string;
  lienSms?: string;
  lienWhatsApp?: string;
  active?: boolean;
};

/**
 * Message de connexion depuis le vivier (SMS ou WhatsApp) : lien pré-langué
 * (+ téléphone pré-rempli) et NOUVEAU PIN à 4 chiffres. Le PIN étant haché en base, il est régénéré à chaque envoi
 * (l'ancien ne fonctionne plus). Profil VIVIER/INACTIF → passe en ACTIF (même verrou
 * dossier d'embauche que la réactivation) pour que le lien serve immédiatement.
 * Le PIN est masqué dans le journal EnvoiMessage.
 */
export async function envoyerSmsConnexion(input: unknown): Promise<ResultatSmsConnexion> {
  try {
    const user = await requireAdmin();
    const parsed = smsConnexionSchema.parse(input);
    await assurerEnumsSms();
    if (!/\{pin\}/.test(parsed.contenu)) {
      return { ok: false, erreur: 'Le message doit contenir {pin}' };
    }

    const profil = await prisma.user.findFirst({
      where: { id: parsed.userId, organisationId: user.organisationId },
      include: { organisation: true }
    });
    if (!profil) return { ok: false, erreur: 'Profil introuvable' };
    if (profil.role !== 'OUVRIER' && profil.role !== 'CHEF_EQUIPE') {
      return { ok: false, erreur: 'Réservé aux profils ouvriers' };
    }
    if (profil.statutProfil === 'LISTE_NOIRE') {
      return { ok: false, erreur: 'Profil en liste noire — contact bloqué' };
    }
    if (profil.statutProfil === 'CANDIDAT') {
      return { ok: false, erreur: 'Candidature à valider avant d’ouvrir l’accès' };
    }
    const activer = profil.statutProfil !== 'ACTIF' || !profil.actif;
    if (activer) {
      const bloquant = await dossierBloquant(user.organisationId, profil.id);
      if (bloquant) {
        return {
          ok: false,
          erreur: `Dossier d'embauche incomplet (${manquants(bloquant.checklist)
            .map((m) => LIBELLES_CHECKLIST[m])
            .join(', ')}) — activez depuis le dossier`
        };
      }
    }

    const pin = String(randomInt(0, 10000)).padStart(4, '0');
    await prisma.user.update({
      where: { id: profil.id },
      data: {
        pinHash: await bcrypt.hash(pin, 10),
        pinEchecs: 0,
        pinBloqueJusqua: null,
        ...(activer ? { statutProfil: 'ACTIF', actif: true } : {})
      }
    });
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'vivier.smsConnexion',
      entite: 'User',
      entiteId: profil.id,
      avant: { statutProfil: profil.statutProfil },
      apres: { statutProfil: 'ACTIF', pinChange: true, mode: parsed.mode }
    });

    const vars: Record<string, string> = {
      prenom: profil.prenom,
      organisation: profil.organisation.nom,
      telephone: profil.telephone,
      lien: lienConnexion(profil.langue, profil.telephone),
      pin
    };
    const rendu = (p: string) =>
      parsed.contenu.replace(/\{(\w+)\}/g, (_, k: string) => (k === 'pin' ? p : vars[k] ?? ''));
    const contenu = rendu(pin);
    const contenuJournal = rendu('••••');

    const resultat = await envoyerEtJournaliser({
      organisationId: user.organisationId,
      canal: parsed.mode === 'WHATSAPP' ? 'WHATSAPP' : 'SMS',
      contexte: 'CONNEXION',
      destinataire: {
        id: profil.id,
        telephone: profil.telephone,
        telegramChatId: profil.telegramChatId
      },
      contenu,
      contenuJournal,
      channel:
        parsed.mode === 'SERVEUR'
          ? new SmsChannel(configSms(profil.organisation.parametres))
          : new WhatsAppLinkChannel() // LIEN_GENERE : l'admin envoie depuis son téléphone (SMS ou WhatsApp)
    });

    revalidatePath('/admin/vivier');
    revalidatePath(`/admin/vivier/${profil.id}`);
    revalidatePath('/admin/ouvriers');
    return {
      ok: true,
      statut: resultat.statut,
      detail: resultat.detail,
      pin,
      active: activer,
      lienSms: parsed.mode === 'LIEN' ? lienSms(profil.telephone, contenu) : undefined,
      lienWhatsApp: parsed.mode === 'WHATSAPP' ? lienWaMe(profil.telephone, contenu) : undefined
    };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : 'Erreur inattendue' };
  }
}
