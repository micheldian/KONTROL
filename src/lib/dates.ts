// Helpers de dates — tout est raisonné en Europe/Paris (spec section 6).

const TZ = 'Europe/Paris';

/** "YYYY-MM-DD" du jour en Europe/Paris (éventuellement décalé de N jours). */
export function todayParis(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Convertit "YYYY-MM-DD" en Date UTC minuit (stockage @db.Date). */
export function dateFromYMD(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Extrait "YYYY-MM-DD" d'une Date stockée @db.Date. */
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Ajoute N jours à un "YYYY-MM-DD". */
export function addDays(ymdStr: string, n: number): string {
  const d = dateFromYMD(ymdStr);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

/** Heure courante "HH:MM" en Europe/Paris. */
export function nowTimeParis(): string {
  return new Date().toLocaleTimeString('fr-FR', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** Minutes depuis minuit d'un "HH:MM". */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Durée en heures décimales : fin − début − pause (jamais négatif). */
export function dureeHeures(debut: string, fin: string, pauseMinutes: number): number {
  const mins = toMinutes(fin) - toMinutes(debut) - (pauseMinutes || 0);
  return Math.max(0, Math.round((mins / 60) * 100) / 100);
}

/** Chevauchement de deux créneaux [d1,f1) et [d2,f2). */
export function chevauche(d1: string, f1: string, d2: string, f2: string): boolean {
  return toMinutes(d1) < toMinutes(f2) && toMinutes(d2) < toMinutes(f1);
}

/** Format lisible "Vendredi 12 juin" dans la locale donnée. */
export function formatJour(ymdStr: string, locale: string): string {
  const d = dateFromYMD(ymdStr);
  const s = d.toLocaleDateString(
    locale === 'ro' ? 'ro-RO' : locale === 'es' ? 'es-ES' : 'fr-FR',
    { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }
  );
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Format "12/06/2026". */
export function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? dateFromYMD(d) : d;
  return date.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
}

/** Mois courant {mois, annee} en Europe/Paris. */
export function moisCourant(): { mois: number; annee: number } {
  const t = todayParis();
  return { mois: Number(t.slice(5, 7)), annee: Number(t.slice(0, 4)) };
}

/** Bornes "YYYY-MM-DD" d'un mois : [premier jour, premier jour du mois suivant). */
export function bornesMois(mois: number, annee: number): { debut: string; finExclue: string } {
  const debut = `${annee}-${String(mois).padStart(2, '0')}-01`;
  const mSuiv = mois === 12 ? 1 : mois + 1;
  const aSuiv = mois === 12 ? annee + 1 : annee;
  return { debut, finExclue: `${aSuiv}-${String(mSuiv).padStart(2, '0')}-01` };
}

/** Nombre de jours entre deux "YYYY-MM-DD" (b − a). */
export function diffJours(a: string, b: string): number {
  return Math.round((dateFromYMD(b).getTime() - dateFromYMD(a).getTime()) / 86400000);
}

export function formatEuros(n: number | string): string {
  return (
    Number(n)
      .toFixed(2)
      .replace('.', ',')
      .replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €'
  );
}

export function formatHeures(n: number | string): string {
  const v = Number(n);
  const h = Math.floor(v);
  const m = Math.round((v - h) * 60);
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}
