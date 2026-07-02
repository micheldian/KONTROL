import { requireWorker } from '@/lib/session';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { formatEuros } from '@/lib/dates';
import AdvanceRequest from './advance-request';

export const dynamic = 'force-dynamic';

// Le ticket de caisse complet arrive en phase 8 ; la demande d'acompte est déjà active.
export default async function MoneyPage() {
  const user = await requireWorker();
  const t = await getTranslations('money');
  const tc = await getTranslations('common');

  const demandeEnAttente = await prisma.acompte.findFirst({
    where: {
      organisationId: user.organisationId,
      userId: user.userId,
      statut: 'DEMANDE'
    }
  });

  return (
    <div>
      <div className="mb-3 mt-2 text-[13px] uppercase tracking-widest text-muted">
        {t('title')}
      </div>
      <div className="card text-center text-[15px] text-muted">{t('noData')}</div>

      {demandeEnAttente ? (
        <div className="card mt-4 py-4 text-center text-[14px] font-semibold text-[#B07900]">
          {t('advancePending', { amount: formatEuros(Number(demandeEnAttente.montant)) })}
        </div>
      ) : (
        <AdvanceRequest
          labels={{
            askAdvance: t('askAdvance'),
            advanceAmount: t('advanceAmount'),
            advanceReason: t('advanceReason'),
            advanceSend: t('advanceSend'),
            advanceSent: t('advanceSent'),
            error: tc('error')
          }}
        />
      )}
    </div>
  );
}
