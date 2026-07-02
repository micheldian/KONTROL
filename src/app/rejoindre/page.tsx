import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import LangSwitcher from '@/components/LangSwitcher';
import JoinForm from './join-form';

export const dynamic = 'force-dynamic';

// Portail public d'inscription (canal de recrutement principal) — trilingue,
// aucun compte requis, partageable (Facebook, WhatsApp, affiches).
export default async function RejoindrePage() {
  const t = await getTranslations('join');
  const org = await prisma.organisation.findFirst({ orderBy: { createdAt: 'asc' } });
  const tags = org
    ? await prisma.competenceTag.findMany({
        where: { organisationId: org.id, actif: true },
        orderBy: { libelle: 'asc' }
      })
    : [];

  return (
    <main className="mx-auto min-h-screen max-w-[520px] px-5 pb-16 pt-8">
      <div className="flex items-center justify-between">
        <div className="text-[20px] font-bold tracking-wider">
          KRON<b className="text-brand">TROL</b>
          <span className="ml-2 text-[13px] font-normal tracking-normal text-muted">
            {org?.nom}
          </span>
        </div>
        <LangSwitcher />
      </div>

      <h1 className="mt-7 text-[26px] font-bold">{t('title')}</h1>
      <p className="mt-1.5 text-[14.5px] text-muted">{t('subtitle')}</p>

      <JoinForm
        tags={tags.map((x) => ({ id: x.id, libelle: x.libelle }))}
        labels={{
          lastName: t('lastName'),
          firstName: t('firstName'),
          phone: t('phone'),
          language: t('language'),
          langOther: t('langOther'),
          experience: t('experience'),
          experiencePlaceholder: t('experiencePlaceholder'),
          skills: t('skills'),
          send: t('send'),
          thanks: t('thanks'),
          thanksText: t('thanksText'),
          alreadySent: t('alreadySent'),
          errPhone: t('errPhone'),
          errRequired: t('errRequired'),
          errRate: t('errRate')
        }}
      />
    </main>
  );
}
