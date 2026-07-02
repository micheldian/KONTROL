'use client';

import { useLocale } from 'next-intl';
import { useTransition } from 'react';
import { setLocale } from '@/app/locale-action';

const LANGS = [
  { code: 'fr', flag: '🇫🇷' },
  { code: 'ro', flag: '🇷🇴' },
  { code: 'es', flag: '🇪🇸' }
];

export default function LangSwitcher() {
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-1.5">
      {LANGS.map((l) => (
        <button
          key={l.code}
          disabled={pending}
          onClick={() => startTransition(() => setLocale(l.code))}
          className={`rounded-lg border-[1.5px] px-2.5 py-1.5 text-[15px] leading-none transition-colors ${
            locale === l.code
              ? 'border-brand bg-brand'
              : 'border-line bg-white'
          }`}
          aria-label={l.code}
        >
          {l.flag}
        </button>
      ))}
    </div>
  );
}
