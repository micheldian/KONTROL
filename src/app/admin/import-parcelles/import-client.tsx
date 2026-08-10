'use client';

// Workflow d'import (spec §5.14.3) :
// 1. upload + parsing dans le navigateur (xlsx/csv/geojson/kml)
// 2. mapping interactif colonnes → champs cibles (auto-pré-rempli)
// 3. aperçu 20 lignes + validation à blanc
// 4. création de l'ImportBatch puis boucle /process (lots résumables, progression)
// 5. rapport final + export .xlsx des erreurs pour corriger et réimporter

import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { kml as kmlVersGeoJSON } from '@tmcw/togeojson';

const CHAMPS_CIBLES = [
  { key: 'client_nom', label: 'Client (nom) *', requis: true },
  { key: 'client_contact', label: 'Contact client' },
  { key: 'client_telephone', label: 'Téléphone client' },
  { key: 'client_email', label: 'Email client' },
  { key: 'commune', label: 'Commune' },
  { key: 'code_insee', label: 'Code INSEE' },
  { key: 'section', label: 'Section cadastrale' },
  { key: 'numero', label: 'Numéro de parcelle' },
  { key: 'latitude', label: 'Latitude' },
  { key: 'longitude', label: 'Longitude' },
  { key: 'cepage', label: 'Cépage' },
  { key: 'millesime', label: 'Millésime' },
  { key: 'notes', label: 'Notes parcelle' }
] as const;

type ChampCible = (typeof CHAMPS_CIBLES)[number]['key'];

type EtatBatch = {
  id: string;
  statut: string;
  totalLignes: number;
  lignesTraitees: number;
  clientsCrees: number;
  parcellesCreees: number;
  parcellesIgnorees: number;
  erreurs: Array<{ ligne: number; raison: string; donnees: Record<string, unknown> }>;
};

type Historique = {
  id: string;
  nomFichier: string;
  statut: string;
  totalLignes: number;
  lignesTraitees: number;
  clientsCrees: number;
  parcellesCreees: number;
  parcellesIgnorees: number;
  createdAt: string;
};

/** Auto-mapping : correspondance approximative entre noms de colonnes et champs cibles. */
function devinerMapping(colonnes: string[]): Record<ChampCible, string> {
  const normalise = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const synonymes: Record<ChampCible, string[]> = {
    client_nom: ['clientnom', 'client', 'nomclient', 'domaine', 'exploitation', 'nom'],
    client_contact: ['clientcontact', 'contact'],
    client_telephone: ['clienttelephone', 'telephone', 'tel', 'portable'],
    client_email: ['clientemail', 'email', 'mail'],
    commune: ['commune', 'ville', 'localite'],
    code_insee: ['codeinsee', 'insee'],
    section: ['section', 'sectioncadastrale'],
    numero: ['numero', 'numparcelle', 'noparcelle', 'parcelle', 'num'],
    latitude: ['latitude', 'lat', 'y'],
    longitude: ['longitude', 'lng', 'lon', 'long', 'x'],
    cepage: ['cepage', 'variete'],
    millesime: ['millesime', 'annee', 'anneeplantation'],
    notes: ['notes', 'note', 'commentaire', 'remarques']
  };
  const resultat = {} as Record<ChampCible, string>;
  for (const champ of CHAMPS_CIBLES) {
    const match = colonnes.find((c) => synonymes[champ.key].includes(normalise(c)));
    resultat[champ.key] = match ?? '';
  }
  return resultat;
}

