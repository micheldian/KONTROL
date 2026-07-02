import 'server-only';
import { prisma } from './prisma';
import { todayParis, dateFromYMD, moisCourant } from './dates';
import { recapMois } from './money';

/** « Personne en interne pas au travail » : logés aujourd'hui sans affectation aujourd'hui. */
export async function logesSansAffectation(organisationId: string, date = todayParis()) {
  const d = dateFromYMD(date);
  const sejours = await prisma.sejourLogement.findMany({
    where: {
      logement: { organisationId },
      dateArrivee: { lte: d },
      OR: [{ dateDepart: null }, { dateDepart: { gt: d } }],
      user: { statutProfil: 'ACTIF' }
    },
    include: { user: true, logement: true }
  });
  if (sejours.length === 0) return [];

  const affectes = await prisma.affectationOuvrier.findMany({
    where: {
      userId: { in: sejours.map((s) => s.userId) },
      affectation: { organisationId, date: d }
    },
    select: { userId: true }
  });
  const idsAffectes = new Set(affectes.map((a) => a.userId));
  return sejours
    .filter((s) => !idsAffectes.has(s.userId))
    .map((s) => ({
      userId: s.userId,
      nom: `${s.user.prenom} ${s.user.nom}`,
      telephone: s.user.telephone,
      logement: s.logement.nom
    }));
}

/** Ouvriers affectés (publié) un jour donné sans aucune heure saisie ce jour. */
export async function heuresNonSaisies(organisationId: string, date = todayParis()) {
  const d = dateFromYMD(date);
  const affectes = await prisma.affectationOuvrier.findMany({
    where: {
      affectation: { organisationId, date: d, publieAt: { not: null } }
    },
    include: { user: true },
    distinct: ['userId']
  });
  if (affectes.length === 0) return [];

  const saisis = await prisma.creneauHeures.findMany({
    where: { organisationId, date: d, userId: { in: affectes.map((a) => a.userId) } },
    select: { userId: true },
    distinct: ['userId']
  });
  const idsSaisis = new Set(saisis.map((s) => s.userId));
  return affectes
    .filter((a) => !idsSaisis.has(a.userId))
    .map((a) => ({
      userId: a.userId,
      nom: `${a.user.prenom} ${a.user.nom}`,
      telephone: a.user.telephone,
      langue: a.user.langue,
      telegramChatId: a.user.telegramChatId
    }));
}

/** Ouvriers dont les acomptes du mois dépassent le gagné validé (règle 5). */
export async function acomptesDepassements(organisationId: string) {
  const { mois, annee } = moisCourant();
  const avecAcomptes = await prisma.acompte.groupBy({
    by: ['userId'],
    where: {
      organisationId,
      statut: { in: ['APPROUVE', 'VERSE'] },
      date: {
        gte: dateFromYMD(`${annee}-${String(mois).padStart(2, '0')}-01`),
        lt: dateFromYMD(
          mois === 12 ? `${annee + 1}-01-01` : `${annee}-${String(mois + 1).padStart(2, '0')}-01`
        )
      }
    },
    _sum: { montant: true }
  });

  const resultats: { userId: string; nom: string; acomptes: number; gagne: number }[] = [];
  for (const a of avecAcomptes) {
    const recap = await recapMois({
      organisationId,
      userId: a.userId,
      mois,
      annee,
      tempsReel: true
    });
    if (recap.totalAcomptes > recap.totalBrut) {
      const u = await prisma.user.findUnique({ where: { id: a.userId } });
      resultats.push({
        userId: a.userId,
        nom: u ? `${u.prenom} ${u.nom}` : a.userId,
        acomptes: recap.totalAcomptes,
        gagne: recap.totalBrut
      });
    }
  }
  return resultats;
}

/** Synthèse du jour pour le dashboard. */
export async function syntheseDuJour(organisationId: string) {
  const date = todayParis();
  const d = dateFromYMD(date);
  const { mois, annee } = moisCourant();

  const [affectationsJour, missionsActives, demandesAcompte, candidatures, listeNoireCandidatures] =
    await Promise.all([
      prisma.affectationOuvrier.findMany({
        where: { affectation: { organisationId, date: d, publieAt: { not: null } } },
        select: { confirme: true }
      }),
      prisma.mission.count({ where: { organisationId, statut: 'ACTIVE' } }),
      prisma.acompte.count({ where: { organisationId, statut: 'DEMANDE' } }),
      prisma.candidature.count({ where: { organisationId, statut: 'EN_ATTENTE' } }),
      prisma.candidature.count({
        where: {
          organisationId,
          statut: 'EN_ATTENTE',
          user: { statutProfil: 'LISTE_NOIRE' }
        }
      })
    ]);

  const [sansAffectation, sansHeures, depassements] = await Promise.all([
    logesSansAffectation(organisationId, date),
    heuresNonSaisies(organisationId, date),
    acomptesDepassements(organisationId)
  ]);

  return {
    date,
    mois,
    annee,
    missionsActives,
    confirmations: {
      total: affectationsJour.length,
      confirmees: affectationsJour.filter((a) => a.confirme).length
    },
    sansAffectation,
    sansHeures,
    depassements,
    demandesAcompte,
    candidatures,
    listeNoireCandidatures
  };
}
