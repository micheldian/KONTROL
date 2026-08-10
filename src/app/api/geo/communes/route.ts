// Autocomplétion commune → code INSEE (proxy serveur de l'API Géo gouv).

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { chercherCommunes } from '@/lib/geo';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  const nom = new URL(req.url).searchParams.get('nom') ?? '';
  if (nom.trim().length < 2) return NextResponse.json({ communes: [] });
  return NextResponse.json({ communes: await chercherCommunes(nom.trim()) });
}
