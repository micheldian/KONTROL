'use client';

import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';

export default function LogoutButton({ className }: { className?: string }) {
  const t = useTranslations('common');
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/' })}
      className={
        className ??
        'rounded-full border border-[#3a4d43] px-3 py-1.5 text-[12.5px] font-semibold hover:bg-[#243730]'
      }
    >
      {t('logout')}
    </button>
  );
}
