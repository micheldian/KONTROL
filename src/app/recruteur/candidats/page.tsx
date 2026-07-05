import { requireRecruteur } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatDate, ymd } from '@/lib/dates';

export const dynamic = 'force-dynamic';

const BADGE: Record<string, { cls: string; txt: string }> = {
  PROPOSEE: { cls: 'badge-amber', txt: 'proposé' },
  ACCEPTEE: { cls: 'badge-ok', txt: 'accepté' },
  REFUSEE: { cls: 'badge-warn', txt: 'refusé' }
};

// Tous ses candidats proposés + statuts (spec §C.3). « Placé » = placement non annulé.
export default async function MesCandidatsPage({
  searchParams
}: {
  searchParams: { ok?: string };
}) {
  const user = await requireRecruteur();

  const propositions = await prisma.propositionCandidat.findMany({
    where: { organisationId: user.organisationId, recruteurId: user.userId },
    include: {
      candidat: { select: { prenom: true, nom: true, telephone: true } },
      demande: { select: { titre: true } },
      placement: { select: { commissionStatut: true } }
    },
    orderBy: { creeAt: 'desc' }
  });

  return (
    <div>
      <h1 className="mb-5 text-[21px] font-bold">
        Mes candidats
        <span className="block text-[13px] font-normal text-muted">
          {propositions.length} proposition{propositions.length > 1 ? 's' : ''}
        </span>
      </h1>

      {searchParams.ok && (
        <div className="mb-4 rounded-card border-[1.5px] border-[#BFD9C8] bg-[#EFF7F1] px-4 py-3 text-[13.5px] font-semibold text-ok">
          ✓ Proposition envoyée — elle apparaîtra ici avec son statut
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="table-admin">
          <thead>
            <tr>
              <th>Candidat</th>
              <th>Téléphone</th>
              <th>Demande</th>
              <th>Proposé le</th>
              <th>Statut</th>
              <th>Détail</th>
            </tr>
          </thead>
          <tbody>
            {propositions.map((p) => {
              const place = p.placement && p.placement.commissionStatut !== 'ANNULEE';
              const b = place
                ? { cls: 'badge-ok', txt: '💰 placé' }
                : (BADGE[p.statut] ?? { cls: 'badge-muted', txt: p.statut });
              return (
                <tr key={p.id}>
                  <td className="font-semibold">
                    {p.candidat.prenom} {p.candidat.nom}
                  </td>
                  <td className="font-mono text-[12.5px]">{p.candidat.telephone}</td>
                  <td>{p.demande?.titre ?? <span className="text-muted">spontanée</span>}</td>
                  <td className="font-mono text-[12.5px]">{formatDate(ymd(p.creeAt))}</td>
                  <td>
                    <span className={`badge ${b.cls}`}>{b.txt}</span>
                  </td>
                  <td className="text-[12.5px] text-muted">
                    {p.doublonDetecte && 'profil déjà connu'}
                    {p.motifRefus ? ` ${p.motifRefus}` : ''}
                  </td>
                </tr>
              );
            })}
            {propositions.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted">
                  Aucune proposition pour l’instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
