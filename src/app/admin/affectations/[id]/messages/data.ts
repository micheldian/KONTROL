import 'server-only';
import { prisma } from '@/lib/prisma';
import { renduTemplate, type LangueCode } from '@/lib/messaging/templates';
import { ymd, formatJour } from '@/lib/dates';

/** Construit le message d'affectation dans la langue de chaque destinataire. */
export async function messagesAffectation(affectationId: string, organisationId: string) {
  const affectation = await prisma.affectation.findFirst({
    where: { id: affectationId, organisationId },
    include: {
      mission: { include: { client: true } },
      parcelle: true,
      ouvriers: { include: { user: true } },
      organisation: true
    }
  });
  if (!affectation) return null;

  const surcharges = (affectation.organisation.parametres as { templates?: unknown })
    ?.templates;
  const locales: Record<LangueCode, string> = { FR: 'fr', RO: 'ro', ES: 'es' };

  const destinataires = affectation.ouvriers.map((ao) => {
    const langue = ao.user.langue as LangueCode;
    const contenu = renduTemplate(
      'AFFECTATION',
      langue,
      {
        prenom: ao.user.prenom,
        client: affectation.mission.client.nom,
        mission: affectation.mission.libelle,
        date: formatJour(ymd(affectation.date), locales[langue]),
        heure: affectation.heureDebut,
        adresse: affectation.parcelle?.adresse ?? affectation.mission.client.adresse ?? '',
        instructions: affectation.instructions ?? ''
      },
      surcharges
    );
    return { ao, contenu };
  });

  return { affectation, destinataires };
}
