'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function RecruteurLoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn('admin-credentials', { email, password, redirect: false });
    if (res?.error) {
      setError('Email ou mot de passe incorrect (compte suspendu ?)');
      setBusy(false);
    } else {
      router.push('/recruteur');
      router.refresh();
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-6">
      <div className="mb-8 text-center text-[24px] font-bold tracking-wider">
        KRON<b className="text-brand">TROL</b>
        <div className="mt-1 text-[13px] font-normal tracking-normal text-muted">
          Espace recruteurs
        </div>
      </div>
      {params.get('inscrit') && (
        <div className="mb-4 rounded-card border-[1.5px] border-[#BFD9C8] bg-[#EFF7F1] px-4 py-3 text-center text-[13.5px] font-semibold text-ok">
          ✓ Compte créé — connectez-vous
        </div>
      )}
      <form onSubmit={submit} className="card space-y-4 p-6">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-[13.5px] font-semibold text-warn">{error}</p>}
        <button type="submit" disabled={busy} className="btn btn-green w-full">
          Se connecter
        </button>
      </form>
      <Link
        href="/recruteur/inscription"
        className="mt-6 text-center text-[13px] text-muted underline"
      >
        Pas encore de compte ? S’inscrire gratuitement
      </Link>
    </main>
  );
}
