import { requireWorker } from '@/lib/session';
import { getTranslations, getLocale } from 'next-intl/server';
import { todayParis, formatJour } from '@/lib/dates';

export const dynamic = 'force-dynamic';

// Écran « Mes heures » — rempli en phase 5 (saisie par créneaux + chef d'équipe).
export default async function HoursPage() {
  await requireWorker();
  const t = await getTranslations('hours');
  const locale = await getLocale();

  return (
    <div>
      <div className="mb-3 mt-2 text-[13px] uppercase tracking-widest text-muted">
        {t('title')} · {formatJour(todayParis(), locale)}
      </div>
      <div className="card text-center text-[15px] text-muted">{t('noSlotToday')}</div>
    </div>
  );
}
