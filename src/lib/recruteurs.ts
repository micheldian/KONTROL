// Module Recruteurs (phase 17) — règles de commission anti-abus (spec §E) :
//  1. commission fixe par placement (défaut org, surchargeable par demande)
//  2. placement = proposition acceptée par l'admin → commission DUE
//  3. pas de commission si le téléphone était déjà connu de l'organisation,
//     SAUF profil INACTIF sans activité depuis plus de delaiRepropositionMois
//  4. deux recruteurs proposent le même candidat → le premier (horodatage) crédité
//  5. refusé / liste noire → jamais de commission
//  6. annulation possible dans delaiAnnulationPlacementJours (défaut 7)

import 'server-only';
import { prisma } from '@/lib/prisma';

export type ParametresRecrutement = {
  commissionDefaut: number;
  delaiRepropositionMois: number;
  delaiAnnulationPlacementJours: number;
};

export function parametresRecrutement(parametres: unknown): ParametresRecrutement {
  const p = (parametres as Record<string, unknown>) ?? {};
  return {
    commissionDefaut: Number(p.commissionDefaut) > 0 ? Number(p.commissionDefaut) : 100,
    delaiRepropositionMois:
      Number(p.delaiRepropositionMois) > 0 ? Number(p.delaiRepropositionMois) : 12,
    delaiAnnulationPlacementJours:
      Number(p.delaiAnnulationPlacementJours) > 0 ? Number(p.delaiAnnulationPlacementJours) : 7
  };
}

/**
 * Règle 3 : une proposition marquée doublon peut quand même être commissionnée
 * si le profil existant est INACTIF sans activité (créneau/affectation) depuis
 * plus de delaiRepropositionMois.
 */
export async function commissionEligible(params: {
  organisationId: string;
  candidatUserId: string;
  doublonDetecte: boolean;
  delaiRepropositionMois: number;
}): Promise<{ eligible: boolean; raison: string }> {
  if (!params.doublonDetecte) {
    return { eligible: true, raison: 'nouveau profil apporté par le recruteur' };
  }

  const candidat = await prisma.user.findFirst({
    where: { id: params.candidatUserId, organisationId: params.organisationId }
  });
  if (!candidat) return { eligible: false, raison: 'profil introuvable' };
  if (candidat.statutProfil === 'LISTE_NOIRE') {
    return { eligible: false, raison: 'profil en liste noire' };
  }
  if (candidat.statutProfil !== 'INACTIF') {
    return {
      eligible: false,
      raison: `profil déjà connu (${candidat.statutProfil.toLowerCase()})`
    };
  }

  const [dernierCreneau, derniereAffectation] = await Promise.all([
    prisma.creneauHeures.findFirst({
      where: { organisationId: params.organisationId, userId: params.candidatUserId },
      orderBy: { date: 'desc' },
      select: { date: true }
    }),
    prisma.affectationOuvrier.findFirst({
      where: {
        userId: params.candidatUserId,
        affectation: { organisationId: params.organisationId }
      },
      orderBy: { affectation: { date: 'desc' } },
      select: { affectation: { select: { date: true } } }
    })
  ]);
  const derniereActivite = [
    dernierCreneau?.date,
    derniereAffectation?.affectation.date,
    candidat.createdAt
  ]
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const seuil = new Date();
  seuil.setMonth(seuil.getMonth() - params.delaiRepropositionMois);
  if (derniereActivite < seuil) {
    return {
      eligible: true,
      raison: `profil inactif depuis plus de ${params.delaiRepropositionMois} mois`
    };
  }
  return {
    eligible: false,
    raison: `profil inactif depuis moins de ${params.delaiRepropositionMois} mois`
  };
}

/** Gains d'un recruteur : généré (placements non annulés), payé, reste dû. */
export async function gainsRecruteur(organisationId: string, recruteurId: string) {
  const [placements, paiements] = await Promise.all([
    prisma.placement.findMany({
      where: { organisationId, recruteurId },
      include: {
        candidat: { select: { prenom: true, nom: true } },
        demande: { select: { titre: true } }
      },
      orderBy: { placeAt: 'desc' }
    }),
    prisma.paiementCommission.findMany({
      where: { organisationId, recruteurId },
      orderBy: { date: 'desc' }
    })
  ]);
  const genere = placements
    .filter((p) => p.commissionStatut !== 'ANNULEE')
    .reduce((s, p) => s + Number(p.commissionMontant), 0);
  const paye = paiements.reduce((s, p) => s + Number(p.montant), 0);
  return {
    placements,
    paiements,
    genere: Math.round(genere * 100) / 100,
    paye: Math.round(paye * 100) / 100,
    du: Math.round((genere - paye) * 100) / 100
  };
}
