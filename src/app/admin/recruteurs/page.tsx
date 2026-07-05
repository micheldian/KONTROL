import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatEuros } from '@/lib/dates';
import ErreurBanniere from '@/components/admin/ErreurBanniere';
import { basculerSuspensionRecruteur } from './actions';

export const dynamic = 'force-dynamic';

// Liste des recruteurs (spec §D.3) : contact, propositions, placements,
// taux de réussite, dû / payé, suspension.
export default async function RecruteursPage({
  searchParams
}: {
  searchParams: { erreur?: string };
}) {
  const user = await requireAdmin();

  const [recruteurs, placements, paiements] = await Promise.all([
    prisma.user.findMany({
      where: { organisationId: user.organisationId, role: 'RECRUTEUR' },
      include: { _count: { select: { propositionsEmises: true } } },
      orderBy: [{ actif: 'desc' }, { nom: 'asc' }]
    }),
    prisma.placement.findMany({
      where: { organisationId: user.organisationId },
      select: { recruteurId: true, commissionStatut: true, commissionMontant: true }
    }),
    prisma.paiementCommission.groupBy({
      by: ['recruteurId'],
      where: { organisationId: user.organisationId },
      _sum: { montant: true }
    })
  ]);

  const totalDuGlobal = placements
    .filter((p) => p.commissionStatut === 'DUE')
    .reduce((s, p) => s + Number(p.commissionMontant), 0);

  const statsDe = (id: string) => {
    const mes = placements.filter((p) => p.recruteurId === id);
    const du = mes
      .filter((p) => p.commissionStatut === 'DUE')
      .reduce((s, p) => s + Number(p.commissionMontant), 0);
    const paye = Number(paiements.find((p) => p.recruteurId === id)?._sum.montant ?? 0);
    return { placements: mes.filter((p) => p.commissionStatut !== 'ANNULEE').length, du, paye };
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-bold">
          Recruteurs & commissions
          <span className="block text-[13px] font-normal text-muted">
            {recruteurs.length} recruteur{recruteurs.length > 1 ? 's' : ''} · total dû{' '}
            {formatEuros(totalDuGlobal)}
          </span>
        </h1>
        <div className="flex flex-wrap gap-1.5">
          <Link href="/admin/demandes" className="btn-sm btn-outline">
            Demandes MO →
          </Link>
          <a href="/api/commissions/export" className="btn-sm btn-outline">
            ⬇ Export CSV
          </a>
        </div>
      </div>

      <ErreurBanniere erreur={searchParams.erreur} />

      <div className="card p-0">
        <div className="hidden gap-3 border-b border-line px-4 py-2 text-[11.5px] font-bold uppercase tracking-wide text-muted md:grid md:grid-cols-[1.6fr_1fr_repeat(5,minmax(0,0.7fr))_auto]">
          <span>Recruteur</span>
          <span>Contact</span>
          <span className="text-right">Propositions</span>
          <span className="text-right">Placements</span>
          <span className="text-right">Réussite</span>
          <span className="text-right">Dû</span>
          <span className="text-right">Payé</span>
          <span />
        </div>
        {recruteurs.map((r) => {
          const s = statsDe(r.id);
          const nbProp = r._count.propositionsEmises;
          const taux = nbProp > 0 ? Math.round((s.placements / nbProp) * 100) : null;
          return (
            <div
              key={r.id}
              className="grid gap-x-3 gap-y-1 border-b border-line px-4 py-3 text-[13.5px] last:border-b-0 md:grid-cols-[1.6fr_1fr_repeat(5,minmax(0,0.7fr))_auto] md:items-center"
            >
              <div>
                <Link href={`/admin/recruteurs/${r.id}`} className="font-bold hover:underline">
                  {r.prenom} {r.nom}
                </Link>
                {r.societe && <span className="ml-1.5 text-[12.5px] text-muted">{r.societe}</span>}
                {!r.actif && <span className="badge badge-warn ml-1.5">suspendu</span>}
              </div>
              <div className="text-[12.5px] text-muted">
                {r.telephone}
                {r.email ? <span className="block">{r.email}</span> : null}
              </div>
              <div className="md:text-right">
                <span className="text-muted md:hidden">Propositions : </span>
                {nbProp}
              </div>
              <div className="md:text-right">
                <span className="text-muted md:hidden">Placements : </span>
                {s.placements}
              </div>
              <div className="md:text-right">
                <span className="text-muted md:hidden">Réussite : </span>
                {taux === null ? '—' : `${taux} %`}
              </div>
              <div className="font-mono md:text-right">
                <span className="font-sans text-muted md:hidden">Dû : </span>
                {s.du > 0 ? <b className="text-warn">{formatEuros(s.du)}</b> : '—'}
              </div>
              <div className="font-mono md:text-right">
                <span className="font-sans text-muted md:hidden">Payé : </span>
                {s.paye > 0 ? formatEuros(s.paye) : '—'}
              </div>
              <div className="flex gap-1.5">
                <Link href={`/admin/recruteurs/${r.id}`} className="btn-sm btn-outline">
                  Fiche
                </Link>
                <form action={basculerSuspensionRecruteur}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className={`btn-sm ${r.actif ? 'text-warn' : 'btn-green'}`}>
                    {r.actif ? 'Suspendre' : 'Réactiver'}
                  </button>
                </form>
              </div>
            </div>
          );
        })}
        {recruteurs.length === 0 && (
          <div className="px-4 py-8 text-center text-muted">
            Aucun recruteur inscrit. Partagez la page publique{' '}
            <span className="font-mono text-[12.5px]">/recruteur/inscription</span>.
          </div>
        )}
      </div>
    </div>
  );
}
