import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { moisCourant, bornesMois, dateFromYMD, todayParis, formatEuros, ymd } from '@/lib/dates';
import { enregistrerAcompte, traiterDemande, marquerVerse } from './actions';

export const dynamic = 'force-dynamic';

export default async function AcomptesPage({
  searchParams
}: {
  searchParams: { mois?: string; alerte?: string; ouvrier?: string; gagne?: string; total?: string };
}) {
  const user = await requireAdmin();
  const courant = moisCourant();
  const [annee, mois] = /^\d{4}-\d{2}$/.test(searchParams.mois ?? '')
    ? [Number(searchParams.mois!.slice(0, 4)), Number(searchParams.mois!.slice(5, 7))]
    : [courant.annee, courant.mois];
  const bornes = bornesMois(mois, annee);

  const [demandes, acomptes, ouvriers] = await Promise.all([
    prisma.acompte.findMany({
      where: { organisationId: user.organisationId, statut: 'DEMANDE' },
      include: { user: true },
      orderBy: { demandeAt: 'asc' }
    }),
    prisma.acompte.findMany({
      where: {
        organisationId: user.organisationId,
        statut: { in: ['APPROUVE', 'VERSE', 'REFUSE'] },
        date: { gte: dateFromYMD(bornes.debut), lt: dateFromYMD(bornes.finExclue) }
      },
      include: { user: true },
      orderBy: { date: 'desc' }
    }),
    prisma.user.findMany({
      where: {
        organisationId: user.organisationId,
        role: { in: ['OUVRIER', 'CHEF_EQUIPE'] },
        statutProfil: 'ACTIF'
      },
      orderBy: [{ nom: 'asc' }]
    })
  ]);

  const totalDeduits = acomptes
    .filter((a) => a.statut !== 'REFUSE')
    .reduce((s, a) => s + Number(a.montant), 0);
  const moisStr = `${annee}-${String(mois).padStart(2, '0')}`;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-bold">
          Acomptes
          <span className="block text-[13px] font-normal text-muted">
            {moisStr} · {formatEuros(totalDeduits)} déduits · {demandes.length} demande
            {demandes.length > 1 ? 's' : ''} en attente
          </span>
        </h1>
        <form className="flex items-center gap-2">
          <input type="month" name="mois" defaultValue={moisStr} className="input w-auto py-2" />
          <button className="btn-sm btn-outline">Voir</button>
        </form>
      </div>

      {searchParams.alerte === 'depassement' && (
        <div className="mb-4 rounded-card border-[1.5px] border-[#F3C1A8] bg-[#FFF3EC] px-4 py-3 text-[13.5px]">
          <b className="text-warn">⚠ Garde-fou :</b> les acomptes de{' '}
          <b>{searchParams.ouvrier}</b> atteindraient {searchParams.total} € pour{' '}
          {searchParams.gagne} € gagnés validés ce mois. Cochez «&nbsp;Forcer&nbsp;» pour
          confirmer malgré tout.
        </div>
      )}

      {/* Demandes du portail à traiter */}
      {demandes.length > 0 && (
        <>
          <h2 className="mb-3 text-[16px] font-bold">Demandes à traiter</h2>
          <div className="card mb-6 p-0">
            {demandes.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
              >
                <div className="min-w-[160px] flex-1">
                  <b className="text-[14.5px]">
                    {d.user.prenom} {d.user.nom}
                  </b>
                  <span className="block text-[12.5px] text-muted">
                    demandé le{' '}
                    {d.demandeAt?.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}
                    {d.note ? ` · « ${d.note} »` : ''}
                  </span>
                </div>
                <span className="font-mono text-[16px] font-bold">
                  {formatEuros(Number(d.montant))}
                </span>
                <form action={traiterDemande} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="decision" value="approuver" />
                  <select name="mode" className="input w-auto py-1.5 text-[13px]">
                    <option value="ESPECES">Espèces</option>
                    <option value="VIREMENT">Virement</option>
                  </select>
                  <label className="flex items-center gap-1 text-[12px] text-muted">
                    <input type="checkbox" name="forcer" className="accent-brand" />
                    Forcer
                  </label>
                  <button className="btn-sm btn-green">Approuver</button>
                </form>
                <form action={traiterDemande}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="decision" value="refuser" />
                  <button className="btn-sm text-warn">Refuser</button>
                </form>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Nouveau versement */}
      <h2 className="mb-3 text-[16px] font-bold">Enregistrer un acompte versé</h2>
      <form action={enregistrerAcompte} className="card mb-6 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">Ouvrier</label>
          <select name="ouvrierId" required className="input w-auto py-2">
            {ouvriers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.prenom} {o.nom}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Montant (€)</label>
          <input name="montant" type="number" step="0.01" min={1} required className="input w-[120px] py-2" />
        </div>
        <div>
          <label className="label">Date</label>
          <input name="date" type="date" required defaultValue={todayParis()} className="input w-auto py-2" />
        </div>
        <div>
          <label className="label">Mode</label>
          <select name="mode" className="input w-auto py-2">
            <option value="ESPECES">Espèces</option>
            <option value="VIREMENT">Virement</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="label">Note</label>
          <input name="note" className="input py-2" />
        </div>
        <label className="flex items-center gap-1.5 pb-2 text-[12.5px] text-muted">
          <input type="checkbox" name="forcer" className="accent-brand" />
          Forcer si dépassement
        </label>
        <button className="btn-sm btn-green px-5 py-2.5">Enregistrer</button>
      </form>

      {/* Historique du mois */}
      <h2 className="mb-3 text-[16px] font-bold">Acomptes du mois</h2>
      <div className="card overflow-x-auto p-0">
        <table className="table-admin">
          <thead>
            <tr>
              <th>Date</th>
              <th>Ouvrier</th>
              <th>Montant</th>
              <th>Mode</th>
              <th>Statut</th>
              <th>Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {acomptes.map((a) => (
              <tr key={a.id}>
                <td className="font-mono text-[12.5px]">{ymd(a.date)}</td>
                <td className="font-semibold">
                  {a.user.prenom} {a.user.nom}
                </td>
                <td className="font-mono font-bold">{formatEuros(Number(a.montant))}</td>
                <td className="text-[13px]">{a.mode === 'ESPECES' ? 'Espèces' : a.mode === 'VIREMENT' ? 'Virement' : '—'}</td>
                <td>
                  <span
                    className={`badge ${
                      a.statut === 'VERSE'
                        ? 'badge-ok'
                        : a.statut === 'APPROUVE'
                          ? 'badge-amber'
                          : 'badge-warn'
                    }`}
                  >
                    {a.statut === 'VERSE' ? 'Versé' : a.statut === 'APPROUVE' ? 'Approuvé' : 'Refusé'}
                  </span>
                </td>
                <td className="text-[12.5px] text-muted">{a.note ?? '—'}</td>
                <td className="text-right">
                  {a.statut === 'APPROUVE' && (
                    <form action={marquerVerse}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="btn-sm btn-outline">Marquer versé</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {acomptes.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted">
                  Aucun acompte ce mois.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
