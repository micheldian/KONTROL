'use client';

import { useRef, useState, useTransition } from 'react';
import { enregistrerPhoto, supprimerPhoto } from '@/app/admin/ouvriers/photo-actions';

const COTE_MAX = 640; // px — suffisant pour reconnaître un visage, ~50-150 Ko en JPEG

/** Réduit l'image dans le navigateur (canvas) → data URL JPEG. */
async function reduire(fichier: File): Promise<string> {
  const bitmap = await createImageBitmap(fichier);
  const ratio = Math.min(1, COTE_MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function initiales(prenom: string, nom: string): string {
  return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();
}

/** Vignette ronde (listes) : photo si présente, sinon initiales. */
export function Avatar({
  userId,
  version,
  prenom,
  nom,
  taille = 32
}: {
  userId: string;
  version: number | null;
  prenom: string;
  nom: string;
  taille?: number;
}) {
  const style = { width: taille, height: taille, fontSize: Math.round(taille * 0.38) };
  if (version) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/ouvriers/${userId}/photo?v=${version}`}
        alt={`${prenom} ${nom}`}
        style={style}
        className="shrink-0 rounded-full border border-line object-cover"
      />
    );
  }
  return (
    <span
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full border border-line bg-[#E8EFE9] font-bold text-brand"
      aria-label={`${prenom} ${nom}`}
    >
      {initiales(prenom, nom)}
    </span>
  );
}

/** Bloc photo de la fiche : grand avatar + prendre / remplacer / supprimer. */
export default function PhotoOuvrier({
  userId,
  prenom,
  nom,
  version: versionInitiale
}: {
  userId: string;
  prenom: string;
  nom: string;
  version: number | null;
}) {
  const [version, setVersion] = useState<number | null>(versionInitiale);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function surFichier(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier) return;
    setErreur(null);
    startTransition(async () => {
      try {
        const dataUrl = await reduire(fichier);
        const res = await enregistrerPhoto({ userId, dataUrl });
        if (!res.ok) setErreur(res.erreur ?? 'Erreur');
        else setVersion(res.version ?? Date.now());
      } catch (err) {
        setErreur(err instanceof Error ? err.message : 'Image illisible');
      }
    });
  }

  function supprimer() {
    if (!window.confirm('Supprimer la photo ?')) return;
    startTransition(async () => {
      const res = await supprimerPhoto({ userId });
      if (!res.ok) setErreur(res.erreur ?? 'Erreur');
      else setVersion(null);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar userId={userId} version={version} prenom={prenom} nom={nom} taille={72} />
      <div className="flex flex-col gap-1.5">
        {/* capture="user" : ouvre directement l'appareil photo sur mobile */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="user"
          onChange={surFichier}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="btn-sm btn-outline"
        >
          {pending ? '…' : version ? '📷 Remplacer la photo' : '📷 Prendre une photo'}
        </button>
        {version && (
          <button
            type="button"
            onClick={supprimer}
            disabled={pending}
            className="text-left text-[12px] text-muted underline"
          >
            Supprimer
          </button>
        )}
        {erreur && <span className="text-[12px] text-warn">{erreur}</span>}
      </div>
    </div>
  );
}
