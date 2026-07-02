'use client';

import { useTransition } from 'react';
import { journaliserWhatsApp } from './actions';

/** Ouvre le lien wa.me pré-rempli et journalise l'envoi. */
export default function WaButton({
  affectationId,
  userId,
  href
}: {
  affectationId: string;
  userId: string;
  href: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => {
        window.open(href, '_blank', 'noopener');
        startTransition(async () => {
          const fd = new FormData();
          fd.set('affectationId', affectationId);
          fd.set('userId', userId);
          await journaliserWhatsApp(fd);
        });
      }}
      className="btn-sm btn-outline"
    >
      🟢 WhatsApp
    </button>
  );
}
