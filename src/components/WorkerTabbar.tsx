'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

const TABS = [
  { href: '/app', icon: '📅', key: 'today' },
  { href: '/app/heures', icon: '⏱', key: 'hours' },
  { href: '/app/argent', icon: '💶', key: 'money' }
] as const;

export default function WorkerTabbar() {
  const pathname = usePathname();
  const t = useTranslations('nav');

  return (
    <nav className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-[430px] -translate-x-1/2 border-t-[1.5px] border-line bg-white">
      {TABS.map((tab) => {
        const active =
          tab.href === '/app' ? pathname === '/app' : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex flex-1 flex-col items-center gap-0.5 px-1 pb-3 pt-2.5 text-[12.5px] font-semibold ${
              active ? 'text-brand' : 'text-muted'
            }`}
          >
            <span className="text-[21px] leading-none">{tab.icon}</span>
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
