import { requireRecruteur } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { proposerCandidat } from '../actions';

export const dynamic = 'force-dynamic';

// Formulaire type /rejoindre + rattachement recruteur/demande (spec §C.2).
export default async function ProposerCandidatPage({
  searchParams
}: {
  searchParams: { demande?: string; erreur?: string };
}) {
  const user = await requireRecruteur();

  const [demande, tags] = await Promise.all([
    searchParams.demande
      ? prisma.demandeMainOeuvre.findFirst({
          where: {
            id: searchParams.demande,
            organisationId: user.organisationId,
            statut: 'OUVERTE'
          }
        })
      : null,
    prisma.competenceTag.findMany({
      where: { organisationId: user.organisationId, actif: true },
      orderBy: { libelle: 'asc' }
    })
  ]);

  return (
    <div className="max-w-[560px]">
      <h1 className="mb-1 text-[21px] font-bold">
        {demande ? `Proposer un candidat — ${demande.titre}` : 'Proposer un candidat au vivier'}
      </h1>
      <p className="mb-5 text-[13px] text-muted">
        {demande
          ? 'Le candidat sera rattaché à cette demande.'
          : 'Proposition spontanée, hors demande.'}{' '}
        Le téléphone sert de clé unique : un profil déjà connu de l’organisation sera signalé.
      </p>

      {searchParams.erreur && (
        <div className="mb-4 rounded-card border-[1.5px] border-[#F3C1A8] bg-[#FFF3EC] px-4 py-3 text-[13.5px] font-semibold text-warn">
          ⚠ {searchParams.erreur}
        </div>
      )}

      <form action={proposerCandidat} className="card space-y-4 p-5">
        {demande && <input type="hidden" name="demandeId" value={demande.id} />}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Prénom *</label>
            <input name="prenom" required className="input" />
          </div>
          <div>
            <label className="label">Nom *</label>
            <input name="nom" required className="input" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Téléphone * (clé unique)</label>
            <input name="telephone" type="tel" required className="input" placeholder="+40 7…" />
          </div>
          <div>
            <label className="label">Langue *</label>
            <select name="langue" className="input" defaultValue="RO">
              <option value="RO">Română</option>
              <option value="FR">Français</option>
              <option value="ES">Español</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Expérience (texte libre)</label>
          <textarea
            name="experienceDeclaree"
            rows={2}
            className="input"
            placeholder="Ex. 3 saisons de vendanges en Champagne…"
          />
        </div>
        <div>
          <label className="label">Compétences</label>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <label key={t.id} className="badge badge-muted cursor-pointer">
                <input type="checkbox" name="tagIds" value={t.id} className="mr-1 accent-brand" />
                {t.libelle}
              </label>
            ))}
          </div>
        </div>
        <button type="submit" className="btn btn-green w-full">
          Envoyer la proposition
        </button>
        <p className="text-center text-[12px] text-muted">
          La commission devient due quand l’organisation accepte le candidat (profils déjà
          connus : voir règles anti-doublon).
        </p>
      </form>
    </div>
  );
}
