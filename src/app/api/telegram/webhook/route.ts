import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalisePhone } from '@/lib/auth';

// Webhook du bot Telegram Krontrol.
// Association du chat : l'ouvrier envoie /start puis PARTAGE SON CONTACT (bouton Telegram),
// on associe alors chat_id ↔ téléphone. (Configurer l'URL via setWebhook une fois le token posé.)
export async function POST(req: Request) {
  // Anti-usurpation : si TELEGRAM_WEBHOOK_SECRET est défini (recommandé en production,
  // via setWebhook secret_token), on exige l'en-tête envoyé par Telegram.
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return new NextResponse('Non autorisé', { status: 401 });
  }

  const update = await req.json().catch(() => null);
  const message = update?.message;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = String(message.chat?.id ?? '');
  const token = process.env.TELEGRAM_BOT_TOKEN;

  async function reply(text: string) {
    if (!token) return; // simulation : pas de réponse sortante
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup:
          text.includes('contact') || text.includes('contactul') || text.includes('contacto')
            ? {
                keyboard: [[{ text: '📱 Partager mon contact', request_contact: true }]],
                resize_keyboard: true,
                one_time_keyboard: true
              }
            : undefined
      })
    });
  }

  if (message.contact?.phone_number) {
    const telephone = normalisePhone(String(message.contact.phone_number));
    const user = await prisma.user.findUnique({ where: { telephone } });
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { telegramChatId: chatId }
      });
      await reply('✅ Krontrol : votre Telegram est connecté. / Telegramul dvs. este conectat. / Su Telegram está conectado.');
    } else {
      await reply('❌ Numéro inconnu de Krontrol. Contactez le bureau. / Număr necunoscut. / Número desconocido.');
    }
    return NextResponse.json({ ok: true });
  }

  if (typeof message.text === 'string' && message.text.startsWith('/start')) {
    await reply(
      'Bienvenue sur Krontrol ! Appuyez sur le bouton pour partager votre contact.\n' +
        'Bun venit! Apăsați butonul pentru a partaja contactul.\n' +
        'Bienvenido. Pulse el botón para compartir su contacto.'
    );
  }

  return NextResponse.json({ ok: true });
}
