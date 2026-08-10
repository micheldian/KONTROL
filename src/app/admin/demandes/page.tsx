import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatDate, formatEuros, todayParis, ymd } from '@/lib/dates';
import { parametresRecrutement } from '@/lib/recruteurs';
import ErreurBanniere from '@/components/admin/ErreurBanniere';
import { saveDemande, changerStatutDemande, supprimerDemande } from './actions';

export const dynamic = 'force-dynamic';

const STATUT_BADGE: Record<string, string> = {
  OUVERTE: 'badge-ok',
  POURVUE: 'badge-amber',
  FERMEE: 'badge-muted'
};

export default async function DemandesPage({
  searchParams
}: {
  searchParams: { erreur?: string };
}) {
  const user = await requireAdmin();

  const [demandes, tags, org, nbRecruteurs] = await Promise.all([
    prisma.demandeMainOeuvre.findMany({
      where: { organisationId: user.organisationId },
      include: {
        competences: { include: { tag: true } },
        propositions: { select: { statut: true } }
      },
      orderBy: [{ statut: 'asc' }, { dateDebut: 'asc' }]
    }),
    prisma.competenceTag.findMany({
      where: { organisationId: user.organisationId, actif: true },
      orderBy: { libelle: 'asc' }
    }),
    prisma.organisation.findUnique({ where: { id: user.organisationId } }),
    prisma.user.count({
      where: { organisationId: user.organisationId, role: 'RECRUTEUR', actif: true }
    })
  ]);
  const params = parametresRecrutement(org?.parametres);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-bold">
          Demandes de main-d’œuvre
          <span className="block text-[13px] font-normal text-muted">
            {nbRecruteurs} recruteur{nbRecruteurs > 1 ? 's' : ''} actif
            {nbRecruteurs > 1 ? 's' : ''} · commission par défaut{' '}
            {formatEuros(params.commissionDefaut)} (Paramètres)
          </span>
        </h1>
        <Link href="/admin/recruteurs" className="btn-sm btn-outline">
          Recruteurs & commissions →
        </Link>
      </div>

      <ErreurBanniere erreur={searchParams.erreur} />

      <div className="space-y-3">
        {demandes.map((d) => {
          const acceptees = d.propositions.filter((p) => p.statut === 'ACCEPTEE').length;
          const enAttente = d.propositions.filter((p) => p.statut === 'PROPOSEE').length;
          return (
            <div key={d.id} className="card">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-[240px] flex-1">
                  <b className="text-[15.5px]">{d.titre}</b>
                  <div className="mt-0.5 text-[13px] text-muted">
                    👥 {acceptees}/{d.nbPersonnes} pourvus
                    {enAttente > 0 ? ` · ${enAttente} proposition${enAttente > 1 ? 's' : ''} en attente` : ''}{' '}
                    · 📅 {formatDate(ymd(d.dateDebut))}
                    {d.dateFin ? ` → ${formatDate(ymd(d.dateFin))}` : ''}
                    {d.region ? ` · 📍 ${d.region}` : ''} · 💰{' '}
                    {formatEuros(Number(d.commissionParPlacement))}/placement
                  </div>
                  {d.competences.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.competences.map((c) => (
                        <span key={c.id} className="badge badge-muted">
                          {c.tag.libelle}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className={`badge ${STATUT_BADGE[d.statut]}`}>{d.statut.toLowerCase()}</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link href={`/admin/demandes/${d.id}/notifier`} className="btn-sm btn-ink">
                    📣 Notifier
                  </Link>
                  {d.statut === 'OUVERTE' ? (
                    <form action={changerStatutDemande}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="statut" value="FERMEE" />
                      <button className="btn-sm btn-outline">Fermer</button>
                    </form>
                  ) : (
                    <form action={changerStatutDemande}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="statut" value="OUVERTE" />
                      <button className="btn-sm btn-outline">Rouvrir</button>
                    </form>
                  )}
                  <form action={supprimerDemande}>
                    <input type="hidden" name="id" value={d.id} />
                    <button className="btn-sm text-warn">Suppr.</button>
                  </form>
                </div>
              </div>
            </div>
          );
        })}
        {demandes.length === 0 && (
          <div className="card py-8 text-center text-muted">
            Aucune demande. Publiez-en une ci-dessous — les recruteurs seront notifiés.
          </div>
        )}
      </div>

      {/* Création */}
      <h2 className="mb-3 mt-8 text-[16px] font-bold">Nouvelle demande</h2>
      <form action={saveDemande} className="card space-y-4 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="label">Titre *</label>
            <input name="titre" required className="input" placeholder="Ex. Taille — Champagne" />
          </div>
          <div>
            <label className="label">Personnes recherchées *</label>
            <input name="nbPersonnes" type="number" min={1} required className="input" defaultValue={5} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="label">Début *</label>
            <input name="dateDebut" type="date" required className="input" defaultValue={todayParis()} />
          </div>
          <div>
            <label className="label">Fin</label>
            <input name="dateFin" type="date" className="input" />
          </div>
          <div>
            <label className="label">Région / lieu</label>
            <input name="region" className="input" placeholder="Ex. Champagne (51)" />
          </div>
          <div>
            <label className="label">Commission € (vide = {params.commissionDefaut})</label>
            <input name="commissionParPlacement" type="number" step="0.01" min={0} className="input" />
          </div>
        </div>
        <div>
          <label className="label">Description</label>
          <textarea name="description" rows={2} className="input" placeholder="Détails de la mission…" />
        </div>
        <div>
          <label className="label">Conditions affichées (salaire indicatif, logement…)</label>
          <input name="conditions" className="input" placeholder="Ex. 13 €/h, logement fourni" />
        </div>
        <div>
          <label className="label">Compétences requises</label>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <label key={t.id} className="badge badge-muted cursor-pointer">
                <input type="checkbox" name="tagIds" value={t.id} className="mr-1 accent-brand" />
                {t.libelle}
              </label>
            ))}
          </div>
        </div>
        <button className="btn-sm btn-green px-6 py-3">
          📣 Publier la demande (puis notifier les recruteurs)
        </button>
      </form>
    </div>
  );
}
