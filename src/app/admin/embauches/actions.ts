'use server';

// Dossiers d'embauche (phase 18) — création, lien d'onboarding, DPAE,
// activation verrouillée (règle 5), forçage ADMIN motivé, annulation.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireAdminStrict } from '@/lib/session';
import { audit } from '@/lib/audit';
import { dateFromYMD } from '@/lib/dates';
import {
  ORDRE_CHECKLIST,
  checklistComplete,
  manquants,
  LIBELLES_CHECKLIST,
  genererTokenOnboarding,
  delaiTokenJours,
  majChecklist,
  messageLienOnboarding
} from '@/lib/embauche';
import { TelegramChannel, envoyerEtJournaliser, telegramToken } from '@/lib/messaging/channel';

function urlBase(): string {
  return process.env.NEXTAUTH_URL ?? '';
}

async function dossierScope(id: string, organisationId: string) {
  return prisma.dossierEmbauche.findFirst({
    where: { id, organisationId },
    include: { user: true, checklist: true, organisation: true }
  });
}

/** Bouton « Embaucher » (fiche vivier/ouvrier) → dossier EN_COURS + checklist + lien. */
export async function embaucherOuvrier(formData: FormData) {
  const user = await requireAdmin();
  const userId = formData.get('userId') as string;
  let erreur: string | null = null;
  let dossierId = '';

  try {
    const profil = await prisma.user.findFirst({
      where: {
        id: userId,
        organisationId: user.organisationId,
        role: { in: ['OUVRIER', 'CHEF_EQUIPE'] }
      }
    });
    if (!profil) throw new Error('Profil introuvable');
    if (profil.statutProfil === 'LISTE_NOIRE') {
      throw new Error('Profil en liste noire — embauche impossible');
    }
    const existant = await prisma.dossierEmbauche.findFirst({
      where: { organisationId: user.organisationId, userId, statut: 'EN_COURS' }
    });
    if (existant) throw new Error('Un dossier d’embauche est déjà en cours pour ce profil');

    const dateDebut = (formData.get('dateDebut') as string) || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDebut)) throw new Error('Date de début invalide');
    const dateFin = (formData.get('dateFinPrevue') as string) || '';
    const taux = Number(formData.get('tauxHoraire'));
    if (!Number.isFinite(taux) || taux <= 0) throw new Error('Taux horaire invalide');

    const modeleContratId = (formData.get('modeleContratId') as string) || '';
    if (modeleContratId) {
      const modele = await prisma.modeleContrat.findFirst({
        where: { id: modeleContratId, organisationId: user.organisationId, categorie: 'CONTRAT' }
      });
      if (!modele) throw new Error('Modèle de contrat introuvable');
    }
    const logementId = (formData.get('logementId') as string) || '';
    if (logementId) {
      const logement = await prisma.logement.findFirst({
        where: { id: logementId, organisationId: user.organisationId }
      });
      if (!logement) throw new Error('Logement introuvable');
    }

    const org = await prisma.organisation.findUnique({ where: { id: user.organisationId } });
    const jours = delaiTokenJours(org?.parametres);
    const expire = new Date();
    expire.setDate(expire.getDate() + jours);

    const dossier = await prisma.dossierEmbauche.create({
      data: {
        organisationId: user.organisationId,
        userId,
        dateDebut: dateFromYMD(dateDebut),
        dateFinPrevue: /^\d{4}-\d{2}-\d{2}$/.test(dateFin) ? dateFromYMD(dateFin) : null,
        tauxHoraire: taux,
        modeleContratId: modeleContratId || null,
        logementId: logementId || null,
        tokenOnboarding: genererTokenOnboarding(),
        tokenExpireAt: expire,
        creeParId: user.userId,
        checklist: { create: ORDRE_CHECKLIST.map((type) => ({ type })) }
      }
    });
    dossierId = dossier.id;

    // Taux appliqué au profil dès l'embauche (repris par les créneaux)
    await prisma.user.update({ where: { id: userId }, data: { tauxHoraire: taux } });

    // Logement : le séjour démarre à la date de début (modifiable ensuite)
    if (logementId) {
      await prisma.sejourLogement.create({
        data: {
          logementId,
          userId,
          dateArrivee: dateFromYMD(dateDebut),
          dateDepart: /^\d{4}-\d{2}-\d{2}$/.test(dateFin) ? dateFromYMD(dateFin) : null
        }
      });
    }

    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'embauche.creer',
      entite: 'DossierEmbauche',
      entiteId: dossier.id,
      apres: { ouvrier: userId, dateDebut, taux }
    });
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inattendue';
  }
  revalidatePath('/admin/embauches');
  redirect(
    erreur
      ? `/admin/vivier/${userId}?erreur=${encodeURIComponent(erreur)}`
      : `/admin/embauches/${dossierId}?cree=1`
  );
}

