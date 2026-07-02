import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { renduTemplate, type LangueCode } from '@/lib/messaging/templates';
import ContactGroupe from './contact-groupe';

export const dynamic = 'force-dynamic';

// Contact depuis le vivier — template « on a une mission pour vous » dans la langue
// du profil, éditable avant envoi, individuel ou groupé, journalisé.
export default async function ContactVivierPage({
  searchParams
}: {
  searchParams: { ids?: string };
}) {
  const user = await requireAdmin();
  const ids = (searchParams.ids ?? '').split(',').filter(Boolean).slice(0, 100);

  const [profils, org] = await Promise.all([
    prisma.user.findMany({
      where: {
        id: { in: ids },
        organisationId: user.organisationId,
        statutProfil: { not: 'LISTE_NOIRE' } // règle 12 : réembauche bloquée
      }
    }),
    prisma.organisation.findUnique({ where: { id: user.organisationId } })
  ]);

  const surcharges = (org?.parametres as { templates?: unknown })?.templates;
  const destinataires = profils.map((p) => ({
    id: p.id,
    nom: `${p.prenom} ${p.nom}`,
    telephone: p.telephone,
    langue: p.langue,
    telegramConnecte: !!p.telegramChatId,
    message: renduTemplate(
      'VIVIER',
      p.langue as LangueCode,
      { prenom: p.prenom, organisation: org?.nom ?? 'Krontrol' },
      surcharges
    )
  }));

  const envois = await prisma.envoiMessage.findMany({
    where: {
      organisationId: user.organisationId,
      contexte: 'VIVIER',
      destinataireUserId: { in: ids }
    },
    include: { destinataire: true },
    orderBy: { envoyeAt: 'desc' },
    take: 20
  });

  return (
    <div className="max-w-[760px]">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[21px] font-bold">
          Contacter le vivier
          <span className="block text-[13px] font-normal text-muted">
            {destinataires.length} destinataire{destinataires.length > 1 ? 's' : ''} ·
            message dans la langue du profil, éditable avant envoi
          </span>
        </h1>
        <Link href="/admin/vivier" className="btn-sm btn-outline">
          ← Vivier
        </Link>
      </div>

      <ContactGroupe destinataires={destinataires} />

      {envois.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-[16px] font-bold">Derniers envois vivier</h2>
          <div className="card p-0">
            {envois.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 border-b border-line px-4 py-2 text-[13px] last:border-b-0"
              >
                <span className="font-mono text-[12px] text-muted">
                  {e.envoyeAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
                </span>
                <span>{e.canal === 'TELEGRAM' ? '✈️' : '🟢'}</span>
                <span className="flex-1 font-semibold">
                  {e.destinataire.prenom} {e.destinataire.nom}
                </span>
                <span className="badge badge-muted">{e.statut.toLowerCase()}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
