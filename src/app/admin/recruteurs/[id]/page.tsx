import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { gainsRecruteur, parametresRecrutement } from '@/lib/recruteurs';
import { formatDate, formatEuros, todayParis, ymd } from '@/lib/dates';
import ErreurBanniere from '@/components/admin/ErreurBanniere';
import { basculerSuspensionRecruteur, payerCommission, annulerPlacement } from '../actions';

export const dynamic = 'force-dynamic';

const STATUT_PROP: Record<string, { cls: string; txt: string }> = {
  PROPOSEE: { cls: 'badge-amber', txt: 'en attente' },
  ACCEPTEE: { cls: 'badge-ok', txt: 'acceptée' },
  REFUSEE: { cls: 'badge-muted', txt: 'refusée' }
};

// Fiche recruteur : gains, placements (annulation sous délai), paiement de
// commission, historique des propositions (spec §D.3, règles E.6-7).
export default async function FicheRecruteurPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { erreur?: string };
}) {
  const user = await requireAdmin();

  const [recruteur, org] = await Promise.all([
    prisma.user.findFirst({
      where: { id: params.id, organisationId: user.organisationId, role: 'RECRUTEUR' }
    }),
    prisma.organisation.findUnique({ where: { id: user.organisationId } })
  ]);
  if (!recruteur) notFound();

  const [gains, propositions] = await Promise.all([
    gainsRecruteur(user.organisationId, recruteur.id),
    prisma.propositionCandidat.findMany({
      where: { organisationId: user.organisationId, recruteurId: recruteur.id },
      include: {
        candidat: { select: { prenom: true, nom: true, telephone: true } },
        demande: { select: { titre: true } }
      },
      orderBy: { creeAt: 'desc' },
      take: 30
    })
  ]);
  const reglesAnnulation = parametresRecrutement(org?.parametres);

  return (
    <div className="max-w-[860px]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-bold">
          {recruteur.prenom} {recruteur.nom}
          {recruteur.societe ? ` · ${recruteur.societe}` : ''}
          {!recruteur.actif && <span className="badge badge-warn ml-2 align-middle">suspendu</span>}
          <span className="block text-[13px] font-normal text-muted">
            {recruteur.telephone}
            {recruteur.email ? ` · ${recruteur.email}` : ''} · langue {recruteur.langue} · inscrit
            le {formatDate(ymd(recruteur.createdAt))}
          </span>
        </h1>
        <div className="flex flex-wrap gap-1.5">
          <Link href="/admin/recruteurs" className="btn-sm btn-outline">
            ← Recruteurs
          </Link>
          <form action={basculerSuspensionRecruteur}>
            <input type="hidden" name="id" value={recruteur.id} />
            <button className={`btn-sm ${recruteur.actif ? 'text-warn' : 'btn-green'}`}>
              {recruteur.actif ? 'Suspendre' : 'Réactiver'}
            </button>
          </form>
        </div>
      </div>

      <ErreurBanniere erreur={searchParams.erreur} />

      {/* Gains */}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="card">
          <div className="label">Commissions générées</div>
          <div className="font-mono text-[22px] font-bold">{formatEuros(gains.genere)}</div>
        </div>
        <div className="card">
          <div className="label">Déjà payé</div>
          <div className="font-mono text-[22px] font-bold text-ok">{formatEuros(gains.paye)}</div>
        </div>
        <div className="card bg-ink text-paper">
          <div className="label text-[#A9B5AE]">Reste dû</div>
          <div className="font-mono text-[22px] font-bold text-amber">{formatEuros(gains.du)}</div>
        </div>
      </div>

      {/* Paiement */}
      <h2 className="mb-2 text-[16px] font-bold">Payer une commission</h2>
      <form action={payerCommission} className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="recruteurId" value={recruteur.id} />
        <div>
          <label className="label">Montant €</label>
          <input
            name="montant"
            type="number"
            step="0.01"
            min="0.01"
            required
            className="input w-[120px]"
            defaultValue={gains.du > 0 ? gains.du.toFixed(2) : ''}
          />
        </div>
        <div>
          <label className="label">Date</label>
          <input name="date" type="date" required className="input" defaultValue={todayParis()} />
        </div>
        <div>
          <label className="label">Mode</label>
          <select name="mode" className="input">
            <option value="VIREMENT">Virement</option>
            <option value="ESPECES">Espèces</option>
          </select>
        </div>
        <div className="min-w-[160px] flex-1">
          <label className="label">Note</label>
          <input name="note" className="input" placeholder="Référence…" />
        </div>
        <button className="btn-sm btn-green">💶 Enregistrer le paiement</button>
      </form>

      {/* Placements */}
      <h2 className="mb-2 text-[16px] font-bold">
        Placements
        <span className="ml-2 text-[12.5px] font-normal text-muted">
          annulation possible {reglesAnnulation.delaiAnnulationPlacementJours} jours après le
          placement (règle anti-abus)
        </span>
      </h2>
      <div className="card mb-5 p-0">
        {gains.placements.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 text-[13.5px] last:border-b-0"
          >
            <span className="font-mono text-[12px] text-muted">{formatDate(ymd(p.placeAt))}</span>
            <b className="min-w-[140px] flex-1">
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
                  ? `annulé${p.motifAnnulation ? ` — ${p.motifAnnulation}` : ''}`
                  : 'dû'}
            </span>
            {p.commissionStatut === 'DUE' && (
              <form action={annulerPlacement} className="flex items-center gap-1.5">
                <input type="hidden" name="id" value={p.id} />
                <input
                  name="motif"
                  required
                  className="input h-[34px] w-[180px] text-[12.5px]"
                  placeholder="Motif d’annulation…"
                />
                <button className="btn-sm text-warn">Annuler</button>
              </form>
            )}
          </div>
        ))}
        {gains.placements.length === 0 && (
          <div className="px-4 py-6 text-center text-[13.5px] text-muted">Aucun placement.</div>
        )}
      </div>

      {/* Paiements */}
      <h2 className="mb-2 text-[16px] font-bold">Historique des paiements</h2>
      <div className="card mb-5 p-0">
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
          <div className="px-4 py-6 text-center text-[13.5px] text-muted">Aucun paiement.</div>
        )}
      </div>

      {/* Propositions */}
      <h2 className="mb-2 text-[16px] font-bold">Dernières propositions</h2>
      <div className="card p-0">
        {propositions.map((p) => {
          const b = STATUT_PROP[p.statut] ?? { cls: 'badge-muted', txt: p.statut };
          return (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 text-[13.5px] last:border-b-0"
            >
              <span className="font-mono text-[12px] text-muted">
                {formatDate(ymd(p.creeAt))}
              </span>
              <b className="min-w-[140px] flex-1">
                {p.candidat.prenom} {p.candidat.nom}
                <span className="ml-1.5 font-normal text-muted">{p.candidat.telephone}</span>
              </b>
              <span className="text-[12.5px] text-muted">
                {p.demande?.titre ?? 'proposition spontanée'}
              </span>
              {p.doublonDetecte && <span className="badge badge-muted">doublon</span>}
              <span className={`badge ${b.cls}`}>{b.txt}</span>
              {p.motifRefus && (
                <span className="w-full text-[12px] text-muted">↳ {p.motifRefus}</span>
              )}
            </div>
          );
        })}
        {propositions.length === 0 && (
          <div className="px-4 py-6 text-center text-[13.5px] text-muted">
            Aucune proposition.
          </div>
        )}
      </div>
    </div>
  );
}
