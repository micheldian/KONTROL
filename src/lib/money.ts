import 'server-only';
import { prisma } from './prisma';
import {
  bornesMois,
  dateFromYMD,
  diffJours,
  todayParis,
  addDays,
  ymd
} from './dates';

// Règles métier :
// 3. Seules les heures VALIDÉ/CORRIGÉ comptent ; EN_ATTENTE affiché à titre indicatif.
// 5. Seuls les acomptes APPROUVE/VERSE sont déduits.
// 6. Logement : arrivée incluse, départ exclu (paramétrable), tous les jours de présence.

export type RecapMois = {
  mois: number;
  annee: number;
  tauxDefaut: number;
  totalHeuresValidees: number;
  totalBrut: number;
  heuresEnAttente: number;
  lignesHeures: { taux: number; heures: number; montant: number }[];
  acomptes: { id: string; date: Date; montant: number; mode: string | null; statut: string }[];
  totalAcomptes: number;
  logement: {
    jours: number;
    total: number;
    sejours: { nom: string; arrivee: string; jours: number; tarifJour: number; total: number }[];
  };
  retenues: { id: string; date: Date; libelle: string; montant: number }[];
  totalRetenues: number;
  net: number;
};

/** Jours de présence d'un séjour dans [debutMois, finExclue) ∩ [arrivée, départ). */
function joursSejour(
  sejour: { dateArrivee: Date; dateDepart: Date | null },
  debut: string,
  finExclue: string,
  departInclus: boolean
): number {
  const arrivee = ymd(sejour.dateArrivee);
  let departExclu: string | null = sejour.dateDepart ? ymd(sejour.dateDepart) : null;
  if (departExclu && departInclus) departExclu = addDays(departExclu, 1);

  const debutEff = arrivee > debut ? arrivee : debut;
  const finEff = departExclu && departExclu < finExclue ? departExclu : finExclue;
  return Math.max(0, diffJours(debutEff, finEff));
}

/**
 * Récapitulatif d'un mois pour un ouvrier.
 * `tempsReel` : borne le logement à aujourd'hui inclus (écran « Mon argent ») ;
 * sinon, mois complet (clôture).
 */
export async function recapMois(params: {
  organisationId: string;
  userId: string;
  mois: number;
  annee: number;
  tempsReel?: boolean;
}): Promise<RecapMois> {
  const { organisationId, userId, mois, annee } = params;
  const { debut, finExclue } = bornesMois(mois, annee);
  const today = todayParis();
  // Fenêtre logement : en temps réel on compte jusqu'à aujourd'hui inclus
  const finLogement =
    params.tempsReel && addDays(today, 1) < finExclue ? addDays(today, 1) : finExclue;

  const [org, creneaux, acomptes, retenues, sejours] = await Promise.all([
    prisma.organisation.findUnique({ where: { id: organisationId } }),
    prisma.creneauHeures.findMany({
      where: {
        organisationId,
        userId,
        date: { gte: dateFromYMD(debut), lt: dateFromYMD(finExclue) }
      }
    }),
    prisma.acompte.findMany({
      where: {
        organisationId,
        userId,
        date: { gte: dateFromYMD(debut), lt: dateFromYMD(finExclue) },
        statut: { in: ['APPROUVE', 'VERSE'] }
      },
      orderBy: { date: 'asc' }
    }),
    prisma.retenue.findMany({
      where: {
        organisationId,
        userId,
        date: { gte: dateFromYMD(debut), lt: dateFromYMD(finExclue) }
      },
      orderBy: { date: 'asc' }
    }),
    prisma.sejourLogement.findMany({
      where: {
        userId,
        logement: { organisationId },
        dateArrivee: { lt: dateFromYMD(finLogement) },
        OR: [{ dateDepart: null }, { dateDepart: { gte: dateFromYMD(debut) } }]
      },
      include: { logement: true }
    })
  ]);

  const tauxDefaut = Number(org?.tarifHoraireBase ?? 0);
  const departInclus = !!(org?.parametres as { regleDepartLogementInclus?: boolean })
    ?.regleDepartLogementInclus;

  // Heures validées, groupées par taux appliqué (en général un seul)
  const parTaux = new Map<number, number>();
  let heuresEnAttente = 0;
  for (const c of creneaux) {
    const h = Number(c.heuresCalculees);
    if (c.statut === 'EN_ATTENTE') {
      heuresEnAttente += h;
    } else {
      const taux = Number(c.tauxApplique ?? tauxDefaut);
      parTaux.set(taux, (parTaux.get(taux) ?? 0) + h);
    }
  }
  const lignesHeures = Array.from(parTaux.entries()).map(([taux, heures]) => ({
    taux,
    heures: Math.round(heures * 100) / 100,
    montant: Math.round(taux * heures * 100) / 100
  }));
  const totalHeuresValidees = lignesHeures.reduce((a, l) => a + l.heures, 0);
  const totalBrut = lignesHeures.reduce((a, l) => a + l.montant, 0);

  const totalAcomptes = acomptes.reduce((a, x) => a + Number(x.montant), 0);
  const totalRetenues = retenues.reduce((a, x) => a + Number(x.montant), 0);

  const sejoursDetail = sejours
    .map((s) => {
      const jours = joursSejour(s, debut, finLogement, departInclus);
      const tarifJour = Number(s.logement.tarifJour);
      return {
        nom: s.logement.nom,
        arrivee: ymd(s.dateArrivee),
        jours,
        tarifJour,
        total: Math.round(jours * tarifJour * 100) / 100
      };
    })
    .filter((s) => s.jours > 0);
  const joursLogement = sejoursDetail.reduce((a, s) => a + s.jours, 0);
  const totalLogement = sejoursDetail.reduce((a, s) => a + s.total, 0);

  const net =
    Math.round((totalBrut - totalAcomptes - totalLogement - totalRetenues) * 100) / 100;

  return {
    mois,
    annee,
    tauxDefaut,
    totalHeuresValidees: Math.round(totalHeuresValidees * 100) / 100,
    totalBrut: Math.round(totalBrut * 100) / 100,
    heuresEnAttente: Math.round(heuresEnAttente * 100) / 100,
    lignesHeures,
    acomptes: acomptes.map((a) => ({
      id: a.id,
      date: a.date,
      montant: Number(a.montant),
      mode: a.mode,
      statut: a.statut
    })),
    totalAcomptes: Math.round(totalAcomptes * 100) / 100,
    logement: { jours: joursLogement, total: Math.round(totalLogement * 100) / 100, sejours: sejoursDetail },
    retenues: retenues.map((r) => ({
      id: r.id,
      date: r.date,
      libelle: r.libelle,
      montant: Number(r.montant)
    })),
    totalRetenues: Math.round(totalRetenues * 100) / 100,
    net
  };
}

/**
 * Garde-fou acomptes (règle 5) : dépassement si (acomptes déduits du mois + nouveau)
 * > montant gagné validé du mois.
 */
export async function verifieDepassementAcompte(params: {
  organisationId: string;
  userId: string;
  montantNouveau: number;
  mois: number;
  annee: number;
}) {
  const recap = await recapMois({
    organisationId: params.organisationId,
    userId: params.userId,
    mois: params.mois,
    annee: params.annee,
    tempsReel: true
  });
  const totalApres = recap.totalAcomptes + params.montantNouveau;
  return {
    gagneValide: recap.totalBrut,
    dejaAcomptes: recap.totalAcomptes,
    totalApres,
    depasse: totalApres > recap.totalBrut
  };
}
