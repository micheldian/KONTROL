'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ClientLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn('admin-credentials', {
      email,
      password,
      redirect: false
    });
    if (res?.error) {
      setError('Email ou mot de passe incorrect');
      setBusy(false);
    } else {
      router.push('/client');
      router.refresh();
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-6">
      <div className="mb-8 text-center text-[24px] font-bold tracking-wider">
        KRON<b className="text-brand">TROL</b>
        <div className="mt-1 text-[13px] font-normal tracking-normal text-muted">
          Espace client — suivi de vos missions & parcelles
        </div>
      </div>
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
      <Link href="/" className="mt-6 text-center text-[13px] text-muted underline">
        ← Krontrol
      </Link>
    </main>
  );
}
