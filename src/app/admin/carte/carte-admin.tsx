'use client';

// Carte & Parcelles (spec V3 §5.12) — Leaflet + fonds IGN Géoplateforme (gratuits,
// sans clé). Polygones colorés par client, bordure selon le statut de la dernière
// affectation. Saisie Mode A (référence cadastrale) et Mode B (clic → API Carto),
// sélection multiple → création d'affectation.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapContainer, TileLayer, GeoJSON, Popup, Polygon, useMapEvents, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression, Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type ClientCarte = { id: string; nom: string; couleur: string };

type StatutInfo = { statut: 'AUCUNE' | 'PLANIFIEE' | 'EN_COURS' | 'TERMINEE'; derniereDate: string | null };

type ParcelleCarte = {
  id: string;
  ref: string;
  commune: string | null;
  codeInsee: string | null;
  section: string | null;
  numero: string | null;
  adresse: string | null;
  cepage: string | null;
  millesime: number | null;
  surfaceM2: number | null;
  centroidLat: number | null;
  centroidLng: number | null;
  geometry: unknown;
  client: ClientCarte;
  statut: StatutInfo;
};

type Candidate = {
  numero: string;
  section: string;
  codeInsee: string;
  commune?: string;
  contenanceM2: number | null;
  geometry: unknown;
  centroide: { lat: number; lng: number } | null;
  dessinee?: boolean; // Mode C : polygone tracé à la main (pas de référence cadastrale)
};

