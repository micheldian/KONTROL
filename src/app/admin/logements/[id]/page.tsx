import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { todayParis, dateFromYMD, ymd } from '@/lib/dates';
import LogementForm from '../logement-form';
import ErreurBanniere from '@/components/admin/ErreurBanniere';
import { creerSejour, cloreSejour, supprimerSejour } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EditLogementPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { erreur?: string };
}) {
  const user = await requireAdmin();
  const today = dateFromYMD(todayParis());
  const [logement, ouvriers] = await Promise.all([
    prisma.logement.findFirst({
      where: { id: params.id, organisationId: user.organisationId },
      include: {
        sejours: {
          include: { user: true },
          orderBy: [{ dateDepart: 'asc' }, { dateArrivee: 'desc' }]
        }
      }
    }),
    prisma.user.findMany({
      where: {
        organisationId: user.organisationId,
        role: { in: ['OUVRIER', 'CHEF_EQUIPE'] },
        statutProfil: 'ACTIF'
      },
      orderBy: [{ nom: 'asc' }]
    })
  ]);
  if (!logement) notFound();

  const enCours = logement.sejours.filter(
    (s) => s.dateArrivee <= today && (!s.dateDepart || s.dateDepart > today)
  );
  const autres = logement.sejours.filter((s) => !enCours.includes(s));

  return (
    <div className="max-w-[760px]">
      <ErreurBanniere erreur={searchParams.erreur} />
      <LogementForm logement={logement} />

      <h2 className="mb-1 mt-8 text-[16px] font-bold">Séjours</h2>
      <p className="mb-3 text-[12.5px] text-muted">
        Jour d’arrivée <b>inclus</b>, jour de départ <b>exclu</b> — le décompte est
        indépendant des jours travaillés (week-ends et jours de pluie comptent).
        Occupation actuelle : <b>{enCours.length} / {logement.capacite} lits</b>
        {enCours.length > logement.capacite && (
          <span className="badge badge-warn ml-2">sur-occupation</span>
        )}
      </p>

      <div className="card mb-4 p-0">
        {[...enCours, ...autres].map((s) => {
          const actif = enCours.includes(s);
          return (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
            >
              <b className="min-w-[140px] text-[14px]">
                {s.user.prenom} {s.user.nom}
              </b>
              <span className="font-mono text-[12.5px] text-muted">
                {ymd(s.dateArrivee)} → {s.dateDepart ? ymd(s.dateDepart) : 'en cours'}
              </span>
              {actif ? (
                <span className="badge badge-ok">présent</span>
              ) : s.dateDepart && s.dateDepart <= today ? (
                <span className="badge badge-muted">terminé</span>
              ) : (
                <span className="badge badge-amber">à venir</span>
              )}
              <span className="ml-auto flex items-center gap-2">
                {!s.dateDepart && (
                  <form action={cloreSejour} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={s.id} />
                    <input
                      type="date"
                      name="dateDepart"
                      required
                      defaultValue={todayParis()}
                      className="input w-auto px-2 py-1.5 text-[12.5px]"
                    />
                    <button className="btn-sm btn-outline">Clore</button>
                  </form>
                )}
                <form action={supprimerSejour}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn-sm text-warn">✕</button>
                </form>
              </span>
            </div>
          );
        })}
        {logement.sejours.length === 0 && (
          <div className="px-4 py-5 text-center text-[13.5px] text-muted">Aucun séjour.</div>
        )}
      </div>

      <form action={creerSejour} className="card flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="logementId" value={logement.id} />
        <div>
          <label className="label">Ouvrier</label>
          <select name="ouvrierId" required className="input w-auto py-2">
            {ouvriers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.prenom} {o.nom}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Arrivée (incluse)</label>
          <input name="dateArrivee" type="date" required defaultValue={todayParis()} className="input w-auto py-2" />
        </div>
        <div>
          <label className="label">Départ (exclu, optionnel)</label>
          <input name="dateDepart" type="date" className="input w-auto py-2" />
        </div>
        <button className="btn-sm btn-green px-5 py-2.5">Ajouter le séjour</button>
      </form>
    </div>
  );
}
