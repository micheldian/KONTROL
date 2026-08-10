import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import SelectionContact from './selection-contact';
import ErreurBanniere from '@/components/admin/ErreurBanniere';

export const dynamic = 'force-dynamic';

// Les candidatures en attente (statut CANDIDAT) ont leur propre page « Candidatures »
const STATUTS = ['VIVIER', 'ACTIF', 'INACTIF', 'LISTE_NOIRE'] as const;
const TRIS = ['note', 'nom', 'saison'] as const;

// L'écran clé du vivier : « profils ≥ 4★, tag taille, roumain, statut vivier » en 10 s.
export default async function VivierPage({
  searchParams
}: {
  searchParams: {
    q?: string;
    statut?: string;
    langue?: string;
    noteMin?: string;
    tags?: string | string[];
    permis?: string;
    vehicule?: string;
    tri?: string;
    erreur?: string;
  };
}) {
  const user = await requireAdmin();
  const q = searchParams.q?.trim() ?? '';
  const filtrePermis = searchParams.permis === '1';
  const filtreVehicule = searchParams.vehicule === '1';
  const statut = STATUTS.includes(searchParams.statut as never)
    ? (searchParams.statut as (typeof STATUTS)[number])
    : undefined;
  const langue = ['FR', 'RO', 'ES'].includes(searchParams.langue ?? '')
    ? (searchParams.langue as 'FR' | 'RO' | 'ES')
    : undefined;
  const noteMin = Number(searchParams.noteMin) || undefined;
  const tagsFiltre = (
    Array.isArray(searchParams.tags) ? searchParams.tags : searchParams.tags ? [searchParams.tags] : []
  ).filter(Boolean);
  const tri = TRIS.includes(searchParams.tri as never)
    ? (searchParams.tri as (typeof TRIS)[number])
    : 'note';

  const tags = await prisma.competenceTag.findMany({
    where: { organisationId: user.organisationId, actif: true },
    orderBy: { libelle: 'asc' }
  });

  const profils = await prisma.user.findMany({
    where: {
      organisationId: user.organisationId,
      role: { in: ['OUVRIER', 'CHEF_EQUIPE'] },
      // Par défaut : main-d'œuvre actuelle et passée — jamais les candidatures en attente
      ...(statut ? { statutProfil: statut } : { statutProfil: { not: 'CANDIDAT' as const } }),
      ...(langue ? { langue } : {}),
      ...(noteMin ? { note: { gte: noteMin } } : {}),
      ...(filtrePermis ? { permisB: true } : {}),
      ...(filtreVehicule ? { vehicule: true } : {}),
      ...(q
        ? {
            OR: [
              { nom: { contains: q, mode: 'insensitive' } },
              { prenom: { contains: q, mode: 'insensitive' } },
              { telephone: { contains: q.replace(/[^\d+]/g, '') || q } },
              // Mot-clé libre dans l'expérience déclarée (ex. « pomme de terre »)
              { experienceDeclaree: { contains: q, mode: 'insensitive' } },
              { notesInternes: { contains: q, mode: 'insensitive' } }
            ]
          }
        : {}),
      // Compétences combinables : le profil doit avoir TOUS les tags cochés
      ...(tagsFiltre.length > 0
        ? { AND: tagsFiltre.map((tagId) => ({ competences: { some: { tagId } } })) }
        : {})
    },
    include: {
      competences: { include: { tag: true } },
      creneaux: {
        where: { statut: { in: ['VALIDE', 'CORRIGE'] } },
        select: { date: true },
        orderBy: { date: 'desc' },
        take: 1
      }
    },
    take: 500
  });

  const lignes = profils
    .map((p) => ({
      ...p,
      derniereSaison: p.creneaux[0]?.date.getUTCFullYear() ?? null
    }))
    .sort((a, b) => {
      if (tri === 'nom') return a.nom.localeCompare(b.nom);
      if (tri === 'saison') return (b.derniereSaison ?? 0) - (a.derniereSaison ?? 0);
      return (b.note ?? 0) - (a.note ?? 0);
    });

  const lien = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (statut) params.set('statut', statut);
    if (langue) params.set('langue', langue);
    if (filtrePermis) params.set('permis', '1');
    if (filtreVehicule) params.set('vehicule', '1');
    if (noteMin) params.set('noteMin', String(noteMin));
    tagsFiltre.forEach((t) => params.append('tags', t));
    params.set('tri', tri);
    for (const [k, v] of Object.entries(patch)) {
      params.delete(k);
      if (v) params.set(k, v);
    }
    return `/admin/vivier?${params.toString()}`;
  };

  return (
    <div>
      <h1 className="mb-5 text-[21px] font-bold">
        Vivier — mémoire de l’entreprise
        <span className="block text-[13px] font-normal text-muted">
          {lignes.length} profil{lignes.length > 1 ? 's' : ''} · main-d&apos;œuvre actuelle et
          passée (actifs, vivier, anciens, liste noire) — les candidatures en attente sont
          dans <a href="/admin/candidatures" className="underline">Candidatures</a>
        </span>
      </h1>
      <ErreurBanniere erreur={searchParams.erreur} />

      {/* Recherche + filtres combinables */}
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label">Nom ou téléphone</label>
          <input
            name="q"
            defaultValue={q}
            className="input w-[230px] py-2"
            placeholder="Nom, tél. ou mot-clé (ex. pomme de terre)"
          />
        </div>
        <div>
          <label className="label">Statut</label>
          <select name="statut" defaultValue={statut ?? ''} className="input w-auto py-2">
            <option value="">Tous</option>
            {STATUTS.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ').toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Langue</label>
          <select name="langue" defaultValue={langue ?? ''} className="input w-auto py-2">
            <option value="">Toutes</option>
            <option value="FR">FR</option>
            <option value="RO">RO</option>
            <option value="ES">ES</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 pb-1">
          <label className="flex items-center gap-1.5 text-[13px] font-semibold">
            <input
              type="checkbox"
              name="permis"
              value="1"
              defaultChecked={filtrePermis}
              className="h-4 w-4 accent-brand"
            />
            🚗 Permis B
          </label>
          <label className="flex items-center gap-1.5 text-[13px] font-semibold">
            <input
              type="checkbox"
              name="vehicule"
              value="1"
              defaultChecked={filtreVehicule}
              className="h-4 w-4 accent-brand"
            />
            🚙 Véhiculé
          </label>
        </div>
        <div>
          <label className="label">Note minimum</label>
          <select name="noteMin" defaultValue={noteMin ?? ''} className="input w-auto py-2">
            <option value="">—</option>
            {[3, 4, 5].map((n) => (
              <option key={n} value={n}>
                ≥ {n}★
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Tri</label>
          <select name="tri" defaultValue={tri} className="input w-auto py-2">
            <option value="note">Note</option>
            <option value="nom">Nom</option>
            <option value="saison">Dernière saison</option>
          </select>
        </div>
        <div className="w-full">
          <label className="label">Compétences (toutes exigées)</label>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <label
                key={t.id}
                className={`badge cursor-pointer ${
                  tagsFiltre.includes(t.id) ? 'badge-ok' : 'badge-muted'
                }`}
              >
                <input
                  type="checkbox"
                  name="tags"
                  value={t.id}
                  defaultChecked={tagsFiltre.includes(t.id)}
                  className="mr-1 accent-brand"
                />
                {t.libelle}
              </label>
            ))}
          </div>
        </div>
        <button className="btn-sm btn-green px-5">Filtrer</button>
        <Link href="/admin/vivier" className="btn-sm btn-outline">
          Réinitialiser
        </Link>
      </form>

      {/* Table + sélection multiple pour contact groupé */}
      <SelectionContact
        profils={lignes.map((p) => ({
          id: p.id,
          nom: `${p.prenom} ${p.nom}`,
          telephone: p.telephone,
          langue: p.langue,
          statut: p.statutProfil,
          note: p.note,
          tags: p.competences.map((c) => c.tag.libelle),
          derniereSaison: p.derniereSaison,
          telegramConnecte: !!p.telegramChatId,
          permisB: p.permisB,
          vehicule: p.vehicule,
          listeNoire: p.statutProfil === 'LISTE_NOIRE',
          aPin: !!p.pinHash
        }))}
        lienTriNote={lien({ tri: 'note' })}
        lienTriNom={lien({ tri: 'nom' })}
        lienTriSaison={lien({ tri: 'saison' })}
      />
    </div>
  );
}
