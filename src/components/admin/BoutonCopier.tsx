'use client';

import { useState } from 'react';

// Bouton copier-coller (écran DPAE/TESA, lien d'onboarding).
export default function BoutonCopier({
  texte,
  label = 'Copier',
  petit = true
}: {
  texte: string;
  label?: string;
  petit?: boolean;
}) {
  const [copie, setCopie] = useState(false);
  return (
    <button
      type="button"
      className={`${petit ? 'btn-sm' : 'btn'} ${copie ? 'btn-green' : 'btn-outline'}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texte);
        } catch {
          const zone = document.createElement('textarea');
          zone.value = texte;
          document.body.appendChild(zone);
          zone.select();
          document.execCommand('copy');
          zone.remove();
        }
        setCopie(true);
        setTimeout(() => setCopie(false), 1500);
      }}
    >
      {copie ? '✓ Copié' : label}
    </button>
  );
}
