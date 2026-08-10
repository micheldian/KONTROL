import { requireClient } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatHeures, formatDate, ymd, formatEuros } from '@/lib/dates';

export const dynamic = 'force-dynamic';

// « Mes missions » — heures validées cumulées en temps réel (spec §4.1.1).
// Le tarif n'apparaît que si afficherTarifAuClient est activé pour ce client.
export default async function ClientMissionsPage() {
  const user = await requireClient();

  const [client, missions, totaux] = await Promise.all([
    prisma.client.findFirst({
      where: { id: user.clientId, organisationId: user.organisationId }
    }),
    prisma.mission.findMany({
      where: { clientId: user.clientId, organisationId: user.organisationId },
      orderBy: [{ statut: 'asc' }, { dateDebut: 'desc' }]
    }),
    prisma.creneauHeures.groupBy({
      by: ['missionId'],
      where: {
        organisationId: user.organisationId,
        mission: { clientId: user.clientId },
        statut: { in: ['VALIDE', 'CORRIGE'] }
      },
      _sum: { heuresCalculees: true }
    })
  ]);
  if (!client) return null;

  const heuresParMission = new Map(
    totaux.map((t) => [t.missionId, Number(t._sum.heuresCalculees ?? 0)])
  );

  return (
    <div>
      <h1 className="mb-5 text-[21px] font-bold">
        Mes missions
        <span className="block text-[13px] font-normal text-muted">
          {missions.length} mission{missions.length > 1 ? 's' : ''} · heures mises à jour en
          temps réel (heures validées uniquement)
        </span>
      </h1>

      <div className="space-y-3">
        {missions.map((m) => (
          <div key={m.id} className="card">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[220px] flex-1">
                <b className="text-[15.5px]">{m.libelle}</b>
                <span className="block text-[13px] text-muted">
                  {[
                    m.typeTravaux,
                    `du ${formatDate(ymd(m.dateDebut))}`,
                    m.dateFin ? `au ${formatDate(ymd(m.dateFin))}` : 'en cours'
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              <div className="text-right">
                <b className="text-[17px]">
                  {formatHeures(heuresParMission.get(m.id) ?? 0)}
                </b>
                <span className="block text-[12px] text-muted">heures validées</span>
              </div>
              {client.afficherTarifAuClient && m.modeFacturation === 'HEURE' && m.tauxClient && (
                <span className="badge badge-muted">{formatEuros(Number(m.tauxClient))}/h</span>
              )}
              {client.afficherTarifAuClient && m.modeFacturation === 'TACHE' && m.montantForfait && (
                <span className="badge badge-muted">
                  forfait {formatEuros(Number(m.montantForfait))}
                </span>
              )}
              <span className={`badge ${m.statut === 'ACTIVE' ? 'badge-ok' : 'badge-muted'}`}>
                {m.statut === 'ACTIVE' ? 'active' : 'terminée'}
              </span>
            </div>
          </div>
        ))}
        {missions.length === 0 && (
          <div className="card py-8 text-center text-muted">Aucune mission pour l’instant.</div>
        )}
      </div>
    </div>
  );
}
