import { requireAdminStrict } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { templatesParDefaut } from '@/lib/messaging/templates';
import {
  majParametres,
  majTemplates,
  creerCompte,
  desactiverCompte,
  ajouterTag,
  basculerTag
} from './actions';

export const dynamic = 'force-dynamic';

const CONTEXTES = [
  { key: 'AFFECTATION', titre: 'Affectation (envoi du planning)' },
  { key: 'RECAP', titre: 'Récapitulatif mensuel' },
  { key: 'VIVIER', titre: 'Vivier (« on a une mission pour vous »)' }
] as const;
const LANGUES = ['FR', 'RO', 'ES'] as const;

export default async function ParametresPage() {
  const user = await requireAdminStrict();
  const [org, comptes, tags] = await Promise.all([
    prisma.organisation.findUnique({ where: { id: user.organisationId } }),
    prisma.user.findMany({
      where: { organisationId: user.organisationId, role: { in: ['ADMIN', 'RH'] } },
      orderBy: [{ role: 'asc' }, { nom: 'asc' }]
    }),
    prisma.competenceTag.findMany({
      where: { organisationId: user.organisationId },
      orderBy: { libelle: 'asc' }
    })
  ]);
  if (!org) return null;

  const params = (org.parametres as Record<string, unknown>) ?? {};
  const templates = (params.templates as Record<string, Record<string, string>>) ?? {};
  const defauts = templatesParDefaut();

  return (
    <div className="max-w-[860px]">
      <h1 className="mb-5 text-[21px] font-bold">
        Paramètres — {org.nom}
        <span className="block text-[13px] font-normal text-muted">ADMIN uniquement</span>
      </h1>

      {/* Généraux + intégrations */}
      <form action={majParametres} className="card mb-6 space-y-4 p-5">
        <h2 className="text-[16px] font-bold">Général & intégrations</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Tarif horaire de base (€/h)</label>
            <input
              name="tarifHoraireBase"
              type="number"
              step="0.01"
              min={1}
              required
              defaultValue={Number(org.tarifHoraireBase)}
              className="input"
            />
            <p className="mt-1 text-[12px] text-muted">
              Surchargeable ouvrier par ouvrier sur sa fiche (règle 1).
            </p>
          </div>
          <label className="mt-6 flex items-center gap-2 text-[13.5px]">
            <input
              type="checkbox"
              name="regleDepartLogementInclus"
              defaultChecked={params.regleDepartLogementInclus === true}
              className="h-4 w-4 accent-brand"
            />
            Compter aussi le jour de départ du logement (par défaut : exclu)
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Token bot Telegram (vide = simulation)</label>
            <input
              name="telegramBotToken"
              defaultValue={(params.telegramBotToken as string) ?? ''}
              className="input font-mono text-[13px]"
              placeholder="123456:ABC…"
            />
          </div>
          <div>
            <label className="label">Clé API Pennylane (vide = simulation)</label>
            <input
              name="pennylaneApiKey"
              defaultValue={(params.pennylaneApiKey as string) ?? ''}
              className="input font-mono text-[13px]"
            />
          </div>
        </div>
        <button className="btn-sm btn-green px-5 py-2.5">Enregistrer</button>
      </form>

      {/* Templates */}
      <form action={majTemplates} className="card mb-6 space-y-4 p-5">
        <h2 className="text-[16px] font-bold">Modèles de messages (3 langues)</h2>
        <p className="text-[12.5px] text-muted">
          Variables : {'{prenom} {client} {mission} {date} {heure} {adresse} {instructions} {mois} {net} {organisation}'}
          . Vide = modèle par défaut.
        </p>
        {CONTEXTES.map((c) => (
          <div key={c.key}>
            <h3 className="mb-2 text-[13.5px] font-bold">{c.titre}</h3>
            <div className="grid gap-3 md:grid-cols-3">
              {LANGUES.map((l) => (
                <div key={l}>
                  <label className="label">{l}</label>
                  <textarea
                    name={`tpl_${c.key}_${l}`}
                    rows={5}
                    defaultValue={templates[c.key]?.[l] ?? ''}
                    placeholder={defauts[c.key][l]}
                    className="input text-[12.5px]"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        <button className="btn-sm btn-green px-5 py-2.5">Enregistrer les modèles</button>
      </form>

      {/* Tags de compétences */}
      <div className="card mb-6 p-5">
        <h2 className="mb-3 text-[16px] font-bold">Tags de compétences (vivier)</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {tags.map((t) => (
            <form key={t.id} action={basculerTag}>
              <input type="hidden" name="id" value={t.id} />
              <button
                className={`badge ${t.actif ? 'badge-ok' : 'badge-muted line-through'}`}
                title={t.actif ? 'Cliquer pour désactiver' : 'Cliquer pour réactiver'}
              >
                {t.libelle}
              </button>
            </form>
          ))}
        </div>
        <form action={ajouterTag} className="flex gap-2">
          <input name="libelle" required placeholder="Nouveau tag (ex. taille)" className="input w-[240px] py-2" />
          <button className="btn-sm btn-green">Ajouter</button>
        </form>
      </div>

      {/* Comptes ADMIN / RH */}
      <div className="card p-5">
        <h2 className="mb-3 text-[16px] font-bold">Comptes ADMIN & RH</h2>
        <div className="mb-4">
          {comptes.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 border-b border-line py-2 last:border-b-0"
            >
              <b className="min-w-[160px] text-[14px]">
                {c.prenom} {c.nom}
              </b>
              <span className="badge badge-muted">{c.role}</span>
              <span className="flex-1 text-[13px] text-muted">{c.email}</span>
              {!c.actif ? (
                <span className="badge badge-warn">désactivé</span>
              ) : c.id !== user.userId ? (
                <form action={desactiverCompte}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="btn-sm text-warn">Désactiver</button>
                </form>
              ) : (
                <span className="badge badge-ok">vous</span>
              )}
            </div>
          ))}
        </div>
        <form action={creerCompte} className="grid gap-3 md:grid-cols-3">
          <input name="prenom" required placeholder="Prénom" className="input py-2" />
          <input name="nom" required placeholder="Nom" className="input py-2" />
          <select name="role" className="input py-2">
            <option value="RH">RH</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <input name="email" type="email" required placeholder="email@pickajob.fr" className="input py-2" />
          <input name="telephone" required placeholder="+33 6…" className="input py-2" />
          <input
            name="motDePasse"
            type="password"
            required
            minLength={8}
            placeholder="Mot de passe (8 min.)"
            className="input py-2"
          />
          <button className="btn-sm btn-green md:col-span-3">Créer le compte</button>
        </form>
      </div>
    </div>
  );
}
