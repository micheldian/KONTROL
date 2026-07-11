import 'server-only';
import { prisma } from '@/lib/prisma';
import { renduTemplate, type LangueCode } from '@/lib/messaging/templates';
import { ymd, formatJour } from '@/lib/dates';
import { googleMapsUrl, refParcelle } from '@/lib/geo';

/** Construit le message d'affectation dans la langue de chaque destinataire. */
export async function messagesAffectation(affectationId: string, organisationId: string) {
  const affectation = await prisma.affectation.findFirst({
    where: { id: affectationId, organisationId },
    include: {
      mission: { include: { client: true } },
      parcelles: { include: { parcelle: true } },
      ouvriers: { include: { user: true } },
      organisation: true
    }
  });
  if (!affectation) return null;

  const surcharges = (affectation.organisation.parametres as { templates?: unknown })
    ?.templates;
  const locales: Record<LangueCode, string> = { FR: 'fr', RO: 'ro', ES: 'es' };

  // Bloc parcelles (format spec §5.4) : réf cadastrale, surface, lien Maps — indépendant de la langue
  const parcelles = affectation.parcelles.map((ap) => ap.parcelle);
  const blocParcelles =
    parcelles.length > 0
      ? `Parcelles (${parcelles.length}) :\n` +
        parcelles
          .map((p, i) => {
            const surface = p.surfaceM2
              ? ` — ${(p.surfaceM2 / 10000).toFixed(2).replace('.', ',')} ha`
              : '';
            const lien =
              p.centroidLat != null && p.centroidLng != null
                ? `\n   ${googleMapsUrl(p.centroidLat, p.centroidLng)}`
                : p.adresse
                  ? `\n   https://www.google.com/maps?q=${encodeURIComponent(p.adresse)}`
                  : '';
            return `${i + 1}. ${refParcelle(p)}${surface}${lien}`;
          })
          .join('\n')
      : '';

  const adresseFallback =
    parcelles[0]?.adresse ?? parcelles[0]?.commune ?? affectation.mission.client.adresse ?? '';

  const heure = `${affectation.heureDebut}${affectation.heureFinPrevue ? ` − ${affectation.heureFinPrevue}` : ''}`;

  const destinataires = affectation.ouvriers.map((ao) => {
    const langue = ao.user.langue as LangueCode;
    const contenu = renduTemplate(
      'AFFECTATION',
      langue,
      {
        prenom: ao.user.prenom,
        client: affectation.mission.client.nom,
        mission: affectation.mission.libelle,
        travaux: affectation.mission.typeTravaux ?? affectation.mission.libelle,
        date: formatJour(ymd(affectation.date), locales[langue]),
        heure,
        adresse: blocParcelles ? '' : adresseFallback ? `📍 ${adresseFallback}` : '',
        parcelles: blocParcelles || (adresseFallback ? `📍 ${adresseFallback}` : ''),
        instructions: affectation.instructions ? `⚠ ${affectation.instructions}` : ''
      },
      surcharges
    );
    return { ao, contenu };
  });

  return { affectation, destinataires, parcelles };
}
