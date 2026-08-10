'use client';

import { useEffect, useState } from 'react';

// Confirmation visuelle globale des enregistrements du back-office : toutes les
// mutations passent par des server actions (POST avec l'en-tête Next-Action).
// On intercepte ces appels pour afficher « Enregistrement… » puis « ✓ Enregistré »
// — sans toucher aux dizaines de formulaires existants. Si l'action redirige
// avec ?erreur= ou affiche une bannière d'erreur, le ✓ est remplacé.

type Etat = null | 'pending' | 'ok' | 'erreur';

function enteteNextAction(init?: RequestInit): boolean {
  const h = init?.headers;
  if (!h) return false;
  if (h instanceof Headers) return h.has('Next-Action');
  if (Array.isArray(h)) return h.some(([k]) => k.toLowerCase() === 'next-action');
  return Object.keys(h).some((k) => k.toLowerCase() === 'next-action');
}

export default function ToastActions() {
  const [etat, setEtat] = useState<Etat>(null);

  useEffect(() => {
    const original = window.fetch.bind(window);
    let enCours = 0;
    let timerFin: ReturnType<typeof setTimeout> | null = null;

    window.fetch = async (entree: RequestInfo | URL, init?: RequestInit) => {
      if (!enteteNextAction(init)) return original(entree, init);

      enCours++;
      if (timerFin) clearTimeout(timerFin);
      setEtat('pending');
      try {
        const reponse = await original(entree, init);
        enCours--;
        if (enCours <= 0) {
          // Laisse le re-rendu se poser, puis vérifie qu'aucune erreur n'est affichée
          timerFin = setTimeout(() => {
            const erreurVisible =
              document.querySelector('[data-banniere-erreur]') ||
              window.location.search.includes('erreur=');
            setEtat(reponse.ok && !erreurVisible ? 'ok' : 'erreur');
            timerFin = setTimeout(() => setEtat(null), 2600);
          }, 450);
        }
        return reponse;
      } catch (e) {
        enCours--;
        setEtat('erreur');
        timerFin = setTimeout(() => setEtat(null), 3500);
        throw e;
      }
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  if (!etat) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 left-1/2 z-[2000] -translate-x-1/2 rounded-full border-[1.5px] px-5 py-2.5 text-[14px] font-bold shadow-lg transition-opacity ${
        etat === 'pending'
          ? 'border-line bg-white text-muted'
          : etat === 'ok'
            ? 'border-[#BFD9C8] bg-[#EFF7F1] text-ok'
            : 'border-[#F3C1A8] bg-[#FFF3EC] text-warn'
      }`}
    >
      {etat === 'pending' && '⏳ Enregistrement…'}
      {etat === 'ok' && '✓ Enregistré'}
      {etat === 'erreur' && '⚠ Non enregistré — vérifiez le message d’erreur'}
    </div>
  );
}
