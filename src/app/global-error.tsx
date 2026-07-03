'use client';

// Filet de sécurité racine : affiche l'erreur réelle (message + digest) au lieu
// du « Application error » générique de Next, avec un bouton Recharger.
// Rend son propre <html> car il remplace le layout racine.

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#F6F3EA', color: '#1F2A24', margin: 0 }}>
        <div style={{ maxWidth: 420, margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>
            KRON<span style={{ color: '#B07900' }}>TROL</span>
          </div>
          <h1 style={{ fontSize: 19, marginTop: 32 }}>Oups, quelque chose s’est mal passé</h1>
          <p style={{ fontSize: 14.5, color: '#5C6660' }}>
            Rechargez la page — si le problème persiste, envoyez le détail ci-dessous à votre
            responsable.
          </p>
          <button
            onClick={() => (reset ? reset() : window.location.reload())}
            style={{
              marginTop: 20,
              minHeight: 56,
              width: '100%',
              fontSize: 17,
              fontWeight: 700,
              color: '#fff',
              background: '#2E7D32',
              border: 0,
              borderRadius: 14,
              cursor: 'pointer'
            }}
          >
            ↻ Recharger la page
          </button>
          <pre
            style={{
              marginTop: 28,
              padding: 12,
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: 11.5,
              background: '#EFEAD9',
              borderRadius: 10,
              color: '#5C6660'
            }}
          >
            {String(error?.stack ?? error?.message ?? error).slice(0, 900)}
            {error?.digest ? `\ndigest: ${error.digest}` : ''}
            {typeof navigator !== 'undefined' ? `\n\nUA: ${navigator.userAgent}` : ''}
          </pre>
        </div>
      </body>
    </html>
  );
}
