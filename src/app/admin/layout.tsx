import Link from 'next/link';
import { getSessionUser } from '@/lib/session';
import LogoutButton from '@/components/LogoutButton';

const NAV: Array<{ href: string; label: string; adminOnly?: boolean }> = [
  { href: '/admin', label: 'Tableau de bord' },
  { href: '/admin/affectations', label: 'Affectations' },
  { href: '/admin/heures', label: 'Heures' },
  { href: '/admin/ouvriers', label: 'Ouvriers' },
  { href: '/admin/vivier', label: 'Vivier' },
  { href: '/admin/candidatures', label: 'Candidatures' },
  { href: '/admin/clients', label: 'Clients' },
  { href: '/admin/missions', label: 'Missions' },
  { href: '/admin/logements', label: 'Logements' },
  { href: '/admin/acomptes', label: 'Acomptes' },
  { href: '/admin/retenues', label: 'Retenues' },
  { href: '/admin/clotures', label: 'Clôtures' },
  { href: '/admin/factures', label: 'Facturation', adminOnly: true },
  { href: '/admin/parametres', label: 'Paramètres', adminOnly: true }
];

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  // /admin/login est rendu sans chrome
  if (!user || (user.role !== 'ADMIN' && user.role !== 'RH')) {
    return <>{children}</>;
  }

  const nav = NAV.filter((n) => !n.adminOnly || user.role === 'ADMIN');

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 bg-ink text-paper">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-2.5">
          <Link href="/admin" className="text-[17px] font-bold tracking-wider">
            KRON<b className="text-amber">TROL</b>
            <span className="ml-2 text-[12px] font-normal text-[#A9B5AE]">back-office</span>
          </Link>
          <div className="flex items-center gap-3 text-[13px]">
            <span className="hidden sm:inline">
              {user.name} · {user.role}
            </span>
            <LogoutButton />
          </div>
        </div>
        <nav className="border-t border-[#243730]">
          <div className="mx-auto flex max-w-[1200px] gap-1 overflow-x-auto px-4 py-1.5 text-[13px]">
            {nav.map((n) => (
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
      <main className="mx-auto max-w-[1200px] px-4 py-6">{children}</main>
    </div>
  );
}
