import 'server-only';

// Rate-limiting simple en mémoire par clé (IP) — fenêtre glissante.
// Suffisant en anti-spam de formulaire public ; sur Vercel chaque instance a sa
// propre mémoire, ce qui reste un frein efficace contre les rafales.

const seaux = new Map<string, number[]>();

export function limiteAtteinte(cle: string, max: number, fenetreMs: number): boolean {
  const maintenant = Date.now();
  const liste = (seaux.get(cle) ?? []).filter((t) => maintenant - t < fenetreMs);
  if (liste.length >= max) {
    seaux.set(cle, liste);
    return true;
  }
  liste.push(maintenant);
  seaux.set(cle, liste);
  // nettoyage opportuniste
  if (seaux.size > 5000) {
    for (const [k, v] of Array.from(seaux.entries())) {
      if (v.every((t) => maintenant - t > fenetreMs)) seaux.delete(k);
    }
  }
  return false;
}
