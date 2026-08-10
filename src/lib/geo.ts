// Géométrie & données cadastrales IGN (spec V3 §6) — tout est appelé côté serveur
// (CORS, cache, rate-limiting). Pas de PostGIS : GeoJSON en Json, filtrage par centroïde.

import 'server-only';

export type Position = [number, number]; // [lng, lat]

export type GeoJSONGeometry = {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
};

export type ParcelleCadastrale = {
  numero: string;
  section: string;
  codeInsee: string;
  commune?: string;
  contenanceM2: number | null;
  geometry: GeoJSONGeometry;
};

/** Anneaux extérieurs d'un Polygon/MultiPolygon. */
function anneauxExterieurs(g: GeoJSONGeometry): Position[][] {
  if (g.type === 'Polygon') return [(g.coordinates as number[][][])[0] as Position[]];
  return (g.coordinates as number[][][][]).map((poly) => poly[0] as Position[]);
}

/**
 * Centroïde pondéré par l'aire (formule du polygone, projection équirectangulaire
 * locale — largement suffisant à l'échelle d'une parcelle).
 */
export function centroide(g: GeoJSONGeometry): { lat: number; lng: number } | null {
  const anneaux = anneauxExterieurs(g);
  let aireTotale = 0;
  let cx = 0;
  let cy = 0;
  for (const ring of anneaux) {
    if (ring.length < 3) continue;
    let a = 0;
    let x = 0;
    let y = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const cross = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
      a += cross;
      x += (ring[i][0] + ring[i + 1][0]) * cross;
      y += (ring[i][1] + ring[i + 1][1]) * cross;
    }
    if (a === 0) continue;
    aireTotale += a / 2;
    cx += x / 6;
    cy += y / 6;
  }
  if (aireTotale === 0) {
    // Dégénéré : moyenne simple des sommets
    const pts = anneaux.flat();
    if (pts.length === 0) return null;
    return {
      lng: pts.reduce((s, p) => s + p[0], 0) / pts.length,
      lat: pts.reduce((s, p) => s + p[1], 0) / pts.length
    };
  }
  return { lng: cx / aireTotale, lat: cy / aireTotale };
}

/** Surface approchée en m² (shoelace + mètres locaux) — utilisée si l'IGN ne donne pas la contenance. */
export function surfaceM2(g: GeoJSONGeometry): number {
  const c = centroide(g);
  if (!c) return 0;
  const mLat = 111_320; // m par degré de latitude
  const mLng = 111_320 * Math.cos((c.lat * Math.PI) / 180);
  let total = 0;
  for (const ring of anneauxExterieurs(g)) {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      a +=
        ring[i][0] * mLng * (ring[i + 1][1] * mLat) -
        ring[i + 1][0] * mLng * (ring[i][1] * mLat);
    }
    total += Math.abs(a / 2);
  }
  return Math.round(total);
}

/** Bbox [minLng, minLat, maxLng, maxLat]. */
export function bbox(g: GeoJSONGeometry): [number, number, number, number] {
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  for (const ring of anneauxExterieurs(g)) {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLng, minLat, maxLng, maxLat];
}

const API_CARTO = 'https://apicarto.ign.fr/api/cadastre/parcelle';

type FeatureCollection = {
  features: Array<{
    geometry: GeoJSONGeometry;
    properties: {
      numero?: string;
      section?: string;
      code_insee?: string;
      code_dep?: string;
      code_com?: string;
      nom_com?: string;
      contenance?: number;
    };
  }>;
};

function versParcelles(fc: FeatureCollection): ParcelleCadastrale[] {
  return (fc.features ?? [])
    .filter((f) => f.geometry)
    .map((f) => ({
      numero: f.properties.numero ?? '',
      section: f.properties.section ?? '',
      codeInsee:
        f.properties.code_insee ??
        `${f.properties.code_dep ?? ''}${f.properties.code_com ?? ''}`,
      commune: f.properties.nom_com,
      contenanceM2: typeof f.properties.contenance === 'number' ? f.properties.contenance : null,
      geometry: f.geometry
    }));
}

/** Si source_ign=PCI provoque une erreur, réessayer sans le paramètre (spec §6.2). */
async function fetchApiCarto(params: URLSearchParams): Promise<FeatureCollection> {
  const avecSource = new URLSearchParams(params);
  avecSource.set('source_ign', 'PCI');
  for (const p of [avecSource, params]) {
    const res = await fetch(`${API_CARTO}?${p.toString()}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 }
    });
    if (res.ok) return (await res.json()) as FeatureCollection;
  }
  throw new Error('API Carto IGN indisponible ou requête invalide');
}

/** Parcelle(s) par référence cadastrale (INSEE + section + numéro). */
export async function parcelleParReference(
  codeInsee: string,
  section: string,
  numero: string
): Promise<ParcelleCadastrale[]> {
  const params = new URLSearchParams({
    code_insee: codeInsee.trim(),
    section: section.trim().toUpperCase().padStart(2, '0'),
    numero: numero.trim().padStart(4, '0')
  });
  return versParcelles(await fetchApiCarto(params));
}

/** Parcelle(s) intersectant un point (clic carte / lat-lng d'import). */
export async function parcelleParPoint(lat: number, lng: number): Promise<ParcelleCadastrale[]> {
  const params = new URLSearchParams({
    geom: JSON.stringify({ type: 'Point', coordinates: [lng, lat] })
  });
  return versParcelles(await fetchApiCarto(params));
}

/** Autocomplétion commune → code INSEE (API Géo gouv, gratuit). */
export async function chercherCommunes(
  nom: string
): Promise<Array<{ nom: string; code: string; centre?: { lat: number; lng: number } }>> {
  const res = await fetch(
    `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(nom)}&fields=nom,code,codeDepartement,centre&boost=population&limit=8`,
    { next: { revalidate: 86400 } }
  );
  if (!res.ok) return [];
  const json = (await res.json()) as Array<{
    nom: string;
    code: string;
    codeDepartement: string;
    centre?: { coordinates: [number, number] };
  }>;
  return json.map((c) => ({
    nom: `${c.nom} (${c.codeDepartement})`,
    code: c.code,
    centre: c.centre ? { lng: c.centre.coordinates[0], lat: c.centre.coordinates[1] } : undefined
  }));
}

/** Référence cadastrale lisible : "Eguisheim AB 0123" (ou l'adresse en fallback). */
export function refParcelle(p: {
  commune?: string | null;
  codeInsee?: string | null;
  section?: string | null;
  numero?: string | null;
  adresse?: string | null;
}): string {
  if (p.section && p.numero) {
    return `${p.commune ?? p.codeInsee ?? ''} ${p.section} ${p.numero}`.trim();
  }
  return p.adresse ?? 'Parcelle';
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** URL d'itinéraire : centroïde si géométrie connue, sinon adresse (spec §3.2). */
export function itineraireUrl(p: {
  centroidLat?: number | null;
  centroidLng?: number | null;
  adresse?: string | null;
}): string | null {
  if (p.centroidLat != null && p.centroidLng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${p.centroidLat},${p.centroidLng}`;
  }
  if (p.adresse) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.adresse)}`;
  }
  return null;
}
