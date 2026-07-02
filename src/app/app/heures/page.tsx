import { requireWorker } from '@/lib/session';
import { getTranslations, getLocale } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { todayParis, dateFromYMD, formatJour, bornesMois, moisCourant, ymd, formatHeures } from '@/lib/dates';
import HoursForm from './hours-form';
import TeamForm from './team-form';

export const dynamic = 'force-dynamic';

export default async function HoursPage() {
  const user = await requireWorker();
  const t = await getTranslations('hours');
  const locale = await getLocale();
  const today = todayParis();
  const dateDb = dateFromYMD(today);

  const [affectations, creneauxJour, missionsActives, affectationsChef] =
    await Promise.all([
      prisma.affectationOuvrier.findMany({
        where: {
          userId: user.userId,
          affectation: {
            organisationId: user.organisationId,
            date: dateDb,
            publieAt: { not: null }
          }
        },
        include: {
          affectation: { include: { mission: { include: { client: true } } } }
        },
        orderBy: { affectation: { heureDebut: 'asc' } }
      }),
      prisma.creneauHeures.findMany({
        where: { organisationId: user.organisationId, userId: user.userId, date: dateDb },
        include: { mission: { include: { client: true } } },
        orderBy: { heureDebut: 'asc' }
      }),
      prisma.mission.findMany({
        where: { organisationId: user.organisationId, statut: 'ACTIVE' },
        include: { client: true },
        orderBy: { libelle: 'asc' }
      }),
      user.estChefEquipe
        ? prisma.affectation.findMany({
            where: {
              organisationId: user.organisationId,
              date: dateDb,
              chefEquipeId: user.userId,
              publieAt: { not: null }
            },
            include: {
              mission: { include: { client: true } },
              ouvriers: { include: { user: true } },
              creneaux: true
            },
            orderBy: { heureDebut: 'asc' }
          })
        : Promise.resolve([])
    ]);

  // Historique du mois
  const { mois, annee } = moisCourant();
  const bornes = bornesMois(mois, annee);
  const historique = await prisma.creneauHeures.findMany({
    where: {
      organisationId: user.organisationId,
      userId: user.userId,
      date: { gte: dateFromYMD(bornes.debut), lt: dateFromYMD(bornes.finExclue) }
    },
    include: { mission: { include: { client: true } } },
    orderBy: [{ date: 'desc' }, { heureDebut: 'asc' }]
  });

  const dejaAffectations = new Set(creneauxJour.map((c) => c.affectationId).filter(Boolean));
  const aSaisir = affectations
    .filter((ao) => !dejaAffectations.has(ao.affectation.id))
    .map((ao) => ({
      affectationId: ao.affectation.id,
      missionId: ao.affectation.missionId,
      libelle: `${ao.affectation.mission.client.nom} — ${ao.affectation.mission.libelle}`,
      heureDebut: ao.affectation.heureDebut,
      heureFin: ao.affectation.heureFinPrevue ?? ao.affectation.heureDebut,
      pauseMinutes: ao.affectation.pauseMinutesPrevue ?? 0
    }));

  const labels = {
    start: t('start'),
    end: t('end'),
    pause: t('pause'),
    totalDay: t('totalDay'),
    confirmHours: t('confirmHours'),
    sent: t('sent'),
    sentToast: t('sentToast'),
    addSlot: t('addSlot'),
    chooseMission: t('chooseMission'),
    minutes: t('minutes'),
    error: (await getTranslations('common'))('error')
  };

  return (
    <div>
      <div className="mb-3 mt-2 text-[13px] uppercase tracking-widest text-muted">
        {t('title')} · {formatJour(today, locale)}
      </div>

      {/* Créneaux déjà saisis aujourd'hui */}
      {creneauxJour.map((c) => (
        <div key={c.id} className="card mb-3">
          <div className="flex items-center justify-between">
            <span className="slot-chip">
              {c.heureDebut} → {c.heureFin}
            </span>
            <span
              className={`text-[13px] font-semibold ${
                c.statut === 'VALIDE'
                  ? 'text-ok'
                  : c.statut === 'CORRIGE'
                    ? 'text-[#B07900]'
                    : 'text-warn'
              }`}
            >
              {c.statut === 'VALIDE'
                ? t('validated')
                : c.statut === 'CORRIGE'
                  ? t('corrected')
                  : t('pendingValidation')}
            </span>
          </div>
          <div className="mt-1.5 text-[14px] font-semibold">
            {c.mission.client.nom} — {c.mission.libelle}
          </div>
          <div className="text-[12.5px] text-muted">
            {t('pause')} {c.pauseMinutes} {t('minutes')} ·{' '}
            {formatHeures(Number(c.heuresCalculees))}
          </div>
        </div>
      ))}

      {/* Saisie du jour */}
      {aSaisir.length > 0 || missionsActives.length > 0 ? (
        <HoursForm
          planifies={aSaisir}
          missions={missionsActives.map((m) => ({
            id: m.id,
            libelle: `${m.client.nom} — ${m.libelle}`
          }))}
          labels={labels}
          rienAPlanifier={creneauxJour.length === 0 && aSaisir.length === 0}
          noSlotText={t('noSlotToday')}
        />
      ) : (
        creneauxJour.length === 0 && (
          <div className="card py-8 text-center text-[15px] text-muted">
            {t('noSlotToday')}
          </div>
        )
      )}

      {/* Chef d'équipe : saisie groupée */}
      {affectationsChef.length > 0 && (
        <>
          <div className="mb-3 mt-8 text-[13px] uppercase tracking-widest text-muted">
            {t('myTeam')}
          </div>
          {affectationsChef.map((a) => {
            const dejaSaisis = new Set(a.creneaux.map((c) => c.userId));
            const membres = a.ouvriers
              .filter((o) => !dejaSaisis.has(o.userId))
              .map((o) => ({
                userId: o.userId,
                nom: `${o.user.prenom} ${o.user.nom}`
              }));
            if (membres.length === 0) return null;
            return (
              <TeamForm
                key={a.id}
                affectationId={a.id}
                titre={`${a.mission.client.nom} — ${a.mission.libelle}`}
                membres={membres}
                defauts={{
                  heureDebut: a.heureDebut,
                  heureFin: a.heureFinPrevue ?? a.heureDebut,
                  pauseMinutes: a.pauseMinutesPrevue ?? 0
                }}
                labels={{
                  start: labels.start,
                  end: labels.end,
                  pause: labels.pause,
                  applyToAll: t('applyToAll'),
                  teamEntry: t('teamEntry'),
                  teamSent: t('teamSent'),
                  error: labels.error
                }}
              />
            );
          })}
        </>
      )}

      {/* Historique du mois */}
      {historique.length > 0 && (
        <>
          <div className="mb-3 mt-8 text-[13px] uppercase tracking-widest text-muted">
            {t('history')}
          </div>
          <div className="card p-0">
            {historique.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5 text-[13px] last:border-b-0"
              >
                <span className="font-mono text-[12px] text-muted">
                  {ymd(c.date).slice(8)}/{ymd(c.date).slice(5, 7)}
                </span>
                <span className="flex-1 truncate">{c.mission.client.nom}</span>
                <span className="font-mono font-bold">
                  {formatHeures(Number(c.heuresCalculees))}
                </span>
                <span
                  className={`badge ${
                    c.statut === 'VALIDE'
                      ? 'badge-ok'
                      : c.statut === 'CORRIGE'
                        ? 'badge-amber'
                        : 'badge-warn'
                  }`}
                >
                  {t(`status_${c.statut}`)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
