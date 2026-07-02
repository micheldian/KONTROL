import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Enregistre l'abonnement push de l'appareil de l'utilisateur connecté. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return new NextResponse('Non autorisé', { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint as string | undefined;
  const p256dh = body?.keys?.p256dh as string | undefined;
  const auth = body?.keys?.auth as string | undefined;
  if (!endpoint || !p256dh || !auth) {
    return new NextResponse('Abonnement invalide', { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: user.userId, p256dh, auth },
    create: { userId: user.userId, endpoint, p256dh, auth }
  });
  return NextResponse.json({ ok: true });
}
