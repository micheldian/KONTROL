import { requireAdminStrict } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { templatesParDefaut } from '@/lib/messaging/templates';
import { VARIABLES_DISPONIBLES } from '@/lib/contrats';
import {
  majParametres,
  majTemplates,
  creerCompte,
  desactiverCompte,
  ajouterTag,
  basculerTag,
  saveModeleContrat,
  basculerModeleContrat,
  purgerDocumentsAnciens
} from './actions';

export const dynamic = 'force-dynamic';

const CONTEXTES = [
  { key: 'AFFECTATION', titre: 'Affectation (envoi du planning)' },
  { key: 'RECAP', titre: 'Récapitulatif mensuel' },
  { key: 'VIVIER', titre: 'Vivier (« on a une mission pour vous »)' },
  { key: 'DEMANDE', titre: 'Demande de main-d’œuvre (envoi aux recruteurs)' }
] as const;
const LANGUES = ['FR', 'RO', 'ES'] as const;

const CATEGORIE_MODELE_LIBELLE: Record<string, string> = {
  CONTRAT: 'Contrat',
  MUTUELLE_ADHESION: 'Mutuelle adhésion',
  MUTUELLE_DISPENSE: 'Mutuelle dispense'
};

export default async function ParametresPage() {
  const user = await requireAdminStrict();
  const [org, comptes, tags, clients, modeles] = await Promise.all([
    prisma.organisation.findUnique({ where: { id: user.organisationId } }),
    prisma.user.findMany({
      where: {
        organisationId: user.organisationId,
        role: { in: ['ADMIN', 'MANAGER', 'CLIENT'] }
      },
      include: { client: { select: { nom: true } } },
      orderBy: [{ role: 'asc' }, { nom: 'asc' }]
    }),
    prisma.competenceTag.findMany({
      where: { organisationId: user.organisationId },
      orderBy: { libelle: 'asc' }
    }),
    prisma.client.findMany({
      where: { organisationId: user.organisationId },
      select: { id: true, nom: true },
      orderBy: { nom: 'asc' }
    }),
    prisma.modeleContrat.findMany({
      where: { organisationId: user.organisationId },
      orderBy: [{ categorie: 'asc' }, { createdAt: 'desc' }]
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
        <label className="flex items-center gap-2 text-[13.5px]">
          <input
            type="checkbox"
            name="afficherNomsOuvriersAuClient"
            defaultChecked={params.afficherNomsOuvriersAuClient === true}
            className="h-4 w-4 accent-brand"
          />
          Portail client : afficher les noms des ouvriers (par défaut : « N ouvriers », chef visible)
        </label>
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
        <h2 className="pt-2 text-[16px] font-bold">Recruteurs & commissions</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label">Commission par placement (€)</label>
            <input
              name="commissionDefaut"
              type="number"
              step="0.01"
              min={1}
              defaultValue={Number(params.commissionDefaut) > 0 ? Number(params.commissionDefaut) : 100}
              className="input"
            />
            <p className="mt-1 text-[12px] text-muted">
              Montant fixe par défaut, surchargeable demande par demande.
            </p>
          </div>
          <div>
            <label className="label">Re-proposition possible après (mois)</label>
            <input
              name="delaiRepropositionMois"
              type="number"
              min={1}
              defaultValue={
                Number(params.delaiRepropositionMois) > 0 ? Number(params.delaiRepropositionMois) : 12
              }
              className="input"
            />
            <p className="mt-1 text-[12px] text-muted">
              Un profil déjà connu ne rapporte une commission que s’il est INACTIF depuis plus
              longtemps que ce délai.
            </p>
          </div>
          <div>
            <label className="label">Délai d’annulation d’un placement (jours)</label>
            <input
              name="delaiAnnulationPlacementJours"
              type="number"
              min={1}
              defaultValue={
                Number(params.delaiAnnulationPlacementJours) > 0
                  ? Number(params.delaiAnnulationPlacementJours)
                  : 7
              }
              className="input"
            />
            <p className="mt-1 text-[12px] text-muted">
              Si le candidat ne se présente pas, la commission peut être annulée dans ce délai.
            </p>
          </div>
        </div>
        <h2 className="pt-2 text-[16px] font-bold">Embauche digitale & DPAE (TESA/MSA)</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label">N° employeur MSA</label>
            <input
              name="msaNumeroEmployeur"
              defaultValue={(params.msaNumeroEmployeur as string) ?? ''}
              className="input font-mono text-[13px]"
            />
          </div>
          <div>
            <label className="label">SIRET</label>
            <input
              name="siret"
              defaultValue={(params.siret as string) ?? ''}
              className="input font-mono text-[13px]"
            />
          </div>
          <div>
            <label className="label">Adresse de l’établissement</label>
            <input
              name="adresseEtablissement"
              defaultValue={(params.adresseEtablissement as string) ?? ''}
              className="input"
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="label">Validité du lien d’onboarding (jours)</label>
            <input
              name="delaiTokenOnboardingJours"
              type="number"
              min={1}
              defaultValue={
                Number(params.delaiTokenOnboardingJours) > 0
                  ? Number(params.delaiTokenOnboardingJours)
                  : 7
              }
              className="input"
            />
          </div>
          <div>
            <label className="label">Rétention des documents (années)</label>
            <input
              name="dureeRetentionDocumentsAnnees"
              type="number"
              min={1}
              defaultValue={
                Number(params.dureeRetentionDocumentsAnnees) > 0
                  ? Number(params.dureeRetentionDocumentsAnnees)
                  : 5
              }
              className="input"
            />
            <p className="mt-1 text-[12px] text-muted">Durées légales : 5 ans conseillé.</p>
          </div>
          <div>
            <label className="label">Clé API Anthropic — OCR (vide = saisie manuelle)</label>
            <input
              name="anthropicApiKey"
              defaultValue={(params.anthropicApiKey as string) ?? ''}
              className="input font-mono text-[13px]"
              placeholder="sk-ant-…"
            />
            <p className="mt-1 text-[12px] text-muted">
              Lecture automatique des pièces d’identité, cartes vitales et RIB.
            </p>
          </div>
        </div>
        <button className="btn-sm btn-green px-5 py-2.5">Enregistrer</button>
      </form>

      {/* Templates */}
      <form action={majTemplates} className="card mb-6 space-y-4 p-5">
        <h2 className="text-[16px] font-bold">Modèles de messages (3 langues)</h2>
        <p className="text-[12.5px] text-muted">
          Variables : {'{prenom} {client} {mission} {travaux} {date} {heure} {parcelles} {adresse} {instructions} {mois} {net} {organisation}'}
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

      {/* Modèles de documents d'embauche (phase 18) */}
      <div className="card mb-6 space-y-4 p-5">
        <h2 className="text-[16px] font-bold">Modèles de documents d’embauche</h2>
        <p className="text-[12.5px] text-muted">
          Contrat CDD saisonnier et formulaires mutuelle. Variables :{' '}
          {VARIABLES_DISPONIBLES.map((v) => `{{${v}}}`).join(' ')} (+ {'{{motifDispense}}'} pour
          la dispense). Sans modèle actif, les modèles provisoires intégrés sont utilisés.
        </p>
        <div className="space-y-1.5">
          {modeles.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-2 text-[13.5px]">
              <span className={`badge ${m.actif ? 'badge-ok' : 'badge-muted'}`}>
                {CATEGORIE_MODELE_LIBELLE[m.categorie]}
              </span>
              <b className="flex-1">{m.nom}</b>
              <span className="text-[12px] text-muted">
                {m.contenuTemplate.length} caractères
              </span>
              <form action={basculerModeleContrat}>
                <input type="hidden" name="id" value={m.id} />
                <button className="btn-sm btn-outline">
                  {m.actif ? 'Désactiver' : 'Activer'}
                </button>
              </form>
            </div>
          ))}
          {modeles.length === 0 && (
            <p className="text-[13px] text-muted">
              Aucun modèle personnalisé — les placeholders intégrés sont utilisés. Collez vos
              vrais documents ci-dessous dès que vous les avez.
            </p>
          )}
        </div>
        <form action={saveModeleContrat} className="space-y-3 border-t border-line pt-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">Nom du modèle *</label>
              <input name="nom" required className="input" placeholder="Ex. CDD saisonnier 2026" />
            </div>
            <div>
              <label className="label">Catégorie</label>
              <select name="categorie" className="input">
                <option value="CONTRAT">Contrat de travail</option>
                <option value="MUTUELLE_ADHESION">Mutuelle — adhésion</option>
                <option value="MUTUELLE_DISPENSE">Mutuelle — dispense</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Contenu (texte avec variables {'{{prenom}}'} …) *</label>
            <textarea
              name="contenuTemplate"
              rows={8}
              required
              className="input font-mono text-[12px]"
              placeholder={'CONTRAT DE TRAVAIL…\n{{prenom}} {{nom}}, né·e le {{dateNaissance}}…'}
            />
          </div>
          <button className="btn-sm btn-green">Ajouter le modèle</button>
        </form>
        <form action={purgerDocumentsAnciens} className="border-t border-line pt-3">
          <button
            className="btn-sm text-warn"
            title="Supprime définitivement les documents au-delà de la durée de rétention (dossiers en cours exclus) — tracé"
          >
            🗑 Purger les documents au-delà de la rétention
          </button>
        </form>
      </div>

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

      {/* Comptes ADMIN / MANAGER / CLIENT */}
      <div className="card p-5">
        <h2 className="mb-3 text-[16px] font-bold">Comptes ADMIN, MANAGER & CLIENT</h2>
        <p className="mb-3 text-[12.5px] text-muted">
          MANAGER : validation des heures, affectations, acomptes, logements, vivier, carte &
          import, clôtures — pas de facturation ni de paramètres. CLIENT : portail /client en
          lecture seule, rattaché à un client.
        </p>
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
              <span className="flex-1 text-[13px] text-muted">
                {c.email}
                {c.client ? ` · ${c.client.nom}` : ''}
              </span>
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
            <option value="MANAGER">MANAGER</option>
            <option value="ADMIN">ADMIN</option>
            <option value="CLIENT">CLIENT (portail)</option>
          </select>
          <select name="clientId" className="input py-2">
            <option value="">— Client rattaché (si rôle CLIENT) —</option>
            {clients.map((cl) => (
              <option key={cl.id} value={cl.id}>
                {cl.nom}
              </option>
            ))}
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
