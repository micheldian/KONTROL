import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { recapMois } from '@/lib/money';
import { moisCourant, bornesMois, dateFromYMD, formatEuros, formatHeures } from '@/lib/dates';
import {
  cloturerOuvrier,
  cloturerEnMasse,
  enregistrerVersement,
  rouvrirCloture,
  envoyerRecap
} from './actions';

export const dynamic = 'force-dynamic';

export default async function CloturesPage({
  searchParams
}: {
  searchParams: { mois?: string; erreur?: string };
}) {
  const user = await requireAdmin();
  const courant = moisCourant();
  const [annee, mois] = /^\d{4}-\d{2}$/.test(searchParams.mois ?? '')
    ? [Number(searchParams.mois!.slice(0, 4)), Number(searchParams.mois!.slice(5, 7))]
    : [courant.annee, courant.mois];
  const moisStr = `${annee}-${String(mois).padStart(2, '0')}`;
  const bornes = bornesMois(mois, annee);
  const [debut, finExclue] = [dateFromYMD(bornes.debut), dateFromYMD(bornes.finExclue)];

  // Ouvriers concernés par le mois (activité ou clôture existante)
  const [avecHeures, avecAcomptes, avecRetenues, avecSejours, cloturesExistantes] =
    await Promise.all([
      prisma.creneauHeures.findMany({
        where: { organisationId: user.organisationId, date: { gte: debut, lt: finExclue } },
        select: { userId: true },
        distinct: ['userId']
      }),
      prisma.acompte.findMany({
        where: {
          organisationId: user.organisationId,
          date: { gte: debut, lt: finExclue },
          statut: { in: ['APPROUVE', 'VERSE'] }
        },
        select: { userId: true },
        distinct: ['userId']
      }),
      prisma.retenue.findMany({
        where: { organisationId: user.organisationId, date: { gte: debut, lt: finExclue } },
        select: { userId: true },
        distinct: ['userId']
      }),
      prisma.sejourLogement.findMany({
        where: {
          logement: { organisationId: user.organisationId },
          dateArrivee: { lt: finExclue },
          OR: [{ dateDepart: null }, { dateDepart: { gte: debut } }]
        },
        select: { userId: true },
        distinct: ['userId']
      }),
      prisma.clotureMois.findMany({
        where: { organisationId: user.organisationId, mois, annee },
        include: { user: true }
      })
    ]);

  const ids = new Set<string>([
    ...avecHeures.map((x) => x.userId),
    ...avecAcomptes.map((x) => x.userId),
    ...avecRetenues.map((x) => x.userId),
    ...avecSejours.map((x) => x.userId),
    ...cloturesExistantes.map((x) => x.userId)
  ]);

  const ouvriers = await prisma.user.findMany({
    where: {
      id: { in: Array.from(ids) },
      organisationId: user.organisationId,
      role: { in: ['OUVRIER', 'CHEF_EQUIPE'] }
    },
    orderBy: [{ nom: 'asc' }]
  });

  const cloturesParOuvrier = new Map(cloturesExistantes.map((c) => [c.userId, c]));
  const lignes = await Promise.all(
    ouvriers.map(async (o) => ({
      ouvrier: o,
      recap: await recapMois({
        organisationId: user.organisationId,
        userId: o.id,
        mois,
        annee
      }),
      cloture: cloturesParOuvrier.get(o.id)
    }))
  );

  const aCloturer = lignes.filter(
    (l) =>
      (!l.cloture || l.cloture.statut === 'ROUVERTE') && l.recap.heuresEnAttente === 0
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-bold">
          Clôtures mensuelles
          <span className="block text-[13px] font-normal text-muted">
            {moisStr} · {lignes.length} ouvrier{lignes.length > 1 ? 's' : ''} concerné
            {lignes.length > 1 ? 's' : ''} · snapshot immuable, heures validées uniquement
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <form className="flex items-center gap-2">
            <input type="month" name="mois" defaultValue={moisStr} className="input w-auto py-2" />
            <button className="btn-sm btn-outline">Voir</button>
          </form>
          <a href={`/api/clotures/export?mois=${moisStr}`} className="btn-sm btn-ink">
            ⬇ Export compta (CSV)
          </a>
        </div>
      </div>

      {searchParams.erreur && (
        <div className="mb-4 rounded-card border-[1.5px] border-[#F3C1A8] bg-[#FFF3EC] px-4 py-3 text-[13.5px] text-warn">
          ⚠ {searchParams.erreur}
        </div>
      )}

      {aCloturer.length > 0 && (
        <form action={cloturerEnMasse} className="mb-4">
          <input type="hidden" name="mois" value={mois} />
          <input type="hidden" name="annee" value={annee} />
          {aCloturer.map((l) => (
            <input key={l.ouvrier.id} type="hidden" name="ouvrierIds" value={l.ouvrier.id} />
          ))}
          <button className="btn-sm btn-green">
            🔒 Clôturer le mois pour {aCloturer.length} ouvrier{aCloturer.length > 1 ? 's' : ''}
          </button>
        </form>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="table-admin">
          <thead>
            <tr>
              <th>Ouvrier</th>
              <th>Heures</th>
              <th>Brut</th>
              <th>Acomptes</th>
              <th>Logement</th>
              <th>Retenues</th>
              <th>Net</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lignes.map(({ ouvrier, recap, cloture }) => (
              <tr key={ouvrier.id}>
                <td className="font-semibold">
                  {ouvrier.prenom} {ouvrier.nom}
                  {recap.heuresEnAttente > 0 && (
                    <span className="badge badge-warn ml-2">
                      {formatHeures(recap.heuresEnAttente)} en attente
                    </span>
                  )}
                </td>
                <td className="font-mono">{formatHeures(recap.totalHeuresValidees)}</td>
                <td className="font-mono">{formatEuros(recap.totalBrut)}</td>
                <td className="font-mono text-warn">− {formatEuros(recap.totalAcomptes)}</td>
                <td className="font-mono text-warn">− {formatEuros(recap.logement.total)}</td>
                <td className="font-mono text-warn">− {formatEuros(recap.totalRetenues)}</td>
                <td className="font-mono font-bold">
                  {formatEuros(cloture && cloture.statut === 'CLOTUREE' ? Number(cloture.netAVerser) : recap.net)}
                </td>
                <td>
                  {!cloture ? (
                    <span className="badge badge-muted">à clôturer</span>
                  ) : cloture.statut === 'ROUVERTE' ? (
                    <span className="badge badge-amber">rouverte</span>
                  ) : cloture.verseAt ? (
                    <span className="badge badge-ok">
                      versé {cloture.modeVersement === 'ESPECES' ? 'espèces' : 'virement'}
                    </span>
                  ) : (
                    <span className="badge badge-ok">clôturé</span>
                  )}
                </td>
                <td>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {(!cloture || cloture.statut === 'ROUVERTE') && (
                      <form action={cloturerOuvrier}>
                        <input type="hidden" name="ouvrierId" value={ouvrier.id} />
                        <input type="hidden" name="mois" value={mois} />
                        <input type="hidden" name="annee" value={annee} />
                        <button className="btn-sm btn-green">Clôturer</button>
                      </form>
                    )}
                    {cloture && cloture.statut === 'CLOTUREE' && (
                      <>
                        <a
                          href={`/api/clotures/${cloture.id}/pdf`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-sm btn-outline"
                        >
                          PDF
                        </a>
                        <form action={envoyerRecap}>
                          <input type="hidden" name="id" value={cloture.id} />
                          <input type="hidden" name="canal" value="TELEGRAM" />
                          <button className="btn-sm btn-outline" title="Envoyer par Telegram">✈️</button>
                        </form>
                        {!cloture.verseAt && (
                          <form action={enregistrerVersement} className="flex items-center gap-1">
                            <input type="hidden" name="id" value={cloture.id} />
                            <select name="mode" className="input w-auto px-1.5 py-1.5 text-[12px]">
                              <option value="ESPECES">Espèces</option>
                              <option value="VIREMENT">Virement</option>
                            </select>
                            <button className="btn-sm btn-amber">Versé</button>
                          </form>
                        )}
                        {user.role === 'ADMIN' && (
                          <form action={rouvrirCloture}>
                            <input type="hidden" name="id" value={cloture.id} />
                            <button className="btn-sm text-warn" title="Réouverture tracée">
                              Rouvrir
                            </button>
                          </form>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {lignes.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted">
                  Aucune activité sur ce mois.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
