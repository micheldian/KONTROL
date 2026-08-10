import Link from 'next/link';
import { getSessionUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import LogoutButton from '@/components/LogoutButton';

// Portail client (spec V3 §4) — lecture seule, français.
// Confidentialité stricte : jamais de taux ouvriers, acomptes, logements, vivier, notes.

const NAV = [
  { href: '/client', label: 'Mes missions' },
  { href: '/client/carte', label: 'Ma carte' },
  { href: '/client/planning', label: 'Planning' },
  { href: '/client/historique', label: 'Historique par parcelle' }
];

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  // /client/login est rendu sans chrome
  if (!user || user.role !== 'CLIENT' || !user.clientId) {
    return <>{children}</>;
  }

  const client = await prisma.client.findFirst({
    where: { id: user.clientId, organisationId: user.organisationId },
    select: { nom: true }
  });

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 bg-ink text-paper">
        <div className="mx-auto flex max-w-[1000px] items-center justify-between px-4 py-2.5">
          <Link href="/client" className="text-[17px] font-bold tracking-wider">
            KRON<b className="text-amber">TROL</b>
            <span className="ml-2 text-[12px] font-normal text-[#A9B5AE]">
              espace client
            </span>
          </Link>
          <div className="flex items-center gap-3 text-[13px]">
            <span className="hidden sm:inline">{client?.nom ?? user.name}</span>
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
