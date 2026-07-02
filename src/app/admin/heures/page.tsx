import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { todayParis, dateFromYMD, ymd, formatHeures, addDays } from '@/lib/dates';
import {
  validerCreneau,
  validerEnMasse,
  corrigerCreneau,
  saisieManuelle
} from './actions';

export const dynamic = 'force-dynamic';

const STATUTS = ['EN_ATTENTE', 'VALIDE', 'CORRIGE'] as const;

export default async function HeuresAdminPage({
  searchParams
}: {
  searchParams: { date?: string; statut?: string; missionId?: string; ouvrierId?: string; tous?: string };
}) {
  const user = await requireAdmin();
  const today = todayParis();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '') ? searchParams.date! : today;
  const statut = STATUTS.includes(searchParams.statut as never)
    ? (searchParams.statut as (typeof STATUTS)[number])
    : undefined;
  const toutEnAttente = searchParams.tous === '1';

  const where = {
    organisationId: user.organisationId,
    ...(toutEnAttente
      ? { statut: 'EN_ATTENTE' as const }
      : {
          date: dateFromYMD(date),
          ...(statut ? { statut } : {}),
          ...(searchParams.missionId ? { missionId: searchParams.missionId } : {}),
          ...(searchParams.ouvrierId ? { userId: searchParams.ouvrierId } : {})
        })
  };

  const [creneaux, missions, ouvriers] = await Promise.all([
    prisma.creneauHeures.findMany({
      where,
      include: {
        user: true,
        mission: { include: { client: true } }
      },
      orderBy: [{ date: 'desc' }, { user: { nom: 'asc' } }, { heureDebut: 'asc' }],
      take: 300
    }),
    prisma.mission.findMany({
      where: { organisationId: user.organisationId },
      include: { client: true },
      orderBy: { libelle: 'asc' }
    }),
    prisma.user.findMany({
      where: {
        organisationId: user.organisationId,
        role: { in: ['OUVRIER', 'CHEF_EQUIPE'] }
      },
      orderBy: [{ nom: 'asc' }]
    })
  ]);

  const enAttente = creneaux.filter((c) => c.statut === 'EN_ATTENTE');
  const saisisseurs = new Map(ouvriers.map((o) => [o.id, `${o.prenom} ${o.nom}`]));
  const totalHeures = creneaux.reduce((a, c) => a + Number(c.heuresCalculees), 0);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-bold">
          Heures
          <span className="block text-[13px] font-normal text-muted">
            {toutEnAttente ? 'Tous les créneaux en attente' : `Jour : ${date}`} ·{' '}
            {creneaux.length} créneau{creneaux.length > 1 ? 'x' : ''} ·{' '}
            {formatHeures(totalHeures)}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <Link href={`/admin/heures?date=${addDays(date, -1)}`} className="btn-sm btn-outline">←</Link>
          <span className="font-mono text-[13px]">{date}</span>
          <Link href={`/admin/heures?date=${addDays(date, 1)}`} className="btn-sm btn-outline">→</Link>
          <Link
            href="/admin/heures?tous=1"
            className={`btn-sm ${toutEnAttente ? 'btn-ink' : 'btn-outline'}`}
          >
            ⏳ Tout l’en-attente
          </Link>
        </div>
      </div>

      {/* Filtres (vues par mission / ouvrier / jour — spec 4.5) */}
      {!toutEnAttente && (
        <form className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="date" value={date} />
          <div>
            <label className="label">Statut</label>
            <select name="statut" className="input w-auto py-2" defaultValue={statut ?? ''}>
              <option value="">Tous</option>
              <option value="EN_ATTENTE">En attente</option>
              <option value="VALIDE">Validé</option>
              <option value="CORRIGE">Corrigé</option>
            </select>
          </div>
          <div>
            <label className="label">Mission</label>
            <select name="missionId" className="input w-auto py-2" defaultValue={searchParams.missionId ?? ''}>
              <option value="">Toutes</option>
              {missions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.client.nom} — {m.libelle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Ouvrier</label>
            <select name="ouvrierId" className="input w-auto py-2" defaultValue={searchParams.ouvrierId ?? ''}>
              <option value="">Tous</option>
              {ouvriers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.prenom} {o.nom}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-sm btn-outline">Filtrer</button>
        </form>
      )}

      {/* Validation en masse */}
      {enAttente.length > 0 && (
        <form action={validerEnMasse} className="mb-3">
          {enAttente.map((c) => (
            <input key={c.id} type="hidden" name="ids" value={c.id} />
          ))}
          <button className="btn-sm btn-green">
            ✓ Tout valider ({enAttente.length} ligne{enAttente.length > 1 ? 's' : ''})
          </button>
        </form>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="table-admin">
          <thead>
            <tr>
              <th>Date</th>
              <th>Ouvrier</th>
              <th>Mission</th>
              <th>Créneau</th>
              <th>Heures</th>
              <th>Saisi par</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {creneaux.map((c) => (
              <tr key={c.id}>
                <td className="font-mono text-[12.5px]">{ymd(c.date)}</td>
                <td className="font-semibold">
                  {c.user.prenom} {c.user.nom}
                </td>
                <td className="text-[13px]">
                  {c.mission.client.nom} — {c.mission.libelle}
                </td>
                <td className="font-mono text-[13px]">
                  {c.heureDebut}–{c.heureFin}
                  {c.pauseMinutes ? ` (p. ${c.pauseMinutes}′)` : ''}
                </td>
                <td className="font-mono font-bold">{formatHeures(Number(c.heuresCalculees))}</td>
                <td className="text-[12.5px] text-muted">
                  {c.saisiParId === c.userId
                    ? 'lui-même'
                    : saisisseurs.get(c.saisiParId) ?? 'bureau'}
                </td>
                <td>
                  <span
                    className={`badge ${
                      c.statut === 'VALIDE'
                        ? 'badge-ok'
                        : c.statut === 'CORRIGE'
                          ? 'badge-amber'
                          : 'badge-warn'
                    }`}
                    title={c.commentaire ?? undefined}
                  >
                    {c.statut === 'EN_ATTENTE' ? 'En attente' : c.statut === 'VALIDE' ? 'Validé' : 'Corrigé'}
                  </span>
                </td>
                <td>
                  <div className="flex items-center justify-end gap-1.5">
                    {c.statut === 'EN_ATTENTE' && (
                      <form action={validerCreneau}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="btn-sm btn-green">Valider</button>
                      </form>
                    )}
                    <details className="relative">
                      <summary className="btn-sm btn-outline cursor-pointer list-none">
                        Corriger
                      </summary>
                      <form
                        action={corrigerCreneau}
                        className="absolute right-0 z-20 mt-1 w-[290px] space-y-2 rounded-card border-[1.5px] border-line bg-white p-3 shadow-lg"
                      >
                        <input type="hidden" name="id" value={c.id} />
                        <div className="grid grid-cols-3 gap-1.5">
                          <input name="heureDebut" type="time" defaultValue={c.heureDebut} className="input px-1.5 py-1.5 text-[13px]" />
                          <input name="heureFin" type="time" defaultValue={c.heureFin} className="input px-1.5 py-1.5 text-[13px]" />
                          <input name="pauseMinutes" type="number" min={0} step={5} defaultValue={c.pauseMinutes} className="input px-1.5 py-1.5 text-[13px]" />
                        </div>
                        <input name="commentaire" placeholder="Motif de la correction" className="input px-2 py-1.5 text-[13px]" />
                        <button className="btn-sm btn-ink w-full">Corriger et valider</button>
                      </form>
                    </details>
                  </div>
                </td>
              </tr>
            ))}
            {creneaux.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted">
                  Aucun créneau pour ces critères.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Saisie manuelle admin */}
      <h2 className="mb-3 mt-8 text-[16px] font-bold">Saisie manuelle (validée directement)</h2>
      <form action={saisieManuelle} className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">Ouvrier</label>
          <select name="ouvrierId" required className="input w-auto py-2">
            {ouvriers
              .filter((o) => o.statutProfil === 'ACTIF')
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.prenom} {o.nom}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="label">Mission</label>
          <select name="missionId" required className="input w-auto py-2">
            {missions
              .filter((m) => m.statut === 'ACTIVE')
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.client.nom} — {m.libelle}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input name="date" type="date" required defaultValue={date} className="input w-auto py-2" />
        </div>
        <div>
          <label className="label">Début</label>
          <input name="heureDebut" type="time" required className="input w-auto py-2" />
        </div>
        <div>
          <label className="label">Fin</label>
          <input name="heureFin" type="time" required className="input w-auto py-2" />
        </div>
        <div>
          <label className="label">Pause (min)</label>
          <input name="pauseMinutes" type="number" min={0} step={5} defaultValue={0} className="input w-[90px] py-2" />
        </div>
        <button className="btn-sm btn-green px-5 py-2.5">Ajouter</button>
      </form>
    </div>
  );
}
