import Link from 'next/link';
import { getSessionUser } from '@/lib/session';
import LogoutButton from '@/components/LogoutButton';

// Portail recruteur (spec §C) — ne voit jamais : autres recruteurs, vivier, paie.

const NAV = [
  { href: '/recruteur', label: 'Demandes ouvertes' },
  { href: '/recruteur/proposer', label: '➕ Proposer un candidat' },
  { href: '/recruteur/candidats', label: 'Mes candidats' },
  { href: '/recruteur/gains', label: 'Mes gains' }
];

export default async function RecruteurLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  // login / inscription rendus sans chrome
  if (!user || user.role !== 'RECRUTEUR') {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-[1200] bg-ink text-paper">
        <div className="mx-auto flex max-w-[1000px] items-center justify-between px-4 py-2.5">
          <Link href="/recruteur" className="text-[17px] font-bold tracking-wider">
            KRON<b className="text-amber">TROL</b>
            <span className="ml-2 text-[12px] font-normal text-[#A9B5AE]">recruteur</span>
          </Link>
          <div className="flex items-center gap-3 text-[13px]">
            <span className="hidden sm:inline">{user.name}</span>
            <LogoutButton />
          </div>
        </div>
        <nav className="border-t border-[#243730]">
          <div className="mx-auto flex max-w-[1000px] gap-1 overflow-x-auto px-4 py-1.5 text-[13px]">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="whitespace-nowrap rounded-full px-3 py-1.5 font-semibold text-[#A9B5AE] hover:bg-[#243730] hover:text-paper"
              >
                {n.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-[1000px] px-4 py-6">{children}</main>
    </div>
  );
}