const WMTS = (layer: string, format: string) =>
  `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=normal&FORMAT=${format}&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;

const FONDS = {
  satellite: WMTS('ORTHOIMAGERY.ORTHOPHOTOS', 'image/jpeg'),
  plan: WMTS('GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', 'image/png'),
  cadastre: WMTS('CADASTRALPARCELS.PARCELLAIRE_EXPRESS', 'image/png')
};

const COULEUR_STATUT: Record<StatutInfo['statut'], string> = {
  AUCUNE: '#9AA5A0',
  PLANIFIEE: '#F59E0B',
  EN_COURS: '#F59E0B',
  TERMINEE: '#2E7D32'
};

const LIBELLE_STATUT: Record<StatutInfo['statut'], string> = {
  AUCUNE: 'aucune affectation',
  PLANIFIEE: 'planifiée',
  EN_COURS: 'en cours (aujourd’hui)',
  TERMINEE: 'terminée'
};

function surfaceHa(m2: number | null) {
  return m2 ? `${(m2 / 10000).toFixed(2).replace('.', ',')} ha` : '';
}

/** Remonte les mouvements de carte (chargement par viewport) et les clics (Modes B et C). */
function EvenementsCarte({
  onViewport,
  onClic,
  clicActif
}: {
  onViewport: (bbox: string) => void;
  onClic: (lat: number, lng: number) => void;
  clicActif: boolean;
}) {
  const map = useMapEvents({
    moveend: () => {
      const b = map.getBounds();
      onViewport(`${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`);
    },
    click: (e) => {
      if (clicActif) onClic(e.latlng.lat, e.latlng.lng);
    }
  });
  useEffect(() => {
    const b = map.getBounds();
    onViewport(`${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function CapteurCarte({ surCarte }: { surCarte: (m: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => {
    surCarte(map); // accolades obligatoires : la valeur retournée serait prise pour un cleanup
  }, [map, surCarte]);
  return null;
}

export default function CarteAdmin({
  clients,
  dateAffectation
}: {
  clients: ClientCarte[];
  dateAffectation: string;
}) {
  const router = useRouter();
  const mapRef = useRef<LeafletMap | null>(null);

  const [fond, setFond] = useState<'satellite' | 'plan'>('satellite');
  const [cadastreVisible, setCadastreVisible] = useState(false);
  const [parcelles, setParcelles] = useState<ParcelleCarte[]>([]);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  // Filtres du panneau
  const [fClient, setFClient] = useState('');
  const [fTexte, setFTexte] = useState('');
  const [fStatut, setFStatut] = useState('');

  // Saisie Mode A (référence) / Mode B (pointer) / Mode C (dessin à main levée)
  const [modePointer, setModePointer] = useState(false);
  const [modeDessin, setModeDessin] = useState(false);
  const [pointsDessin, setPointsDessin] = useState<Array<[number, number]>>([]);
  const [communeQuery, setCommuneQuery] = useState('');
  const [communes, setCommunes] = useState<Array<{ nom: string; code: string; centre?: { lat: number; lng: number } }>>([]);
  const [insee, setInsee] = useState('');
  const [section, setSection] = useState('');
  const [numero, setNumero] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [choisie, setChoisie] = useState<Candidate | null>(null);
  const [saveClientId, setSaveClientId] = useState('');
  const [saveCepage, setSaveCepage] = useState('');
  const [saveMillesime, setSaveMillesime] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  const bboxCourant = useRef<string>('');

  const chargerParcelles = useCallback(
    async (bbox?: string) => {
      if (bbox) bboxCourant.current = bbox;
      const params = new URLSearchParams();
      if (bboxCourant.current && !fClient) params.set('bbox', bboxCourant.current);
      if (fClient) params.set('clientId', fClient);
      try {
        const res = await fetch(`/api/parcelles?${params.toString()}`);
        if (!res.ok) return;
        const json = (await res.json()) as { parcelles: ParcelleCarte[] };
        setParcelles(json.parcelles);
      } catch {
        /* réseau : silencieux, rechargé au prochain mouvement */
      }
    },
    [fClient]
  );

  useEffect(() => {
    void chargerParcelles();
  }, [chargerParcelles]);

  // Autocomplétion commune (Mode A)
  useEffect(() => {
    if (communeQuery.trim().length < 2) {
      setCommunes([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geo/communes?nom=${encodeURIComponent(communeQuery)}`);
        const json = (await res.json()) as { communes: typeof communes };
        setCommunes(json.communes ?? []);
      } catch {
        setCommunes([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [communeQuery]);

  const filtrees = useMemo(() => {
    const q = fTexte.trim().toLowerCase();
    return parcelles.filter((p) => {
      if (fClient && p.client.id !== fClient) return false;
      if (fStatut && p.statut?.statut !== fStatut) return false;
      if (q) {
        const txt = `${p.ref} ${p.commune ?? ''} ${p.cepage ?? ''} ${p.client.nom} ${p.adresse ?? ''}`.toLowerCase();
        if (!txt.includes(q)) return false;
      }
      return true;
    });
  }, [parcelles, fClient, fStatut, fTexte]);

  const toggleSelection = (id: string) => {
    setSelection((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const zoomSur = (p: ParcelleCarte) => {
    if (p.centroidLat != null && p.centroidLng != null && mapRef.current) {
      mapRef.current.setView([p.centroidLat, p.centroidLng], 17);
    }
  };

  // Sur mobile le bloc « Enregistrer » est sous la carte : on y amène l'écran
  const scrollVersEnregistrer = () => {
    setTimeout(() => {
      document.getElementById('bloc-enregistrer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  };

  const chercherCandidates = async (url: string, contexte: string) => {
    setMessage(null);
    setCandidates([]);
    setChoisie(null);
    try {
      const res = await fetch(url);
      const json = (await res.json()) as { candidates?: Candidate[]; error?: string };
      if (!res.ok || json.error) {
        setMessage(json.error ?? 'Erreur IGN');
        return;
      }
      const c = json.candidates ?? [];
      if (c.length === 0) {
        setMessage(`Aucune parcelle trouvée ${contexte}. Vérifiez la référence ou pointez ailleurs.`);
        return;
      }
      setCandidates(c);
      if (c.length === 1) {
        setChoisie(c[0]);
        scrollVersEnregistrer();
      }
      const centre = c[0].centroide;
      if (centre && mapRef.current) mapRef.current.setView([centre.lat, centre.lng], 17);
      if (c.length > 1) setMessage(`${c.length} parcelles renvoyées — choisissez dans la liste ou touchez le polygone bleu.`);
    } catch {
      setMessage('IGN injoignable — réessayez.');
    }
  };

  const rechercheModeA = () => {
    if (!insee || !section || !numero) {
      setMessage('Commune (INSEE), section et numéro sont obligatoires.');
      return;
    }
    void chercherCandidates(
      `/api/geo/cadastre?insee=${encodeURIComponent(insee)}&section=${encodeURIComponent(section)}&numero=${encodeURIComponent(numero)}`,
      'pour cette référence'
    );
  };

  const clicCarte = (lat: number, lng: number) => {
    if (modeDessin) {
      // Mode C : chaque tap pose un sommet du polygone
      setPointsDessin((pts) => [...pts, [lat, lng]]);
      return;
    }
    setModePointer(false);
    void chercherCandidates(`/api/geo/cadastre?lat=${lat}&lng=${lng}`, 'à cet endroit');
  };

  const terminerDessin = () => {
    if (pointsDessin.length < 3) {
      setMessage('Posez au moins 3 points pour former une parcelle.');
      return;
    }
    // GeoJSON : anneau [lng, lat] fermé
    const ring = pointsDessin.map(([lat, lng]) => [lng, lat]);
    ring.push(ring[0]);
    const lats = pointsDessin.map((p) => p[0]);
    const lngs = pointsDessin.map((p) => p[1]);
    setChoisie({
      numero: '',
      section: '',
      codeInsee: '',
      contenanceM2: null,
      geometry: { type: 'Polygon', coordinates: [ring] },
      centroide: {
        lat: lats.reduce((a, b) => a + b, 0) / lats.length,
        lng: lngs.reduce((a, b) => a + b, 0) / lngs.length
      },
      dessinee: true
    });
    setModeDessin(false);
    setMessage('Polygone tracé — choisissez le client puis enregistrez.');
    scrollVersEnregistrer();
  };

  const annulerDessin = () => {
    setModeDessin(false);
    setPointsDessin([]);
    setMessage(null);
  };

  const enregistrer = async () => {
    if (!choisie) return;
    if (!saveClientId) {
      setMessage('Choisissez le client à qui rattacher la parcelle.');
      return;
    }
    setEnregistrement(true);
    try {
      const res = await fetch('/api/parcelles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          choisie.dessinee
            ? {
                clientId: saveClientId,
                geometry: choisie.geometry,
                dessinee: true,
                cepage: saveCepage || undefined,
                millesime: saveMillesime ? Number(saveMillesime) : undefined
              }
            : {
                clientId: saveClientId,
                codeInsee: choisie.codeInsee,
                section: choisie.section,
                numero: choisie.numero,
                commune: choisie.commune,
                contenanceM2: choisie.contenanceM2,
                geometry: choisie.geometry,
                cepage: saveCepage || undefined,
                millesime: saveMillesime ? Number(saveMillesime) : undefined
              }
        )
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMessage(json.error ?? 'Erreur à l’enregistrement');
      } else {
        setMessage('✓ Parcelle enregistrée.');
        setCandidates([]);
        setChoisie(null);
        setPointsDessin([]);
        setSaveCepage('');
        setSaveMillesime('');
        void chargerParcelles();
      }
    } finally {
      setEnregistrement(false);
    }
  };

  const supprimer = async (id: string) => {
    if (!window.confirm('Supprimer cette parcelle ?')) return;
    const res = await fetch(`/api/parcelles?id=${id}`, { method: 'DELETE' });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) setMessage(json.error ?? 'Suppression impossible');
    else void chargerParcelles();
  };

  const creerAffectation = () => {
    const ids = Array.from(selection);
    if (ids.length === 0) return;
    router.push(`/admin/affectations?date=${dateAffectation}&parcelles=${ids.join(',')}`);
  };

  const centreAlsace: LatLngBoundsExpression = [
    [47.9, 7.0],
    [48.35, 7.6]
  ];

  return (
    // Mobile : carte en haut, panneau en dessous. Desktop (md+) : panneau à gauche, carte plein écran.
    <div className="flex flex-col md:h-[calc(100dvh-110px)] md:flex-row">
      {/* Panneau latéral */}
      <div className="order-2 flex flex-col border-t-[1.5px] border-line bg-white md:order-1 md:min-h-0 md:w-[340px] md:flex-none md:overflow-hidden md:border-r-[1.5px] md:border-t-0">
        <div className="space-y-2 border-b border-line p-3">
          <div className="flex gap-2">
            <select value={fClient} onChange={(e) => setFClient(e.target.value)} className="input flex-1 py-1.5 text-[13px]">
              <option value="">Tous les clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
            <select value={fStatut} onChange={(e) => setFStatut(e.target.value)} className="input w-[120px] py-1.5 text-[13px]">
              <option value="">Statut</option>
              <option value="AUCUNE">aucune</option>
              <option value="PLANIFIEE">planifiée</option>
              <option value="EN_COURS">en cours</option>
              <option value="TERMINEE">terminée</option>
            </select>
          </div>
          <input
            value={fTexte}
            onChange={(e) => setFTexte(e.target.value)}
            placeholder="Filtrer : commune, cépage, réf…"
            className="input w-full py-1.5 text-[13px]"
          />
          {selection.size > 0 && (
            <button onClick={creerAffectation} className="btn-sm btn-green w-full">
              ➕ Créer une affectation ({selection.size} parcelle{selection.size > 1 ? 's' : ''})
            </button>
          )}
        </div>

        <div className="max-h-[32dvh] overflow-y-auto md:max-h-none md:min-h-0 md:flex-1">
          {filtrees.map((p) => (
            <div
              key={p.id}
              className="flex cursor-pointer items-center gap-2 border-b border-line px-3 py-2 text-[13px] hover:bg-[#F4F1E8]"
              onClick={() => zoomSur(p)}
            >
              <input
                type="checkbox"
                checked={selection.has(p.id)}
                onChange={() => toggleSelection(p.id)}
                onClick={(e) => e.stopPropagation()}
                className="h-4 w-4 accent-brand"
              />
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.client.couleur }} />
              <span className="min-w-0 flex-1">
                <b className="block truncate">{p.ref}</b>
                <span className="block truncate text-[11.5px] text-muted">
                  {p.client.nom}
                  {p.cepage ? ` · ${p.cepage}` : ''}
                  {p.surfaceM2 ? ` · ${surfaceHa(p.surfaceM2)}` : ''}
                </span>
              </span>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                title={LIBELLE_STATUT[p.statut?.statut ?? 'AUCUNE']}
                style={{ background: COULEUR_STATUT[p.statut?.statut ?? 'AUCUNE'] }}
              />
            </div>
          ))}
          {filtrees.length === 0 && (
            <div className="p-4 text-center text-[12.5px] text-muted">
              Aucune parcelle dans la vue / les filtres.
            </div>
          )}
        </div>

        {/* Saisie manuelle */}
        <div className="space-y-2 border-t-[1.5px] border-line p-3">
          <b className="text-[12.5px] uppercase tracking-wide text-muted">Ajouter une parcelle</b>
          <div className="relative">
            <input
              value={communeQuery}
              onChange={(e) => setCommuneQuery(e.target.value)}
              placeholder="Commune (autocomplétion)"
              className="input w-full py-1.5 text-[13px]"
            />
            {communes.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 z-[1000] mb-1 max-h-[160px] overflow-y-auto rounded-lg border border-line bg-white shadow-lg">
                {communes.map((c) => (
                  <button
                    key={c.code}
                    className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-[#F4F1E8]"
                    onClick={() => {
                      setInsee(c.code);
                      setCommuneQuery(c.nom);
                      setCommunes([]);
                      if (c.centre && mapRef.current) mapRef.current.setView([c.centre.lat, c.centre.lng], 14);
                    }}
                  >
                    {c.nom} <span className="text-muted">· {c.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <input value={insee} onChange={(e) => setInsee(e.target.value)} placeholder="INSEE" className="input w-[80px] py-1.5 text-[13px]" />
            <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="Section" className="input w-[76px] py-1.5 text-[13px]" />
            <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="N°" className="input flex-1 py-1.5 text-[13px]" />
            <button onClick={rechercheModeA} className="btn-sm btn-ink">🔍</button>
          </div>
          <button
            onClick={() => {
              const actif = !modePointer;
              setModePointer(actif);
              setModeDessin(false);
              if (actif) setCadastreVisible(true); // viser juste : contours cadastraux visibles
              setMessage(
                actif
                  ? 'Zoomez puis touchez la parcelle — les contours cadastraux (orange) vous guident.'
                  : null
              );
            }}
            className={`btn-sm w-full ${modePointer ? 'btn-amber' : 'btn-outline'}`}
          >
            📍 {modePointer ? 'Touchez la carte… (annuler)' : 'Pointer une parcelle sur la carte'}
          </button>
          {!modeDessin ? (
            <button
              onClick={() => {
                setModeDessin(true);
                setModePointer(false);
                setPointsDessin([]);
                setCandidates([]);
                setChoisie(null);
                setCadastreVisible(true);
                setMessage('Touchez la carte pour poser les sommets de la parcelle, puis « Terminer ».');
              }}
              className="btn-sm btn-outline w-full"
            >
              ✏️ Dessiner une parcelle à la main
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={terminerDessin} className="btn-sm btn-green flex-1" disabled={pointsDessin.length < 3}>
                ✓ Terminer ({pointsDessin.length} point{pointsDessin.length > 1 ? 's' : ''})
              </button>
              {pointsDessin.length > 0 && (
                <button onClick={() => setPointsDessin((p) => p.slice(0, -1))} className="btn-sm btn-outline">
                  ⌫
                </button>
              )}
              <button onClick={annulerDessin} className="btn-sm text-warn">
                ✕
              </button>
            </div>
          )}

          {/* Plusieurs candidates : liste tapotable (plus fiable au doigt que le polygone) */}
          {candidates.length > 1 && (
            <div className="max-h-[120px] space-y-1 overflow-y-auto">
              {candidates.map((c, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setChoisie(c);
                    if (c.centroide && mapRef.current) mapRef.current.setView([c.centroide.lat, c.centroide.lng], 18);
                    scrollVersEnregistrer();
                  }}
                  className={`block w-full rounded-lg border px-2 py-1.5 text-left text-[12.5px] ${
                    choisie === c ? 'border-brand bg-[#EFF7F1]' : 'border-line bg-white'
                  }`}
                >
                  {c.commune ?? c.codeInsee} {c.section} {c.numero}
                  {c.contenanceM2 ? ` — ${surfaceHa(c.contenanceM2)}` : ''}
                </button>
              ))}
            </div>
          )}

          {choisie && (
            <div id="bloc-enregistrer" className="space-y-2 rounded-lg border border-line bg-paper p-2">
              <div className="text-[12.5px]">
                <b>
                  {choisie.dessinee
                    ? '✏️ Parcelle dessinée à la main'
                    : `${choisie.commune ?? choisie.codeInsee} ${choisie.section} ${choisie.numero}`}
                </b>
                {choisie.contenanceM2 ? ` — ${surfaceHa(choisie.contenanceM2)}` : ''}
              </div>
              <select value={saveClientId} onChange={(e) => setSaveClientId(e.target.value)} className="input w-full py-1.5 text-[13px]">
                <option value="">— Client à rattacher * —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <input value={saveCepage} onChange={(e) => setSaveCepage(e.target.value)} placeholder="Cépage" className="input flex-1 py-1.5 text-[13px]" />
                <input value={saveMillesime} onChange={(e) => setSaveMillesime(e.target.value)} placeholder="Millésime" className="input w-[90px] py-1.5 text-[13px]" />
              </div>
              <button onClick={enregistrer} disabled={enregistrement} className="btn-sm btn-green w-full">
                {enregistrement ? 'Enregistrement…' : '✓ Enregistrer la parcelle'}
              </button>
            </div>
          )}
          {message && <div className="text-[12.5px] text-[#B07900]">{message}</div>}
        </div>
      </div>

      {/* Carte */}
      <div className="relative order-1 h-[46dvh] shrink-0 md:order-2 md:h-auto md:min-w-0 md:flex-1">
        <div className="absolute right-2 top-2 z-[1000] flex gap-1 rounded-xl bg-white p-1 shadow md:right-3 md:top-3">
          <button
            onClick={() => setFond('satellite')}
            className={`btn-sm ${fond === 'satellite' ? 'btn-ink' : 'btn-outline'}`}
          >
            Satellite
          </button>
          <button onClick={() => setFond('plan')} className={`btn-sm ${fond === 'plan' ? 'btn-ink' : 'btn-outline'}`}>
            Plan IGN
          </button>
          <button
            onClick={() => setCadastreVisible((v) => !v)}
            className={`btn-sm ${cadastreVisible ? 'btn-amber' : 'btn-outline'}`}
          >
            Cadastre
          </button>
        </div>

        {/* Barre d'action flottante (mobile) : dessiner/pointer sans quitter la carte */}
        {(modeDessin || modePointer) && (
          <div className="absolute bottom-3 left-2 right-2 z-[1000] flex gap-2 md:hidden">
            {modeDessin ? (
              <>
                <button
                  onClick={terminerDessin}
                  disabled={pointsDessin.length < 3}
                  className="btn-sm btn-green flex-1 py-3 shadow-lg"
                >
                  ✓ Terminer ({pointsDessin.length} pt{pointsDessin.length > 1 ? 's' : ''})
                </button>
                {pointsDessin.length > 0 && (
                  <button
                    onClick={() => setPointsDessin((p) => p.slice(0, -1))}
                    className="btn-sm rounded-xl bg-white px-4 py-3 shadow-lg"
                  >
                    ⌫
                  </button>
                )}
                <button onClick={annulerDessin} className="btn-sm rounded-xl bg-white px-4 py-3 text-warn shadow-lg">
                  ✕
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setModePointer(false);
                  setMessage(null);
                }}
                className="btn-sm mx-auto rounded-xl bg-white px-5 py-3 shadow-lg"
              >
                📍 Touchez une parcelle… (annuler)
              </button>
            )}
          </div>
        )}

        <MapContainer
          bounds={centreAlsace}
          className="h-full w-full"
          style={{ cursor: modePointer || modeDessin ? 'crosshair' : undefined }}
        >
          <CapteurCarte surCarte={(m) => (mapRef.current = m)} />
          <EvenementsCarte
            onViewport={(b) => void chargerParcelles(b)}
            onClic={clicCarte}
            clicActif={modePointer || modeDessin}
          />
          <TileLayer
            key={fond}
            url={FONDS[fond]}
            attribution="© IGN / Géoplateforme"
            maxZoom={19}
          />
          {cadastreVisible && (
            <TileLayer url={FONDS.cadastre} opacity={0.65} maxZoom={19} attribution="© IGN — PCI Express" />
          )}

          {filtrees
            .filter((p) => p.geometry)
            .map((p) => (
              <GeoJSON
                key={`${p.id}-${selection.has(p.id) ? 's' : 'n'}-${p.statut?.statut ?? ''}-${modePointer || modeDessin ? 'off' : 'on'}`}
                interactive={!(modePointer || modeDessin)}
                data={{ type: 'Feature', properties: {}, geometry: p.geometry } as never}
                style={{
                  color: selection.has(p.id) ? '#1D4ED8' : COULEUR_STATUT[p.statut?.statut ?? 'AUCUNE'],
                  weight: selection.has(p.id) ? 4 : 2.5,
                  fillColor: p.client.couleur,
                  fillOpacity: 0.35
                }}
              >
                <Popup>
                  <div className="min-w-[210px] space-y-1.5 text-[13px]">
                    <b>{p.ref}</b>
                    <div className="text-muted">
                      {p.client.nom}
                      {p.cepage ? ` · ${p.cepage}` : ''}
                      {p.millesime ? ` · ${p.millesime}` : ''}
                      {p.surfaceM2 ? ` · ${surfaceHa(p.surfaceM2)}` : ''}
                    </div>
                    <div className="text-[12px] text-muted">
                      Dernière intervention : {LIBELLE_STATUT[p.statut?.statut ?? 'AUCUNE']}
                      {p.statut?.derniereDate ? ` (${p.statut.derniereDate})` : ''}
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      <button className="btn-sm btn-green" onClick={() => toggleSelection(p.id)}>
                        {selection.has(p.id) ? '− Retirer de la sélection' : '+ Sélectionner'}
                      </button>
                      {p.centroidLat != null && (
                        <a
                          className="btn-sm btn-outline"
                          href={`https://www.google.com/maps?q=${p.centroidLat},${p.centroidLng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          🧭 Itinéraire
                        </a>
                      )}
                      <button className="btn-sm text-warn" onClick={() => void supprimer(p.id)}>
                        Supprimer
                      </button>
                    </div>
                  </div>
                </Popup>
              </GeoJSON>
            ))}

          {/* Candidates IGN en attente de confirmation (bleu pointillé) */}
          {candidates.map((c, i) => (
            <GeoJSON
              key={`cand-${i}-${c.section}-${c.numero}-${choisie === c ? 'x' : 'o'}`}
              data={{ type: 'Feature', properties: {}, geometry: c.geometry } as never}
              style={{
                color: choisie === c ? '#1D4ED8' : '#3B82F6',
                weight: choisie === c ? 4 : 2.5,
                dashArray: '6 4',
                fillColor: '#3B82F6',
                fillOpacity: choisie === c ? 0.35 : 0.15
              }}
              eventHandlers={{ click: () => setChoisie(c) }}
            />
          ))}

          {/* Mode C : aperçu du polygone en cours de dessin */}
          {pointsDessin.length > 0 && (
            <Polygon
              positions={pointsDessin}
              pathOptions={{
                color: '#B45309',
                weight: 3,
                dashArray: '4 4',
                fillColor: '#F59E0B',
                fillOpacity: 0.2
              }}
              interactive={false}
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
