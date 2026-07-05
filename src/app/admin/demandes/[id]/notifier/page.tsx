import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatDate, ymd } from '@/lib/dates';
import { lienWaMe, telegramToken } from '@/lib/messaging/channel';
import { renduTemplate, type LangueCode } from '@/lib/messaging/templates';
import { notifierRecruteursTelegram } from '../../actions';

export const dynamic = 'force-dynamic';

const STATUT_BADGE: Record<string, { cls: string; txt: string }> = {
  ENVOYE: { cls: 'badge-ok', txt: 'envoyé' },
  SIMULE: { cls: 'badge-amber', txt: 'simulé (token vide)' },
  ECHEC: { cls: 'badge-warn', txt: 'échec' },
  LIEN_GENERE: { cls: 'badge-ok', txt: 'lien ouvert' }
};

// Notification des recruteurs : Telegram automatique + liens wa.me (niveau 1).
export default async function NotifierRecruteursPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams: { creee?: string };
}) {
  const user = await requireAdmin();
  const [demande, org, recruteurs, envois] = await Promise.all([
    prisma.demandeMainOeuvre.findFirst({
      where: { id: params.id, organisationId: user.organisationId }
    }),
    prisma.organisation.findUnique({ where: { id: user.organisationId } }),
    prisma.user.findMany({
      where: { organisationId: user.organisationId, role: 'RECRUTEUR', actif: true },
      orderBy: { nom: 'asc' }
    }),
    prisma.envoiMessage.findMany({
      where: { organisationId: user.organisationId, contexte: 'DEMANDE' },
      include: { destinataire: { select: { prenom: true, nom: true } } },
      orderBy: { envoyeAt: 'desc' },
      take: 20
    })
  ]);
  if (!demande || !org) notFound();

  const surcharges = (org.parametres as { templates?: unknown })?.templates;
  const lien = `${process.env.NEXTAUTH_URL ?? ''}/recruteur`;
  const contenuPour = (langue: LangueCode) =>
    renduTemplate(
      'DEMANDE',
      langue,
      {
        organisation: org.nom,
        titre: demande.titre,
        nbPersonnes: String(demande.nbPersonnes),
        dates: `${formatDate(ymd(demande.dateDebut))}${demande.dateFin ? ` → ${formatDate(ymd(demande.dateFin))}` : ''}`,
        region: demande.region ?? '',
        commission: Number(demande.commissionParPlacement).toFixed(0),
        lien
      },
      surcharges
    );
  const tokenPresent = !!telegramToken(org.parametres);

  return (
    <div className="max-w-[760px]">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[21px] font-bold">
          Notifier les recruteurs — {demande.titre}
          <span className="block text-[13px] font-normal text-muted">
            {recruteurs.length} recruteur{recruteurs.length > 1 ? 's' : ''} actif
            {recruteurs.length > 1 ? 's' : ''} ·{' '}
            {tokenPresent ? 'Telegram actif' : 'Telegram en mode simulation (token vide)'}
          </span>
        </h1>
        <Link href="/admin/demandes" className="btn-sm btn-outline">
          ← Demandes
        </Link>
      </div>

      {searchParams.creee && (
        <div className="mb-4 rounded-card border-[1.5px] border-[#BFD9C8] bg-[#EFF7F1] px-4 py-3 text-[13.5px] font-semibold text-ok">
          ✓ Demande publiée — notifiez les recruteurs ci-dessous
        </div>
      )}

      <form action={notifierRecruteursTelegram} className="mb-4">
        <input type="hidden" name="demandeId" value={demande.id} />
        <button className="btn-sm btn-ink" disabled={recruteurs.length === 0}>
          ✈️ Telegram à tous les recruteurs ({recruteurs.length})
        </button>
      </form>

      <div className="space-y-3">
        {recruteurs.map((r) => {
          const contenu = contenuPour(r.langue as LangueCode);
          return (
            <div key={r.id} className="card">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <b className="text-[14.5px]">
                  {r.prenom} {r.nom}
                  {r.societe ? ` · ${r.societe}` : ''}
                </b>
                <span className="badge badge-muted">{r.langue}</span>
                {r.telegramChatId ? (
                  <span className="badge badge-ok">Telegram connecté</span>
                ) : (
                  <span className="badge badge-warn">Telegram non connecté</span>
                )}
                <a
                  href={lienWaMe(r.telephone, contenu)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-sm btn-green ml-auto"
                >
                  🟢 WhatsApp
                </a>
              </div>
              <pre className="whitespace-pre-wrap rounded-lg bg-paper p-3 font-sans text-[13px]">
                {contenu}
              </pre>
            </div>
          );
        })}
        {recruteurs.length === 0 && (
          <div className="card py-8 text-center text-muted">
            Aucun recruteur actif — partagez la page d’inscription :{' '}
            <span className="font-mono text-[12.5px]">/recruteur/inscription</span>
          </div>
        )}
      </div>

      <h2 className="mb-3 mt-8 text-[16px] font-bold">Derniers envois (demandes)</h2>
      <div className="card p-0">
        {envois.map((e) => {
          const b = STATUT_BADGE[e.statut] ?? { cls: 'badge-muted', txt: e.statut };
          return (
            <div
              key={e.id}
              className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-[13px] last:border-b-0"
            >
              <span className="font-mono text-[12px] text-muted">
                {e.envoyeAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
              </span>
              <span className="flex-1 font-semibold">
                {e.destinataire.prenom} {e.destinataire.nom}
              </span>
              <span className={`badge ${b.cls}`}>{b.txt}</span>
            </div>
          );
        })}
        {envois.length === 0 && (
          <div className="px-4 py-6 text-center text-[13.5px] text-muted">Aucun envoi.</div>
        )}
      </div>
    </div>
  );
}
