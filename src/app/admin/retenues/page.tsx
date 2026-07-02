import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { moisCourant, bornesMois, dateFromYMD, todayParis, formatEuros, ymd } from '@/lib/dates';
import { creerRetenue, supprimerRetenue } from './actions';

export const dynamic = 'force-dynamic';

const LIBELLES_COURANTS = ['Transport', 'Repas', 'Matériel', 'Autre'];

export default async function RetenuesPage({
  searchParams
}: {
  searchParams: { mois?: string };
}) {
  const user = await requireAdmin();
  const courant = moisCourant();
  const [annee, mois] = /^\d{4}-\d{2}$/.test(searchParams.mois ?? '')
    ? [Number(searchParams.mois!.slice(0, 4)), Number(searchParams.mois!.slice(5, 7))]
    : [courant.annee, courant.mois];
  const bornes = bornesMois(mois, annee);
  const moisStr = `${annee}-${String(mois).padStart(2, '0')}`;

  const [retenues, ouvriers] = await Promise.all([
    prisma.retenue.findMany({
      where: {
        organisationId: user.organisationId,
        date: { gte: dateFromYMD(bornes.debut), lt: dateFromYMD(bornes.finExclue) }
      },
      include: { user: true },
      orderBy: { date: 'desc' }
    }),
    prisma.user.findMany({
      where: {
        organisationId: user.organisationId,
        role: { in: ['OUVRIER', 'CHEF_EQUIPE'] }
      },
      orderBy: [{ nom: 'asc' }]
    })
  ]);

  const total = retenues.reduce((s, r) => s + Number(r.montant), 0);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-bold">
          Retenues diverses
          <span className="block text-[13px] font-normal text-muted">
            {moisStr} · {retenues.length} ligne{retenues.length > 1 ? 's' : ''} ·{' '}
            {formatEuros(total)}
          </span>
        </h1>
        <form className="flex items-center gap-2">
          <input type="month" name="mois" defaultValue={moisStr} className="input w-auto py-2" />
          <button className="btn-sm btn-outline">Voir</button>
        </form>
      </div>

      <form action={creerRetenue} className="card mb-6 flex flex-wrap items-end gap-3 p-4">
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
          <label className="label">Libellé</label>
          <input name="libelle" required list="libelles" className="input w-[160px] py-2" placeholder="Transport…" />
          <datalist id="libelles">
            {LIBELLES_COURANTS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label">Montant (€)</label>
          <input name="montant" type="number" step="0.01" min={0.01} required className="input w-[110px] py-2" />
        </div>
        <div>
          <label className="label">Date</label>
          <input name="date" type="date" required defaultValue={todayParis()} className="input w-auto py-2" />
        </div>
        <div className="flex-1">
          <label className="label">Note</label>
          <input name="note" className="input py-2" />
        </div>
        <button className="btn-sm btn-green px-5 py-2.5">Ajouter</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="table-admin">
          <thead>
            <tr>
              <th>Date</th>
              <th>Ouvrier</th>
              <th>Libellé</th>
              <th>Montant</th>
              <th>Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {retenues.map((r) => (
              <tr key={r.id}>
                <td className="font-mono text-[12.5px]">{ymd(r.date)}</td>
                <td className="font-semibold">
                  {r.user.prenom} {r.user.nom}
                </td>
                <td>{r.libelle}</td>
                <td className="font-mono font-bold">{formatEuros(Number(r.montant))}</td>
                <td className="text-[12.5px] text-muted">{r.note ?? '—'}</td>
                <td className="text-right">
                  <form action={supprimerRetenue}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn-sm text-warn">Supprimer</button>
                  </form>
                </td>
              </tr>
            ))}
            {retenues.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted">
                  Aucune retenue ce mois.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
