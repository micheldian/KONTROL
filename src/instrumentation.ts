// Hook de démarrage Next.js (experimental.instrumentationHook) : exécuté une fois par
// instance serveur, avant la première requête → migrations idempotentes.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assurerMigrations } = await import('./lib/migrations-auto');
    await assurerMigrations().catch((e) => {
      console.error('[migrations-auto] échec au démarrage :', e);
    });
  }
}
