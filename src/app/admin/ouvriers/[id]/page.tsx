import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import OuvrierForm from '../ouvrier-form';
import { debloquerPin } from '../actions';
import { creerSejour, cloreSejour } from '../../logements/actions';
import ErreurBanniere from '@/components/admin/ErreurBanniere';
import { recapMois } from '@/lib/money';
import { historiqueProfil } from '@/lib/historique';
import { refParcelle } from '@/lib/geo';
import {
  moisCourant,
  formatEuros,
  formatHeures,
  formatDate,
  todayParis,
  dateFromYMD,
  ymd,
  diffJours
} from '@/lib/dates';

export const dynamic = 'force-dynamic';

const STATUT_CRENEAU: Record<string, { cls: string; txt: string }> = {
  EN_ATTENTE: { cls: 'badge-amber', txt: 'en attente' },
  VALIDE: { cls: 'badge-ok', txt: 'validé' },
  CORRIGE: { cls: 'badge-muted', txt: 'corrigé' }
};

export default async function OuvrierPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { erreur?: string };
}) {
  const user = await requireAdmin();
  const ouvrier = await prisma.user.findFirst({
    where: {
      id: params.id,
      organisationId: user.organisationId,
      role: { in: ['OUVRIER', 'CHEF_EQUIPE'] }
    }
  });
  if (!ouvrier) notFound();

  const pinBloque = ouvrier.pinBloqueJusqua && ouvrier.pinBloqueJusqua > new Date();
  const today = todayParis();

  const { mois, annee } = moisCourant();
  const [recap, historique, sejourActuel, prochainesAffectations, derniersCreneaux, logements] =
    await Promise.all([
      recapMois({
        organisationId: user.organisationId,
        userId: ouvrier.id,
        mois,
        annee,
        tempsReel: true
      }),
      historiqueProfil(user.organisationId, ouvrier.id),
      // Logement actuel : séjour en cours (arrivée passée, pas de départ ou départ futur)
      prisma.sejourLogement.findFirst({
        where: {
          userId: ouvrier.id,
          logement: { organisationId: user.organisationId },
          dateArrivee: { lte: dateFromYMD(today) },
          OR: [{ dateDepart: null }, { dateDepart: { gt: dateFromYMD(today) } }]
        },
        include: { logement: true },
        orderBy: { dateArrivee: 'desc' }
      }),
      prisma.affectationOuvrier.findMany({
        where: {
          userId: ouvrier.id,
          affectation: { organisationId: user.organisationId, date: { gte: dateFromYMD(today) } }
        },
        include: {
          affectation: {
            include: {
              mission: { include: { client: { select: { nom: true } } } },
              parcelles: { include: { parcelle: true } }
            }
          }
        },
        orderBy: { affectation: { date: 'asc' } },
        take: 5
      }),
      prisma.creneauHeures.findMany({
        where: { organisationId: user.organisationId, userId: ouvrier.id },
        include: { mission: { include: { client: { select: { nom: true } } } } },
        orderBy: [{ date: 'desc' }, { heureDebut: 'desc' }],
        take: 6
      }),
      prisma.logement.findMany({
        where: { organisationId: user.organisationId },
        orderBy: { nom: 'asc' }
      })
    ]);

  const joursPresence = sejourActuel ? diffJours(ymd(sejourActuel.dateArrivee), today) + 1 : 0;

  return (
    <div className="max-w-[860px]">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[21px] font-bold">
          {ouvrier.prenom} {ouvrier.nom}
          <span className="block text-[13px] font-normal text-muted">
            {ouvrier.telephone} · {ouvrier.langue} ·{' '}
            {ouvrier.estChefEquipe ? 'Chef d’équipe' : 'Ouvrier'} · {ouvrier.statutProfil}
            {historique.derniereSaison ? ` · dernière saison ${historique.derniereSaison}` : ''}
          </span>
        </h1>
        <div className="flex gap-2">
          <Link href={`/admin/vivier/${ouvrier.id}`} className="btn-sm btn-outline">
            Profil vivier
          </Link>
          <Link href="/admin/ouvriers" className="btn-sm btn-outline">
            ← Retour
          </Link>
        </div>
      </div>

      <ErreurBanniere erreur={searchParams.erreur} />

      {pinBloque && (
        <div className="mb-4 flex items-center justify-between rounded-card border-[1.5px] border-[#F3C1A8] bg-[#FFF3EC] px-4 py-3">
          <span className="text-[13.5px] font-semibold text-warn">
            PIN bloqué (trop d’échecs) jusqu’à{' '}
            {ouvrier.pinBloqueJusqua!.toLocaleTimeString('fr-FR', {
              timeZone: 'Europe/Paris',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
          <form action={debloquerPin}>
            <input type="hidden" name="id" value={ouvrier.id} />
            <button className="btn-sm btn-ink">Débloquer maintenant</button>
          </form>
        </div>
      )}

      {/* Situation du mois en temps réel (spec 4.3) */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="card p-3">
          <div className="label mb-0.5">Heures validées</div>
          <div className="font-mono text-[18px] font-bold">
            {formatHeures(recap.totalHeuresValidees)}
          </div>
          {recap.heuresEnAttente > 0 && (
            <div className="text-[11.5px] text-muted">
              + {formatHeures(recap.heuresEnAttente)} en attente
            </div>
          )}
        </div>
        <div className="card p-3">
          <div className="label mb-0.5">Gagné validé</div>
          <div className="font-mono text-[18px] font-bold">{formatEuros(recap.totalBrut)}</div>
        </div>
        <div className="card p-3">
          <div className="label mb-0.5">Acomptes</div>
          <div className="font-mono text-[18px] font-bold text-warn">
            − {formatEuros(recap.totalAcomptes)}
          </div>
        </div>
        <div className="card p-3">
          <div className="label mb-0.5">Logement + retenues</div>
          <div className="font-mono text-[18px] font-bold text-warn">
            − {formatEuros(recap.logement.total + recap.totalRetenues)}
          </div>
        </div>
        <div className="card bg-ink p-3 text-amber">
          <div className="label mb-0.5 text-[#A9B5AE]">Net ce mois</div>
          <div className="font-mono text-[18px] font-bold">{formatEuros(recap.net)}</div>
        </div>
      </div>

      {/* Situation actuelle : logement + planning à venir */}
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-2 text-[14px] font-bold">🛏 Logement</h2>
          {sejourActuel ? (
            <div className="text-[13.5px]">
              <div className="font-semibold">{sejourActuel.logement.nom}</div>
              <div className="text-muted">
                arrivé le {formatDate(ymd(sejourActuel.dateArrivee))} · {joursPresence} jour
                {joursPresence > 1 ? 's' : ''} de présence
                {sejourActuel.dateDepart
                  ? ` · départ prévu le ${formatDate(ymd(sejourActuel.dateDepart))}`
                  : ''}
              </div>
              <div className="text-muted">
                {Number(sejourActuel.logement.tarifJour).toFixed(2).replace('.', ',')} €/jour ·{' '}
                {formatEuros(recap.logement.total)} décomptés ce mois
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <Link
                  href={`/admin/logements/${sejourActuel.logementId}`}
                  className="btn-sm btn-outline"
                >
                  Fiche logement →
                </Link>
                <form action={cloreSejour} className="flex items-end gap-2">
                  <input type="hidden" name="id" value={sejourActuel.id} />
                  <input type="hidden" name="retour" value={`/admin/ouvriers/${ouvrier.id}`} />
                  <div>
                    <label className="label">Départ (jour exclu)</label>
                    <input name="dateDepart" type="date" required defaultValue={today} className="input py-1.5" />
                  </div>
                  <button className="btn-sm btn-outline">Clore le séjour</button>
                </form>
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-2 text-[13px] text-muted">
                Pas de logement en cours — assignez-le ici (arrivée incluse, départ exclu,
                décompté chaque jour de présence) :
              </p>
              <form action={creerSejour} className="space-y-2">
                <input type="hidden" name="ouvrierId" value={ouvrier.id} />
                <input type="hidden" name="retour" value={`/admin/ouvriers/${ouvrier.id}`} />
                <select name="logementId" required className="input w-full py-2 text-[13.5px]" defaultValue="">
                  <option value="" disabled>
                    — Choisir un logement —
                  </option>
                  {logements.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nom} · {Number(l.tarifJour).toFixed(2).replace('.', ',')} €/jour
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="label">Arrivée *</label>
                    <input name="dateArrivee" type="date" required defaultValue={today} className="input py-2" />
                  </div>
                  <div>
                    <label className="label">Départ (optionnel)</label>
                    <input name="dateDepart" type="date" className="input py-2" />
                  </div>
                  <button className="btn-sm btn-green py-2.5">🛏 Assigner</button>
                </div>
              </form>
              {logements.length === 0 && (
                <p className="mt-2 text-[12.5px] text-muted">
                  Aucun logement créé —{' '}
                  <Link href="/admin/logements/new" className="underline">
                    créer un logement →
                  </Link>
                </p>
              )}
            </div>
          )}
          {historique.logements.length > 0 && (
            <p className="mt-2 text-[12px] text-muted">
              Logements connus : {historique.logements.join(', ')}
            </p>
          )}
        </div>

        <div className="card p-4">
          <h2 className="mb-2 text-[14px] font-bold">📅 Prochaines affectations</h2>
          {prochainesAffectations.length === 0 && (
            <p className="text-[13.5px] text-muted">
              Rien de planifié.{' '}
              <Link href="/admin/affectations" className="underline">
                Planifier →
              </Link>
            </p>
          )}
          <div className="space-y-1.5">
            {prochainesAffectations.map((ao) => (
              <div key={ao.id} className="flex items-center gap-2 text-[13px]">
                <span className="w-[86px] font-mono text-[12px] text-muted">
                  {ymd(ao.affectation.date) === today
                    ? 'aujourd’hui'
                    : formatDate(ymd(ao.affectation.date))}
                </span>
                <span className="slot-chip">{ao.affectation.heureDebut}</span>
                <span className="min-w-0 flex-1 truncate">
                  {ao.affectation.mission.client.nom}
                  {ao.affectation.parcelles.length > 0
                    ? ` · ${refParcelle(ao.affectation.parcelles[0].parcelle)}${ao.affectation.parcelles.length > 1 ? ` +${ao.affectation.parcelles.length - 1}` : ''}`
                    : ''}
                </span>
                <span
                  className={`badge ${ao.confirme ? 'badge-ok' : 'badge-warn'}`}
                  title={ao.confirme ? 'A confirmé « J’y serai »' : 'Pas encore confirmé'}
                >
                  {ao.confirme ? '✓' : '⏳'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dernières heures + historique */}
      <div className="mb-5 grid gap-3 md:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-2 text-[14px] font-bold">⏱ Dernières heures saisies</h2>
          {derniersCreneaux.length === 0 && (
            <p className="text-[13.5px] text-muted">Aucune heure saisie pour l’instant.</p>
          )}
          <div className="space-y-1.5">
            {derniersCreneaux.map((c) => {
              const b = STATUT_CRENEAU[c.statut] ?? { cls: 'badge-muted', txt: c.statut };
              return (
                <div key={c.id} className="flex items-center gap-2 text-[13px]">
                  <span className="w-[76px] font-mono text-[12px] text-muted">
                    {formatDate(ymd(c.date))}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.mission.client.nom}</span>
                  <span className="font-mono text-[12.5px]">
                    {formatHeures(Number(c.heuresCalculees))}
                  </span>
                  <span className={`badge ${b.cls}`}>{b.txt}</span>
                </div>
              );
            })}
          </div>
          <Link href="/admin/heures" className="btn-sm btn-outline mt-2.5">
            Toutes les heures →
          </Link>
        </div>

        <div className="card p-4">
          <h2 className="mb-2 text-[14px] font-bold">📜 Historique</h2>
          <div className="space-y-1 text-[13.5px]">
            {historique.saisons.map((s) => (
              <div key={s.annee} className="flex justify-between">
                <span>Saison {s.annee}</span>
                <b className="font-mono">{formatHeures(s.heures)}</b>
              </div>
            ))}
            {historique.saisons.length === 0 && (
              <p className="text-muted">Aucune heure validée pour l’instant.</p>
            )}
            {historique.tauxConfirmation !== null && (
              <div className="flex justify-between border-t border-line pt-1.5">
                <span>Confirmations « J’y serai »</span>
                <b className="font-mono">
                  {historique.tauxConfirmation}% ({historique.totalAffectations} aff.)
                </b>
              </div>
            )}
          </div>
          {historique.missions.length > 0 && (
            <p className="mt-2 text-[12px] text-muted">
              Missions principales :{' '}
              {historique.missions
                .slice(0, 3)
                .map((m) => `${m.client} (${formatHeures(m.heures)})`)
                .join(' · ')}
            </p>
          )}
          <Link href={`/admin/vivier/${ouvrier.id}`} className="btn-sm btn-outline mt-2.5">
            Profil vivier complet (note, tags) →
          </Link>
        </div>
      </div>

      <OuvrierForm ouvrier={ouvrier} />
    </div>
  );
}
