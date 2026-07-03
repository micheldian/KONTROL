'use client';

// Erreur de segment (le layout racine reste affiché) — même filet que global-error.

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-[420px] px-6 py-12 text-center">
      <h1 className="text-[19px] font-bold">Oups, quelque chose s’est mal passé</h1>
      <p className="mt-2 text-[14.5px] text-muted">
        Rechargez la page — si le problème persiste, envoyez le détail ci-dessous à votre
        responsable.
      </p>
      <button onClick={() => reset()} className="btn btn-green mt-5 w-full">
        ↻ Recharger la page
      </button>
      <pre className="mt-7 whitespace-pre-wrap break-words rounded-xl bg-[#EFEAD9] p-3 text-left text-[11.5px] text-muted">
        {String(error?.message ?? error)}
        {error?.digest ? `\ndigest: ${error.digest}` : ''}
      </pre>
    </div>
  );
}
