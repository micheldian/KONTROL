import Link from 'next/link';
import ErreurBanniere from '@/components/admin/ErreurBanniere';
import { remettreAuVivier } from '../vivier/actions';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const STATUTS_OUVRIERS = ['ACTIF', 'INACTIF'] as const;

export default async function OuvriersPage({
  searchParams
}: {
  searchParams: { q?: string; statut?: string; erreur?: string };
}) {
  const user = await requireAdmin();
  const q = searchParams.q?.trim() ?? '';
  const statut = STATUTS_OUVRIERS.includes(searchParams.statut as never)
    ? (searchParams.statut as 'ACTIF' | 'INACTIF')
    : 'ACTIF';

  const ouvriers = await prisma.user.findMany({
    where: {
      organisationId: user.organisationId,
      role: { in: ['OUVRIER', 'CHEF_EQUIPE'] },
      statutProfil: statut,
      ...(q
        ? {
            OR: [
              { nom: { contains: q, mode: 'insensitive' } },
              { prenom: { contains: q, mode: 'insensitive' } },
              { telephone: { contains: q.replace(/[^\d+]/g, '') || q } }
            ]
          }
        : {})
    },
    orderBy: [{ nom: 'asc' }, { prenom: 'asc' }]
  });

  const org = await prisma.organisation.findUnique({
    where: { id: user.organisationId }
  });
  const tarifBase = Number(org?.tarifHoraireBase ?? 0);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-bold">
          Ouvriers
          <span className="block text-[13px] font-normal text-muted">
            {ouvriers.length} profil{ouvriers.length > 1 ? 's' : ''} · tarif de base{' '}
            {tarifBase.toFixed(2)} €/h
          </span>
        </h1>
      <ErreurBanniere erreur={searchParams.erreur} />
        <div className="flex items-center gap-2">
          <form className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Nom ou téléphone…"
              className="input w-[220px] py-2"
            />
            <input type="hidden" name="statut" value={statut} />
            <button className="btn-sm btn-outline">Chercher</button>
          </form>
          <Link href="/admin/ouvriers/new" className="btn-sm btn-green">
            + Nouvel ouvrier
          </Link>
        </div>
      </div>

      <div className="mb-3 flex gap-2">
        {STATUTS_OUVRIERS.map((s) => (
          <Link
            key={s}
            href={`/admin/ouvriers?statut=${s}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            className={`badge ${s === statut ? 'badge-ok' : 'badge-muted'}`}
          >
            {s === 'ACTIF' ? 'Actifs' : 'Inactifs'}
          </Link>
        ))}
        <Link href="/admin/vivier" className="badge badge-muted">
          Vivier complet →
        </Link>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table-admin">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Téléphone</th>
              <th>Langue</th>
              <th>Taux</th>
              <th>Rôle</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {ouvriers.map((o) => (
              <tr key={o.id}>
                <td className="font-semibold">
                  {o.prenom} {o.nom}
                </td>
                <td className="font-mono text-[13px]">{o.telephone}</td>
                <td>{o.langue}</td>
                <td className="font-mono text-[13px]">
                  {o.tauxHoraire ? `${Number(o.tauxHoraire).toFixed(2)} €/h` : `base`}
                </td>
                <td>
                  {o.estChefEquipe ? (
                    <span className="badge badge-amber">Chef d’équipe</span>
                  ) : (
                    <span className="badge badge-muted">Ouvrier</span>
                  )}
                </td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {o.statutProfil === 'ACTIF' && (
                      <form action={remettreAuVivier}>
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="retour" value="/admin/ouvriers" />
                        <button
                          className="btn-sm btn-outline"
                          title="Fin de mission : retour au vivier (historique et PIN conservés)"
                        >
                          ↩ Vivier
                        </button>
                      </form>
                    )}
                    <Link href={`/admin/ouvriers/${o.id}`} className="btn-sm btn-outline">
                      Fiche
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {ouvriers.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted">
                  Aucun ouvrier {statut === 'ACTIF' ? 'actif' : 'inactif'}
                  {q ? ` pour « ${q} »` : ''}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
