import 'server-only';
import { prisma } from './prisma';

/** Historique automatique d'un profil, alimenté par Krontrol (spec 4.12). */
export async function historiqueProfil(organisationId: string, userId: string) {
  const [creneaux, confirmations, sejours] = await Promise.all([
    prisma.creneauHeures.findMany({
      where: { organisationId, userId, statut: { in: ['VALIDE', 'CORRIGE'] } },
      include: { mission: { include: { client: true } } }
    }),
    prisma.affectationOuvrier.findMany({
      where: { affectation: { organisationId }, userId },
      select: { confirme: true }
    }),
    prisma.sejourLogement.findMany({
      where: { userId, logement: { organisationId } },
      include: { logement: true },
      orderBy: { dateArrivee: 'desc' }
    })
  ]);

  // Heures par année (saisons travaillées)
  const parAnnee = new Map<number, number>();
  const parMission = new Map<string, { libelle: string; client: string; heures: number }>();
  for (const c of creneaux) {
    const annee = c.date.getUTCFullYear();
    parAnnee.set(annee, (parAnnee.get(annee) ?? 0) + Number(c.heuresCalculees));
    const cle = c.missionId;
    const cur = parMission.get(cle) ?? {
      libelle: c.mission.libelle,
      client: c.mission.client.nom,
      heures: 0
    };
    cur.heures += Number(c.heuresCalculees);
    parMission.set(cle, cur);
  }

  const saisons = Array.from(parAnnee.entries())
    .map(([annee, heures]) => ({ annee, heures: Math.round(heures * 100) / 100 }))
    .sort((a, b) => b.annee - a.annee);

  const missions = Array.from(parMission.values()).sort((a, b) => b.heures - a.heures);

  const totalAff = confirmations.length;
  const confirmees = confirmations.filter((c) => c.confirme).length;

  const logements = Array.from(new Set(sejours.map((s) => s.logement.nom)));

  return {
    saisons,
    missions,
    tauxConfirmation: totalAff > 0 ? Math.round((confirmees / totalAff) * 100) : null,
    totalAffectations: totalAff,
    logements,
    derniereSaison: saisons[0]?.annee ?? null
  };
}
