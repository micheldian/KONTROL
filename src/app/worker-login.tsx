'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function WorkerLogin() {
  const t = useTranslations('login');
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(fullPin: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await signIn('pin', {
      telephone: phone,
      pin: fullPin,
      redirect: false
    });
    if (res?.error) {
      setPin('');
      setError(res.error === 'PIN_BLOQUE' ? t('blocked') : t('badCredentials'));
      setBusy(false);
    } else {
      router.push('/app');
      router.refresh();
    }
  }

  function press(d: number) {
    if (pin.length >= 4 || busy) return;
    const next = pin + String(d);
    setPin(next);
    if (next.length === 4) submit(next);
  }

  return (
    <div className="flex w-full flex-1 flex-col items-center">
      <h1 className="mt-8 text-[26px] font-bold">{t('title')}</h1>
      <p className="mt-1.5 text-[14px] text-muted">{t('subtitle')}</p>

      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        className="input mt-6 text-center font-mono text-[18px]"
        placeholder={t('phonePlaceholder')}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        aria-label={t('phone')}
      />

      <div className="mb-2 mt-6 flex gap-3.5" aria-label={t('pin')}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 border-brand transition-colors ${
              pin.length > i ? 'bg-brand' : ''
            }`}
          />
        ))}
      </div>

      {error && <p className="mt-1 text-[13.5px] font-semibold text-warn">{error}</p>}

      <div className="mt-3.5 grid w-full max-w-[300px] grid-cols-3 gap-2.5">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button
            key={d}
            onClick={() => press(d)}
            className="h-[62px] rounded-card border-[1.5px] border-line bg-white font-mono text-[24px] font-semibold active:bg-brand active:text-white"
          >
            {d}
          </button>
        ))}
        <span />
        <button
          onClick={() => press(0)}
          className="h-[62px] rounded-card border-[1.5px] border-line bg-white font-mono text-[24px] font-semibold active:bg-brand active:text-white"
        >
          0
        </button>
        <button
          onClick={() => setPin(pin.slice(0, -1))}
          className="h-[62px] text-[18px]"
          aria-label="Effacer"
        >
          ⌫
        </button>
      </div>

      <div className="mt-auto pt-10">
        <Link href="/admin/login" className="text-[13px] text-muted underline">
          {t('adminAccess')}
        </Link>
      </div>
    </div>
  );
}
