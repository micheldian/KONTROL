// Canaux d'envoi de messages.
// - Telegram : Bot API dédié Krontrol (token en variable d'env ou paramètre d'organisation).
//   Token vide → mode SIMULATION (message journalisé statut SIMULE, rien n'est envoyé).
// - WhatsApp niveau 1 : liens wa.me pré-remplis (un clic par destinataire), statut LIEN_GENERE.
// - WhatsApp niveau 2 (Cloud API Meta) : implémenter MessageChannel ci-dessous et brancher.
// - SMS : Twilio (identifiants en paramètres d'organisation ou variables d'env).
//   Identifiants vides → mode SIMULATION ; repli « sms: » ouvert depuis le téléphone de l'admin.

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

  /** sendLocation : un point par parcelle → l'ouvrier ouvre l'itinéraire en un tap (spec §5.4). */
  async envoyerLocalisation(
    telegramChatId: string | null,
    lat: number,
    lng: number
  ): Promise<ResultatEnvoi> {
    if (!this.token) return { statut: 'SIMULE' };
    if (!telegramChatId) return { statut: 'ECHEC', detail: 'Chat Telegram inconnu' };
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.token}/sendLocation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: telegramChatId, latitude: lat, longitude: lng })
      });
      const json = (await res.json()) as { ok: boolean; description?: string };
      return json.ok ? { statut: 'ENVOYE' } : { statut: 'ECHEC', detail: json.description };
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

/** Lien « sms: » pré-rempli (iOS et Android acceptent la forme `?&body=`). */
export function lienSms(telephone: string, contenu: string): string {
  return `sms:${telephone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(contenu)}`;
}

/**
 * Migration auto-appliquée (idempotente) : valeurs d'enum SMS / CONNEXION. Équivalent de
 * prisma/migration-sms.sql, exécuté une fois par instance avant le premier usage — la base
 * de production n'est pas migrée à la main au déploiement. `ADD VALUE IF NOT EXISTS` ne
 * peut pas tourner dans une transaction : appels $executeRawUnsafe séparés, hors $transaction.
 */
let enumsSmsPrets: Promise<void> | null = null;
export function assurerEnumsSms(): Promise<void> {
  if (!enumsSmsPrets) {
    enumsSmsPrets = (async () => {
      await prisma.$executeRawUnsafe(`ALTER TYPE "CanalMessage" ADD VALUE IF NOT EXISTS 'SMS'`);
      await prisma.$executeRawUnsafe(
        `ALTER TYPE "ContexteMessage" ADD VALUE IF NOT EXISTS 'CONNEXION'`
      );
    })().catch((e) => {
      enumsSmsPrets = null; // nouvel essai au prochain appel
      throw e;
    });
  }
  return enumsSmsPrets;
}

export type ConfigSms = { accountSid: string; authToken: string; from: string };

/** Identifiants Twilio : paramètres d'organisation prioritaires, sinon variables d'env. */
export function configSms(parametres: unknown): ConfigSms | undefined {
  const p = parametres as
    | { smsTwilioSid?: string; smsTwilioToken?: string; smsExpediteur?: string }
    | null;
  const accountSid = p?.smsTwilioSid || process.env.TWILIO_ACCOUNT_SID || '';
  const authToken = p?.smsTwilioToken || process.env.TWILIO_AUTH_TOKEN || '';
  const from = p?.smsExpediteur || process.env.TWILIO_FROM || '';
  if (!accountSid || !authToken || !from) return undefined;
  return { accountSid, authToken, from };
}

/** SMS via Twilio (API REST, sans SDK). Config absente → SIMULE. */
export class SmsChannel implements MessageChannel {
  constructor(private config: ConfigSms | undefined) {}

  async envoyer(
    destinataire: { telephone: string; telegramChatId: string | null },
    contenu: string
  ): Promise<ResultatEnvoi> {
    if (!this.config) {
      return { statut: 'SIMULE', detail: 'Identifiants SMS vides — mode simulation' };
    }
    const to = destinataire.telephone.replace(/[^\d+]/g, '');
    if (!/^\+\d{8,15}$/.test(to)) {
      return { statut: 'ECHEC', detail: `Numéro invalide pour un SMS : ${destinataire.telephone}` };
    }
    try {
      const body = new URLSearchParams({ To: to, Body: contenu });
      // Expéditeur : numéro E.164 ou nom alphanumérique (≤ 11 caractères)
      if (this.config.from.startsWith('MG')) body.set('MessagingServiceSid', this.config.from);
      else body.set('From', this.config.from);
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization:
              'Basic ' +
              Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body
        }
      );
      const json = (await res.json()) as { sid?: string; message?: string; status?: string };
      if (!res.ok) return { statut: 'ECHEC', detail: json.message ?? `HTTP ${res.status}` };
      return { statut: 'ENVOYE', detail: json.sid };
    } catch (e) {
      return { statut: 'ECHEC', detail: String(e) };
    }
  }
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
  /** Version journalisée si différente (ex. PIN masqué dans le SMS de connexion). */
  contenuJournal?: string;
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
      contenu: params.contenuJournal ?? params.contenu,
      statut: resultat.statut,
      affectationId: params.affectationId ?? null,
      clotureId: params.clotureId ?? null
    }
  });
  return resultat;
}
