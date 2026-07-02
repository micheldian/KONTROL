'use client';

import { useState, useTransition } from 'react';
import { demanderAcompte } from './actions';

export default function AdvanceRequest({
  labels
}: {
  labels: Record<string, string>;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (envoye) {
    return (
      <div className="card mt-4 py-4 text-center text-[14px] font-semibold text-ok">
        {labels.advanceSent}
      </div>
    );
  }

  if (!ouvert) {
    return (
      <button onClick={() => setOuvert(true)} className="btn btn-amber mt-4 w-full">
        {labels.askAdvance}
      </button>
    );
  }

  return (
    <div className="card mt-4 space-y-3">
      <div>
        <label className="label">{labels.advanceAmount}</label>
        <input
          type="number"
          inputMode="decimal"
          min={1}
          step="1"
          className="input text-center font-mono text-[18px]"
          value={montant}
          onChange={(e) => setMontant(e.target.value)}
        />
      </div>
      <div>
        <label className="label">{labels.advanceReason}</label>
        <input className="input" value={motif} onChange={(e) => setMotif(e.target.value)} />
      </div>
      {erreur && <p className="text-[13.5px] font-semibold text-warn">{erreur}</p>}
      <button
        disabled={pending || !montant}
        onClick={() => {
          setErreur(null);
          startTransition(async () => {
            try {
              await demanderAcompte(Number(montant), motif);
              setEnvoye(true);
            } catch (e) {
              setErreur(e instanceof Error ? e.message : labels.error);
            }
          });
        }}
        className="btn btn-green w-full"
      >
        {labels.advanceSend}
      </button>
    </div>
  );
}
