import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatHeures } from '@/lib/dates';
import MissionForm, { MissionDelete } from '../mission-form';
import { addParcelle, deleteParcelle } from '../actions';

export const dynamic = 'force-dynamic';

export default async function MissionPage({ params }: { params: { id: string } }) {
  const user = await requireAdmin();
  const mission = await prisma.mission.findFirst({
    where: { id: params.id, organisationId: user.organisationId },
    include: { parcelles: true, client: true }
  });
  if (!mission) notFound();

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

      <h2 className="mb-3 mt-8 text-[16px] font-bold">Parcelles / adresses</h2>
      <div className="card p-0">
        {mission.parcelles.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
          >
            <div className="flex-1">
              <div className="text-[14px] font-semibold">📍 {p.adresse}</div>
              {p.instructions && (
                <div className="text-[12.5px] text-muted">{p.instructions}</div>
              )}
            </div>
            <form action={deleteParcelle}>
              <input type="hidden" name="id" value={p.id} />
              <button className="btn-sm text-warn">Retirer</button>
            </form>
          </div>
        ))}
        {mission.parcelles.length === 0 && (
          <div className="px-4 py-5 text-center text-[13.5px] text-muted">
            Aucune parcelle.
          </div>
        )}
        <form action={addParcelle} className="flex gap-2 border-t-[1.5px] border-line p-3">
          <input type="hidden" name="missionId" value={mission.id} />
          <input name="adresse" required placeholder="Adresse de la parcelle" className="input flex-1" />
          <input name="instructions" placeholder="Instructions (optionnel)" className="input flex-1" />
          <button type="submit" className="btn-sm btn-green px-4">
            Ajouter
          </button>
        </form>
      </div>

      <MissionDelete missionId={mission.id} />
    </div>
  );
}
