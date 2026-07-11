import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatDate, formatEuros, todayParis, ymd } from '@/lib/dates';
import {
  ORDRE_CHECKLIST,
  LIBELLES_CHECKLIST,
  itemRempli,
  checklistComplete,
  delaiTokenJours,
  messageLienOnboarding
} from '@/lib/embauche';
import { dpaeProvider, dpaeUrgente } from '@/lib/dpae';
import { LIBELLES_DOCUMENT } from '@/lib/documents';
import { lienWaMe } from '@/lib/messaging/channel';
import ErreurBanniere from '@/components/admin/ErreurBanniere';
import BoutonCopier from '@/components/admin/BoutonCopier';
import {
  regenererLien,
  envoyerLienTelegram,
  deposerDpae,
  cocherChecklist,
  activerOuvrier,
  forcerActivation,
  annulerDossier
} from '../actions';

export const dynamic = 'force-dynamic';

const STATUT_BADGE: Record<string, { cls: string; txt: string }> = {
  EN_COURS: { cls: 'badge-amber', txt: 'en cours' },
  COMPLET: { cls: 'badge-ok', txt: 'complet — prêt à activer' },
  FORCE: { cls: 'badge-warn', txt: 'activé en forçage (incomplet)' },
  ANNULE: { cls: 'badge-muted', txt: 'annulé' }
};

