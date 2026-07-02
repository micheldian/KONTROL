import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { todayParis, addDays, dateFromYMD, formatJour } from '@/lib/dates';
import {
  createAffectation,
  deleteAffectation,
  dupliquerHier,
  publierJour
} from './actions';

export const dynamic = 'force-dynamic';

export default async function AffectationsPage({
  searchParams
}: {
  searchParams: { date?: string; info?: string; parcelles?: string };
}) {
  const user = await requireAdmin();
  const today = todayParis();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date ?? '')
    ? searchParams.date!
    : addDays(today, 1); // par défaut : planification J+1

  // Pré-sélection de parcelles depuis la carte (/admin/carte → « Créer une affectation »)
  const preselection = new Set((searchParams.parcelles ?? '').split(',').filter(Boolean));

  const [affectations, missions, ouvriers, parcelles] = await Promise.all([
    prisma.affectation.findMany({
      where: { organisationId: user.organisationId, date: dateFromYMD(date) },
      include: {
        mission: { include: { client: true } },
        parcelles: { include: { parcelle: true } },
        ouvriers: { include: { user: true } }
      },
      orderBy: { heureDebut: 'asc' }
    }),
    prisma.mission.findMany({
      where: { organisationId: user.organisationId, statut: 'ACTIVE' },
      include: { client: true },
      orderBy: { libelle: 'asc' }
    }),
    prisma.user.findMany({
      where: {
        organisationId: user.organisationId,
        role: { in: ['OUVRIER', 'CHEF_EQUIPE'] },
        statutProfil: 'ACTIF'
      },
      orderBy: [{ estChefEquipe: 'desc' }, { nom: 'asc' }]
    }),
    prisma.parcelle.findMany({
      where: { organisationId: user.organisationId },
      include: { client: { select: { id: true, nom: true } } },
      orderBy: [{ client: { nom: 'asc' } }, { commune: 'asc' }, { numero: 'asc' }]
    })
  ]);

  const nonPubliees = affectations.filter((a) => !a.publieAt).length;
  const totalConfirmes = affectations.reduce(
    (acc, a) => acc + a.ouvriers.filter((o) => o.confirme).length,
    0
  );
  const totalOuvriers = affectations.reduce((acc, a) => acc + a.ouvriers.length, 0);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-bold">
          Affectations
          <span className="block text-[13px] font-normal text-muted">
            {formatJour(date, 'fr')} · {affectations.length} affectation
            {affectations.length > 1 ? 's' : ''} · confirmations {totalConfirmes}/
            {totalOuvriers}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <Link href={`/admin/affectations?date=${addDays(date, -1)}`} className="btn-sm btn-outline">
            ←
          </Link>
          <form action="/admin/affectations" className="inline">
            <input
              type="date"
              name="date"
              defaultValue={date}
              className="input w-auto py-2"
            />
          </form>
          <Link href={`/admin/affectations?date=${addDays(date, 1)}`} className="btn-sm btn-outline">
            →
          </Link>
          <Link href={`/admin/affectations?date=${today}`} className="btn-sm btn-outline">
            Aujourd&apos;hui
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <form action={dupliquerHier}>
          <input type="hidden" name="date" value={date} />
          <button className="btn-sm btn-amber">⧉ Dupliquer hier</button>
        </form>
        {nonPubliees > 0 && (
          <form action={publierJour}>
            <input type="hidden" name="date" value={date} />
            <button className="btn-sm btn-green">
              📣 Publier le jour ({nonPubliees} en brouillon)
            </button>
          </form>
        )}
        {searchParams.info === 'rien-a-dupliquer' && (
          <span className="badge badge-warn">Rien à dupliquer la veille</span>
        )}
      </div>

      {/* Liste des affectations du jour */}
      <div className="space-y-3">
        {affectations.map((a) => (
          <div key={a.id} className="card p-0">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
              <span className="slot-chip">
                {a.heureDebut}
                {a.heureFinPrevue ? ` → ${a.heureFinPrevue}` : ''}
              </span>
              <div className="min-w-[180px] flex-1">
                <b className="text-[14.5px]">
                  {a.mission.client.nom} — {a.mission.libelle}
                </b>
                <span className="block text-[12.5px] text-muted">
                  📍{' '}
                  {a.parcelles.length > 0
                    ? a.parcelles
                        .map((ap) =>
                          ap.parcelle.section && ap.parcelle.numero
                            ? `${ap.parcelle.commune ?? ''} ${ap.parcelle.section} ${ap.parcelle.numero}`.trim()
                            : ap.parcelle.adresse ?? 'parcelle'
                        )
                        .join(' · ')
                    : a.mission.client.adresse ?? 'adresse non définie'}
                  {a.pauseMinutesPrevue ? ` · pause ${a.pauseMinutesPrevue} min` : ''}
                </span>
                {a.instructions && (
                  <span className="block text-[12.5px] text-[#B07900]">
                    ⚠ {a.instructions}
                  </span>
                )}
              </div>
              {a.publieAt ? (
                <span className="badge badge-ok">Publiée</span>
              ) : (
                <span className="badge badge-amber">Brouillon</span>
              )}
              <Link href={`/admin/affectations/${a.id}/messages`} className="btn-sm btn-outline">
                ✉ Messages
              </Link>
              <form action={deleteAffectation}>
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="date" value={date} />
                <button className="btn-sm text-warn">Supprimer</button>
              </form>
            </div>
            <div className="flex flex-wrap gap-2 px-4 py-3">
              {a.ouvriers.map((ao) => (
                <span
                  key={ao.id}
                  className={`badge ${ao.confirme ? 'badge-ok' : 'badge-warn'}`}
                  title={ao.confirme ? 'A confirmé « J’y serai »' : 'Pas encore confirmé'}
                >
                  {ao.confirme ? '✓' : '⏳'} {ao.user.prenom} {ao.user.nom}
                  {a.chefEquipeId === ao.userId ? ' · chef' : ''}
                </span>
              ))}
            </div>
          </div>
        ))}
        {affectations.length === 0 && (
          <div className="card py-8 text-center text-muted">
            Aucune affectation ce jour. Créez-en une ci-dessous ou dupliquez hier.
          </div>
        )}
      </div>

      {/* Création */}
      <h2 className="mb-3 mt-8 text-[16px] font-bold">Nouvelle affectation</h2>
      <form action={createAffectation} className="card space-y-4 p-5">
        <input type="hidden" name="date" value={date} />
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label">Mission *</label>
            <select name="missionId" required className="input" defaultValue="">
              <option value="" disabled>
                — Choisir —
              </option>
              {missions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.client.nom} — {m.libelle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Chef d’équipe du jour</label>
            <select name="chefEquipeId" className="input" defaultValue="">
              <option value="">— Aucun —</option>
              {ouvriers
                .filter((o) => o.estChefEquipe)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.prenom} {o.nom}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">
            Parcelle(s) — multi-sélection, celles du client de la mission choisie
          </label>
          <div className="grid max-h-[180px] grid-cols-1 gap-1 overflow-y-auto rounded-xl border-[1.5px] border-line bg-paper p-3 md:grid-cols-2">
            {parcelles.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  name="parcelleIds"
                  value={p.id}
                  defaultChecked={preselection.has(p.id)}
                  className="h-4 w-4 accent-brand"
                />
                <span className="text-muted">{p.client.nom} —</span>{' '}
                {p.section && p.numero
                  ? `${p.commune ?? p.codeInsee} ${p.section} ${p.numero}`
                  : p.adresse}
                {p.surfaceM2 ? (
                  <span className="text-[11.5px] text-muted">
                    {(p.surfaceM2 / 10000).toFixed(2).replace('.', ',')} ha
                  </span>
                ) : null}
              </label>
            ))}
            {parcelles.length === 0 && (
              <span className="text-[12.5px] text-muted">
                Aucune parcelle enregistrée — fiche client, carte ou import.
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Heure de début *</label>
            <input name="heureDebut" type="time" required className="input" defaultValue="07:30" />
          </div>
          <div>
            <label className="label">Heure de fin prévue</label>
            <input name="heureFinPrevue" type="time" className="input" />
          </div>
          <div>
            <label className="label">Pause prévue (min)</label>
            <input name="pauseMinutesPrevue" type="number" min={0} step={5} className="input" defaultValue={0} />
          </div>
        </div>
        <div>
          <label className="label">Instructions (visibles par les ouvriers)</label>
          <input name="instructions" className="input" placeholder="Ex. : Apporter sécateurs…" />
        </div>
        <div>
          <label className="label">
            Ouvriers * (cocher — le chef d’équipe doit aussi être coché)
          </label>
          <div className="grid max-h-[220px] grid-cols-2 gap-1 overflow-y-auto rounded-xl border-[1.5px] border-line bg-paper p-3 md:grid-cols-3">
            {ouvriers.map((o) => (
              <label key={o.id} className="flex cursor-pointer items-center gap-2 text-[13.5px]">
                <input type="checkbox" name="ouvrierIds" value={o.id} className="h-4 w-4 accent-brand" />
                {o.prenom} {o.nom}
                {o.estChefEquipe && <span className="badge badge-amber">chef</span>}
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button type="submit" className="btn-sm btn-green px-6 py-3">
            Créer l’affectation
          </button>
          <label className="flex items-center gap-2 text-[13.5px]">
            <input type="checkbox" name="publier" className="h-4 w-4 accent-brand" defaultChecked />
            Publier immédiatement (visible portail)
          </label>
        </div>
      </form>
    </div>
  );
}
