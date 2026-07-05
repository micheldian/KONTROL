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
    delaiAnnulationPlacementJours: Math.round(numOuDefaut('delaiAnnulationPlacementJours', 7))
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
