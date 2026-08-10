import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireRecruteur } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatDate, ymd } from '@/lib/dates';
import { majNoteRecruteur } from '../../actions';

export const dynamic = 'force-dynamic';

// Fiche candidat côté recruteur (mini-CRM) : uniquement les infos qu'il a
// lui-même fournies + statut de sa proposition + situation TRÈS générale
// (jamais d'heures, de taux, de logement ni de documents — et la liste noire
// n'est jamais révélée, affichée comme « indisponible »).
export default async function FicheCandidatRecruteurPage({
  params
}: {
  params: { id: string };
}) {
  const user = await requireRecruteur();
  const t = await getTranslations('recruiter');

  const proposition = await prisma.propositionCandidat.findFirst({
    where: { id: params.id, organisationId: user.organisationId, recruteurId: user.userId },
    include: {
      candidat: {
        select: {
          prenom: true,
          nom: true,
          telephone: true,
          langue: true,
          permisB: true,
          vehicule: true,
          experienceDeclaree: true,
          statutProfil: true,
          competences: { include: { tag: true } }
        }
      },
      demande: { select: { titre: true } },
      placement: { select: { placeAt: true, commissionStatut: true } }
    }
  });
  if (!proposition) notFound();

  const c = proposition.candidat;
  const place = proposition.placement && proposition.placement.commissionStatut !== 'ANNULEE';
  const BADGE: Record<string, { cls: string; txt: string }> = {
    PROPOSEE: { cls: 'badge-amber', txt: t('stProposed') },
    ACCEPTEE: { cls: 'badge-ok', txt: t('stAccepted') },
    REFUSEE: { cls: 'badge-warn', txt: t('stRefused') }
  };
  const badge = place
    ? { cls: 'badge-ok', txt: t('stPlaced') }
    : (BADGE[proposition.statut] ?? { cls: 'badge-muted', txt: proposition.statut });

  // Situation générale volontairement grossière (aucun détail d'activité)
  const situation =
    c.statutProfil === 'ACTIF'
      ? { icone: '🟢', txt: t('sitMission') }
      : c.statutProfil === 'VIVIER' || c.statutProfil === 'INACTIF'
        ? { icone: '🔵', txt: t('sitDispo') }
        : c.statutProfil === 'CANDIDAT'
          ? { icone: '🟡', txt: t('sitValidation') }
          : { icone: '⚪', txt: t('sitIndispo') };

  return (
    <div className="max-w-[640px]">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[21px] font-bold">
          {t('ficheTitle')} — {c.prenom} {c.nom}
          <span className="mt-1 block">
            <span className={`badge ${badge.cls}`}>{badge.txt}</span>
            {proposition.doublonDetecte && (
              <span className="badge badge-muted ml-1">{t('knownProfile')}</span>
            )}
          </span>
        </h1>
        <Link href="/recruteur/candidats" className="btn-sm btn-outline">
          ← {t('back')}
        </Link>
      </div>

      {/* Infos fournies par le recruteur */}
      <div className="card mb-4 p-5">
        <h2 className="mb-3 text-[15px] font-bold">{t('ficheInfos')}</h2>
        <div className="space-y-2 text-[13.5px]">
          <div className="flex gap-3">
            <span className="w-[170px] text-muted">{t('fichePhone')}</span>
            <b className="font-mono">{c.telephone}</b>
          </div>
          <div className="flex gap-3">
            <span className="w-[170px] text-muted">{t('ficheLang')}</span>
            <b>{c.langue}</b>
          </div>
          <div className="flex gap-3">
            <span className="w-[170px] text-muted">{t('ficheMobilite')}</span>
            <b>
              {[c.permisB ? `🚗 ${t('permisB')}` : null, c.vehicule ? `🚙 ${t('vehicule')}` : null]
                .filter(Boolean)
                .join(' · ') || '—'}
            </b>
          </div>
          <div className="flex gap-3">
            <span className="w-[170px] text-muted">{t('thRequest')}</span>
            <b>{proposition.demande?.titre ?? t('spontaneousF')}</b>
          </div>
          <div className="flex gap-3">
            <span className="w-[170px] text-muted">{t('ficheProposedOn')}</span>
            <b className="font-mono">{formatDate(ymd(proposition.creeAt))}</b>
          </div>
          {c.experienceDeclaree && (
            <div className="flex gap-3">
              <span className="w-[170px] shrink-0 text-muted">{t('ficheExp')}</span>
              <span>{c.experienceDeclaree}</span>
            </div>
          )}
          {c.competences.length > 0 && (
            <div className="flex gap-3">
              <span className="w-[170px] shrink-0 text-muted">{t('ficheSkills')}</span>
              <span className="flex flex-wrap gap-1">
                {c.competences.map((uc) => (
                  <span key={uc.tagId} className="badge badge-muted">
                    {uc.tag.libelle}
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Situation générale */}
      <div className="card mb-4 p-5">
        <h2 className="mb-2 text-[15px] font-bold">{t('ficheSituation')}</h2>
        <p className="text-[15px] font-semibold">
          {situation.icone} {situation.txt}
        </p>
        {place && proposition.placement && (
          <p className="mt-1 text-[13px] text-muted">
            💰 {t('fichePlacedOn')} {formatDate(ymd(proposition.placement.placeAt))}
          </p>
        )}
        {proposition.motifRefus && (
          <p className="mt-1 text-[13px] text-warn">↳ {proposition.motifRefus}</p>
        )}
      </div>

      {/* Notes privées (mini-CRM) */}
      <form action={majNoteRecruteur} className="card p-5">
        <input type="hidden" name="id" value={proposition.id} />
        <h2 className="mb-1 text-[15px] font-bold">📝 {t('ficheNotes')}</h2>
        <p className="mb-3 text-[12.5px] text-muted">{t('ficheNotesAide')}</p>
        <textarea
          name="note"
          rows={6}
          maxLength={4000}
          defaultValue={proposition.noteRecruteur ?? ''}
          placeholder={t('ficheNotesPlaceholder')}
          className="input text-[13.5px]"
        />
        <button className="btn-sm btn-green mt-3">{t('save')}</button>
      </form>
    </div>
  );
}
