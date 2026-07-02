import { requireWorker } from '@/lib/session';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

// Écran « Mon argent » — rempli en phase 8 (ticket de caisse temps réel).
export default async function MoneyPage() {
  await requireWorker();
  const t = await getTranslations('money');

  return (
    <div>
      <div className="mb-3 mt-2 text-[13px] uppercase tracking-widest text-muted">
        {t('title')}
      </div>
      <div className="card text-center text-[15px] text-muted">{t('noData')}</div>
    </div>
  );
}
