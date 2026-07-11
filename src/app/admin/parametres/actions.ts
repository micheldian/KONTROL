'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireAdminStrict } from '@/lib/session';
import { audit } from '@/lib/audit';
import { normalisePhone } from '@/lib/auth';

/** Paramètres généraux : tarif de base, règle logement, intégrations. */
export async function majParametres(formData: FormData) {
  const user = await requireAdminStrict();
  const tarif = Number(formData.get('tarifHoraireBase'));
  if (!tarif || tarif <= 0) throw new Error('Tarif de base invalide');

  const org = await prisma.organisation.findUnique({
    where: { id: user.organisationId }
  });
  const parametres = {
    ...((org?.parametres as object) ?? {}),
    regleDepartLogementInclus: formData.get('regleDepartLogementInclus') === 'on',
    afficherNomsOuvriersAuClient: formData.get('afficherNomsOuvriersAuClient') === 'on',
    telegramBotToken: ((formData.get('telegramBotToken') as string) || '').trim(),
    pennylaneApiKey: ((formData.get('pennylaneApiKey') as string) || '').trim()
  };

  // Module recruteurs : commission fixe + délais anti-abus (phase 17)
  const numOuDefaut = (champ: string, defaut: number) => {
    const v = Number(formData.get(champ));
    return Number.isFinite(v) && v > 0 ? v : defaut;
  };
  Object.assign(parametres, {
    commissionDefaut: numOuDefaut('commissionDefaut', 100),
    delaiRepropositionMois: Math.round(numOuDefaut('delaiRepropositionMois', 12)),
    delaiAnnulationPlacementJours: Math.round(numOuDefaut('delaiAnnulationPlacementJours', 7)),
    // Embauche digitale (phase 18) : lien onboarding, DPAE/TESA, rétention
    delaiTokenOnboardingJours: Math.round(numOuDefaut('delaiTokenOnboardingJours', 7)),
    dureeRetentionDocumentsAnnees: Math.round(numOuDefaut('dureeRetentionDocumentsAnnees', 5)),
    msaNumeroEmployeur: ((formData.get('msaNumeroEmployeur') as string) || '').trim(),
    siret: ((formData.get('siret') as string) || '').trim(),
    adresseEtablissement: ((formData.get('adresseEtablissement') as string) || '').trim(),
    anthropicApiKey: ((formData.get('anthropicApiKey') as string) || '').trim()
  });

  await prisma.organisation.update({
    where: { id: user.organisationId },
    data: { tarifHoraireBase: tarif, parametres }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'parametres.maj',
    entite: 'Organisation',
    entiteId: user.organisationId,
    apres: { tarif, regleDepartLogementInclus: parametres.regleDepartLogementInclus }
  });
  revalidatePath('/admin/parametres');
}

const CONTEXTES = ['AFFECTATION', 'RECAP', 'VIVIER', 'DEMANDE'] as const;
const LANGUES = ['FR', 'RO', 'ES'] as const;

/** Modèles de messages (3 contextes × 3 langues). */
export async function majTemplates(formData: FormData) {
  const user = await requireAdminStrict();
  const org = await prisma.organisation.findUnique({
    where: { id: user.organisationId }
  });

  const templates: Record<string, Record<string, string>> = {};
  for (const c of CONTEXTES) {
    for (const l of LANGUES) {
      const v = ((formData.get(`tpl_${c}_${l}`) as string) || '').trim();
      if (v) {
        templates[c] = templates[c] ?? {};
        templates[c][l] = v;
      }
    }
  }

  await prisma.organisation.update({
    where: { id: user.organisationId },
    data: {
      parametres: { ...((org?.parametres as object) ?? {}), templates }
    }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'parametres.templates',
    entite: 'Organisation',
    entiteId: user.organisationId
  });
  revalidatePath('/admin/parametres');
}

const compteSchema = z.object({
  prenom: z.string().trim().min(1),
  nom: z.string().trim().min(1),
  email: z.string().email(),
  telephone: z.string().min(6),
  role: z.enum(['ADMIN', 'MANAGER', 'CLIENT']),
  clientId: z.string().optional(),
  motDePasse: z.string().min(8, 'Mot de passe : 8 caractères minimum')
});

/** Crée un compte ADMIN, MANAGER ou CLIENT (portail client lecture seule). */
export async function creerCompte(formData: FormData) {
  const user = await requireAdminStrict();
  const parsed = compteSchema.parse(Object.fromEntries(formData.entries()));
  const telephone = normalisePhone(parsed.telephone);

  let clientId: string | null = null;
  if (parsed.role === 'CLIENT') {
    const client = await prisma.client.findFirst({
      where: { id: parsed.clientId ?? '', organisationId: user.organisationId }
    });
    if (!client) throw new Error('Un compte CLIENT doit être rattaché à un client');
    clientId = client.id;
  }

  const conflit = await prisma.user.findFirst({
    where: { OR: [{ email: parsed.email.toLowerCase() }, { telephone }] }
  });
  if (conflit) throw new Error('Email ou téléphone déjà utilisé');

  const compte = await prisma.user.create({
    data: {
      organisationId: user.organisationId,
      role: parsed.role,
      statutProfil: 'ACTIF',
      prenom: parsed.prenom,
      nom: parsed.nom,
      email: parsed.email.toLowerCase(),
      telephone,
      clientId,
      motDePasseHash: await bcrypt.hash(parsed.motDePasse, 10),
      langue: 'FR'
    }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'compte.creer',
    entite: 'User',
    entiteId: compte.id,
    apres: { role: parsed.role, email: parsed.email }
  });
  revalidatePath('/admin/parametres');
}

