import Link from 'next/link';
import { requireAdminStrict } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatEuros } from '@/lib/dates';
import { estSimulation } from '@/lib/pennylane';
import { synchroniserStatut } from './actions';

export const dynamic = 'force-dynamic';

const BADGES: Record<string, string> = {
  SIMULEE: 'badge-amber',
  BROUILLON: 'badge-muted',
  FINALISEE: 'badge-ok',
  ENVOYEE: 'badge-ok',
  PAYEE: 'badge-ok'
};

export default async function FacturesPage() {
  const user = await requireAdminStrict();
  const [factures, missions, org] = await Promise.all([
    prisma.factureClient.findMany({
      where: { organisationId: user.organisationId },
      include: { mission: { include: { client: true } } },
      orderBy: { creeAt: 'desc' }
    }),
    prisma.mission.findMany({
      where: { organisationId: user.organisationId, statut: 'ACTIVE' },
      include: { client: true },
      orderBy: { libelle: 'asc' }
    }),
    prisma.organisation.findUnique({ where: { id: user.organisationId } })
  ]);

  const simulation = estSimulation(org?.parametres);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-bold">
          Facturation Pennylane
          <span className="block text-[13px] font-normal text-muted">
            {simulation
              ? 'Mode simulation (PENNYLANE_API_KEY vide) — les factures sont enregistrées localement'
              : 'API Pennylane active'}
          </span>
        </h1>
        <form action="/admin/factures/nouvelle" className="flex items-center gap-2">
          <select name="missionId" required className="input w-auto py-2">
            {missions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.client.nom} — {m.libelle}
              </option>
            ))}
          </select>
          <button className="btn-sm btn-green">+ Composer une facture</button>
        </form>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table-admin">
          <thead>
            <tr>
              <th>Date</th>
              <th>Mission</th>
              <th>Client</th>
              <th>Lignes</th>
              <th>Montant HT</th>
              <th>Pennylane</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {factures.map((f) => (
              <tr key={f.id}>
                <td className="font-mono text-[12.5px]">
                  {f.creeAt.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}
                </td>
                <td className="font-semibold">{f.mission.libelle}</td>
                <td>{f.mission.client.nom}</td>
                <td>{Array.isArray(f.lignes) ? (f.lignes as unknown[]).length : '—'}</td>
                <td className="font-mono font-bold">{formatEuros(Number(f.montantHT))}</td>
                <td className="font-mono text-[11.5px] text-muted">
                  {f.pennylaneInvoiceId ?? '—'}
                </td>
                <td>
                  <span className={`badge ${BADGES[f.statut] ?? 'badge-muted'}`}>
                    {f.statut === 'SIMULEE' ? 'Simulée' : f.statut.toLowerCase()}
                  </span>
                </td>
                <td className="text-right">
                  {f.statut !== 'SIMULEE' && (
                    <form action={synchroniserStatut}>
                      <input type="hidden" name="id" value={f.id} />
                      <button className="btn-sm btn-outline">↻ Statut</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {factures.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted">
                  Aucune facture. Composez la première depuis une mission.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {missions.length === 0 && (
        <p className="mt-4 text-[13px] text-muted">
          Aucune mission active —{' '}
          <Link href="/admin/missions/new" className="underline">
            créez une mission
          </Link>{' '}
          d’abord.
        </p>
      )}
    </div>
  );
}
