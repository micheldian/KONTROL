import { requireClient } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { todayParis, dateFromYMD, ymd, formatJour } from '@/lib/dates';
import { refParcelle } from '@/lib/geo';

export const dynamic = 'force-dynamic';

// « Planning » — prochaines interventions planifiées chez le client (publiées uniquement).
// Noms des ouvriers masqués par défaut (« N ouvriers ») ; le chef d'équipe peut être montré
// si le paramètre d'organisation afficherNomsOuvriersAuClient est activé (spec §4.2).
export default async function ClientPlanningPage() {
  const user = await requireClient();

  const [org, affectations] = await Promise.all([
    prisma.organisation.findUnique({ where: { id: user.organisationId } }),
    prisma.affectation.findMany({
      where: {
        organisationId: user.organisationId,
        mission: { clientId: user.clientId },
        publieAt: { not: null },
        date: { gte: dateFromYMD(todayParis()) }
      },
      include: {
        mission: true,
        parcelles: { include: { parcelle: true } },
        ouvriers: { include: { user: { select: { id: true, prenom: true, nom: true } } } }
      },
      orderBy: [{ date: 'asc' }, { heureDebut: 'asc' }]
    })
  ]);

  const params = (org?.parametres as Record<string, unknown>) ?? {};
  const afficherNoms = params.afficherNomsOuvriersAuClient === true;

  return (
    <div>
      <h1 className="mb-5 text-[21px] font-bold">
        Planning
        <span className="block text-[13px] font-normal text-muted">
          Prochaines interventions planifiées chez vous
        </span>
      </h1>

      <div className="space-y-3">
        {affectations.map((a) => {
          const chef = a.chefEquipeId
            ? a.ouvriers.find((o) => o.userId === a.chefEquipeId)?.user
            : null;
          return (
            <div key={a.id} className="card">
              <div className="flex flex-wrap items-center gap-3">
                <span className="slot-chip">
                  {a.heureDebut}
                  {a.heureFinPrevue ? ` → ${a.heureFinPrevue}` : ''}
                </span>
                <div className="min-w-[220px] flex-1">
                  <b className="text-[14.5px]">
                    {formatJour(ymd(a.date), 'fr')} — {a.mission.typeTravaux ?? a.mission.libelle}
                  </b>
                  <span className="block text-[12.5px] text-muted">
                    {a.ouvriers.length} ouvrier{a.ouvriers.length > 1 ? 's' : ''} prévu
                    {a.ouvriers.length > 1 ? 's' : ''}
                    {afficherNoms &&
                      a.ouvriers.length > 0 &&
                      ` : ${a.ouvriers.map((o) => `${o.user.prenom} ${o.user.nom}`).join(', ')}`}
                    {!afficherNoms && chef && ` · chef d’équipe : ${chef.prenom} ${chef.nom}`}
                  </span>
                  {a.parcelles.length > 0 && (
                    <span className="block text-[12.5px] text-muted">
                      📍 {a.parcelles.map((ap) => refParcelle(ap.parcelle)).join(' · ')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {affectations.length === 0 && (
          <div className="card py-8 text-center text-muted">
            Aucune intervention planifiée pour le moment.
          </div>
        )}
      </div>
    </div>
  );
}
