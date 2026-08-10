import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { todayParis } from '@/lib/dates';
import ErreurBanniere from '@/components/admin/ErreurBanniere';
import { embaucherOuvrier } from '../actions';

export const dynamic = 'force-dynamic';

// Mini-formulaire « Embaucher » (spec B.1) : contrat, dates, taux, logement.
export default async function NouvelleEmbauchePage({
  searchParams
}: {
  searchParams: { user?: string; erreur?: string };
}) {
  const user = await requireAdmin();
  const [profil, modeles, logements, org] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: searchParams.user ?? '',
        organisationId: user.organisationId,
        role: { in: ['OUVRIER', 'CHEF_EQUIPE'] }
      }
    }),
    prisma.modeleContrat.findMany({
      where: { organisationId: user.organisationId, categorie: 'CONTRAT', actif: true },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.logement.findMany({
      where: { organisationId: user.organisationId },
      orderBy: { nom: 'asc' }
    }),
    prisma.organisation.findUnique({ where: { id: user.organisationId } })
  ]);
  if (!profil) notFound();

  const tauxDefaut = Number(profil.tauxHoraire ?? org?.tarifHoraireBase ?? 12.5);

  return (
    <div className="max-w-[560px]">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[21px] font-bold">
          🚀 Embaucher — {profil.prenom} {profil.nom}
          <span className="block text-[13px] font-normal text-muted">
            {profil.telephone} · {profil.langue} · statut {profil.statutProfil}
          </span>
        </h1>
        <Link href={`/admin/vivier/${profil.id}`} className="btn-sm btn-outline">
          ← Profil
        </Link>
      </div>

      <ErreurBanniere erreur={searchParams.erreur} />

      <form action={embaucherOuvrier} className="card space-y-4 p-5">
        <input type="hidden" name="userId" value={profil.id} />
        <div>
          <label className="label">Modèle de contrat</label>
          <select name="modeleContratId" className="input">
            <option value="">Modèle par défaut (CDD saisonnier provisoire)</option>
            {modeles.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nom}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[12px] text-muted">
            Gérez vos modèles dans Paramètres → Modèles de documents.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Début du contrat *</label>
            <input name="dateDebut" type="date" required className="input" defaultValue={todayParis()} />
          </div>
          <div>
            <label className="label">Fin prévue</label>
            <input name="dateFinPrevue" type="date" className="input" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Taux horaire (€/h) *</label>
            <input
              name="tauxHoraire"
              type="number"
              step="0.01"
              min={1}
              required
              className="input"
              defaultValue={tauxDefaut.toFixed(2)}
            />
          </div>
          <div>
            <label className="label">Logement (crée le séjour)</label>
            <select name="logementId" className="input">
              <option value="">Aucun</option>
              {logements.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nom}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn btn-green w-full">
          Créer le dossier d’embauche (checklist + lien ouvrier)
        </button>
        <p className="text-center text-[12px] text-muted">
          L’ouvrier ne passera en ACTIF qu’une fois la checklist complète (identité, n° sécu,
          mutuelle, contrat signé, DPAE). IBAN recommandé mais non bloquant.
        </p>
      </form>
    </div>
  );
}
