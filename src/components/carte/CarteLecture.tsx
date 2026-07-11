'use client';

// Carte Leaflet en lecture seule (portail client, mini-carte dashboard) :
// fonds IGN, polygones colorés, popup informative — aucune action d'écriture.

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, Popup, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type ParcelleLecture = {
  id: string;
  ref: string;
  sousTitre?: string;
  statutLibelle?: string;
  couleur: string; // remplissage (couleur client)
  bordure: string; // couleur du statut
  geometry: unknown;
  centroidLat: number | null;
  centroidLng: number | null;
};

const WMTS = (layer: string, format: string) =>
  `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&FORMAT=${format}&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;

function Cadrage({ parcelles }: { parcelles: ParcelleLecture[] }) {
  const map = useMap();
  useEffect(() => {
    const pts = parcelles.filter((p) => p.centroidLat != null && p.centroidLng != null);
    if (pts.length === 0) return;
    const lats = pts.map((p) => p.centroidLat!);
    const lngs = pts.map((p) => p.centroidLng!);
    const bounds: LatLngBoundsExpression = [
      [Math.min(...lats) - 0.01, Math.min(...lngs) - 0.01],
      [Math.max(...lats) + 0.01, Math.max(...lngs) + 0.01]
    ];
    map.fitBounds(bounds);
  }, [map, parcelles]);
  return null;
}

export default function CarteLecture({
  parcelles,
  hauteur = 'calc(100vh - 210px)'
}: {
  parcelles: ParcelleLecture[];
  hauteur?: string;
}) {
  const avecGeo = useMemo(() => parcelles.filter((p) => p.geometry), [parcelles]);

  return (
    <div className="overflow-hidden rounded-xl border-[1.5px] border-line" style={{ height: hauteur }}>
      <MapContainer
        bounds={[
          [47.9, 7.0],
          [48.35, 7.6]
        ]}
        className="h-full w-full"
      >
        <Cadrage parcelles={parcelles} />
        <TileLayer
          url={WMTS('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg')}
          attribution="© IGN / Géoplateforme"
          maxZoom={19}
        />
        {avecGeo.map((p) => (
          <GeoJSON
            key={p.id}
            data={{ type: 'Feature', properties: {}, geometry: p.geometry } as never}
            style={{ color: p.bordure, weight: 3, fillColor: p.couleur, fillOpacity: 0.35 }}
          >
            <Popup>
              <div className="text-[13px]">
                <b>{p.ref}</b>
                {p.sousTitre && <div className="text-muted">{p.sousTitre}</div>}
                {p.statutLibelle && <div>{p.statutLibelle}</div>}
              </div>
            </Popup>
          </GeoJSON>
        ))}
      </MapContainer>
    </div>
  );
}
