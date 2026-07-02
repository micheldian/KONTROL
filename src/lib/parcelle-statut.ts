// Statut de la dernière intervention par parcelle — bordure des polygones sur la
// carte (gris = aucune, orange = planifiée/envoyée, vert = terminée) et portail client.

import 'server-only';
import { prisma } from '@/lib/prisma';
import { todayParis, ymd } from '@/lib/dates';

export type StatutParcelle = 'AUCUNE' | 'PLANIFIEE' | 'EN_COURS' | 'TERMINEE';

export type InfoStatutParcelle = {
  statut: StatutParcelle;
  derniereDate: string | null; // YYYY-MM-DD
  typeTravaux: string | null;
};

export const COULEUR_STATUT: Record<StatutParcelle, string> = {
  AUCUNE: '#9AA5A0',
  PLANIFIEE: '#F59E0B',
  EN_COURS: '#F59E0B',
  TERMINEE: '#2E7D32'
};

/** Calcule le statut de la dernière affectation de chaque parcelle (une requête). */
export async function statutsParcelles(
  parcelleIds: string[],
  organisationId: string
): Promise<Record<string, InfoStatutParcelle>> {
  const resultat: Record<string, InfoStatutParcelle> = {};
  for (const id of parcelleIds) {
    resultat[id] = { statut: 'AUCUNE', derniereDate: null, typeTravaux: null };
  }
  if (parcelleIds.length === 0) return resultat;

  const liens = await prisma.affectationParcelle.findMany({
    where: { parcelleId: { in: parcelleIds }, affectation: { organisationId } },
    include: {
      affectation: { select: { date: true, publieAt: true, mission: { select: { typeTravaux: true } } } }
    },
    orderBy: { affectation: { date: 'desc' } }
  });

  const today = todayParis();
  for (const lien of liens) {
    const info = resultat[lien.parcelleId];
    if (!info || info.derniereDate) continue; // on garde la plus récente (tri desc)
    const date = ymd(lien.affectation.date);
    info.derniereDate = date;
    info.typeTravaux = lien.affectation.mission.typeTravaux ?? null;
    info.statut = date > today ? 'PLANIFIEE' : date === today ? 'EN_COURS' : 'TERMINEE';
  }
  return resultat;
}
