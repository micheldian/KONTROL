import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import OuvrierForm from '../ouvrier-form';
import { debloquerPin } from '../actions';

export const dynamic = 'force-dynamic';

export default async function OuvrierPage({ params }: { params: { id: string } }) {
  const user = await requireAdmin();
  const ouvrier = await prisma.user.findFirst({
    where: {
      id: params.id,
      organisationId: user.organisationId,
      role: { in: ['OUVRIER', 'CHEF_EQUIPE'] }
    }
  });
  if (!ouvrier) notFound();

  const pinBloque = ouvrier.pinBloqueJusqua && ouvrier.pinBloqueJusqua > new Date();

  return (
    <div className="max-w-[760px]">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[21px] font-bold">
          {ouvrier.prenom} {ouvrier.nom}
          <span className="block text-[13px] font-normal text-muted">
            {ouvrier.telephone} · {ouvrier.langue} ·{' '}
            {ouvrier.estChefEquipe ? 'Chef d’équipe' : 'Ouvrier'} · {ouvrier.statutProfil}
          </span>
        </h1>
        <div className="flex gap-2">
          <Link href={`/admin/vivier/${ouvrier.id}`} className="btn-sm btn-outline">
            Profil vivier
          </Link>
          <Link href="/admin/ouvriers" className="btn-sm btn-outline">
            ← Retour
          </Link>
        </div>
      </div>

      {pinBloque && (
        <div className="mb-4 flex items-center justify-between rounded-card border-[1.5px] border-[#F3C1A8] bg-[#FFF3EC] px-4 py-3">
          <span className="text-[13.5px] font-semibold text-warn">
            PIN bloqué (trop d’échecs) jusqu’à{' '}
            {ouvrier.pinBloqueJusqua!.toLocaleTimeString('fr-FR', {
              timeZone: 'Europe/Paris',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
          <form action={debloquerPin}>
            <input type="hidden" name="id" value={ouvrier.id} />
            <button className="btn-sm btn-ink">Débloquer maintenant</button>
          </form>
        </div>
      )}

      <OuvrierForm ouvrier={ouvrier} />

      <p className="mt-4 text-[12.5px] text-muted">
        Heures, acomptes, logement et net en temps réel apparaissent sur cette fiche au fil
        des phases 5 à 8. Documents (contrat, pièce d’identité) : stockage de fichiers à
        brancher ultérieurement.
      </p>
    </div>
  );
}
