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

// ─── Propositions des recruteurs (spec §D.2 + règles E) ─────────────────────

import { parametresRecrutement, commissionEligible } from '@/lib/recruteurs';
import { redirect } from 'next/navigation';

/**
 * Accepte un candidat proposé par un recruteur.
 * Règle 4 : si plusieurs propositions PROPOSEE existent pour le même candidat,
 * la PLUS ANCIENNE est créditée (les autres sont refusées « doublon »).
 * Règles 3/5 : commission uniquement si le profil est éligible.
 */
export async function accepterProposition(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  let erreur: string | null = null;

  try {
    const cliquee = await prisma.propositionCandidat.findFirst({
      where: { id, organisationId: user.organisationId, statut: 'PROPOSEE' },
      include: { candidat: true }
    });
    if (!cliquee) throw new Error('Proposition introuvable ou déjà traitée');
    if (cliquee.candidat.statutProfil === 'LISTE_NOIRE') {
      throw new Error('Profil en liste noire — sortez-le d’abord de la liste noire (fiche vivier)');
    }

    // Règle 4 : le premier recruteur (horodatage) est crédité
    const premiere = await prisma.propositionCandidat.findFirst({
      where: {
        organisationId: user.organisationId,
        candidatUserId: cliquee.candidatUserId,
        statut: 'PROPOSEE'
      },
      orderBy: { creeAt: 'asc' },
      include: { demande: true }
    });
    const cible = premiere!;

    const org = await prisma.organisation.findUnique({ where: { id: user.organisationId } });
    const params = parametresRecrutement(org?.parametres);

    // Éligibilité commission AVANT de modifier le profil (règle 3)
    const eligibilite = await commissionEligible({
      organisationId: user.organisationId,
      candidatUserId: cible.candidatUserId,
      doublonDetecte: cible.doublonDetecte,
      delaiRepropositionMois: params.delaiRepropositionMois
    });

    await prisma.propositionCandidat.update({
      where: { id: cible.id },
      data: { statut: 'ACCEPTEE', traiteParId: user.userId, traiteAt: new Date() }
    });
    // Les autres propositions du même candidat → refusées (doublon, règle 4)
    await prisma.propositionCandidat.updateMany({
      where: {
        organisationId: user.organisationId,
        candidatUserId: cible.candidatUserId,
        statut: 'PROPOSEE'
      },
      data: {
        statut: 'REFUSEE',
        motifRefus: 'Candidat déjà proposé plus tôt par un autre recruteur',
        traiteParId: user.userId,
        traiteAt: new Date()
      }
    });
    // Profil CANDIDAT → VIVIER (comme la file publique)
    if (cliquee.candidat.statutProfil === 'CANDIDAT') {
      await prisma.user.update({
        where: { id: cible.candidatUserId },
        data: { statutProfil: 'VIVIER' }
      });
    }

    let placementId: string | null = null;
    if (eligibilite.eligible) {
      const montant = Number(
        cible.demande?.commissionParPlacement ?? params.commissionDefaut
      );
      const placement = await prisma.placement.create({
        data: {
          organisationId: user.organisationId,
          propositionId: cible.id,
          recruteurId: cible.recruteurId,
          candidatUserId: cible.candidatUserId,
          demandeId: cible.demandeId,
          commissionMontant: montant
        }
      });
      placementId = placement.id;
    }

    // Progression : demande POURVUE quand le compte y est
    if (cible.demandeId) {
      const demande = await prisma.demandeMainOeuvre.findUnique({
        where: { id: cible.demandeId },
        include: { propositions: { where: { statut: 'ACCEPTEE' }, select: { id: true } } }
      });
      if (demande && demande.statut === 'OUVERTE' && demande.propositions.length >= demande.nbPersonnes) {
        await prisma.demandeMainOeuvre.update({
          where: { id: demande.id },
          data: { statut: 'POURVUE' }
        });
      }
    }

    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'proposition.accepter',
      entite: 'PropositionCandidat',
      entiteId: cible.id,
      apres: {
        recruteurCredite: cible.recruteurId,
        placementId,
        commission: eligibilite.eligible,
        raison: eligibilite.raison
      }
    });
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inattendue';
  }
  revalidatePath('/admin/candidatures');
  redirect(
    erreur ? `/admin/candidatures?erreur=${encodeURIComponent(erreur)}` : '/admin/candidatures'
  );
}

export async function refuserProposition(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const motif = ((formData.get('motif') as string) || '').trim();

  const proposition = await prisma.propositionCandidat.findFirst({
    where: { id, organisationId: user.organisationId, statut: 'PROPOSEE' }
  });
  if (!proposition) throw new Error('Proposition introuvable');

  await prisma.propositionCandidat.update({
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
    action: 'proposition.refuser',
    entite: 'PropositionCandidat',
    entiteId: id,
    apres: { motif }
  });
  revalidatePath('/admin/candidatures');
}

/** Liste noire depuis une proposition : jamais de commission (règle 5). */
export async function listeNoireProposition(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;

  const proposition = await prisma.propositionCandidat.findFirst({
    where: { id, organisationId: user.organisationId, statut: 'PROPOSEE' }
  });
  if (!proposition) throw new Error('Proposition introuvable');

  const fd = new FormData();
  fd.set('id', proposition.candidatUserId);
  fd.set('motif', (formData.get('motif') as string) || '');
  await mettreListeNoire(fd);

  await prisma.propositionCandidat.update({
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
