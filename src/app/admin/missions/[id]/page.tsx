import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatHeures, ymd, formatDate } from '@/lib/dates';
import { refParcelle } from '@/lib/geo';
import MissionForm, { MissionDelete } from '../mission-form';

export const dynamic = 'force-dynamic';

export default async function MissionPage({ params }: { params: { id: string } }) {
  const user = await requireAdmin();
  const mission = await prisma.mission.findFirst({
    where: { id: params.id, organisationId: user.organisationId },
    include: {
      client: true,
      affectations: {
        include: { parcelles: { include: { parcelle: true } } },
        orderBy: { date: 'desc' }
      }
    }
  });
  if (!mission) notFound();

  // Parcelles concernées par la mission = celles de ses affectations (dédupliquées)
  const parcellesMission = new Map<
    string,
    { parcelle: (typeof mission.affectations)[number]['parcelles'][number]['parcelle']; derniereDate: Date }
  >();
  for (const a of mission.affectations) {
    for (const ap of a.parcelles) {
      if (!parcellesMission.has(ap.parcelleId)) {
        parcellesMission.set(ap.parcelleId, { parcelle: ap.parcelle, derniereDate: a.date });
      }
    }
  }

  const clients = await prisma.client.findMany({
    where: { organisationId: user.organisationId },
    orderBy: { nom: 'asc' }
  });

  const total = await prisma.creneauHeures.aggregate({
    where: {
      missionId: mission.id,
      organisationId: user.organisationId,
      statut: { in: ['VALIDE', 'CORRIGE'] }
    },
    _sum: { heuresCalculees: true }
  });

  return (
    <div className="max-w-[760px]">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[21px] font-bold">
          {mission.libelle}
          <span className="block text-[13px] font-normal text-muted">
            {mission.client.nom} · heures validées :{' '}
            {formatHeures(Number(total._sum.heuresCalculees ?? 0))}
          </span>
        </h1>
      </div>

      <MissionForm mission={mission} clients={clients} />

      <div className="mb-3 mt-8 flex items-center justify-between">
        <h2 className="text-[16px] font-bold">
          Parcelles concernées ({parcellesMission.size})
          <span className="block text-[12px] font-normal text-muted">
            via les affectations — les parcelles se gèrent sur la fiche client
          </span>
        </h2>
        <Link href={`/admin/clients/${mission.clientId}`} className="btn-sm btn-outline">
          Parcelles de {mission.client.nom} →
        </Link>
      </div>
      <div className="card p-0">
        {Array.from(parcellesMission.values()).map(({ parcelle: p, derniereDate }) => (
          <div
            key={p.id}
            className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
          >
            <div className="flex-1">
              <div className="text-[14px] font-semibold">📍 {refParcelle(p)}</div>
              <div className="text-[12.5px] text-muted">
                {[
                  p.cepage,
                  p.surfaceM2 ? `${(p.surfaceM2 / 10000).toFixed(2).replace('.', ',')} ha` : null,
                  `dernière affectation : ${formatDate(ymd(derniereDate))}`
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          </div>
        ))}
        {parcellesMission.size === 0 && (
          <div className="px-4 py-5 text-center text-[13.5px] text-muted">
            Aucune affectation avec parcelle pour l’instant.
          </div>
        )}
      </div>

      <MissionDelete missionId={mission.id} />
    </div>
  );
}