export default function ImportClient() {
  const [nomFichier, setNomFichier] = useState('');
  const [colonnes, setColonnes] = useState<string[]>([]);
  const [lignesBrutes, setLignesBrutes] = useState<Array<Record<string, unknown>>>([]);
  const [geometries, setGeometries] = useState<Array<unknown | null>>([]);
  const [mapping, setMapping] = useState<Record<ChampCible, string>>({} as never);
  const [erreurParse, setErreurParse] = useState<string | null>(null);
  const [batch, setBatch] = useState<EtatBatch | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [historique, setHistorique] = useState<Historique[]>([]);
  const stopRef = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/import');
        if (res.ok) setHistorique(((await res.json()) as { batches: Historique[] }).batches);
      } catch {
        /* ignore */
      }
    })();
  }, [batch?.statut]);

  const telechargerModele = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      CHAMPS_CIBLES.map((c) => c.key),
      [
        'Domaine Exemple',
        'Jean Exemple',
        '+33 6 00 00 00 00',
        'contact@domaine-exemple.fr',
        'Eguisheim',
        '68078',
        'AB',
        '0123',
        '',
        '',
        'Riesling',
        '2021',
        'Parcelle du haut'
      ]
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Parcelles');
    XLSX.writeFile(wb, 'modele-import-krontrol.xlsx');
  };

  const chargerFichier = async (file: File) => {
    setErreurParse(null);
    setBatch(null);
    setNomFichier(file.name);
    const ext = file.name.toLowerCase().split('.').pop() ?? '';

    try {
      if (ext === 'csv') {
        const texte = await file.text();
        const res = Papa.parse<Record<string, unknown>>(texte, {
          header: true,
          skipEmptyLines: true
        });
        const cols = res.meta.fields ?? [];
        setColonnes(cols);
        setLignesBrutes(res.data);
        setGeometries([]);
        setMapping(devinerMapping(cols));
      } else if (ext === 'xlsx' || ext === 'xls') {
        const wb = XLSX.read(await file.arrayBuffer());
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        const cols = data.length > 0 ? Object.keys(data[0]) : [];
        setColonnes(cols);
        setLignesBrutes(data);
        setGeometries([]);
        setMapping(devinerMapping(cols));
      } else if (ext === 'geojson' || ext === 'json' || ext === 'kml') {
        let fc: { features?: Array<{ properties?: Record<string, unknown>; geometry?: unknown }> };
        if (ext === 'kml') {
          const dom = new DOMParser().parseFromString(await file.text(), 'text/xml');
          fc = kmlVersGeoJSON(dom) as never;
        } else {
          fc = JSON.parse(await file.text());
        }
        const features = (fc.features ?? []).filter((f) => f.geometry);
        if (features.length === 0) throw new Error('Aucune feature avec géométrie dans le fichier');
        const cols = Array.from(
          new Set(features.flatMap((f) => Object.keys(f.properties ?? {})))
        );
        setColonnes(cols);
        setLignesBrutes(features.map((f) => (f.properties ?? {}) as Record<string, unknown>));
        setGeometries(features.map((f) => f.geometry ?? null));
        setMapping(devinerMapping(cols));
      } else {
        throw new Error('Format non pris en charge (.xlsx, .xls, .csv, .geojson, .kml)');
      }
    } catch (e) {
      setColonnes([]);
      setLignesBrutes([]);
      setErreurParse(e instanceof Error ? e.message : String(e));
    }
  };

  // Lignes mappées vers les champs cibles + n° de ligne d'origine
  const lignesMappees = () =>
    lignesBrutes.map((brut, i) => {
      const ligne: Record<string, unknown> = { __ligne: i + 2 };
      for (const champ of CHAMPS_CIBLES) {
        const col = mapping[champ.key];
        if (col && brut[col] != null && String(brut[col]).trim() !== '') {
          ligne[champ.key] = brut[col];
        }
      }
      if (geometries[i]) ligne.geometry = geometries[i];
      return ligne;
    });

  // Validation à blanc : lignes sans client ou sans source de géométrie
  const problemes = () => {
    const lignes = lignesMappees();
    let sansClient = 0;
    let sansGeo = 0;
    for (const l of lignes) {
      if (!l.client_nom) sansClient++;
      const refOk = (l.code_insee || l.commune) && l.section && l.numero;
      const pointOk = l.latitude && l.longitude;
      if (!refOk && !pointOk && !l.geometry) sansGeo++;
    }
    return { sansClient, sansGeo, total: lignes.length };
  };

  const lancer = async () => {
    setEnCours(true);
    stopRef.current = false;
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomFichier, mapping, lignes: lignesMappees() })
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !json.id) {
        setErreurParse(json.error ?? 'Erreur à la création de l’import');
        return;
      }
      await boucler(json.id);
    } finally {
      setEnCours(false);
    }
  };

  const boucler = async (id: string) => {
    // Boucle /process : chaque appel traite un lot, l'état vit en base (résumable)
    for (let garde = 0; garde < 1000; garde++) {
      if (stopRef.current) return;
      const res = await fetch(`/api/import/${id}/process`, { method: 'POST' });
      if (!res.ok) {
        setErreurParse('Erreur pendant le traitement — relancez, l’import reprendra où il en était.');
        return;
      }
      const { batch: b } = (await res.json()) as { batch: EtatBatch };
      setBatch(b);
      if (b.statut === 'TERMINE') return;
    }
  };

  const exporterErreurs = () => {
    if (!batch || batch.erreurs.length === 0) return;
    const lignes = batch.erreurs.map((e) => ({
      ligne_origine: e.ligne,
      raison: e.raison,
      ...Object.fromEntries(
        Object.entries(e.donnees).filter(([k]) => k !== '__ligne' && k !== 'geometry')
      )
    }));
    const ws = XLSX.utils.json_to_sheet(lignes);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Erreurs');
    XLSX.writeFile(wb, `erreurs-${nomFichier.replace(/\.[^.]+$/, '')}.xlsx`);
  };

  const p = colonnes.length > 0 ? problemes() : null;
  const apercu = lignesMappees().slice(0, 20);
  const progression = batch ? Math.round((batch.lignesTraitees / batch.totalLignes) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* 1. Upload */}
      <div className="card space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="btn-sm btn-ink cursor-pointer">
            📄 Choisir un fichier
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.geojson,.json,.kml"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && void chargerFichier(e.target.files[0])}
            />
          </label>
          <button onClick={telechargerModele} className="btn-sm btn-outline">
            ⬇ Télécharger le modèle Excel
          </button>
          {nomFichier && (
            <span className="text-[13px] text-muted">
              {nomFichier} · {lignesBrutes.length} ligne{lignesBrutes.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {erreurParse && <div className="text-[13px] text-warn">⚠ {erreurParse}</div>}
      </div>

      {/* 2. Mapping */}
      {colonnes.length > 0 && !batch && (
        <div className="card space-y-3 p-5">
          <h2 className="text-[15px] font-bold">Correspondance des colonnes</h2>
          <div className="grid gap-2 md:grid-cols-3">
            {CHAMPS_CIBLES.map((champ) => (
              <div key={champ.key}>
                <label className="label">{champ.label}</label>
                <select
                  value={mapping[champ.key] ?? ''}
                  onChange={(e) => setMapping((m) => ({ ...m, [champ.key]: e.target.value }))}
                  className="input py-1.5 text-[13px]"
                >
                  <option value="">— non importé —</option>
                  {colonnes.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {geometries.length > 0 && (
            <p className="text-[12.5px] text-muted">
              🗺 Les géométries du fichier ({geometries.filter(Boolean).length}) seront utilisées
              directement — pas d’appel IGN.
            </p>
          )}

          {/* 3. Aperçu + validation à blanc */}
          {p && (
            <div className="flex flex-wrap gap-2 text-[13px]">
              <span className="badge badge-ok">{p.total} lignes</span>
              {p.sansClient > 0 && (
                <span className="badge badge-warn">{p.sansClient} sans client → erreur</span>
              )}
              {p.sansGeo > 0 && (
                <span className="badge badge-warn">{p.sansGeo} sans géométrie → erreur</span>
              )}
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-paper text-left">
                  {CHAMPS_CIBLES.filter((c) => mapping[c.key]).map((c) => (
                    <th key={c.key} className="px-2 py-1.5 font-bold">
                      {c.key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {apercu.map((l, i) => (
                  <tr key={i} className="border-t border-line">
                    {CHAMPS_CIBLES.filter((c) => mapping[c.key]).map((c) => (
                      <td key={c.key} className="px-2 py-1">
                        {String(l[c.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={() => void lancer()} disabled={enCours} className="btn-sm btn-green px-6 py-2.5">
            {enCours ? 'Import en cours…' : `🚀 Lancer l’import (${lignesBrutes.length} lignes)`}
          </button>
        </div>
      )}

      {/* 4. Progression + 5. Rapport */}
      {batch && (
        <div className="card space-y-3 p-5">
          <h2 className="text-[15px] font-bold">
            {batch.statut === 'TERMINE' ? '✓ Import terminé' : 'Traitement en cours…'}
          </h2>
          <div className="h-3 overflow-hidden rounded-full bg-paper">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${progression}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-2 text-[13px]">
            <span className="badge badge-muted">
              {batch.lignesTraitees}/{batch.totalLignes} lignes
            </span>
            <span className="badge badge-ok">{batch.clientsCrees} clients créés</span>
            <span className="badge badge-ok">{batch.parcellesCreees} parcelles créées</span>
            <span className="badge badge-muted">{batch.parcellesIgnorees} ignorées (doublons)</span>
            <span className={`badge ${batch.erreurs.length > 0 ? 'badge-warn' : 'badge-muted'}`}>
              {batch.erreurs.length} erreurs
            </span>
          </div>
          {batch.statut === 'TERMINE' && batch.erreurs.length > 0 && (
            <>
              <button onClick={exporterErreurs} className="btn-sm btn-amber">
                ⬇ Télécharger le rapport d’erreurs (.xlsx)
              </button>
              <div className="max-h-[200px] overflow-y-auto rounded-lg border border-line">
                {batch.erreurs.slice(0, 50).map((e, i) => (
                  <div key={i} className="border-b border-line px-3 py-1.5 text-[12.5px] last:border-b-0">
                    <b>Ligne {e.ligne}</b> — {e.raison}
                  </div>
                ))}
              </div>
            </>
          )}
          {batch.statut === 'TERMINE' && (
            <p className="text-[13px] text-muted">
              Les nouvelles parcelles sont visibles sur{' '}
              <a href="/admin/carte" className="underline">
                la carte
              </a>
              , colorées par client.
            </p>
          )}
        </div>
      )}

      {/* Historique */}
      {historique.length > 0 && (
        <div className="card p-0">
          <h2 className="border-b border-line px-4 py-3 text-[14px] font-bold">Imports récents</h2>
          {historique.map((h) => (
            <div
              key={h.id}
              className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2 text-[13px] last:border-b-0"
            >
              <span className="font-mono text-[12px] text-muted">
                {new Date(h.createdAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
              </span>
              <b className="flex-1">{h.nomFichier}</b>
              <span className="text-muted">
                {h.parcellesCreees} parcelles · {h.clientsCrees} clients
              </span>
              <span
                className={`badge ${h.statut === 'TERMINE' ? 'badge-ok' : h.statut === 'ECHEC' ? 'badge-warn' : 'badge-amber'}`}
              >
                {h.statut === 'EN_COURS' && h.lignesTraitees < h.totalLignes
                  ? `${h.lignesTraitees}/${h.totalLignes}`
                  : h.statut.toLowerCase()}
              </span>
              {h.statut === 'EN_COURS' && (
                <button onClick={() => void boucler(h.id)} className="btn-sm btn-outline">
                  Reprendre
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
