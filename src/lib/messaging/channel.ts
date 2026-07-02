// Canaux d'envoi de messages.
// - Telegram : Bot API dédié Krontrol (token en variable d'env ou paramètre d'organisation).
//   Token vide → mode SIMULATION (message journalisé statut SIMULE, rien n'est envoyé).
// - WhatsApp niveau 1 : liens wa.me pré-remplis (un clic par destinataire), statut LIEN_GENERE.
// - WhatsApp niveau 2 (Cloud API Meta) : implémenter MessageChannel ci-dessous et brancher.

import { prisma } from '@/lib/prisma';
import type { CanalMessage, ContexteMessage, StatutEnvoi } from '@prisma/client';

export type ResultatEnvoi = {
  statut: StatutEnvoi;
  detail?: string;
};

export interface MessageChannel {
  envoyer(destinataire: {
    telephone: string;
    telegramChatId: string | null;
  }, contenu: string): Promise<ResultatEnvoi>;
}

export class TelegramChannel implements MessageChannel {
  constructor(private token: string | undefined) {}

  async envoyer(
    destinataire: { telephone: string; telegramChatId: string | null },
    contenu: string
  ): Promise<ResultatEnvoi> {
    if (!this.token) {
      return { statut: 'SIMULE', detail: 'TELEGRAM_BOT_TOKEN vide — mode simulation' };
    }
    if (!destinataire.telegramChatId) {
      return {
        statut: 'ECHEC',
        detail: 'Chat Telegram inconnu — l’ouvrier doit envoyer /start au bot et partager son contact'
      };
    }
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: destinataire.telegramChatId, text: contenu })
      });
      const json = (await res.json()) as { ok: boolean; description?: string };
      if (!json.ok) return { statut: 'ECHEC', detail: json.description };
      return { statut: 'ENVOYE' };
    } catch (e) {
      return { statut: 'ECHEC', detail: String(e) };
    }
  }
}

/** Niveau 1 : pas d'envoi serveur — on journalise et l'admin clique le lien wa.me. */
export class WhatsAppLinkChannel implements MessageChannel {
  async envoyer(): Promise<ResultatEnvoi> {
    return { statut: 'LIEN_GENERE' };
  }
}

export function lienWaMe(telephone: string, contenu: string): string {
  return `https://wa.me/${telephone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(contenu)}`;
}

/** Token Telegram : paramètre d'organisation prioritaire, sinon variable d'env. */
export function telegramToken(parametres: unknown): string | undefined {
  const p = parametres as { telegramBotToken?: string } | null;
  return p?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || undefined;
}

/** Envoie (ou simule/génère) puis journalise dans EnvoiMessage. */
export async function envoyerEtJournaliser(params: {
  organisationId: string;
  canal: CanalMessage;
  contexte: ContexteMessage;
  destinataire: { id: string; telephone: string; telegramChatId: string | null };
  contenu: string;
  affectationId?: string;
  clotureId?: string;
  channel: MessageChannel;
}): Promise<ResultatEnvoi> {
  const resultat = await params.channel.envoyer(
    { telephone: params.destinataire.telephone, telegramChatId: params.destinataire.telegramChatId },
    params.contenu
  );
  await prisma.envoiMessage.create({
    data: {
      organisationId: params.organisationId,
      canal: params.canal,
      contexte: params.contexte,
      destinataireUserId: params.destinataire.id,
      contenu: params.contenu,
      statut: resultat.statut,
      affectationId: params.affectationId ?? null,
      clotureId: params.clotureId ?? null
    }
  });
  return resultat;
}
