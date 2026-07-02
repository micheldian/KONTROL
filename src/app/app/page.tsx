import { requireWorker } from '@/lib/session';
import { getTranslations, getLocale } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { todayParis, addDays, dateFromYMD, formatJour } from '@/lib/dates';
import ConfirmButton from './confirm-button';

export const dynamic = 'force-dynamic';

async function affectationsDuJour(userId: string, organisationId: string, date: string) {
  return prisma.affectationOuvrier.findMany({
    where: {
      userId,
      affectation: {
        organisationId,
        date: dateFromYMD(date),
        publieAt: { not: null }
      }
    },
    include: {
      affectation: {
        include: {
          mission: { include: { client: true } },
          parcelle: true
        }
      }
    },
    orderBy: { affectation: { heureDebut: 'asc' } }
  });
}

function mapsUrl(adresse: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse)}`;
}

export default async function TodayPage() {
  const user = await requireWorker();
  const t = await getTranslations('today');
  const locale = await getLocale();
  const today = todayParis();
  const demain = addDays(today, 1);

  const [dAujourdhui, dDemain] = await Promise.all([
    affectationsDuJour(user.userId, user.organisationId, today),
    affectationsDuJour(user.userId, user.organisationId, demain)
  ]);

  const renderCard = (ao: (typeof dAujourdhui)[number], confirmable: boolean) => {
    const a = ao.affectation;
    const adresse = a.parcelle?.adresse ?? a.mission.client.adresse ?? '';
    return (
      <div key={ao.id} className="card mb-3.5">
        <span className="slot-chip mb-2.5">
          {a.heureDebut}
          {a.heureFinPrevue ? ` → ${a.heureFinPrevue}` : ''}
        </span>
        <h3 className="text-[18px] font-bold">{a.mission.client.nom}</h3>
        <div className="mb-1 mt-1 text-[14px] text-muted">
          {a.mission.libelle}
          {a.pauseMinutesPrevue ? ` · ${t('pause', { min: a.pauseMinutesPrevue })}` : ''}
        </div>
        {adresse && <div className="mb-2 text-[14px] text-muted">📍 {adresse}</div>}
        {a.instructions && (
          <div className="mb-3 rounded-r-lg border-l-[3px] border-amber bg-[#FFF7E3] px-2.5 py-2 text-[13.5px]">
            {a.instructions}
          </div>
        )}
        <div className="flex gap-2.5">
          {adresse && (
            <a
              href={mapsUrl(adresse)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ink flex-1"
            >
              {t('route')}
            </a>
          )}
          {confirmable && (
            <ConfirmButton
              affectationOuvrierId={ao.id}
              confirme={ao.confirme}
              labels={{ beThere: t('beThere'), confirmed: t('confirmed'), toast: t('confirmedToast') }}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="mb-3 mt-2 text-[13px] uppercase tracking-widest text-muted">
        {t('title')} · {formatJour(today, locale)}
      </div>
      {dAujourdhui.length === 0 ? (
        <div className="card py-8 text-center text-[15px] text-muted">
          {t('noMission')}
        </div>
      ) : (
        dAujourdhui.map((ao) => renderCard(ao, true))
      )}

      {dDemain.length > 0 && (
        <>
          <div className="mb-3 mt-7 text-[13px] uppercase tracking-widest text-muted">
            {t('tomorrow')} · {formatJour(demain, locale)}
          </div>
          {dDemain.map((ao) => renderCard(ao, true))}
        </>
      )}
    </div>
  );
}
