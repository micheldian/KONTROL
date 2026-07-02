import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatDate, formatHeures } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function MissionsPage() {
  const user = await requireAdmin();
  const missions = await prisma.mission.findMany({
    where: { organisationId: user.organisationId },
    include: { client: true },
    orderBy: [{ statut: 'asc' }, { dateDebut: 'desc' }]
  });

  // Total d'heures VALIDÉES par mission (temps réel — spec 4.2)
  const totaux = await prisma.creneauHeures.groupBy({
    by: ['missionId'],
    where: { organisationId: user.organisationId, statut: { in: ['VALIDE', 'CORRIGE'] } },
    _sum: { heuresCalculees: true }
  });
  const totalParMission = new Map(
    totaux.map((t) => [t.missionId, Number(t._sum.heuresCalculees ?? 0)])
  );

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[21px] font-bold">
          Missions
          <span className="block text-[13px] font-normal text-muted">
            Une mission = un contrat client
          </span>
        </h1>
        <Link href="/admin/missions/new" className="btn-sm btn-green">
          + Nouvelle mission
        </Link>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table-admin">
          <thead>
            <tr>
              <th>Mission</th>
              <th>Client</th>
              <th>Facturation</th>
              <th>Début</th>
              <th>Heures validées</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {missions.map((m) => (
              <tr key={m.id}>
                <td className="font-semibold">
                  {m.libelle}
                  {m.typeTravaux && (
                    <span className="block text-[12px] font-normal text-muted">
                      {m.typeTravaux}
                    </span>
                  )}
                </td>
                <td>{m.client.nom}</td>
                <td>
                  {m.modeFacturation === 'HEURE' ? (
                    <span className="font-mono text-[13px]">
                      {m.tauxClient ? `${Number(m.tauxClient)} €/h` : 'à l’heure'}
                    </span>
                  ) : (
                    <span className="font-mono text-[13px]">
                      forfait {m.montantForfait ? `${Number(m.montantForfait)} €` : ''}
                    </span>
                  )}
                </td>
                <td>{formatDate(m.dateDebut)}</td>
                <td className="font-mono">
                  {formatHeures(totalParMission.get(m.id) ?? 0)}
                </td>
                <td>
                  <span className={`badge ${m.statut === 'ACTIVE' ? 'badge-ok' : 'badge-muted'}`}>
                    {m.statut === 'ACTIVE' ? 'Active' : 'Terminée'}
                  </span>
                </td>
                <td className="text-right">
                  <Link href={`/admin/missions/${m.id}`} className="btn-sm btn-outline">
                    Ouvrir
                  </Link>
                </td>
              </tr>
            ))}
            {missions.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted">
                  Aucune mission.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
