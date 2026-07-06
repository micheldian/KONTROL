import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireRecruteur } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatDate, formatEuros, ymd } from '@/lib/dates';

export const dynamic = 'force-dynamic';

// Demandes ouvertes avec toutes les informations + commission + progression (spec §C.1).
export default async function DemandesOuvertesPage() {
  const user = await requireRecruteur();
  const t = await getTranslations('recruiter');

  const demandes = await prisma.demandeMainOeuvre.findMany({
    where: { organisationId: user.organisationId, statut: 'OUVERTE' },
    include: {
      competences: { include: { tag: true } },
      propositions: { where: { statut: 'ACCEPTEE' }, select: { id: true } }
    },
    orderBy: { dateDebut: 'asc' }
  });

  return (
    <div>
      <h1 className="mb-5 text-[21px] font-bold">
        {t('requestsTitle')}
        <span className="block text-[13px] font-normal text-muted">
          {t('requestsSubtitle')}
        </span>
      </h1>

      <div className="space-y-3">
        {demandes.map((d) => {
          const pourvus = d.propositions.length;
          return (
            <div key={d.id} className="card">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-[240px] flex-1">
                  <b className="text-[16px]">{d.titre}</b>
                  <div className="mt-1 text-[13.5px] text-muted">
                    👥 {t('persons', { n: d.nbPersonnes })} · 📅{' '}
                    {formatDate(ymd(d.dateDebut))}
                    {d.dateFin ? ` → ${formatDate(ymd(d.dateFin))}` : ''}
                    {d.region ? ` · 📍 ${d.region}` : ''}
                  </div>
                  {d.competences.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {d.competences.map((c) => (
                        <span key={c.id} className="badge badge-muted">
                          {c.tag.libelle}
                        </span>
                      ))}
                    </div>
                  )}
                  {d.description && (
                    <p className="mt-2 text-[13.5px]">{d.description}</p>
                  )}
                  {d.conditions && (
                    <p className="mt-1 text-[13px] text-muted">
                      {t('conditions', { c: d.conditions })}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="badge badge-ok text-[13px]">
                    {t('perPlacement', { m: formatEuros(Number(d.commissionParPlacement)) })}
                  </span>
                  <span
                    className={`badge ${pourvus >= d.nbPersonnes ? 'badge-ok' : 'badge-amber'}`}
                  >
                    {t('filled', { a: pourvus, b: d.nbPersonnes })}
                  </span>
                  <Link
                    href={`/recruteur/proposer?demande=${d.id}`}
                    className="btn-sm btn-green"
                  >
                    {t('navPropose')}
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
        {demandes.length === 0 && (
          <div className="card py-8 text-center text-muted">{t('noRequests')}</div>
        )}
      </div>
    </div>
  );
}
