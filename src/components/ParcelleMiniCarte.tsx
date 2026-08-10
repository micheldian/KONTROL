// Mini-aperçu statique d'une parcelle : photo aérienne IGN (WMS Géoplateforme,
// gratuit sans clé) + polygone en surimpression SVG. Aucun JavaScript client —
// idéal pour l'écran ouvrier « Aujourd'hui » (spec §3.2) et les aperçus légers.

import { bbox, type GeoJSONGeometry } from '@/lib/geo';

const W = 640;
const H = 240;

function anneaux(g: GeoJSONGeometry): number[][][] {
  return g.type === 'Polygon'
    ? [(g.coordinates as number[][][])[0]]
    : (g.coordinates as number[][][][]).map((p) => p[0]);
}

export default function ParcelleMiniCarte({
  geometry,
  couleur = '#F59E0B',
  className = ''
}: {
  geometry: unknown;
  couleur?: string;
  className?: string;
}) {
  const g = geometry as GeoJSONGeometry | null;
  if (!g || !g.type || !g.coordinates) return null;

  let box: [number, number, number, number];
  try {
    box = bbox(g);
  } catch {
    return null;
  }
  const [minLng, minLat, maxLng, maxLat] = box;
  // Marge autour de la parcelle + ratio ≈ W/H pour ne pas déformer
  const spanLng = Math.max(maxLng - minLng, 0.0008);
  const spanLat = Math.max(maxLat - minLat, 0.0004);
  const cx = (minLng + maxLng) / 2;
  const cy = (minLat + maxLat) / 2;
  const ratio = W / H;
  let halfLng = (spanLng / 2) * 1.6;
  let halfLat = (spanLat / 2) * 1.6;
  const latCos = Math.cos((cy * Math.PI) / 180);
  if (halfLng * latCos < halfLat * ratio) halfLng = (halfLat * ratio) / latCos;
  else halfLat = (halfLng * latCos) / ratio;

  const b = {
    minLng: cx - halfLng,
    maxLng: cx + halfLng,
    minLat: cy - halfLat,
    maxLat: cy + halfLat
  };

  // WMS 1.3.0 + EPSG:4326 → BBOX en ordre lat,lng
  const url =
    `https://data.geopf.fr/wms-r/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap` +
    `&LAYERS=ORTHOIMAGERY.ORTHOPHOTOS&STYLES=&CRS=EPSG:4326` +
    `&BBOX=${b.minLat},${b.minLng},${b.maxLat},${b.maxLng}` +
    `&WIDTH=${W}&HEIGHT=${H}&FORMAT=image/jpeg`;

  const px = (lng: number) => ((lng - b.minLng) / (b.maxLng - b.minLng)) * W;
  const py = (lat: number) => ((b.maxLat - lat) / (b.maxLat - b.minLat)) * H;
  const chemins = anneaux(g).map(
    (ring) => ring.map(([lng, lat], i) => `${i === 0 ? 'M' : 'L'}${px(lng).toFixed(1)},${py(lat).toFixed(1)}`).join(' ') + ' Z'
  );

  return (
    <div className={`relative overflow-hidden rounded-xl border-[1.5px] border-line ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Parcelle (photo aérienne IGN)"
        width={W}
        height={H}
        className="block h-auto w-full"
        loading="lazy"
      />
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full">
        {chemins.map((d, i) => (
          <path key={i} d={d} fill={couleur} fillOpacity={0.25} stroke={couleur} strokeWidth={3} />
        ))}
      </svg>
      <span className="absolute bottom-1 right-2 text-[10px] text-white [text-shadow:0_0_3px_rgba(0,0,0,.9)]">
        © IGN
      </span>
    </div>
  );
}
