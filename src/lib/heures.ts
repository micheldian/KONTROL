import 'server-only';
import { prisma } from './prisma';
import { chevauche, dureeHeures, toMinutes, dateFromYMD } from './dates';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export type SaisieCreneau = {
  affectationId?: string | null;
  missionId: string;
  heureDebut: string;
  heureFin: string;
  pauseMinutes: number;
};

export function validerCreneauBrut(c: SaisieCreneau) {
  if (!HHMM.test(c.heureDebut) || !HHMM.test(c.heureFin)) {
    throw new Error('Heure invalide (HH:MM)');
  }
  if (toMinutes(c.heureFin) <= toMinutes(c.heureDebut)) {
    throw new Error('L’heure de fin doit être après le début');
  }
  const pause = Math.max(0, Math.round(c.pauseMinutes || 0));
  if (dureeHeures(c.heureDebut, c.heureFin, pause) <= 0) {
    throw new Error('Durée nulle après pause');
  }
  return { ...c, pauseMinutes: pause };
}

/** Contrôle anti-chevauchement (règle métier 4) parmi les créneaux du jour d'un ouvrier. */
export function verifierChevauchements(
  nouveaux: { heureDebut: string; heureFin: string }[],
  existants: { heureDebut: string; heureFin: string }[]
) {
  const tous = [...existants, ...nouveaux];
  for (let i = 0; i < tous.length; i++) {
    for (let j = i + 1; j < tous.length; j++) {
      if (chevauche(tous[i].heureDebut, tous[i].heureFin, tous[j].heureDebut, tous[j].heureFin)) {
        throw new Error(
          `Chevauchement de créneaux : ${tous[i].heureDebut}–${tous[i].heureFin} et ${tous[j].heureDebut}–${tous[j].heureFin}`
        );
      }
    }
  }
}

/** Taux applicable : taux individuel sinon tarif de base de l'organisation (règle 1). */
export async function tauxPourOuvrier(userId: string, organisationId: string): Promise<number> {
  const [u, org] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, organisationId } }),
    prisma.organisation.findUnique({ where: { id: organisationId } })
  ]);
  if (!u) throw new Error('Ouvrier introuvable');
  return Number(u.tauxHoraire ?? org?.tarifHoraireBase ?? 0);
}

/** Crée des créneaux pour un ouvrier après contrôles (chevauchement, mission org, doublon affectation). */
export async function creerCreneaux(params: {
  organisationId: string;
  ouvrierId: string;
  date: string; // YYYY-MM-DD
  saisiParId: string;
  statut?: 'EN_ATTENTE' | 'VALIDE';
  valideParId?: string;
  creneaux: SaisieCreneau[];
}) {
  const propres = params.creneaux.map(validerCreneauBrut);
  if (propres.length === 0) return [];

  const dateDb = dateFromYMD(params.date);
  const existants = await prisma.creneauHeures.findMany({
    where: {
      organisationId: params.organisationId,
      userId: params.ouvrierId,
      date: dateDb
    }
  });

  // Doublon : un créneau déjà saisi pour la même affectation → on ignore la re-saisie
  const dejaSaisies = new Set(existants.map((e) => e.affectationId).filter(Boolean));
  const aCreer = propres.filter(
    (c) => !c.affectationId || !dejaSaisies.has(c.affectationId)
  );
  if (aCreer.length === 0) return [];

  verifierChevauchements(aCreer, existants);

  const missionIds = Array.from(new Set(aCreer.map((c) => c.missionId)));
  const missions = await prisma.mission.findMany({
    where: { id: { in: missionIds }, organisationId: params.organisationId }
  });
  if (missions.length !== missionIds.length) throw new Error('Mission invalide');

  const taux = await tauxPourOuvrier(params.ouvrierId, params.organisationId);
  const statut = params.statut ?? 'EN_ATTENTE';

  const crees = [];
  for (const c of aCreer) {
    crees.push(
      await prisma.creneauHeures.create({
        data: {
          organisationId: params.organisationId,
          userId: params.ouvrierId,
          date: dateDb,
          missionId: c.missionId,
          affectationId: c.affectationId || null,
          heureDebut: c.heureDebut,
          heureFin: c.heureFin,
          pauseMinutes: c.pauseMinutes,
          heuresCalculees: dureeHeures(c.heureDebut, c.heureFin, c.pauseMinutes),
          tauxApplique: taux,
          saisiParId: params.saisiParId,
          statut,
          valideParId: statut === 'VALIDE' ? params.valideParId ?? null : null,
          valideAt: statut === 'VALIDE' ? new Date() : null
        }
      })
    );
  }
  return crees;
}