/** Regénère un lien (token précédent invalidé). */
export async function regenererLien(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const dossier = await dossierScope(id, user.organisationId);
  if (!dossier || dossier.statut === 'ANNULE') throw new Error('Dossier introuvable');

  const jours = delaiTokenJours(dossier.organisation.parametres);
  const expire = new Date();
  expire.setDate(expire.getDate() + jours);
  await prisma.dossierEmbauche.update({
    where: { id },
    data: { tokenOnboarding: genererTokenOnboarding(), tokenExpireAt: expire }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'embauche.lien.regenerer',
    entite: 'DossierEmbauche',
    entiteId: id
  });
  revalidatePath(`/admin/embauches/${id}`);
}

/** Envoi du lien d'onboarding par Telegram (langue de l'ouvrier, journalisé). */
export async function envoyerLienTelegram(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const dossier = await dossierScope(id, user.organisationId);
  if (!dossier || !dossier.tokenOnboarding) throw new Error('Dossier introuvable');

  const jours = delaiTokenJours(dossier.organisation.parametres);
  const contenu = messageLienOnboarding({
    langue: dossier.user.langue,
    organisation: dossier.organisation.nom,
    prenom: dossier.user.prenom,
    lien: `${urlBase()}/embauche/${dossier.tokenOnboarding}`,
    jours
  });
  await envoyerEtJournaliser({
    organisationId: user.organisationId,
    canal: 'TELEGRAM',
    contexte: 'AUTRE',
    destinataire: {
      id: dossier.user.id,
      telephone: dossier.user.telephone,
      telegramChatId: dossier.user.telegramChatId
    },
    contenu,
    channel: new TelegramChannel(telegramToken(dossier.organisation.parametres))
  });
  revalidatePath(`/admin/embauches/${id}`);
}

/** Récépissé DPAE saisi après dépôt sur le site MSA (niveau 1). */
export async function deposerDpae(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  let erreur: string | null = null;
  try {
    const dossier = await dossierScope(id, user.organisationId);
    if (!dossier) throw new Error('Dossier introuvable');
    const numero = ((formData.get('numero') as string) || '').trim();
    const date = (formData.get('date') as string) || '';
    if (!numero) throw new Error('Numéro / récépissé DPAE obligatoire');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date de dépôt invalide');

    await prisma.dossierEmbauche.update({
      where: { id },
      data: { dpaeNumero: numero, dpaeDeposeAt: dateFromYMD(date) }
    });
    await majChecklist({
      dossierId: id,
      type: 'DPAE',
      statut: 'FAIT',
      detail: `Récépissé ${numero}`,
      faitParId: user.userId
    });
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'embauche.dpae',
      entite: 'DossierEmbauche',
      entiteId: id,
      apres: { numero, date }
    });
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inattendue';
  }
  revalidatePath(`/admin/embauches/${id}`);
  redirect(erreur ? `/admin/embauches/${id}?erreur=${encodeURIComponent(erreur)}` : `/admin/embauches/${id}`);
}

/** L'admin coche manuellement un item (ex. IBAN reçu plus tard, identité vérifiée sur place). */
export async function cocherChecklist(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const type = formData.get('type') as (typeof ORDRE_CHECKLIST)[number];
  if (!ORDRE_CHECKLIST.includes(type)) throw new Error('Type invalide');
  const dossier = await dossierScope(id, user.organisationId);
  if (!dossier) throw new Error('Dossier introuvable');

  await majChecklist({
    dossierId: id,
    type,
    statut: 'FAIT',
    detail: 'Validé manuellement (back-office)',
    faitParId: user.userId
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'embauche.checklist.manuel',
    entite: 'DossierEmbauche',
    entiteId: id,
    apres: { type }
  });
  revalidatePath(`/admin/embauches/${id}`);
}

