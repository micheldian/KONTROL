'use client';

import { useMemo, useState, useTransition } from 'react';
import { envoyerMesHeures } from './actions';

type Ligne = {
  affectationId?: string | null;
  missionId: string;
  libelle: string;
  heureDebut: string;
  heureFin: string;
  pauseMinutes: number;
};

function dureeMinutes(l: Ligne) {
  const [h1, m1] = l.heureDebut.split(':').map(Number);
  const [h2, m2] = l.heureFin.split(':').map(Number);
  return Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1) - (l.pauseMinutes || 0));
}

export default function HoursForm({
  planifies,
  missions,
  labels,
  rienAPlanifier,
  noSlotText
}: {
  planifies: Ligne[];
  missions: { id: string; libelle: string }[];
  labels: Record<string, string>;
  rienAPlanifier: boolean;
  noSlotText: string;
}) {
  const [lignes, setLignes] = useState<Ligne[]>(planifies);
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const totalMin = useMemo(
    () => lignes.reduce((acc, l) => acc + dureeMinutes(l), 0),
    [lignes]
  );

  function maj(i: number, patch: Partial<Ligne>) {
    setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function ajouterCreneau() {
    if (missions.length === 0) return;
    setLignes((ls) => [
      ...ls,
      {
        missionId: missions[0].id,
        libelle: missions[0].libelle,
        heureDebut: '08:00',
        heureFin: '12:00',
        pauseMinutes: 0,
        affectationId: null
      }
    ]);
  }

  function envoyer() {
    setErreur(null);
    startTransition(async () => {
      try {
        await envoyerMesHeures(
          lignes.map((l) => ({
            affectationId: l.affectationId ?? null,
            missionId: l.missionId,
            heureDebut: l.heureDebut,
            heureFin: l.heureFin,
            pauseMinutes: l.pauseMinutes
          }))
        );
        setEnvoye(true);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : labels.error);
      }
    });
  }

  if (envoye) return null; // la page re-render côté serveur affiche les créneaux saisis

  if (lignes.length === 0 && rienAPlanifier) {
    return (
      <div>
        <div className="card py-8 text-center text-[15px] text-muted">{noSlotText}</div>
        {missions.length > 0 && (
          <button onClick={ajouterCreneau} className="btn btn-outline mt-3 w-full">
            {labels.addSlot}
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {lignes.map((l, i) => (
        <div key={i} className="card mb-3">
          {l.affectationId ? (
            <span className="slot-chip mb-2.5">{l.libelle}</span>
          ) : (
            <div className="mb-2.5">
              <label className="label">{labels.chooseMission}</label>
              <select
                className="input"
                value={l.missionId}
                onChange={(e) => {
                  const m = missions.find((x) => x.id === e.target.value)!;
                  maj(i, { missionId: m.id, libelle: m.libelle });
                }}
              >
                {missions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.libelle}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border-[1.5px] border-line bg-paper p-2 text-center">
              <label className="label mb-0.5">{labels.start}</label>
              <input
                type="time"
                className="w-full bg-transparent text-center font-mono text-[17px] font-bold outline-none"
                value={l.heureDebut}
                onChange={(e) => maj(i, { heureDebut: e.target.value })}
              />
            </div>
            <div className="rounded-xl border-[1.5px] border-line bg-paper p-2 text-center">
              <label className="label mb-0.5">{labels.end}</label>
              <input
                type="time"
                className="w-full bg-transparent text-center font-mono text-[17px] font-bold outline-none"
                value={l.heureFin}
                onChange={(e) => maj(i, { heureFin: e.target.value })}
              />
            </div>
            <div className="rounded-xl border-[1.5px] border-line bg-paper p-2 text-center">
              <label className="label mb-0.5">{labels.pause}</label>
              <div className="font-mono text-[17px] font-bold">
                {l.pauseMinutes} {labels.minutes}
              </div>
              <div className="mt-1 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => maj(i, { pauseMinutes: Math.max(0, l.pauseMinutes - 15) })}
                  className="h-8 w-8 rounded-lg border-[1.5px] border-line bg-white text-[16px] font-bold"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => maj(i, { pauseMinutes: l.pauseMinutes + 15 })}
                  className="h-8 w-8 rounded-lg border-[1.5px] border-line bg-white text-[16px] font-bold"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      <button onClick={ajouterCreneau} className="mb-3 text-[13.5px] font-semibold text-brand underline">
        {labels.addSlot}
      </button>

      <div className="mb-2.5 font-mono text-[15px] font-bold">
        {labels.totalDay} : {Math.floor(totalMin / 60)} h{' '}
        {String(totalMin % 60).padStart(2, '0')}
      </div>

      {erreur && <p className="mb-2 text-[13.5px] font-semibold text-warn">{erreur}</p>}

      <button
        onClick={envoyer}
        disabled={pending || lignes.length === 0}
        className="btn btn-green w-full"
      >
        {labels.confirmHours}
      </button>
    </div>
  );
}
