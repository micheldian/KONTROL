'use client';

import { useState, useTransition } from 'react';
import { confirmerPresence } from './actions';

export default function ConfirmButton({
  affectationOuvrierId,
  confirme,
  labels
}: {
  affectationOuvrierId: string;
  confirme: boolean;
  labels: { beThere: string; confirmed: string; toast: string };
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(confirme);
  const [toast, setToast] = useState(false);

  function onClick() {
    if (done || pending) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set('affectationOuvrierId', affectationOuvrierId);
      await confirmerPresence(fd);
      setDone(true);
      setToast(true);
      setTimeout(() => setToast(false), 2200);
    });
  }

  return (
    <>
      <button
        onClick={onClick}
        disabled={pending}
        className={`btn flex-1 ${done ? 'btn-done' : 'btn-green'}`}
      >
        {done ? labels.confirmed : labels.beThere}
      </button>
      {toast && (
        <div className="fixed bottom-[84px] left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-4.5 py-2.5 px-5 text-[14px] text-paper">
          {labels.toast}
        </div>
      )}
    </>
  );
}
