import { requireRecruteur } from '@/lib/session';
import { gainsRecruteur } from '@/lib/recruteurs';
import { formatDate, formatEuros, ymd } from '@/lib/dates';

export const dynamic = 'force-dynamic';

// « Mes gains » : ticket de caisse du recruteur (spec §C.4).
export default async function MesGainsPage() {
  const user = await requireRecruteur();
  const gains = await gainsRecruteur(user.organisationId, user.userId);
  const placementsActifs = gains.placements.filter((p) => p.commissionStatut !== 'ANNULEE');

  return (
    <div className="max-w-[640px]">
      <h1 className="mb-5 text-[21px] font-bold">Mes gains</h1>

      {/* Ticket de caisse */}
      <div className="card mb-5 p-5 font-mono text-[14px]">
        <div className="flex justify-between border-b border-dashed border-line pb-2">
          <span>
            Placements confirmés × commission ({placementsActifs.length})
          </span>
          <b>{formatEuros(gains.genere)}</b>
        </div>
        <div className="flex justify-between border-b border-dashed border-line py-2 text-muted">
          <span>Déjà payé</span>
          <span>− {formatEuros(gains.paye)}</span>
        </div>
        <div className="mt-3 flex justify-between rounded-lg bg-ink px-3 py-2.5 text-amber">
          <b>RESTE DÛ</b>
          <b>{formatEuros(gains.du)}</b>
        </div>
      </div>

      {/* Placements */}
      <h2 className="mb-2 text-[15px] font-bold">Placements</h2>
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
            <span className="text-[12.5px] text-muted">{p.demande?.titre ?? 'spontané'}</span>
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
                ? 'payé'
                : p.commissionStatut === 'ANNULEE'
                  ? `annulé${p.motifAnnulation ? ` (${p.motifAnnulation})` : ''}`
                  : 'dû'}
            </span>
          </div>
        ))}
        {gains.placements.length === 0 && (
          <div className="px-4 py-6 text-center text-[13.5px] text-muted">
            Aucun placement pour l’instant — vos candidats acceptés apparaîtront ici.
          </div>
        )}
      </div>

      {/* Paiements */}
      <h2 className="mb-2 text-[15px] font-bold">Historique des paiements</h2>
      <div className="card p-0">
        {gains.paiements.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-[13.5px] last:border-b-0"
          >
            <span className="font-mono text-[12px] text-muted">{formatDate(ymd(p.date))}</span>
            <span className="flex-1">
              {p.mode === 'ESPECES' ? 'Espèces' : 'Virement'}
              {p.note ? ` · ${p.note}` : ''}
            </span>
            <b className="font-mono">{formatEuros(Number(p.montant))}</b>
          </div>
        ))}
        {gains.paiements.length === 0 && (
          <div className="px-4 py-6 text-center text-[13.5px] text-muted">
            Aucun paiement enregistré.
          </div>
        )}
      </div>
    </div>
  );
}
