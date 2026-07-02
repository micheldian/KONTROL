import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const user = await requireAdmin();
  const org = await prisma.organisation.findUnique({
    where: { id: user.organisationId }
  });
  const nbOuvriers = await prisma.user.count({
    where: {
      organisationId: user.organisationId,
      statutProfil: 'ACTIF',
      role: { in: ['OUVRIER', 'CHEF_EQUIPE'] }
    }
  });

  return (
    <div>
      <h1 className="text-[21px] font-bold">
        Tableau de bord
        <span className="block text-[13px] font-normal text-muted">
          {org?.nom} · {nbOuvriers} ouvriers actifs
        </span>
      </h1>
      <p className="mt-6 text-[14px] text-muted">
        Le dashboard complet (alertes, suivi du jour) arrive en phase 11.
      </p>
    </div>
  );
}
