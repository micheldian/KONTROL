import 'server-only';
import webpush from 'web-push';
import { prisma } from './prisma';

// Notifications push PWA (web-push / VAPID).
// Clés vides → no-op silencieux (mode simulation, comme Telegram/Pennylane).

let configure = false;
function pushActif(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!configure) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:contact@pickajob.fr',
      pub,
      priv
    );
    configure = true;
  }
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

/** Envoie une notification push à tous les appareils abonnés d'un utilisateur. */
export async function envoyerPushAUtilisateur(userId: string, payload: PushPayload) {
  if (!pushActif()) return { envoyes: 0, simulation: true };

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  let envoyes = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
      envoyes++;
    } catch (e) {
      // 404/410 : abonnement expiré → nettoyage
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }
    }
  }
  return { envoyes, simulation: false };
}
