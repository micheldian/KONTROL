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
  searchParams: { erreur?: string };
}) {
  const user = await requireAdmin();

  // Propositions des recruteurs externes (spec §D.2), badge « via [Recruteur] »
  const propositions = await prisma.propositionCandidat.findMany({
    where: { organisationId: user.organisationId, statut: 'PROPOSEE' },
    include: {
      candidat: { include: { competences: { include: { tag: true } } } },
      recruteur: { select: { prenom: true, nom: true, societe: true } },
      demande: { select: { titre: true } }
    },
    orderBy: { creeAt: 'asc' }
  });

  const candidatures = await prisma.candidature.findMany({
    where: { organisationId: user.organisationId, statut: 'EN_ATTENTE' },
    include: {
      user: { include: { competences: { include: { tag: true } } } }
    },
    orderBy: { creeAt: 'asc' }
  });

  const traitees = await prisma.candidature.findMany({
    where: { organisationId: user.organisationId, statut: { not: 'EN_ATTENTE' } },
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
