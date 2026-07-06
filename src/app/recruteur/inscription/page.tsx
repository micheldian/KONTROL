import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import LangSwitcher from '@/components/LangSwitcher';
import { inscrireRecruteur } from '../actions';

export const dynamic = 'force-dynamic';

// Inscription publique ouverte (spec §B) : compte actif immédiatement.
// Trilingue FR/RO/ES — lien pré-langué possible : /recruteur/inscription?lang=ro
export default async function InscriptionRecruteurPage({
  searchParams
}: {
  searchParams: { erreur?: string };
}) {
  const t = await getTranslations('recruiter');
  const locale = await getLocale();

  return (
    <main className="mx-auto flex min-h-screen max-w-[460px] flex-col justify-center px-6 py-10">
      <div className="mb-2 flex justify-end">
        <LangSwitcher />
      </div>
      <div className="mb-6 text-center text-[24px] font-bold tracking-wider">
        KRON<b className="text-brand">TROL</b>
        <div className="mt-1 text-[13px] font-normal tracking-normal text-muted">
          {t('spaceTitle')} — {t('signupIntro')}
        </div>
      </div>

      {searchParams.erreur && (
        <div className="mb-4 rounded-card border-[1.5px] border-[#F3C1A8] bg-[#FFF3EC] px-4 py-3 text-[13.5px] font-semibold text-warn">
          ⚠ {searchParams.erreur}
        </div>
      )}

      <form action={inscrireRecruteur} className="card space-y-3.5 p-6">
        {/* Langue affichée au rendu — plus fiable que getLocale() dans l'action */}
        <input type="hidden" name="langueUi" value={locale} />
        <div>
          <label className="label">{t('company')}</label>
          <input name="societe" className="input" placeholder={t('companyPlaceholder')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('firstName')}</label>
            <input name="prenom" required className="input" />
          </div>
          <div>
            <label className="label">{t('lastName')}</label>
            <input name="nom" required className="input" />
          </div>
        </div>
        <div>
          <label className="label">{t('phone')}</label>
          <input name="telephone" type="tel" required className="input" placeholder="+40 7…" />
        </div>
        <div>
          <label className="label">{t('email')}</label>
          <input name="email" type="email" required className="input" />
        </div>
        <div>
          <label className="label">{t('password')}</label>
          <input name="motDePasse" type="password" required minLength={8} className="input" />
        </div>
        <button type="submit" className="btn btn-green w-full">
          {t('createAccount')}
        </button>
        <p className="text-center text-[12px] text-muted">{t('activeNote')}</p>
      </form>

      <Link href="/recruteur/login" className="mt-5 text-center text-[13px] text-muted underline">
        {t('alreadyRegistered')}
      </Link>
    </main>
  );
}
