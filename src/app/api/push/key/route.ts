import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Clé publique VAPID (vide = push désactivé). */
export async function GET() {
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? '' });
}
