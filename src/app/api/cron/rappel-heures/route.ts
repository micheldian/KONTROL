import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { heuresNonSaisies } from '@/lib/alertes';
import { TelegramChannel, envoyerEtJournaliser, telegramToken } from '@/lib/messaging/channel';
import { envoyerPushAUtilisateur } from '@/lib/push';

export const dynamic = 'force-dynamic';

const RAPPELS: Record<string, string> = {
  FR: '⏱ Krontrol : pensez à confirmer vos heures d’aujourd’hui !',
  RO: '⏱ Krontrol: nu uitați să confirmați orele de azi!',
  ES: '⏱ Krontrol: ¡no olvide confirmar sus horas de hoy!'
};

// Cron 19h Europe/Paris : rappel aux ouvriers affectés qui n'ont rien saisi
// (push PWA + Telegram si connecté, simulation sinon).
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Non autorisé', { status: 401 });
  }

  const organisations = await prisma.organisation.findMany();
  const resultats: Record<string, number> = {};

  for (const org of organisations) {
    const retardataires = await heuresNonSaisies(org.id);
    resultats[org.nom] = retardataires.length;
    const channel = new TelegramChannel(telegramToken(org.parametres));

    for (const r of retardataires) {
      const message = RAPPELS[r.langue] ?? RAPPELS.FR;
      await envoyerPushAUtilisateur(r.userId, {
        title: 'Krontrol',
        body: message
      }).catch(() => {});
      await envoyerEtJournaliser({
        organisationId: org.id,
        canal: 'TELEGRAM',
        contexte: 'AUTRE',
        destinataire: {
          id: r.userId,
          telephone: r.telephone,
          telegramChatId: r.telegramChatId
        },
        contenu: message,
        channel
      });
    }
  }

  return NextResponse.json({ ok: true, rappels: resultats });
}
