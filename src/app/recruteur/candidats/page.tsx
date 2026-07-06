import { getTranslations } from 'next-intl/server';
import { requireRecruteur } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatDate, ymd } from '@/lib/dates';

export const dynamic = 'force-dynamic';

// Tous ses candidats proposés + statuts (spec §C.3). « Placé » = placement non annulé.
export default async function MesCandidatsPage({
  searchParams
}: {
  searchParams: { ok?: string };
}) {
  const user = await requireRecruteur();
  const t = await getTranslations('recruiter');

  const BADGE: Record<string, { cls: string; txt: string }> = {
    PROPOSEE: { cls: 'badge-amber', txt: t('stProposed') },
    ACCEPTEE: { cls: 'badge-ok', txt: t('stAccepted') },
    REFUSEE: { cls: 'badge-warn', txt: t('stRefused') }
  };

  const propositions = await prisma.propositionCandidat.findMany({
    where: { organisationId: user.organisationId, recruteurId: user.userId },
    include: {
      candidat: { select: { prenom: true, nom: true, telephone: true } },
      demande: { select: { titre: true } },
      placement: { select: { commissionStatut: true } }
    },
    orderBy: { creeAt: 'desc' }
  });

  return (
    <div>
      <h1 className="mb-5 text-[21px] font-bold">
        {t('navCandidates')}
        <span className="block text-[13px] font-normal text-muted">
          {t('propositionCount', { n: propositions.length })}
        </span>
      </h1>

      {searchParams.ok && (
        <div className="mb-4 rounded-card border-[1.5px] border-[#BFD9C8] bg-[#EFF7F1] px-4 py-3 text-[13.5px] font-semibold text-ok">
          {t('sentOk')}
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="table-admin">
          <thead>
            <tr>
              <th>{t('thCandidate')}</th>
              <th>{t('thPhone')}</th>
              <th>{t('thRequest')}</th>
              <th>{t('thProposedOn')}</th>
              <th>{t('thStatus')}</th>
              <th>{t('thDetail')}</th>
            </tr>
          </thead>
          <tbody>
            {propositions.map((p) => {
              const place = p.placement && p.placement.commissionStatut !== 'ANNULEE';
              const b = place
                ? { cls: 'badge-ok', txt: t('stPlaced') }
                : (BADGE[p.statut] ?? { cls: 'badge-muted', txt: p.statut });
              return (
                <tr key={p.id}>
                  <td className="font-semibold">
                    {p.candidat.prenom} {p.candidat.nom}
                  </td>
                  <td className="font-mono text-[12.5px]">{p.candidat.telephone}</td>
                  <td>{p.demande?.titre ?? <span className="text-muted">{t('spontaneousF')}</span>}</td>
                  <td className="font-mono text-[12.5px]">{formatDate(ymd(p.creeAt))}</td>
                  <td>
                    <span className={`badge ${b.cls}`}>{b.txt}</span>
                  </td>
                  <td className="text-[12.5px] text-muted">
                    {p.doublonDetecte && t('knownProfile')}
                    {p.motifRefus ? ` ${p.motifRefus}` : ''}
                  </td>
                </tr>
              );
            })}
            {propositions.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted">
                  {t('noPropositions')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
