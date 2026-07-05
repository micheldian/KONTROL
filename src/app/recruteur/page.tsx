import Link from 'next/link';
import { requireRecruteur } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatDate, formatEuros, ymd } from '@/lib/dates';

export const dynamic = 'force-dynamic';

// Demandes ouvertes avec toutes les informations + commission + progression (spec §C.1).
export default async function DemandesOuvertesPage() {
  const user = await requireRecruteur();

  const demandes = await prisma.demandeMainOeuvre.findMany({
    where: { organisationId: user.organisationId, statut: 'OUVERTE' },
    include: {
      competences: { include: { tag: true } },
      propositions: { where: { statut: 'ACCEPTEE' }, select: { id: true } }
    },
    orderBy: { dateDebut: 'asc' }
  });

  return (
    <div>
      <h1 className="mb-5 text-[21px] font-bold">
        Demandes de main-d’œuvre ouvertes
        <span className="block text-[13px] font-normal text-muted">
          Proposez vos candidats — commission fixe versée pour chaque personne placée
        </span>
      </h1>

      <div className="space-y-3">
        {demandes.map((d) => {
          const pourvus = d.propositions.length;
          return (
            <div key={d.id} className="card">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-[240px] flex-1">
                  <b className="text-[16px]">{d.titre}</b>
                  <div className="mt-1 text-[13.5px] text-muted">
                    👥 {d.nbPersonnes} personne{d.nbPersonnes > 1 ? 's' : ''} · 📅{' '}
                    {formatDate(ymd(d.dateDebut))}
                    {d.dateFin ? ` → ${formatDate(ymd(d.dateFin))}` : ''}
                    {d.region ? ` · 📍 ${d.region}` : ''}
                  </div>
                  {d.competences.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {d.competences.map((c) => (
                        <span key={c.id} className="badge badge-muted">
                          {c.tag.libelle}
                        </span>
                      ))}
                    </div>
                  )}
                  {d.description && (
                    <p className="mt-2 text-[13.5px]">{d.description}</p>
                  )}
                  {d.conditions && (
                    <p className="mt-1 text-[13px] text-muted">Conditions : {d.conditions}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="badge badge-ok text-[13px]">
                    💰 {formatEuros(Number(d.commissionParPlacement))} / placement
                  </span>
                  <span
                    className={`badge ${pourvus >= d.nbPersonnes ? 'badge-ok' : 'badge-amber'}`}
                  >
                    {pourvus}/{d.nbPersonnes} pourvus
                  </span>
                  <Link
                    href={`/recruteur/proposer?demande=${d.id}`}
                    className="btn-sm btn-green"
                  >
                    ➕ Proposer un candidat
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
        {demandes.length === 0 && (
          <div className="card py-8 text-center text-muted">
            Aucune demande ouverte pour le moment. Vous pouvez proposer des candidats
            spontanément via «&nbsp;Proposer un candidat&nbsp;».
          </div>
        )}
      </div>
    </div>
  );
}