/** Désactive un compte ADMIN/MANAGER/CLIENT (pas le sien). */
export async function desactiverCompte(formData: FormData) {
  const user = await requireAdminStrict();
  const id = formData.get('id') as string;
  if (id === user.userId) throw new Error('Impossible de désactiver son propre compte');

  const compte = await prisma.user.findFirst({
    where: {
      id,
      organisationId: user.organisationId,
      role: { in: ['ADMIN', 'MANAGER', 'CLIENT'] }
    }
  });
  if (!compte) throw new Error('Compte introuvable');

  await prisma.user.update({ where: { id }, data: { actif: false } });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'compte.desactiver',
    entite: 'User',
    entiteId: id
  });
  revalidatePath('/admin/parametres');
}

/** Tags de compétences (liste gérée ici, utilisée par le vivier). */
export async function ajouterTag(formData: FormData) {
  const user = await requireAdminStrict();
  const libelle = ((formData.get('libelle') as string) || '').trim().toLowerCase();
  if (!libelle) throw new Error('Libellé vide');

  await prisma.competenceTag.upsert({
    where: {
      organisationId_libelle: { organisationId: user.organisationId, libelle }
    },
    update: { actif: true },
    create: { organisationId: user.organisationId, libelle }
  });
  revalidatePath('/admin/parametres');
}

export async function basculerTag(formData: FormData) {
  const user = await requireAdminStrict();
  const id = formData.get('id') as string;
  const tag = await prisma.competenceTag.findFirst({
    where: { id, organisationId: user.organisationId }
  });
  if (!tag) throw new Error('Tag introuvable');
  await prisma.competenceTag.update({
    where: { id },
    data: { actif: !tag.actif }
  });
  revalidatePath('/admin/parametres');
}

// ————— Embauche digitale (phase 18) : modèles de documents + purge —————

const CATEGORIES_MODELE = ['CONTRAT', 'MUTUELLE_ADHESION', 'MUTUELLE_DISPENSE'] as const;

/** Crée ou met à jour un modèle (contrat CDD, bulletins mutuelle) — variables {{cle}}. */
export async function saveModeleContrat(formData: FormData) {
  const user = await requireAdminStrict();
  const id = (formData.get('id') as string) || null;
  const nom = ((formData.get('nom') as string) || '').trim();
  const categorie = formData.get('categorie') as (typeof CATEGORIES_MODELE)[number];
  const contenuTemplate = ((formData.get('contenuTemplate') as string) || '').trim();
  if (!nom) throw new Error('Nom du modèle obligatoire');
  if (!CATEGORIES_MODELE.includes(categorie)) throw new Error('Catégorie invalide');
  if (contenuTemplate.length < 40) throw new Error('Contenu du modèle trop court');

  if (id) {
    const existant = await prisma.modeleContrat.findFirst({
      where: { id, organisationId: user.organisationId }
    });
    if (!existant) throw new Error('Modèle introuvable');
    await prisma.modeleContrat.update({
      where: { id },
      data: { nom, categorie, contenuTemplate }
    });
  } else {
    await prisma.modeleContrat.create({
      data: { organisationId: user.organisationId, nom, categorie, contenuTemplate }
    });
  }
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: id ? 'modele.update' : 'modele.create',
    entite: 'ModeleContrat',
    entiteId: id ?? nom
  });
  revalidatePath('/admin/parametres');
}

export async function basculerModeleContrat(formData: FormData) {
  const user = await requireAdminStrict();
  const id = formData.get('id') as string;
  const modele = await prisma.modeleContrat.findFirst({
    where: { id, organisationId: user.organisationId }
  });
  if (!modele) throw new Error('Modèle introuvable');
  await prisma.modeleContrat.update({ where: { id }, data: { actif: !modele.actif } });
  revalidatePath('/admin/parametres');
}

/**
 * Purge des documents au-delà de la durée de rétention (règle 7) — jamais les
 * dossiers en cours. Action manuelle ADMIN, volontairement pas de cron.
 */
export async function purgerDocumentsAnciens() {
  const user = await requireAdminStrict();
  const org = await prisma.organisation.findUnique({ where: { id: user.organisationId } });
  const p = (org?.parametres as Record<string, unknown>) ?? {};
  const annees =
    Number(p.dureeRetentionDocumentsAnnees) > 0 ? Number(p.dureeRetentionDocumentsAnnees) : 5;
  const seuil = new Date();
  seuil.setFullYear(seuil.getFullYear() - annees);

  const purge = await prisma.documentOuvrier.deleteMany({
    where: {
      organisationId: user.organisationId,
      uploadeAt: { lt: seuil },
      OR: [{ dossierId: null }, { dossier: { statut: { not: 'EN_COURS' } } }]
    }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'document.purge',
    entite: 'DocumentOuvrier',
    entiteId: `>${annees}ans`,
    apres: { supprimes: purge.count, seuil: seuil.toISOString() }
  });
  revalidatePath('/admin/parametres');
}
