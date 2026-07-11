import { requireClient } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { statutsParcelles, COULEUR_STATUT, type StatutParcelle } from '@/lib/parcelle-statut';
import { refParcelle } from '@/lib/geo';
import { formatDate } from '@/lib/dates';
import CarteLectureLoader from '@/components/carte/CarteLectureLoader';

export const dynamic = 'force-dynamic';

const LIBELLES: Record<StatutParcelle, string> = {
  AUCUNE: 'à faire (aucune intervention)',
  PLANIFIEE: 'intervention planifiée',
  EN_COURS: 'intervention en cours',
  TERMINEE: 'dernière intervention terminée'
};

// « Ma carte » — limitée aux parcelles du client, statut de la dernière intervention.
export default async function ClientCartePage() {
  const user = await requireClient();

  const [client, parcelles] = await Promise.all([
    prisma.client.findFirst({
      where: { id: user.clientId, organisationId: user.organisationId },
      select: { couleur: true }
    }),
    prisma.parcelle.findMany({
      where: { clientId: user.clientId, organisationId: user.organisationId },
      orderBy: [{ commune: 'asc' }, { numero: 'asc' }]
    })
  ]);
  const statuts = await statutsParcelles(
    parcelles.map((p) => p.id),
    user.organisationId
  );

  const surfaceTotale = parcelles.reduce((s, p) => s + (p.surfaceM2 ?? 0), 0);

  return (
    <div>
      <h1 className="mb-4 text-[21px] font-bold">
        Ma carte
        <span className="block text-[13px] font-normal text-muted">
          {parcelles.length} parcelle{parcelles.length > 1 ? 's' : ''}
          {surfaceTotale > 0 &&
            ` · ${(surfaceTotale / 10000).toFixed(2).replace('.', ',')} ha`}{' '}
          · bordure : gris = à faire, orange = planifiée, vert = terminée
        </span>
      </h1>

      <CarteLectureLoader
        parcelles={parcelles.map((p) => {
          const s = statuts[p.id];
          return {
            id: p.id,
            ref: refParcelle(p),
            sousTitre: [
              p.cepage,
              p.surfaceM2 ? `${(p.surfaceM2 / 10000).toFixed(2).replace('.', ',')} ha` : null
            ]
              .filter(Boolean)
              .join(' · '),
            statutLibelle:
              LIBELLES[s?.statut ?? 'AUCUNE'] +
              (s?.derniereDate ? ` (${formatDate(s.derniereDate)})` : ''),
            couleur: client?.couleur ?? '#FF5722',
            bordure: COULEUR_STATUT[s?.statut ?? 'AUCUNE'],
            geometry: p.geometry,
            centroidLat: p.centroidLat,
            centroidLng: p.centroidLng
          };
        })}
      />
      {parcelles.length === 0 && (
        <div className="card mt-4 py-8 text-center text-muted">
          Aucune parcelle enregistrée pour le moment.
        </div>
      )}
    </div>
  );
}