async function activer(params: {
  dossier: NonNullable<Awaited<ReturnType<typeof dossierScope>>>;
  pin: string;
  adminId: string;
  organisationId: string;
}) {
  const { dossier, pin, adminId, organisationId } = params;
  if (pin && !/^\d{4}$/.test(pin)) throw new Error('PIN : 4 chiffres');
  if (!dossier.user.pinHash && !pin) {
    throw new Error('Ce profil n’a pas de PIN — saisissez-en un pour ouvrir l’accès portail');
  }
  await prisma.user.update({
    where: { id: dossier.userId },
    data: {
      statutProfil: 'ACTIF',
      actif: true,
      tauxHoraire: dossier.tauxHoraire,
      ...(pin ? { pinHash: await bcrypt.hash(pin, 10) } : {}),
      pinEchecs: 0,
      pinBloqueJusqua: null
    }
  });
  await audit({
    organisationId,
    userId: adminId,
    action: 'embauche.activer',
    entite: 'User',
    entiteId: dossier.userId,
    apres: { dossier: dossier.id, statutDossier: dossier.statut }
  });
}

/** Activation normale : uniquement checklist complète (verrou, règle 5). */
export async function activerOuvrier(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  let erreur: string | null = null;
  try {
    const dossier = await dossierScope(id, user.organisationId);
    if (!dossier) throw new Error('Dossier introuvable');
    if (dossier.statut === 'ANNULE') throw new Error('Dossier annulé');
    if (!checklistComplete(dossier.checklist)) {
      const restants = manquants(dossier.checklist)
        .map((m) => LIBELLES_CHECKLIST[m])
        .join(', ');
      throw new Error(`Checklist incomplète : ${restants}. Un ADMIN peut forcer avec motif.`);
    }
    await activer({
      dossier,
      pin: ((formData.get('pin') as string) || '').trim(),
      adminId: user.userId,
      organisationId: user.organisationId
    });
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inattendue';
  }
  revalidatePath(`/admin/embauches/${id}`);
  redirect(
    erreur ? `/admin/embauches/${id}?erreur=${encodeURIComponent(erreur)}` : `/admin/embauches/${id}?active=1`
  );
}

/** Forçage ADMIN seul, motif obligatoire, tracé — bannière rouge tant que non régularisé. */
export async function forcerActivation(formData: FormData) {
  const user = await requireAdminStrict();
  const id = formData.get('id') as string;
  let erreur: string | null = null;
  try {
    const dossier = await dossierScope(id, user.organisationId);
    if (!dossier) throw new Error('Dossier introuvable');
    if (dossier.statut === 'ANNULE') throw new Error('Dossier annulé');
    const motif = ((formData.get('motif') as string) || '').trim();
    if (!motif) throw new Error('Motif de forçage obligatoire');

    await activer({
      dossier,
      pin: ((formData.get('pin') as string) || '').trim(),
      adminId: user.userId,
      organisationId: user.organisationId
    });
    await prisma.dossierEmbauche.update({
      where: { id },
      data: { statut: 'FORCE', forceMotif: motif, forceParId: user.userId, forceAt: new Date() }
    });
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'embauche.activer.force',
      entite: 'DossierEmbauche',
      entiteId: id,
      apres: { motif, manquants: manquants(dossier.checklist) }
    });
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inattendue';
  }
  revalidatePath(`/admin/embauches/${id}`);
  redirect(
    erreur ? `/admin/embauches/${id}?erreur=${encodeURIComponent(erreur)}` : `/admin/embauches/${id}?active=1`
  );
}

/** Annulation : documents conservés (règle 8), profil libéré pour une embauche future. */
export async function annulerDossier(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  let erreur: string | null = null;
  try {
    const dossier = await dossierScope(id, user.organisationId);
    if (!dossier) throw new Error('Dossier introuvable');
    const motif = ((formData.get('motif') as string) || '').trim();
    if (!motif) throw new Error('Motif d’annulation obligatoire');

    await prisma.dossierEmbauche.update({
      where: { id },
      data: { statut: 'ANNULE', annuleMotif: motif, tokenOnboarding: null, tokenExpireAt: null }
    });
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'embauche.annuler',
      entite: 'DossierEmbauche',
      entiteId: id,
      apres: { motif }
    });
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inattendue';
  }
  revalidatePath('/admin/embauches');
  redirect(erreur ? `/admin/embauches/${id}?erreur=${encodeURIComponent(erreur)}` : '/admin/embauches');
}
