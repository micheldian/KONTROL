import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminStrict } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { ymd } from '@/lib/dates';
import { estSimulation } from '@/lib/pennylane';
import Composer from './composer';

export const dynamic = 'force-dynamic';

export default async function NouvelleFacturePage({
  searchParams
}: {
  searchParams: { missionId?: string };
}) {
  const user = await requireAdminStrict();
  if (!searchParams.missionId) notFound();

  const mission = await prisma.mission.findFirst({
    where: { id: searchParams.missionId, organisationId: user.organisationId },
    include: { client: true, organisation: true }
  });
  if (!mission) notFound();

  // Heures validées de la mission (pour l'aperçu ; recalcul serveur à l'envoi)
  const creneaux = await prisma.creneauHeures.findMany({
    where: {
      organisationId: user.organisationId,
      missionId: mission.id,
      statut: { in: ['VALIDE', 'CORRIGE'] }
    },
    include: { user: true },
    orderBy: { date: 'asc' }
  });

  const donnees = creneaux.map((c) => ({
    date: ymd(c.date),
    ouvrier: `${c.user.prenom} ${c.user.nom}`,
    heures: Number(c.heuresCalculees)
  }));

  return (
    <div className="max-w-[860px]">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[21px] font-bold">
          Facture — {mission.client.nom} · {mission.libelle}
          <span className="block text-[13px] font-normal text-muted">
            {estSimulation(mission.organisation.parametres)
              ? 'Mode simulation (clé API vide)'
              : 'Envoi réel à Pennylane'}
            {' · '}numérotation, TVA et mentions légales gérées par Pennylane
          </span>
        </h1>
        <Link href="/admin/factures" className="btn-sm btn-outline">
          ← Retour
        </Link>
      </div>

      <Composer
        missionId={mission.id}
        tauxClient={mission.tauxClient ? Number(mission.tauxClient) : null}
        montantForfait={mission.montantForfait ? Number(mission.montantForfait) : null}
        libelleMission={mission.libelle}
        creneaux={donnees}
      />
    </div>
  );
}
