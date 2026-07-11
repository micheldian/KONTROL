import { getLocale, getTranslations } from 'next-intl/server';
import { requireRecruteur } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { proposerCandidat } from '../actions';

export const dynamic = 'force-dynamic';

// Formulaire type /rejoindre + rattachement recruteur/demande (spec §C.2).
export default async function ProposerCandidatPage({
  searchParams
}: {
  searchParams: { demande?: string; erreur?: string };
}) {
  const user = await requireRecruteur();
  const t = await getTranslations('recruiter');
  const locale = await getLocale();

  const [demande, tags] = await Promise.all([
    searchParams.demande
      ? prisma.demandeMainOeuvre.findFirst({
          where: {
            id: searchParams.demande,
            organisationId: user.organisationId,
            statut: 'OUVERTE'
          }
        })
      : null,
    prisma.competenceTag.findMany({
      where: { organisationId: user.organisationId, actif: true },
      orderBy: { libelle: 'asc' }
    })
  ]);

  return (
    <div className="max-w-[560px]">
      <h1 className="mb-1 text-[21px] font-bold">
        {demande ? t('proposeTitleFor', { titre: demande.titre }) : t('proposeTitleSpont')}
      </h1>
      <p className="mb-5 text-[13px] text-muted">
        {demande ? t('proposeIntroFor') : t('proposeIntroSpont')} {t('phoneKeyNote')}
      </p>

      {searchParams.erreur && (
        <div className="mb-4 rounded-card border-[1.5px] border-[#F3C1A8] bg-[#FFF3EC] px-4 py-3 text-[13.5px] font-semibold text-warn">
          ⚠ {searchParams.erreur}
        </div>
      )}

      <form action={proposerCandidat} className="card space-y-4 p-5">
        <input type="hidden" name="langueUi" value={locale} />
        {demande && <input type="hidden" name="demandeId" value={demande.id} />}
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('phoneKey')}</label>
            <input name="telephone" type="tel" required className="input" placeholder="+40 7…" />
          </div>
          <div>
            <label className="label">{t('language')}</label>
            <select name="langue" className="input" defaultValue="RO">
              <option value="RO">Română</option>
              <option value="FR">Français</option>
              <option value="ES">Español</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">{t('experience')}</label>
          <textarea
            name="experienceDeclaree"
            rows={2}
            className="input"
            placeholder={t('experiencePlaceholder')}
          />
        </div>
        <div>
          <label className="label">{t('skills')}</label>
          <div className="flex flex-wrap gap-2">
            {tags.map((tg) => (
              <label key={tg.id} className="badge badge-muted cursor-pointer">
                <input type="checkbox" name="tagIds" value={tg.id} className="mr-1 accent-brand" />
                {tg.libelle}
              </label>
            ))}
          </div>
        </div>
        <button type="submit" className="btn btn-green w-full">
          {t('send')}
        </button>
        <p className="text-center text-[12px] text-muted">{t('commissionNote')}</p>
      </form>
    </div>
  );
}
