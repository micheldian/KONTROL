'use client';

import { useState, useTransition } from 'react';
import { envoyerHeuresEquipe } from './actions';

type Ligne = { userId: string; nom: string; heureDebut: string; heureFin: string; pauseMinutes: number };

export default function TeamForm({
  affectationId,
  titre,
  membres,
  defauts,
  labels
}: {
  affectationId: string;
  titre: string;
  membres: { userId: string; nom: string }[];
  defauts: { heureDebut: string; heureFin: string; pauseMinutes: number };
  labels: Record<string, string>;
}) {
  const [lignes, setLignes] = useState<Ligne[]>(
    membres.map((m) => ({ ...m, ...defauts }))
  );
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function maj(i: number, patch: Partial<Ligne>) {
    setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function appliquerATous() {
    const [premiere] = lignes;
    if (!premiere) return;
    setLignes((ls) =>
      ls.map((l) => ({
        ...l,
        heureDebut: premiere.heureDebut,
        heureFin: premiere.heureFin,
        pauseMinutes: premiere.pauseMinutes
      }))
    );
  }

  function envoyer() {
    setErreur(null);
    startTransition(async () => {
      try {
        await envoyerHeuresEquipe(
          affectationId,
          lignes.map((l) => ({
            userId: l.userId,
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

  if (envoye) {
    return (
      <div className="card mb-3 py-5 text-center text-[14px] font-semibold text-ok">
        {labels.teamSent}
      </div>
    );
  }

  return (
    <div className="card mb-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="slot-chip">{titre}</span>
        <button
          type="button"
          onClick={appliquerATous}
          className="text-[12.5px] font-semibold text-brand underline"
        >
          {labels.applyToAll}
        </button>
      </div>
      <div className="space-y-2">
        {lignes.map((l, i) => (
          <div key={l.userId} className="rounded-xl border-[1.5px] border-line bg-paper p-2.5">
            <div className="mb-1.5 text-[13.5px] font-bold">{l.nom}</div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="time"
                aria-label={labels.start}
                className="input py-2 text-center font-mono text-[14px]"
                value={l.heureDebut}
                onChange={(e) => maj(i, { heureDebut: e.target.value })}
              />
              <input
                type="time"
                aria-label={labels.end}
                className="input py-2 text-center font-mono text-[14px]"
                value={l.heureFin}
                onChange={(e) => maj(i, { heureFin: e.target.value })}
              />
              <input
                type="number"
                min={0}
                step={15}
                aria-label={labels.pause}
                className="input py-2 text-center font-mono text-[14px]"
                value={l.pauseMinutes}
                onChange={(e) => maj(i, { pauseMinutes: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
        ))}
      </div>
      {erreur && <p className="mt-2 text-[13.5px] font-semibold text-warn">{erreur}</p>}
      <button onClick={envoyer} disabled={pending} className="btn btn-green mt-3 w-full">
        {labels.teamEntry}
      </button>
    </div>
  );
}
