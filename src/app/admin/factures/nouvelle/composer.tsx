'use client';

import { useMemo, useState, useTransition } from 'react';
import { envoyerFacture } from '../actions';

type Creneau = { date: string; ouvrier: string; heures: number };
type LigneLibre = { libelle: string; quantite: number; prixUnitaire: number };

const eur = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export default function Composer({
  missionId,
  tauxClient,
  montantForfait,
  libelleMission,
  creneaux
}: {
  missionId: string;
  tauxClient: number | null;
  montantForfait: number | null;
  libelleMission: string;
  creneaux: Creneau[];
}) {
  const dates = creneaux.map((c) => c.date);
  const [inclureHeures, setInclureHeures] = useState(creneaux.length > 0);
  const [du, setDu] = useState(dates[0] ?? '');
  const [au, setAu] = useState(dates[dates.length - 1] ?? '');
  const [detail, setDetail] = useState(false);
  const [nominatif, setNominatif] = useState(true);
  const [taux, setTaux] = useState(tauxClient ?? 25);

  const [inclureForfait, setInclureForfait] = useState(!!montantForfait && creneaux.length === 0);
  const [forfaitLibelle, setForfaitLibelle] = useState(`${libelleMission} — forfait`);
  const [forfaitMontant, setForfaitMontant] = useState(montantForfait ?? 0);

  const [lignesLibres, setLignesLibres] = useState<LigneLibre[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Aperçu (le serveur recalcule les heures à l'envoi — source de vérité)
  const apercu = useMemo(() => {
    const lignes: { libelle: string; quantite: number; pu: number }[] = [];
    if (inclureHeures && du && au) {
      const dansPeriode = creneaux.filter((c) => c.date >= du && c.date <= au);
      if (detail) {
        const par = new Map<string, number>();
        dansPeriode.forEach((c) => par.set(c.ouvrier, (par.get(c.ouvrier) ?? 0) + c.heures));
        let i = 0;
        for (const [ouvrier, h] of Array.from(par.entries())) {
          i += 1;
          lignes.push({
            libelle: `Main-d'œuvre — ${nominatif ? ouvrier : `Ouvrier ${i}`}`,
            quantite: Math.round(h * 100) / 100,
            pu: taux
          });
        }
      } else {
        const total = dansPeriode.reduce((a, c) => a + c.heures, 0);
        lignes.push({
          libelle: `Main-d'œuvre ${libelleMission} (${du} → ${au})`,
          quantite: Math.round(total * 100) / 100,
          pu: taux
        });
      }
    }
    if (inclureForfait) {
      lignes.push({ libelle: forfaitLibelle, quantite: 1, pu: forfaitMontant });
    }
    lignesLibres.forEach((l) => {
      if (l.libelle.trim()) lignes.push({ libelle: l.libelle, quantite: l.quantite, pu: l.prixUnitaire });
    });
    const total = lignes.reduce((a, l) => a + l.quantite * l.pu, 0);
    return { lignes, total: Math.round(total * 100) / 100 };
  }, [inclureHeures, du, au, detail, nominatif, taux, inclureForfait, forfaitLibelle, forfaitMontant, lignesLibres, creneaux, libelleMission]);

  function envoyer(brouillon: boolean) {
    setErreur(null);
    startTransition(async () => {
      try {
        await envoyerFacture({
          missionId,
          brouillon,
          heures: inclureHeures
            ? { inclure: true, du, au, detailParOuvrier: detail, nominatif, taux }
            : undefined,
          forfait: inclureForfait
            ? { inclure: true, libelle: forfaitLibelle, montant: forfaitMontant }
            : undefined,
          lignesLibres
        });
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Erreur');
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Lignes heures */}
      <div className="card p-5">
        <label className="flex items-center gap-2 text-[15px] font-bold">
          <input
            type="checkbox"
            checked={inclureHeures}
            onChange={(e) => setInclureHeures(e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          Lignes heures ({creneaux.length} créneau{creneaux.length > 1 ? 'x' : ''} validé{creneaux.length > 1 ? 's' : ''})
        </label>
        {inclureHeures && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Du</label>
              <input type="date" value={du} onChange={(e) => setDu(e.target.value)} className="input w-auto py-2" />
            </div>
            <div>
              <label className="label">Au (inclus)</label>
              <input type="date" value={au} onChange={(e) => setAu(e.target.value)} className="input w-auto py-2" />
            </div>
            <div>
              <label className="label">Taux client (€/h HT)</label>
              <input
                type="number"
                step="0.01"
                value={taux}
                onChange={(e) => setTaux(Number(e.target.value))}
                className="input w-[110px] py-2"
              />
            </div>
            <label className="flex items-center gap-1.5 pb-2 text-[13px]">
              <input type="checkbox" checked={detail} onChange={(e) => setDetail(e.target.checked)} className="accent-brand" />
              Détail par ouvrier
            </label>
            {detail && (
              <label className="flex items-center gap-1.5 pb-2 text-[13px]">
                <input type="checkbox" checked={nominatif} onChange={(e) => setNominatif(e.target.checked)} className="accent-brand" />
                Nominatif
              </label>
            )}
          </div>
        )}
      </div>

      {/* Forfait */}
      <div className="card p-5">
        <label className="flex items-center gap-2 text-[15px] font-bold">
          <input
            type="checkbox"
            checked={inclureForfait}
            onChange={(e) => setInclureForfait(e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          Ligne forfait / tâche
        </label>
        {inclureForfait && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <label className="label">Libellé</label>
              <input value={forfaitLibelle} onChange={(e) => setForfaitLibelle(e.target.value)} className="input py-2" />
            </div>
            <div>
              <label className="label">Montant HT (€)</label>
              <input
                type="number"
                step="0.01"
                value={forfaitMontant}
                onChange={(e) => setForfaitMontant(Number(e.target.value))}
                className="input w-[130px] py-2"
              />
            </div>
          </div>
        )}
      </div>

      {/* Lignes libres */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-bold">Lignes libres</span>
          <button
            type="button"
            onClick={() => setLignesLibres((ls) => [...ls, { libelle: '', quantite: 1, prixUnitaire: 0 }])}
            className="btn-sm btn-outline"
          >
            + Ajouter
          </button>
        </div>
        {lignesLibres.map((l, i) => (
          <div key={i} className="mt-2 flex flex-wrap items-center gap-2">
            <input
              placeholder="Libellé"
              value={l.libelle}
              onChange={(e) =>
                setLignesLibres((ls) => ls.map((x, j) => (j === i ? { ...x, libelle: e.target.value } : x)))
              }
              className="input flex-1 py-2"
            />
            <input
              type="number"
              step="0.01"
              value={l.quantite}
              onChange={(e) =>
                setLignesLibres((ls) => ls.map((x, j) => (j === i ? { ...x, quantite: Number(e.target.value) } : x)))
              }
              className="input w-[90px] py-2"
              title="Quantité"
            />
            <input
              type="number"
              step="0.01"
              value={l.prixUnitaire}
              onChange={(e) =>
                setLignesLibres((ls) => ls.map((x, j) => (j === i ? { ...x, prixUnitaire: Number(e.target.value) } : x)))
              }
              className="input w-[110px] py-2"
              title="Prix unitaire HT"
            />
            <button
              type="button"
              onClick={() => setLignesLibres((ls) => ls.filter((_, j) => j !== i))}
              className="btn-sm text-warn"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Aperçu */}
      <div className="card p-5">
        <div className="mb-2 text-[15px] font-bold">Aperçu</div>
        {apercu.lignes.length === 0 ? (
          <p className="text-[13.5px] text-muted">Aucune ligne sélectionnée.</p>
        ) : (
          <table className="w-full text-[13.5px]">
            <tbody>
              {apercu.lignes.map((l, i) => (
                <tr key={i} className="border-b border-line last:border-b-0">
                  <td className="py-1.5">{l.libelle}</td>
                  <td className="py-1.5 text-right font-mono">
                    {l.quantite} × {eur(l.pu)}
                  </td>
                  <td className="py-1.5 text-right font-mono font-bold">
                    {eur(l.quantite * l.pu)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="pt-2.5 font-bold">Total HT</td>
                <td />
                <td className="pt-2.5 text-right font-mono text-[16px] font-bold">
                  {eur(apercu.total)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {erreur && <p className="text-[13.5px] font-semibold text-warn">⚠ {erreur}</p>}

      <div className="flex gap-3">
        <button
          onClick={() => envoyer(true)}
          disabled={pending || apercu.lignes.length === 0}
          className="btn-sm btn-outline px-5 py-3"
        >
          Envoyer en brouillon
        </button>
        <button
          onClick={() => envoyer(false)}
          disabled={pending || apercu.lignes.length === 0}
          className="btn-sm btn-green px-5 py-3"
        >
          Envoyer finalisée
        </button>
      </div>
    </div>
  );
}
