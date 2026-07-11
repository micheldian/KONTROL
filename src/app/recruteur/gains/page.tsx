import { getTranslations } from 'next-intl/server';
import { requireRecruteur } from '@/lib/session';
import { gainsRecruteur } from '@/lib/recruteurs';
import { formatDate, formatEuros, ymd } from '@/lib/dates';

export const dynamic = 'force-dynamic';

// « Mes gains » : ticket de caisse du recruteur (spec §C.4).
export default async function MesGainsPage() {
  const user = await requireRecruteur();
  const t = await getTranslations('recruiter');
  const gains = await gainsRecruteur(user.organisationId, user.userId);
  const placementsActifs = gains.placements.filter((p) => p.commissionStatut !== 'ANNULEE');

  return (
    <div className="max-w-[640px]">
      <h1 className="mb-5 text-[21px] font-bold">{t('navEarnings')}</h1>

      {/* Ticket de caisse */}
      <div className="card mb-5 p-5 font-mono text-[14px]">
        <div className="flex justify-between border-b border-dashed border-line pb-2">
          <span>{t('ticketLine', { n: placementsActifs.length })}</span>
          <b>{formatEuros(gains.genere)}</b>
        </div>
        <div className="flex justify-between border-b border-dashed border-line py-2 text-muted">
          <span>{t('alreadyPaid')}</span>
          <span>− {formatEuros(gains.paye)}</span>
        </div>
        <div className="mt-3 flex justify-between rounded-lg bg-ink px-3 py-2.5 text-amber">
          <b>{t('remaining')}</b>
          <b>{formatEuros(gains.du)}</b>
        </div>
      </div>

      {/* Placements */}
      <h2 className="mb-2 text-[15px] font-bold">{t('placements')}</h2>
      <div className="card mb-5 p-0">
        {gains.placements.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 text-[13.5px] last:border-b-0"
          >
            <span className="font-mono text-[12px] text-muted">{formatDate(ymd(p.placeAt))}</span>
            <b className="flex-1">
              {p.candidat.prenom} {p.candidat.nom}
            </b>
            <span className="text-[12.5px] text-muted">{p.demande?.titre ?? t('spontaneousM')}</span>
            <span className="font-mono">{formatEuros(Number(p.commissionMontant))}</span>
            <span
              className={`badge ${
                p.commissionStatut === 'PAYEE'
                  ? 'badge-ok'
                  : p.commissionStatut === 'ANNULEE'
                    ? 'badge-warn'
                    : 'badge-amber'
              }`}
            >
              {p.commissionStatut === 'PAYEE'
                ? t('stPaid')
                : p.commissionStatut === 'ANNULEE'
                  ? `${t('stCancelled')}${p.motifAnnulation ? ` (${p.motifAnnulation})` : ''}`
                  : t('stDue')}
            </span>
          </div>
        ))}
        {gains.placements.length === 0 && (
          <div className="px-4 py-6 text-center text-[13.5px] text-muted">
            {t('noPlacements')}
          </div>
        )}
      </div>

      {/* Paiements */}
      <h2 className="mb-2 text-[15px] font-bold">{t('paymentsTitle')}</h2>
      <div className="card p-0">
        {gains.paiements.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-[13.5px] last:border-b-0"
          >
            <span className="font-mono text-[12px] text-muted">{formatDate(ymd(p.date))}</span>
            <span className="flex-1">
              {p.mode === 'ESPECES' ? t('cash') : t('transfer')}
              {p.note ? ` · ${p.note}` : ''}
            </span>
            <b className="font-mono">{formatEuros(Number(p.montant))}</b>
          </div>
        ))}
        {gains.paiements.length === 0 && (
          <div className="px-4 py-6 text-center text-[13.5px] text-muted">
            {t('noPayments')}
          </div>
        )}
      </div>
    </div>
  );
}
