'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { normalisePhone } from '@/lib/auth';
import { limiteAtteinte } from '@/lib/rate-limit';

const candidatureSchema = z.object({
  nom: z.string().trim().min(1).max(80),
  prenom: z.string().trim().min(1).max(80),
  telephone: z.string().trim().min(6).max(25),
  langue: z.enum(['FR', 'RO', 'ES']),
  experience: z.string().trim().max(1000).optional(),
  tagIds: z.array(z.string()).max(30),
  // Honeypot : champ invisible, doit rester vide (anti-bot sans captcha)
  siteweb: z.string().max(0, 'SPAM')
});

export type ResultatCandidature =
  | { ok: true; deja?: boolean }
  | { ok: false; erreur: 'RATE' | 'PHONE' | 'CHAMPS' };

/**
 * Candidature publique — canal de recrutement principal.
 * Dédoublonnage par téléphone (règle 11) : numéro existant → candidature rattachée
 * au profil existant, jamais de doublon. Alerte admin si profil liste noire.
 */
export async function envoyerCandidature(input: unknown): Promise<ResultatCandidature> {
  const ip =
    headers().get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers().get('x-real-ip') ||
    'ip-inconnue';
  if (limiteAtteinte(`join:${ip}`, 5, 10 * 60 * 1000)) {
    return { ok: false, erreur: 'RATE' };
  }

  const parsed = candidatureSchema.safeParse(input);
  if (!parsed.success) {
    const spam = parsed.error.issues.some((i) => i.message === 'SPAM');
    // Honeypot rempli → on fait comme si tout allait bien (le bot ne saura rien)
    if (spam) return { ok: true };
    return { ok: false, erreur: 'CHAMPS' };
  }
  const d = parsed.data;

  const telephone = normalisePhone(d.telephone);
  if (!/^\+\d{8,15}$/.test(telephone)) return { ok: false, erreur: 'PHONE' };

  // Portail public mono-organisation : première organisation (Pickajob)
  const org = await prisma.organisation.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!org) return { ok: false, erreur: 'CHAMPS' };

  const tagsValides = await prisma.competenceTag.findMany({
    where: { id: { in: d.tagIds }, organisationId: org.id, actif: true }
  });

  const existant = await prisma.user.findUnique({ where: { telephone } });

  const user =
    existant ??
    (await prisma.user.create({
      data: {
        organisationId: org.id,
        role: 'OUVRIER',
        statutProfil: 'CANDIDAT',
        nom: d.nom,
        prenom: d.prenom,
        telephone,
        langue: d.langue,
        experienceDeclaree: d.experience || null,
        source: 'PORTAIL'
      }
    }));

  if (existant) {
    // Rattachement : on complète l'expérience déclarée sans écraser le profil
    if (d.experience && !existant.experienceDeclaree) {
      await prisma.user.update({
        where: { id: existant.id },
        data: { experienceDeclaree: d.experience }
      });
    }
    const dejaEnAttente = await prisma.candidature.findFirst({
      where: { userId: existant.id, statut: 'EN_ATTENTE' }
    });
    if (dejaEnAttente) return { ok: true, deja: true };
  }

  for (const tag of tagsValides) {
    await prisma.userCompetence.upsert({
      where: { userId_tagId: { userId: user.id, tagId: tag.id } },
      update: {},
      create: { userId: user.id, tagId: tag.id }
    });
  }

  await prisma.candidature.create({
    data: { organisationId: org.id, userId: user.id }
  });

  return { ok: true, deja: !!existant };
}
