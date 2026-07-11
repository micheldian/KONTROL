'use server';

// Actions du portail recruteur : inscription publique ouverte + proposition de
// candidats (sur demande ou spontanée), dédoublonnage strict par téléphone.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireRecruteur } from '@/lib/session';
import { normalisePhone } from '@/lib/auth';
import { audit } from '@/lib/audit';

const inscriptionSchema = z.object({
  societe: z.string().trim().optional(),
  prenom: z.string().trim().min(1),
  nom: z.string().trim().min(1),
  telephone: z.string().trim().min(6),
  email: z.string().email(),
  motDePasse: z.string().min(8)
});

/** Inscription publique — compte actif immédiatement, suspendable par l'admin (spec §B). */
export async function inscrireRecruteur(formData: FormData) {
  // Langue d'affichage au moment de l'inscription (champ caché posé par la page,
  // getLocale() en secours) → langue du profil, utilisée ensuite pour les
  // notifications Telegram/wa.me des demandes + messages d'erreur traduits.
  const brut = ((formData.get('langueUi') as string) || (await getLocale())).toLowerCase();
  const locale = ['fr', 'ro', 'es'].includes(brut) ? brut : 'fr';
  const langue = locale.toUpperCase() as 'FR' | 'RO' | 'ES';
  const t = await getTranslations({ locale, namespace: 'recruiter' });
  let erreur: string | null = null;
  try {
    const parsed = inscriptionSchema.parse(Object.fromEntries(formData.entries()));
    const telephone = normalisePhone(parsed.telephone);
    const email = parsed.email.toLowerCase().trim();

    // Portail public mono-organisation : première organisation (comme /rejoindre)
    const org = await prisma.organisation.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!org) throw new Error(t('errUnexpected'));

    const conflit = await prisma.user.findFirst({
      where: { OR: [{ email }, { telephone }] }
    });
    if (conflit) throw new Error(t('errExists'));

    const recruteur = await prisma.user.create({
      data: {
        organisationId: org.id,
        role: 'RECRUTEUR',
        statutProfil: 'ACTIF',
        societe: parsed.societe || null,
        prenom: parsed.prenom,
        nom: parsed.nom,
        telephone,
        email,
        motDePasseHash: await bcrypt.hash(parsed.motDePasse, 10),
        langue
      }
    });
    await audit({
      organisationId: org.id,
      userId: recruteur.id,
      action: 'recruteur.inscription',
      entite: 'User',
      entiteId: recruteur.id,
      apres: { societe: parsed.societe, email }
    });
  } catch (e) {
    erreur =
      e instanceof z.ZodError
        ? t('errIncomplete')
        : e instanceof Error
          ? e.message
          : t('errUnexpected');
  }
  redirect(
    erreur
      ? `/recruteur/inscription?erreur=${encodeURIComponent(erreur)}`
      : '/recruteur/login?inscrit=1'
  );
}

const propositionSchema = z.object({
  demandeId: z.string().optional(),
  prenom: z.string().trim().min(1),
  nom: z.string().trim().min(1),
  telephone: z.string().trim().min(6),
  langue: z.enum(['FR', 'RO', 'ES']),
  experienceDeclaree: z.string().trim().optional()
});

/** Proposition de candidat — sur une demande ou spontanée (spec §C.2). */
export async function proposerCandidat(formData: FormData) {
  const recruteur = await requireRecruteur();
  const brutUi = ((formData.get('langueUi') as string) || (await getLocale())).toLowerCase();
  const t = await getTranslations({
    locale: ['fr', 'ro', 'es'].includes(brutUi) ? brutUi : 'fr',
    namespace: 'recruiter'
  });
  let erreur: string | null = null;
  const demandeIdBrut = (formData.get('demandeId') as string) || '';

  try {
    const parsed = propositionSchema.parse(Object.fromEntries(formData.entries()));
    const tagIds = formData.getAll('tagIds').map(String).filter(Boolean);
    const telephone = normalisePhone(parsed.telephone);

    // Le recruteur est suspendable : re-vérifier actif côté base
    const moi = await prisma.user.findFirst({
      where: { id: recruteur.userId, actif: true }
    });
    if (!moi) throw new Error(t('errSuspended'));

    let demandeId: string | null = null;
    if (parsed.demandeId) {
      const demande = await prisma.demandeMainOeuvre.findFirst({
        where: {
          id: parsed.demandeId,
          organisationId: recruteur.organisationId,
          statut: 'OUVERTE'
        }
      });
      if (!demande) throw new Error(t('errClosed'));
      demandeId = demande.id;
    }

    // Dédoublonnage par téléphone (règle 3) : profil connu → doublonDetecte
    const existant = await prisma.user.findFirst({
      where: { telephone, organisationId: recruteur.organisationId }
    });
    if (existant && ['ADMIN', 'MANAGER', 'CLIENT', 'RECRUTEUR'].includes(existant.role)) {
      throw new Error(t('errInternal'));
    }

    const dejaProposee = await prisma.propositionCandidat.findFirst({
      where: {
        organisationId: recruteur.organisationId,
        recruteurId: recruteur.userId,
        statut: 'PROPOSEE',
        candidat: { telephone }
      }
    });
    if (dejaProposee) throw new Error(t('errAlreadyProposed'));

    let candidatId: string;
    let doublonDetecte = false;
    if (existant) {
      candidatId = existant.id;
      doublonDetecte = true;
    } else {
      const tagsValides = await prisma.competenceTag.findMany({
        where: { id: { in: tagIds }, organisationId: recruteur.organisationId, actif: true }
      });
      const candidat = await prisma.user.create({
        data: {
          organisationId: recruteur.organisationId,
          role: 'OUVRIER',
          statutProfil: 'CANDIDAT',
          actif: false,
          prenom: parsed.prenom,
          nom: parsed.nom,
          telephone,
          langue: parsed.langue,
          experienceDeclaree: parsed.experienceDeclaree || null,
          source: 'RECRUTEUR',
          competences: { create: tagsValides.map((t) => ({ tagId: t.id })) }
        }
      });
      candidatId = candidat.id;
    }

    const proposition = await prisma.propositionCandidat.create({
      data: {
        organisationId: recruteur.organisationId,
        demandeId,
        recruteurId: recruteur.userId,
        candidatUserId: candidatId,
        doublonDetecte
      }
    });
    await audit({
      organisationId: recruteur.organisationId,
      userId: recruteur.userId,
      action: 'proposition.create',
      entite: 'PropositionCandidat',
      entiteId: proposition.id,
      apres: { candidatId, demandeId, doublonDetecte }
    });
    revalidatePath('/recruteur/candidats');
    revalidatePath('/admin/candidatures');
  } catch (e) {
    erreur =
      e instanceof z.ZodError
        ? t('errFormIncomplete')
        : e instanceof Error
          ? e.message
          : t('errUnexpected');
  }
  redirect(
    erreur
      ? `/recruteur/proposer?${demandeIdBrut ? `demande=${demandeIdBrut}&` : ''}erreur=${encodeURIComponent(erreur)}`
      : '/recruteur/candidats?ok=1'
  );
}
