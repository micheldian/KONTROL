import { requireClient } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { todayParis, dateFromYMD, ymd, formatDate, formatHeures } from '@/lib/dates';
import { refParcelle } from '@/lib/geo';

export const dynamic = 'force-dynamic';

// « Historique par parcelle » — le carnet de travaux (équivalent Process2wine, spec §4.1.4) :
// interventions passées par parcelle avec date, type de travaux et heures validées.
export default async function ClientHistoriquePage() {
  const user = await requireClient();

  const parcelles = await prisma.parcelle.findMany({
    where: { clientId: user.clientId, organisationId: user.organisationId },
    include: {
      affectations: {
        where: {
          affectation: {
            publieAt: { not: null },
            date: { lte: dateFromYMD(todayParis()) }
          }
        },
        include: {
          affectation: {
            include: {
              mission: { select: { typeTravaux: true, libelle: true } },
              _count: { select: { ouvriers: true } }
            }
          }
        },
        orderBy: { affectation: { date: 'desc' } }
      }
    },
    orderBy: [{ commune: 'asc' }, { section: 'asc' }, { numero: 'asc' }]
  });

  // Heures validées par affectation (uniquement VALIDE/CORRIGE — règle 3)
  const affectationIds = parcelles.flatMap((p) => p.affectations.map((ap) => ap.affectationId));
  const heures =
    affectationIds.length > 0
      ? await prisma.creneauHeures.groupBy({
          by: ['affectationId'],
          where: {
            organisationId: user.organisationId,
            affectationId: { in: affectationIds },
            statut: { in: ['VALIDE', 'CORRIGE'] }
          },
          _sum: { heuresCalculees: true }
        })
      : [];
  const heuresParAffectation = new Map(
    heures.map((h) => [h.affectationId, Number(h._sum.heuresCalculees ?? 0)])
  );

  return (
    <div>
      <h1 className="mb-5 text-[21px] font-bold">
        Historique par parcelle
        <span className="block text-[13px] font-normal text-muted">
          Le carnet de travaux : interventions passées, heures validées
        </span>
      </h1>

      <div className="space-y-4">
        {parcelles.map((p) => (
          <div key={p.id} className="card p-0">
            <div className="border-b-[1.5px] border-line px-4 py-3">
              <b className="text-[15px]">📍 {refParcelle(p)}</b>
              <span className="ml-2 text-[12.5px] text-muted">
                {[
                  p.cepage,
                  p.millesime ? `millésime ${p.millesime}` : null,
                  p.surfaceM2 ? `${(p.surfaceM2 / 10000).toFixed(2).replace('.', ',')} ha` : null
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            {p.affectations.map((ap) => {
              const a = ap.affectation;
              const h = heuresParAffectation.get(a.id) ?? 0;
              return (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 text-[13.5px] last:border-b-0"
                >
                  <span className="w-[92px] font-mono text-[12.5px] text-muted">
                    {formatDate(ymd(a.date))}
                  </span>
                  <span className="flex-1 font-semibold">
                    {a.mission.typeTravaux ?? a.mission.libelle}
                  </span>
                  <span className="text-muted">
                    {a._count.ouvriers} ouvrier{a._count.ouvriers > 1 ? 's' : ''}
                  </span>
                  <span className="badge badge-muted">{formatHeures(h)}</span>
                </div>
              );
            })}
            {p.affectations.length === 0 && (
              <div className="px-4 py-4 text-center text-[13px] text-muted">
                Aucune intervention passée sur cette parcelle.
              </div>
            )}
          </div>
        ))}
        {parcelles.length === 0 && (
          <div className="card py-8 text-center text-muted">Aucune parcelle enregistrée.</div>
        )}
      </div>
    </div>
  );
}
