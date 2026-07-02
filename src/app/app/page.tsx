import { requireWorker } from '@/lib/session';
import { getTranslations, getLocale } from 'next-intl/server';
import { todayParis, formatJour } from '@/lib/dates';

export const dynamic = 'force-dynamic';

// Écran « Aujourd'hui » — rempli en phase 3 (affectations + confirmation « J'y serai »).
export default async function TodayPage() {
  await requireWorker();
  const t = await getTranslations('today');
  const locale = await getLocale();
  const today = todayParis();

  return (
    <div>
      <div className="mb-3 mt-2 text-[13px] uppercase tracking-widest text-muted">
        {t('title')} · {formatJour(today, locale)}
      </div>
      <div className="card text-center text-[15px] text-muted">{t('noMission')}</div>
    </div>
  );
}
