import Link from 'next/link';
import ErreurBanniere from '@/components/admin/ErreurBanniere';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { historiqueProfil } from '@/lib/historique';
import { formatHeures } from '@/lib/dates';
import {
  noterProfil,
  majTagsProfil,
  majNotesInternes,
  reactiverProfil,
  remettreAuVivier,
  mettreListeNoire,
  sortirListeNoire
} from '../actions';

export const dynamic = 'force-dynamic';

export default async function ProfilVivierPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { erreur?: string };
}) {
  const user = await requireAdmin();
  const [profil, tags] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: params.id,
        organisationId: user.organisationId,
        role: { in: ['OUVRIER', 'CHEF_EQUIPE'] }
      },
      include: { competences: { include: { tag: true } } }
    }),
    prisma.competenceTag.findMany({
      where: { organisationId: user.organisationId, actif: true },
      orderBy: { libelle: 'asc' }
    })
  ]);
  if (!profil) notFound();

  const historique = await historiqueProfil(user.organisationId, profil.id);
  const auteurListeNoire = profil.listeNoireParId
    ? await prisma.user.findUnique({ where: { id: profil.listeNoireParId } })
    : null;
  const tagsActuels = new Set(profil.competences.map((c) => c.tagId));
  const estAdmin = user.role === 'ADMIN';

  return (
    <div className="max-w-[860px]">
      {/* Bandeau rouge liste noire (spec 4.12) */}
      {profil.statutProfil === 'LISTE_NOIRE' && (
        <div className="mb-4 rounded-card bg-warn px-4 py-3 text-white">
          <b>🚫 LISTE NOIRE — à ne jamais rappeler.</b> Motif : {profil.listeNoireMotif}
          <span className="block text-[12.5px] opacity-90">
            Le {profil.listeNoireAt?.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}
            {auteurListeNoire ? ` par ${auteurListeNoire.prenom} ${auteurListeNoire.nom}` : ''}
          </span>
          {estAdmin && (
            <form action={sortirListeNoire} className="mt-2">
              <input type="hidden" name="id" value={profil.id} />
              <button className="btn-sm bg-white text-warn">
                Sortir de la liste noire (ADMIN, tracé)
              </button>
            </form>
          )}
        </div>
      )}

      <ErreurBanniere erreur={searchParams.erreur} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-bold">
          {profil.prenom} {profil.nom}
          <span className="block text-[13px] font-normal text-muted">
            {profil.telephone} · {profil.langue} · statut {profil.statutProfil} · source{' '}
            {profil.source.toLowerCase()}
          </span>
        </h1>
        <div className="flex gap-2">
          {(profil.statutProfil === 'VIVIER' || profil.statutProfil === 'INACTIF') && (
            <form action={reactiverProfil} className="flex items-center gap-1.5">
              <input type="hidden" name="id" value={profil.id} />
              {!profil.pinHash && (
                <input
                  name="pin"
                  placeholder="PIN 4 chiffres"
                  required
                  pattern="\d{4}"
                  inputMode="numeric"
                  maxLength={4}
                  title="4 chiffres — obligatoire pour ouvrir l’accès portail"
                  className="input w-[110px] px-2 py-1.5 font-mono text-[13px]"
                />
              )}
              <button className="btn-sm btn-green" title="L'historique complet est conservé">
                ⚡ Réactiver → ACTIF
              </button>
            </form>
          )}
          {profil.statutProfil === 'ACTIF' && (
            <form action={remettreAuVivier}>
              <input type="hidden" name="id" value={profil.id} />
              <button
                className="btn-sm btn-outline"
                title="Fin de mission : retour au vivier (historique et PIN conservés, accès portail coupé)"
              >
                ↩ Remettre au vivier
              </button>
            </form>
          )}
          {profil.statutProfil !== 'LISTE_NOIRE' && (
            <Link href={`/admin/vivier/contact?ids=${profil.id}`} className="btn-sm btn-ink">
              💬 Contacter
            </Link>
          )}
          <Link href={`/admin/ouvriers/${profil.id}`} className="btn-sm btn-outline">
            Fiche ouvrier
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Note 5★ — ADMIN uniquement, jamais visible par l'ouvrier */}
        <div className="card p-5">
          <h2 className="mb-2 text-[15px] font-bold">
            Note (interne, jamais visible par l’ouvrier)
          </h2>
          {estAdmin ? (
            <form action={noterProfil} className="space-y-3">
              <input type="hidden" name="id" value={profil.id} />
              <div className="flex gap-1.5" role="radiogroup" aria-label="Note sur 5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="cursor-pointer">
                    <input
                      type="radio"
                      name="note"
                      value={n}
                      defaultChecked={profil.note === n}
                      className="peer sr-only"
                    />
                    <span
                      className={`text-[26px] ${
                        profil.note && n <= profil.note ? 'text-[#B07900]' : 'text-line'
                      } peer-checked:text-[#B07900]`}
                    >
                      ★
                    </span>
                  </label>
                ))}
                <label className="ml-2 flex items-center gap-1 text-[12px] text-muted">
                  <input type="radio" name="note" value="" defaultChecked={!profil.note} />
                  sans note
                </label>
              </div>
              <textarea
                name="noteCommentaire"
                rows={2}
                placeholder="Ex. : très bon tailleur, ponctuel, à rappeler en priorité"
                defaultValue={profil.noteCommentaire ?? ''}
                className="input text-[13.5px]"
              />
              <button className="btn-sm btn-green">Enregistrer la note</button>
            </form>
          ) : (
            <div>
              <span className="text-[24px] text-[#B07900]">
                {profil.note ? '★'.repeat(profil.note) : '—'}
              </span>
              {profil.noteCommentaire && (
                <p className="mt-1 text-[13.5px] text-muted">« {profil.noteCommentaire} »</p>
              )}
              <p className="mt-2 text-[12px] text-muted">Modification réservée à l’ADMIN.</p>
            </div>
          )}
        </div>

        {/* Historique automatique */}
        <div className="card p-5">
          <h2 className="mb-2 text-[15px] font-bold">Historique (alimenté par Krontrol)</h2>
          <div className="space-y-1.5 text-[13.5px]">
            <div>
              <b>Saisons :</b>{' '}
              {historique.saisons.length > 0
                ? historique.saisons
                    .map((s) => `${s.annee} (${formatHeures(s.heures)})`)
                    .join(' · ')
                : 'aucune heure validée'}
            </div>
            <div>
              <b>Missions :</b>{' '}
              {historique.missions.length > 0
                ? historique.missions
                    .slice(0, 5)
                    .map((m) => `${m.client} — ${m.libelle} (${formatHeures(m.heures)})`)
                    .join(' · ')
                : '—'}
            </div>
            <div>
              <b>Confirmations « J’y serai » :</b>{' '}
              {historique.tauxConfirmation !== null
                ? `${historique.tauxConfirmation} % sur ${historique.totalAffectations} affectations`
                : '—'}
            </div>
            <div>
              <b>Logements :</b>{' '}
              {historique.logements.length > 0 ? historique.logements.join(' · ') : '—'}
            </div>
            {profil.experienceDeclaree && (
              <div>
                <b>Expérience déclarée :</b> « {profil.experienceDeclaree} »
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tags de compétences */}
      <form action={majTagsProfil} className="card mt-4 p-5">
        <input type="hidden" name="id" value={profil.id} />
        <h2 className="mb-2 text-[15px] font-bold">Compétences</h2>
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <label
              key={t.id}
              className={`badge cursor-pointer ${
                tagsActuels.has(t.id) ? 'badge-ok' : 'badge-muted'
              }`}
            >
              <input
                type="checkbox"
                name="tagIds"
                value={t.id}
                defaultChecked={tagsActuels.has(t.id)}
                className="mr-1 accent-brand"
              />
              {t.libelle}
            </label>
          ))}
        </div>
        <button className="btn-sm btn-green mt-3">Enregistrer les compétences</button>
      </form>

      {/* Notes internes */}
      <form action={majNotesInternes} className="card mt-4 p-5">
        <input type="hidden" name="id" value={profil.id} />
        <h2 className="mb-2 text-[15px] font-bold">Notes internes</h2>
        <textarea
          name="notesInternes"
          rows={3}
          defaultValue={profil.notesInternes ?? ''}
          className="input text-[13.5px]"
        />
        <button className="btn-sm btn-green mt-3">Enregistrer</button>
      </form>

      {/* Liste noire */}
      {profil.statutProfil !== 'LISTE_NOIRE' && (
        <form
          action={mettreListeNoire}
          className="card mt-4 border-[#F3C1A8] bg-[#FFF3EC] p-5"
        >
          <input type="hidden" name="id" value={profil.id} />
          <h2 className="mb-2 text-[15px] font-bold text-warn">Mettre en liste noire</h2>
          <div className="flex gap-2">
            <input
              name="motif"
              required
              placeholder="Motif obligatoire (date et auteur tracés)"
              className="input flex-1 py-2"
            />
            <button className="btn-sm bg-warn text-white">🚫 Liste noire</button>
          </div>
        </form>
      )}
    </div>
  );
}
