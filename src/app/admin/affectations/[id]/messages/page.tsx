import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { ymd, formatJour } from '@/lib/dates';
import { lienWaMe, telegramToken } from '@/lib/messaging/channel';
import { envoyerTelegram } from './actions';
import { messagesAffectation } from './data';
import WaButton from './wa-button';

export const dynamic = 'force-dynamic';

const STATUT_BADGE: Record<string, { cls: string; txt: string }> = {
  ENVOYE: { cls: 'badge-ok', txt: 'envoyé' },
  SIMULE: { cls: 'badge-amber', txt: 'simulé (token vide)' },
  ECHEC: { cls: 'badge-warn', txt: 'échec' },
  LIEN_GENERE: { cls: 'badge-ok', txt: 'lien ouvert' }
};

export default async function MessagesAffectationPage({
  params
}: {
  params: { id: string };
}) {
  const user = await requireAdmin();
  const data = await messagesAffectation(params.id, user.organisationId);
  if (!data) notFound();
  const { affectation, destinataires } = data;

  const envois = await prisma.envoiMessage.findMany({
    where: { affectationId: affectation.id, organisationId: user.organisationId },
    include: { destinataire: true },
    orderBy: { envoyeAt: 'desc' },
    take: 30
  });

  const tokenPresent = !!telegramToken(affectation.organisation.parametres);

  return (
    <div className="max-w-[860px]">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[21px] font-bold">
          Messages — {affectation.mission.client.nom} · {affectation.heureDebut}
          <span className="block text-[13px] font-normal text-muted">
            {formatJour(ymd(affectation.date), 'fr')} · {destinataires.length} destinataire
            {destinataires.length > 1 ? 's' : ''} ·{' '}
            {tokenPresent ? 'Telegram actif' : 'Telegram en mode simulation (token vide)'}
          </span>
        </h1>
        <Link
          href={`/admin/affectations?date=${ymd(affectation.date)}`}
          className="btn-sm btn-outline"
        >
          ← Retour
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <form action={envoyerTelegram}>
          <input type="hidden" name="affectationId" value={affectation.id} />
          <input type="hidden" name="cible" value="tous" />
          <button className="btn-sm btn-ink">✈️ Telegram à chacun</button>
        </form>
        {affectation.chefEquipeId && (
          <form action={envoyerTelegram}>
            <input type="hidden" name="affectationId" value={affectation.id} />
            <input type="hidden" name="cible" value="chef" />
            <button className="btn-sm btn-outline">✈️ Telegram au chef seulement</button>
          </form>
        )}
      </div>

      <div className="space-y-3">
        {destinataires.map(({ ao, contenu }) => (
          <div key={ao.id} className="card">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <b className="text-[14.5px]">
                {ao.user.prenom} {ao.user.nom}
              </b>
              <span className="badge badge-muted">{ao.user.langue}</span>
              {ao.userId === affectation.chefEquipeId && (
                <span className="badge badge-amber">chef</span>
              )}
              {ao.user.telegramChatId ? (
                <span className="badge badge-ok">Telegram connecté</span>
              ) : (
                <span className="badge badge-warn">Telegram non connecté</span>
              )}
              <span className="ml-auto">
                <WaButton
                  affectationId={affectation.id}
                  userId={ao.userId}
                  href={lienWaMe(ao.user.telephone, contenu)}
                />
              </span>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg bg-paper p-3 font-sans text-[13.5px]">
              {contenu}
            </pre>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-[16px] font-bold">Journal des envois</h2>
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
              <span>{e.canal === 'TELEGRAM' ? '✈️' : '🟢'}</span>
              <span className="flex-1 font-semibold">
                {e.destinataire.prenom} {e.destinataire.nom}
              </span>
              <span className={`badge ${b.cls}`}>{b.txt}</span>
            </div>
          );
        })}
        {envois.length === 0 && (
          <div className="px-4 py-6 text-center text-[13.5px] text-muted">
            Aucun envoi pour cette affectation.
          </div>
        )}
      </div>
    </div>
  );
}
