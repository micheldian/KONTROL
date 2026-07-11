'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/session';
import { audit } from '@/lib/audit';
import {
  TelegramChannel,
  WhatsAppLinkChannel,
  envoyerEtJournaliser,
  telegramToken
} from '@/lib/messaging/channel';
import { messagesAffectation } from './data';

/** Envoi Telegram : à tous les ouvriers de l'affectation ou au chef seulement. */
export async function envoyerTelegram(formData: FormData) {
  const user = await requireAdmin();
  const affectationId = formData.get('affectationId') as string;
  const cible = formData.get('cible') as string; // 'tous' | 'chef'

  const data = await messagesAffectation(affectationId, user.organisationId);
  if (!data) throw new Error('Affectation introuvable');
  const { affectation, destinataires, parcelles } = data;

  const channel = new TelegramChannel(telegramToken(affectation.organisation.parametres));
  const cibles =
    cible === 'chef'
      ? destinataires.filter((d) => d.ao.userId === affectation.chefEquipeId)
      : destinataires;
  if (cibles.length === 0) throw new Error('Aucun destinataire (chef non défini ?)');

  const localisations = parcelles.filter(
    (p) => p.centroidLat != null && p.centroidLng != null
  );

  for (const d of cibles) {
    const resultat = await envoyerEtJournaliser({
      organisationId: user.organisationId,
      canal: 'TELEGRAM',
      contexte: 'AFFECTATION',
      destinataire: {
        id: d.ao.user.id,
        telephone: d.ao.user.telephone,
        telegramChatId: d.ao.user.telegramChatId
      },
      contenu: d.contenu,
      affectationId,
      channel
    });
    // sendLocation par parcelle (centroïde) — itinéraire en un tap
    if (resultat.statut === 'ENVOYE') {
      for (const p of localisations) {
        await channel.envoyerLocalisation(d.ao.user.telegramChatId, p.centroidLat!, p.centroidLng!);
      }
    }
  }

  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'message.telegram',
    entite: 'Affectation',
    entiteId: affectationId,
    apres: { cible, nb: cibles.length }
  });

  revalidatePath(`/admin/affectations/${affectationId}/messages`);
}

/** Journalise la génération des liens WhatsApp (le clic se fait dans la page). */
export async function journaliserWhatsApp(formData: FormData) {
  const user = await requireAdmin();
  const affectationId = formData.get('affectationId') as string;
  const userId = formData.get('userId') as string;

  const data = await messagesAffectation(affectationId, user.organisationId);
  if (!data) throw new Error('Affectation introuvable');
  const d = data.destinataires.find((x) => x.ao.userId === userId);
  if (!d) throw new Error('Destinataire introuvable');

  await envoyerEtJournaliser({
    organisationId: user.organisationId,
    canal: 'WHATSAPP',
    contexte: 'AFFECTATION',
    destinataire: {
      id: d.ao.user.id,
      telephone: d.ao.user.telephone,
      telegramChatId: d.ao.user.telegramChatId
    },
    contenu: d.contenu,
    affectationId,
    channel: new WhatsAppLinkChannel()
  });

  revalidatePath(`/admin/affectations/${affectationId}/messages`);
}
