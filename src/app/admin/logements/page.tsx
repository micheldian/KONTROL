import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { todayParis, dateFromYMD, formatEuros } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function LogementsPage() {
  const user = await requireAdmin();
  const today = dateFromYMD(todayParis());
  const logements = await prisma.logement.findMany({
    where: { organisationId: user.organisationId },
    include: {
      sejours: {
        where: {
          dateArrivee: { lte: today },
          OR: [{ dateDepart: null }, { dateDepart: { gt: today } }]
        }
      }
    },
    orderBy: { nom: 'asc' }
  });

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[21px] font-bold">
          Logements
          <span className="block text-[13px] font-normal text-muted">
            Occupation du jour · tarif propre à chaque logement
          </span>
        </h1>
        <Link href="/admin/logements/new" className="btn-sm btn-green">
          + Nouveau logement
        </Link>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table-admin">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Adresse</th>
              <th>Tarif / jour</th>
              <th>Occupation</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {logements.map((l) => {
              const occ = l.sejours.length;
              const plein = occ >= l.capacite;
              return (
                <tr key={l.id}>
                  <td className="font-semibold">{l.nom}</td>
                  <td className="text-muted">{l.adresse ?? '—'}</td>
                  <td className="font-mono">{formatEuros(Number(l.tarifJour))}</td>
                  <td>
                    <span className={`badge ${plein ? 'badge-warn' : 'badge-ok'}`}>
                      {occ} / {l.capacite} lits
                    </span>
                  </td>
                  <td className="text-right">
                    <Link href={`/admin/logements/${l.id}`} className="btn-sm btn-outline">
                      Modifier
                    </Link>
                  </td>
                </tr>
              );
            })}
            {logements.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted">
                  Aucun logement.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
