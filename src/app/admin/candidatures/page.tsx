import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import ErreurBanniere from '@/components/admin/ErreurBanniere';
import {
  approuverCandidature,
  refuserCandidature,
  listeNoireCandidature,
  accepterProposition,
  refuserProposition,
  listeNoireProposition
} from './actions';

export const dynamic = 'force-dynamic';

export default async function CandidaturesPage({
  searchParams
}: {
  searchParams: { erreur?: string; q?: string };
}) {
  const user = await requireAdmin();

  // Recherche : nom, téléphone OU mot-clé libre dans l'expérience déclarée
  // (ex. « pomme de terre » → tous ceux qui l'ont écrit dans leur candidature)
  const q = searchParams.q?.trim() ?? '';
  const filtreProfil = q
    ? {
        OR: [
          { nom: { contains: q, mode: 'insensitive' as const } },
          { prenom: { contains: q, mode: 'insensitive' as const } },
          { telephone: { contains: q.replace(/[^\d+]/g, '') || q } },
          { experienceDeclaree: { contains: q, mode: 'insensitive' as const } }
        ]
      }
    : {};

  // Propositions des recruteurs externes (spec §D.2), badge « via [Recruteur] »
  const propositions = await prisma.propositionCandidat.findMany({
    where: {
      organisationId: user.organisationId,
      statut: 'PROPOSEE',
      ...(q ? { candidat: filtreProfil } : {})
    },
    include: {
      candidat: { include: { competences: { include: { tag: true } } } },
      recruteur: { select: { prenom: true, nom: true, societe: true } },
      demande: { select: { titre: true } }
    },
    orderBy: { creeAt: 'asc' }
  });

  const candidatures = await prisma.candidature.findMany({
    where: {
      organisationId: user.organisationId,
      statut: 'EN_ATTENTE',
      ...(q ? { user: filtreProfil } : {})
    },
    include: {
      user: { include: { competences: { include: { tag: true } } } }
    },
    orderBy: { creeAt: 'asc' }
  });

  const traitees = await prisma.candidature.findMany({
    where: {
      organisationId: user.organisationId,
      statut: { not: 'EN_ATTENTE' },
      ...(q ? { user: filtreProfil } : {})
    },
    include: { user: true },
    orderBy: { traiteAt: 'desc' },
    take: 15
  });

  return (
    <div>
      <h1 className="mb-5 text-[21px] font-bold">
        Candidatures à valider
        <span className="block text-[13px] font-normal text-muted">
          {candidatures.length} du portail /rejoindre · {propositions.length} proposée
          {propositions.length > 1 ? 's' : ''} par des recruteurs
        </span>
      </h1>

      <ErreurBanniere erreur={searchParams.erreur} />

      {/* Recherche par nom / téléphone / mot-clé d'expérience */}
      <form method="GET" className="card mb-5 flex flex-wrap items-center gap-2 p-3.5">
        <input
          name="q"
          defaultValue={q}
          className="input w-[280px] py-2"
          placeholder="Nom, téléphone ou mot-clé (ex. pomme de terre)"
        />
        <button className="btn-sm btn-ink">🔍 Rechercher</button>
        {q && (
          <a href="/admin/candidatures" className="btn-sm btn-outline">
            ✕ Effacer
          </a>
        )}
        <span className="text-[12px] text-muted">
          Le mot-clé est cherché dans le texte d’expérience écrit par le candidat.
        </span>
      </form>
      {q && (
        <p className="mb-3 text-[13px] text-muted">
          Résultats pour « <b>{q}</b> » : {propositions.length + candidatures.length} en attente
          {traitees.length > 0 ? ` · ${traitees.length} déjà traitée${traitees.length > 1 ? 's' : ''}` : ''}
        </p>
      )}

      {/* Propositions des recruteurs */}
      {propositions.length > 0 && (
        <div className="mb-6 space-y-3">
          {propositions.map((p) => {
            const listeNoire = p.candidat.statutProfil === 'LISTE_NOIRE';
            return (
              <div
                key={p.id}
                className={`card ${listeNoire ? 'border-[3px] border-warn bg-[#FFF3EC]' : 'border-[2px] border-[#B6CBBE]'}`}
              >
                {listeNoire && (
                  <div className="mb-2 rounded-lg bg-warn px-3 py-2 text-[13.5px] font-bold text-white">
                    🚫 PROFIL EN LISTE NOIRE — motif : {p.candidat.listeNoireMotif}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-[200px] flex-1">
                    <b className="text-[15px]">
                      {p.candidat.prenom} {p.candidat.nom}
                    </b>
                    <span className="ml-2 badge badge-ok">
                      via {p.recruteur.societe ?? `${p.recruteur.prenom} ${p.recruteur.nom}`}
                    </span>
                    <span className="ml-1 badge badge-muted">{p.candidat.langue}</span>
                    {p.candidat.permisB && <span className="ml-1 badge badge-ok">🚗 permis</span>}
                    {p.candidat.vehicule && <span className="ml-1 badge badge-ok">🚙 véhiculé</span>}
                    {p.doublonDetecte && !listeNoire && (
                      <span className="ml-1 badge badge-amber">
                        profil déjà connu · {p.candidat.statutProfil}
                      </span>
                    )}
                    <span className="block font-mono text-[13px] text-muted">
                      {p.candidat.telephone} ·{' '}
                      {p.demande ? `demande « ${p.demande.titre} »` : 'proposition spontanée'} ·{' '}
                      {p.creeAt.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}
                    </span>
                    {p.candidat.experienceDeclaree && (
                      <p className="mt-1 text-[13.5px]">« {p.candidat.experienceDeclaree} »</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {p.candidat.competences.map((uc) => (
                        <span key={uc.id} className="badge badge-ok">
                          {uc.tag.libelle}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex gap-2">
                      <Link href={`/admin/vivier/${p.candidat.id}`} className="btn-sm btn-outline">
                        Profil
                      </Link>
                      {!listeNoire && (
                        <form action={accepterProposition}>
                          <input type="hidden" name="id" value={p.id} />
                          <button
                            className="btn-sm btn-green"
                            title="Le placement est compté et la commission devient due si le profil est éligible"
                          >
                            ✓ Accepter → vivier
                          </button>
                        </form>
                      )}
                    </div>
                    <form action={refuserProposition} className="flex items-center gap-1.5">
                      <input type="hidden" name="id" value={p.id} />
                      <input
                        name="motif"
                        placeholder="Motif (optionnel)"
                        className="input w-[170px] px-2 py-1.5 text-[12.5px]"
                      />
                      <button className="btn-sm btn-outline">Refuser</button>
                    </form>
                    {!listeNoire && (
                      <form action={listeNoireProposition} className="flex items-center gap-1.5">
                        <input type="hidden" name="id" value={p.id} />
                        <input
                          name="motif"
                          required
                          placeholder="Motif liste noire (obligatoire)"
                          className="input w-[170px] px-2 py-1.5 text-[12.5px]"
                        />
                        <button className="btn-sm bg-warn text-white">Liste noire</button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-3">
        {candidatures.map((c) => {
          const listeNoire = c.user.statutProfil === 'LISTE_NOIRE';
          const dejaConnu = c.user.source !== 'PORTAIL' || c.user.statutProfil !== 'CANDIDAT';
          return (
            <div
              key={c.id}
              className={`card ${listeNoire ? 'border-[3px] border-warn bg-[#FFF3EC]' : ''}`}
            >
              {listeNoire && (
                <div className="mb-2 rounded-lg bg-warn px-3 py-2 text-[13.5px] font-bold text-white">
                  🚫 CE NUMÉRO CORRESPOND À UN PROFIL EN LISTE NOIRE — motif :{' '}
                  {c.user.listeNoireMotif}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[200px] flex-1">
                  <b className="text-[15px]">
                    {c.user.prenom} {c.user.nom}
                  </b>
                  <span className="ml-2 badge badge-muted">{c.user.langue}</span>
                  {c.user.permisB && <span className="ml-1 badge badge-ok">🚗 permis</span>}
                  {c.user.vehicule && <span className="ml-1 badge badge-ok">🚙 véhiculé</span>}
                  {dejaConnu && !listeNoire && (
                    <span className="ml-1 badge badge-amber">
                      profil existant · {c.user.statutProfil}
                    </span>
                  )}
                  <span className="block font-mono text-[13px] text-muted">
                    {c.user.telephone} · reçu le{' '}
                    {c.creeAt.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}
                  </span>
                  {c.user.experienceDeclaree && (
                    <p className="mt-1 text-[13.5px]">« {c.user.experienceDeclaree} »</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {c.user.competences.map((uc) => (
                      <span key={uc.id} className="badge badge-ok">
                        {uc.tag.libelle}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-2">
                    <Link href={`/admin/vivier/${c.user.id}`} className="btn-sm btn-outline">
                      Profil
                    </Link>
                    {!listeNoire && (
                      <form action={approuverCandidature}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="btn-sm btn-green">✓ Approuver → vivier</button>
                      </form>
                    )}
                  </div>
                  <form action={refuserCandidature} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={c.id} />
                    <input
                      name="motif"
                      placeholder="Motif (optionnel)"
                      className="input w-[170px] px-2 py-1.5 text-[12.5px]"
                    />
                    <button className="btn-sm btn-outline">Refuser</button>
                  </form>
                  {!listeNoire && (
                    <form action={listeNoireCandidature} className="flex items-center gap-1.5">
                      <input type="hidden" name="id" value={c.id} />
                      <input
                        name="motif"
                        required
                        placeholder="Motif liste noire (obligatoire)"
                        className="input w-[170px] px-2 py-1.5 text-[12.5px]"
                      />
                      <button className="btn-sm bg-warn text-white">Liste noire</button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {candidatures.length === 0 && (
          <div className="card py-8 text-center text-muted">
            Aucune candidature en attente. Partagez le lien <b>/rejoindre</b> !
          </div>
        )}
      </div>

      {traitees.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-[16px] font-bold">Dernières traitées</h2>
          <div className="card p-0">
            {traitees.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 border-b border-line px-4 py-2 text-[13px] last:border-b-0"
              >
                <span className="flex-1 font-semibold">
                  {c.user.prenom} {c.user.nom}
                </span>
                <span
                  className={`badge ${c.statut === 'APPROUVEE' ? 'badge-ok' : 'badge-warn'}`}
                >
                  {c.statut === 'APPROUVEE' ? 'approuvée' : 'refusée'}
                </span>
                <span className="text-muted">
                  {c.traiteAt?.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