export default async function FicheDossierPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { erreur?: string; cree?: string; active?: string };
}) {
  const user = await requireAdmin();
  const dossier = await prisma.dossierEmbauche.findFirst({
    where: { id: params.id, organisationId: user.organisationId },
    include: {
      user: true,
      organisation: true,
      modeleContrat: true,
      logement: true,
      checklist: true,
      documents: { orderBy: { uploadeAt: 'desc' } }
    }
  });
  if (!dossier) notFound();

  const complet = checklistComplete(dossier.checklist);
  const b = STATUT_BADGE[dossier.statut];
  const lien = dossier.tokenOnboarding
    ? `${process.env.NEXTAUTH_URL ?? ''}/embauche/${dossier.tokenOnboarding}`
    : null;
  const jours = delaiTokenJours(dossier.organisation.parametres);
  const message = lien
    ? messageLienOnboarding({
        langue: dossier.user.langue,
        organisation: dossier.organisation.nom,
        prenom: dossier.user.prenom,
        lien,
        jours
      })
    : '';
  const champsDpae = dpaeProvider.preparer({
    dossier,
    ouvrier: dossier.user,
    organisation: dossier.organisation
  });
  const toutDpae = champsDpae.map((c) => `${c.label} : ${c.valeur || '—'}`).join('\n');
  const estAdmin = user.role === 'ADMIN';
  const estActif = dossier.user.statutProfil === 'ACTIF';

  return (
    <div className="max-w-[860px]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-bold">
          Dossier d’embauche — {dossier.user.prenom} {dossier.user.nom}
          <span className="block text-[13px] font-normal text-muted">
            Début {formatDate(ymd(dossier.dateDebut))}
            {dossier.dateFinPrevue ? ` → ${formatDate(ymd(dossier.dateFinPrevue))}` : ''} ·{' '}
            {formatEuros(Number(dossier.tauxHoraire))}/h
            {dossier.logement ? ` · 🛏 ${dossier.logement.nom}` : ''} · contrat :{' '}
            {dossier.modeleContrat?.nom ?? 'modèle par défaut'}
          </span>
        </h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`badge ${b.cls}`}>{b.txt}</span>
          <Link href="/admin/embauches" className="btn-sm btn-outline">
            ← Dossiers
          </Link>
        </div>
      </div>

      <ErreurBanniere erreur={searchParams.erreur} />
      {searchParams.cree && (
        <div className="mb-4 rounded-card border-[1.5px] border-[#BFD9C8] bg-[#EFF7F1] px-4 py-3 text-[13.5px] font-semibold text-ok">
          ✓ Dossier créé — envoyez le lien à l’ouvrier ou déroulez le parcours en mode kiosque.
        </div>
      )}
      {searchParams.active && (
        <div className="mb-4 rounded-card border-[1.5px] border-[#BFD9C8] bg-[#EFF7F1] px-4 py-3 text-[13.5px] font-semibold text-ok">
          ✓ Ouvrier activé — il peut se connecter au portail et être affecté.
        </div>
      )}
      {dossier.statut === 'FORCE' && (
        <div className="mb-4 rounded-card border-[1.5px] border-[#F3C1A8] bg-[#FFF3EC] px-4 py-3 text-[13.5px] font-semibold text-warn">
          ⚠ DOSSIER INCOMPLET — activation forcée le{' '}
          {dossier.forceAt ? formatDate(ymd(dossier.forceAt)) : ''} : {dossier.forceMotif}.
          Régularisez les pièces manquantes.
        </div>
      )}
      {dossier.statut === 'EN_COURS' && dpaeUrgente(dossier) && (
        <div className="mb-4 rounded-card border-[1.5px] border-[#F3C1A8] bg-[#FFF3EC] px-4 py-3 text-[13.5px] font-semibold text-warn">
          ⚠ La prise de poste est imminente ({formatDate(ymd(dossier.dateDebut))}) et la DPAE
          n’est pas déposée — elle doit l’être AVANT la prise de poste.
        </div>
      )}

      {/* Lien onboarding + kiosque */}
      {dossier.statut !== 'ANNULE' && !estActif && (
        <div className="card mb-4 p-5">
          <h2 className="mb-2 text-[15px] font-bold">Parcours ouvrier (2 modes)</h2>
          {lien && (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <code className="max-w-full flex-1 truncate rounded-lg bg-paper px-3 py-2 font-mono text-[12px]">
                  {lien}
                </code>
                <BoutonCopier texte={lien} label="Copier le lien" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <a
                  href={lienWaMe(dossier.user.telephone, message)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-sm btn-green"
                >
                  🟢 Envoyer par WhatsApp
                </a>
                <form action={envoyerLienTelegram}>
                  <input type="hidden" name="id" value={dossier.id} />
                  <button className="btn-sm btn-ink">✈️ Envoyer par Telegram</button>
                </form>
                <Link href={`/admin/embauches/${dossier.id}/kiosque`} className="btn-sm btn-outline">
                  📱 Mode kiosque (dérouler ici, l’ouvrier signe lui-même)
                </Link>
                <form action={regenererLien}>
                  <input type="hidden" name="id" value={dossier.id} />
                  <button className="btn-sm text-muted" title="L’ancien lien devient invalide">
                    ↻ Regénérer le lien
                  </button>
                </form>
              </div>
              <p className="mt-2 text-[12px] text-muted">
                Lien valable {jours} jours
                {dossier.tokenExpireAt
                  ? ` (expire le ${formatDate(ymd(dossier.tokenExpireAt))})`
                  : ''}{' '}
                · langue de l’ouvrier : {dossier.user.langue} · mode utilisé :{' '}
                {dossier.mode.toLowerCase()}
              </p>
            </>
          )}
        </div>
      )}

      {/* Checklist */}
      <div className="card mb-4 p-0">
        <h2 className="border-b border-line px-5 py-3 text-[15px] font-bold">
          Checklist de complétude
        </h2>
        {ORDRE_CHECKLIST.map((type) => {
          const item = dossier.checklist.find((c) => c.type === type);
          const rempli = item ? itemRempli(item) : false;
          return (
            <div
              key={type}
              className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5 text-[13.5px] last:border-b-0"
            >
              <span className="text-[16px]">
                {rempli ? (item?.statut === 'FLAG' || item?.statut === 'NON_BLOQUANT' ? '🏳' : '✅') : '☐'}
              </span>
              <b className="min-w-[220px]">{LIBELLES_CHECKLIST[type]}</b>
              <span className="flex-1 text-[12.5px] text-muted">
                {item?.detail ?? ''}
                {item?.faitAt ? ` · ${formatDate(ymd(item.faitAt))}` : ''}
              </span>
              {!rempli && ['IDENTITE', 'SECU', 'IBAN'].includes(type) && dossier.statut !== 'ANNULE' && (
                <form action={cocherChecklist}>
                  <input type="hidden" name="id" value={dossier.id} />
                  <input type="hidden" name="type" value={type} />
                  <button className="btn-sm btn-outline" title="Pièce vérifiée hors ligne">
                    Valider manuellement
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      {/* DPAE */}
      <div className="card mb-4 p-5">
        <h2 className="mb-1 text-[15px] font-bold">
          DPAE — {dossier.dpaeDeposeAt ? 'déposée ✓' : 'prête à déposer (TESA/MSA)'}
        </h2>
        {dossier.dpaeDeposeAt ? (
          <p className="text-[13.5px]">
            Récépissé <b className="font-mono">{dossier.dpaeNumero}</b> · déposée le{' '}
            {formatDate(ymd(dossier.dpaeDeposeAt))}
          </p>
        ) : (
          <>
            <p className="mb-3 text-[12.5px] text-muted">
              Copiez les champs ci-dessous sur le téléservice MSA (dépôt en ~1 minute), puis
              saisissez le récépissé. La DPAE doit être faite avant la prise de poste.
            </p>
            <div className="mb-3">
              <BoutonCopier texte={toutDpae} label="📋 Tout copier" petit={false} />
            </div>
            {(['Employeur', 'Salarié', 'Contrat'] as const).map((section) => (
              <div key={section} className="mb-3">
                <div className="label">{section}</div>
                {champsDpae
                  .filter((c) => c.section === section)
                  .map((c) => (
                    <div
                      key={c.cle}
                      className="flex items-center gap-2 border-b border-line py-1.5 text-[13px] last:border-b-0"
                    >
                      <span className="w-[210px] text-muted">{c.label}</span>
                      <span className={`flex-1 font-mono text-[12.5px] ${c.manquant ? 'text-warn' : ''}`}>
                        {c.valeur || '⚠ manquant'}
                      </span>
                      {c.valeur && <BoutonCopier texte={c.valeur} />}
                    </div>
                  ))}
              </div>
            ))}
            {dossier.statut !== 'ANNULE' && (
              <form action={deposerDpae} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={dossier.id} />
                <div>
                  <label className="label">N° / récépissé DPAE *</label>
                  <input name="numero" required className="input w-[220px] font-mono" />
                </div>
                <div>
                  <label className="label">Déposée le *</label>
                  <input name="date" type="date" required className="input" defaultValue={todayParis()} />
                </div>
                <button className="btn-sm btn-green">✓ DPAE déposée</button>
              </form>
            )}
          </>
        )}
      </div>

      {/* Documents */}
      <div className="card mb-4 p-0">
        <h2 className="border-b border-line px-5 py-3 text-[15px] font-bold">
          Documents du dossier ({dossier.documents.length})
        </h2>
        {dossier.documents.map((d) => (
          <div
            key={d.id}
            className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5 text-[13.5px] last:border-b-0"
          >
            <b className="min-w-[220px]">{LIBELLES_DOCUMENT[d.type]}</b>
            <span className="flex-1 text-[12px] text-muted">
              {formatDate(ymd(d.uploadeAt))} · {(d.taille / 1024).toFixed(0)} Ko · SHA-256{' '}
              <span className="font-mono">{d.hashSha256.slice(0, 12)}…</span>
            </span>
            <a
              href={`/api/documents/${d.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-sm btn-outline"
            >
              👁 Voir
            </a>
          </div>
        ))}
        {dossier.documents.length === 0 && (
          <div className="px-5 py-5 text-center text-[13.5px] text-muted">
            Aucun document pour l’instant — ils arrivent au fil du parcours ouvrier.
          </div>
        )}
      </div>

      {/* Activation */}
      {!estActif && dossier.statut !== 'ANNULE' && (
        <div className="card mb-4 p-5">
          <h2 className="mb-2 text-[15px] font-bold">Passage en ACTIF (verrou de complétude)</h2>
          {complet ? (
            <form action={activerOuvrier} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={dossier.id} />
              {!dossier.user.pinHash && (
                <div>
                  <label className="label">PIN portail (4 chiffres) *</label>
                  <input
                    name="pin"
                    required
                    pattern="\d{4}"
                    inputMode="numeric"
                    maxLength={4}
                    className="input w-[120px] font-mono"
                  />
                </div>
              )}
              <button className="btn btn-green">⚡ Activer l’ouvrier (checklist complète ✓)</button>
            </form>
          ) : (
            <>
              <p className="mb-3 text-[13.5px] text-muted">
                Checklist incomplète — l’activation est verrouillée (règle 5).
              </p>
              {estAdmin && (
                <form action={forcerActivation} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={dossier.id} />
                  <div className="min-w-[220px] flex-1">
                    <label className="label">Motif de forçage (ADMIN, tracé) *</label>
                    <input name="motif" required className="input" placeholder="Urgence : …" />
                  </div>
                  {!dossier.user.pinHash && (
                    <div>
                      <label className="label">PIN (4 chiffres) *</label>
                      <input
                        name="pin"
                        required
                        pattern="\d{4}"
                        inputMode="numeric"
                        maxLength={4}
                        className="input w-[110px] font-mono"
                      />
                    </div>
                  )}
                  <button className="btn-sm text-warn">⚠ Forcer l’activation</button>
                </form>
              )}
            </>
          )}
        </div>
      )}

      {/* Annulation */}
      {dossier.statut === 'EN_COURS' && (
        <form action={annulerDossier} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={dossier.id} />
          <input
            name="motif"
            required
            className="input w-[280px]"
            placeholder="Motif d’annulation (documents conservés)…"
          />
          <button className="btn-sm text-warn">Annuler le dossier</button>
        </form>
      )}
    </div>
  );
}
