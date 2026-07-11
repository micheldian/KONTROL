// Recherche de parcelles cadastrales à l'IGN (proxy serveur de l'API Carto) :
// - ?insee=&section=&numero=  (Mode A : par référence)
// - ?lat=&lng=                (Mode B : par point / clic carte)
// Renvoie les candidates (géométrie + contenance) pour confirmation avant enregistrement.

import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { parcelleParReference, parcelleParPoint, centroide } from '@/lib/geo';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  const p = new URL(req.url).searchParams;

  try {
    let candidates;
    if (p.get('insee') && p.get('section') && p.get('numero')) {
      candidates = await parcelleParReference(p.get('insee')!, p.get('section')!, p.get('numero')!);
    } else if (p.get('lat') && p.get('lng')) {
      const lat = Number(p.get('lat'));
      const lng = Number(p.get('lng'));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return NextResponse.json({ error: 'Point invalide' }, { status: 400 });
      }
      candidates = await parcelleParPoint(lat, lng);
    } else {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }
    return NextResponse.json({
      candidates: candidates.map((c) => ({ ...c, centroide: centroide(c.geometry) }))
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur API Carto IGN' },
      { status: 502 }
    );
  }
}
