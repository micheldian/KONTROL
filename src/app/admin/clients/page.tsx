import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const user = await requireAdmin();
  const clients = await prisma.client.findMany({
    where: { organisationId: user.organisationId },
    include: { _count: { select: { missions: true } } },
    orderBy: { nom: 'asc' }
  });

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[21px] font-bold">
          Clients
          <span className="block text-[13px] font-normal text-muted">
            {clients.length} client{clients.length > 1 ? 's' : ''}
          </span>
        </h1>
        <Link href="/admin/clients/new" className="btn-sm btn-green">
          + Nouveau client
        </Link>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table-admin">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Contact</th>
              <th>Téléphone</th>
              <th>Adresse</th>
              <th>Missions</th>
              <th>Pennylane</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td className="font-semibold">{c.nom}</td>
                <td>{c.contact ?? '—'}</td>
                <td className="font-mono text-[13px]">{c.telephone ?? '—'}</td>
                <td className="text-muted">{c.adresse ?? '—'}</td>
                <td>{c._count.missions}</td>
                <td>
                  {c.pennylaneCustomerId ? (
                    <span className="badge badge-ok">lié</span>
                  ) : (
                    <span className="badge badge-muted">—</span>
                  )}
                </td>
                <td className="text-right">
                  <Link href={`/admin/clients/${c.id}`} className="btn-sm btn-outline">
                    Modifier
                  </Link>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted">
                  Aucun client. Créez le premier.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
