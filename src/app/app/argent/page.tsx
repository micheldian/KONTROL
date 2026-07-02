import { requireWorker } from '@/lib/session';
import { getTranslations, getLocale } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { recapMois } from '@/lib/money';
import { moisCourant, todayParis, formatEuros, formatHeures } from '@/lib/dates';
import AdvanceRequest from './advance-request';

export const dynamic = 'force-dynamic';

const MOIS: Record<string, string[]> = {
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  ro: ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
};

function fmtDate(d: Date) {
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default async function MoneyPage() {
  const user = await requireWorker();
  const t = await getTranslations('money');
  const tc = await getTranslations('common');
  const locale = await getLocale();
  const { mois, annee } = moisCourant();
  const today = todayParis();

  const [recap, demandeEnAttente, clotures] = await Promise.all([
    recapMois({
      organisationId: user.organisationId,
      userId: user.userId,
      mois,
      annee,
      tempsReel: true
    }),
    prisma.acompte.findFirst({
      where: { organisationId: user.organisationId, userId: user.userId, statut: 'DEMANDE' }
    }),
    prisma.clotureMois.findMany({
      where: { organisationId: user.organisationId, userId: user.userId, statut: 'CLOTUREE' },
      orderBy: [{ annee: 'desc' }, { mois: 'desc' }],
      take: 12
    })
  ]);

  const nomMois = MOIS[locale]?.[mois - 1] ?? MOIS.fr[mois - 1];
  const rien =
    recap.totalBrut === 0 &&
    recap.heuresEnAttente === 0 &&
    recap.totalAcomptes === 0 &&
    recap.logement.total === 0 &&
    recap.totalRetenues === 0;

  return (
    <div>
      <div className="mb-3 mt-2 text-[13px] uppercase tracking-widest text-muted">
        {nomMois} {annee} · {t('inProgress')}
      </div>

      {rien ? (
        <div className="card py-8 text-center text-[15px] text-muted">{t('noData')}</div>
      ) : (
        <div className="rounded bg-white px-4.5 p-5 font-mono text-[13.5px] shadow-[0_2px_10px_rgba(20,36,28,.08)]">
          <h4 className="text-center text-[13px] font-bold tracking-[.18em]">KRONTROL</h4>
          <div className="mb-3.5 text-center text-[11.5px] text-muted">
            {user.name} · {t('summaryAt', { date: `${today.slice(8)}/${today.slice(5, 7)}` })}
          </div>

          {/* Heures validées */}
          {recap.lignesHeures.map((l, i) => (
            <div key={i}>
              <div className="flex justify-between py-1">
                <span>{t('validatedHours')}</span>
                <span className="font-bold">
                  {formatHeures(l.heures)} × {l.taux.toFixed(2).replace('.', ',')} €
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span></span>
                <span className="font-bold">= {formatEuros(l.montant)}</span>
              </div>
            </div>
          ))}
          {recap.lignesHeures.length === 0 && (
            <div className="flex justify-between py-1">
              <span>{t('validatedHours')}</span>
              <span className="font-bold">0 h</span>
            </div>
          )}
          {recap.heuresEnAttente > 0 && (
            <div className="flex justify-between py-1 text-[12.5px] text-muted">
              <span>{t('pendingHours')}</span>
              <span>{formatHeures(recap.heuresEnAttente)}</span>
            </div>
          )}

          <div className="my-2.5 border-t-[1.5px] border-dashed border-line" />

          {/* Acomptes */}
          {recap.totalAcomptes > 0 && (
            <>
              <div className="flex justify-between py-1">
                <span>{t('advances')}</span>
                <span className="font-bold text-warn">− {formatEuros(recap.totalAcomptes)}</span>
              </div>
              <div className="text-[12px] text-muted">
                {recap.acomptes.map((a) => `${fmtDate(a.date)} : ${formatEuros(a.montant)}`).join(' · ')}
              </div>
            </>
          )}

          {/* Logement */}
          {recap.logement.total > 0 && (
            <>
              <div className="flex justify-between py-1">
                <span>
                  {t('housing', {
                    days: recap.logement.jours,
                    rate: recap.logement.sejours[0]?.tarifJour ?? ''
                  })}
                </span>
                <span className="font-bold text-warn">− {formatEuros(recap.logement.total)}</span>
              </div>
              {recap.logement.sejours.map((s, i) => (
                <div key={i} className="text-[12px] text-muted">
                  {s.nom} · {t('arrivedOn', { date: `${s.arrivee.slice(8)}/${s.arrivee.slice(5, 7)}` })}
                </div>
              ))}
            </>
          )}

          {/* Retenues */}
          {recap.totalRetenues > 0 && (
            <>
              <div className="flex justify-between py-1">
                <span>{t('deductions')}</span>
                <span className="font-bold text-warn">− {formatEuros(recap.totalRetenues)}</span>
              </div>
              <div className="text-[12px] text-muted">
                {recap.retenues
                  .map((r) => `${r.libelle} ${fmtDate(r.date)} : ${formatEuros(r.montant)}`)
                  .join(' · ')}
              </div>
            </>
          )}

          <div className="my-2.5 border-t-[1.5px] border-dashed border-line" />

          <div className="mt-2 flex items-center justify-between rounded-lg bg-ink px-3.5 py-3 text-amber">
            <span className="text-[11.5px] tracking-widest">{t('netToReceive')}</span>
            <span className="text-[20px] font-bold">{formatEuros(recap.net)}</span>
          </div>
        </div>
      )}

      {/* Demande d'acompte */}
      {demandeEnAttente ? (
        <div className="card mt-4 py-4 text-center text-[14px] font-semibold text-[#B07900]">
          {t('advancePending', { amount: formatEuros(Number(demandeEnAttente.montant)) })}
        </div>
      ) : (
        <AdvanceRequest
          labels={{
            askAdvance: t('askAdvance'),
            advanceAmount: t('advanceAmount'),
            advanceReason: t('advanceReason'),
            advanceSend: t('advanceSend'),
            advanceSent: t('advanceSent'),
            error: tc('error')
          }}
        />
      )}

      {/* Mois clôturés */}
      {clotures.length > 0 && (
        <>
          <div className="mb-3 mt-7 text-[13px] uppercase tracking-widest text-muted">
            {t('closedMonths')}
          </div>
          <div className="card p-0">
            {clotures.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <span className="flex-1 text-[14px] font-semibold">
                  {(MOIS[locale] ?? MOIS.fr)[c.mois - 1]} {c.annee}
                </span>
                <span className="font-mono text-[14px] font-bold">
                  {formatEuros(Number(c.netAVerser))}
                </span>
                <a
                  href={`/api/clotures/${c.id}/pdf`}
                  className="btn-sm btn-outline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('downloadPdf')}
                </a>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
