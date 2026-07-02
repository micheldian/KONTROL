import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import OuvrierForm from '../ouvrier-form';
import { debloquerPin } from '../actions';
import { recapMois } from '@/lib/money';
import { moisCourant, formatEuros, formatHeures } from '@/lib/dates';

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

  const { mois, annee } = moisCourant();
  const recap = await recapMois({
    organisationId: user.organisationId,
    userId: ouvrier.id,
    mois,
    annee,
    tempsReel: true
  });

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

      {/* Situation du mois en temps réel (spec 4.3) */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="card p-3">
          <div className="label mb-0.5">Heures validées</div>
          <div className="font-mono text-[18px] font-bold">
            {formatHeures(recap.totalHeuresValidees)}
          </div>
          {recap.heuresEnAttente > 0 && (
            <div className="text-[11.5px] text-muted">
              + {formatHeures(recap.heuresEnAttente)} en attente
            </div>
          )}
        </div>
        <div className="card p-3">
          <div className="label mb-0.5">Gagné validé</div>
          <div className="font-mono text-[18px] font-bold">{formatEuros(recap.totalBrut)}</div>
        </div>
        <div className="card p-3">
          <div className="label mb-0.5">Acomptes</div>
          <div className="font-mono text-[18px] font-bold text-warn">
            − {formatEuros(recap.totalAcomptes)}
          </div>
        </div>
        <div className="card p-3">
          <div className="label mb-0.5">Logement + retenues</div>
          <div className="font-mono text-[18px] font-bold text-warn">
            − {formatEuros(recap.logement.total + recap.totalRetenues)}
          </div>
        </div>
        <div className="card bg-ink p-3 text-amber">
          <div className="label mb-0.5 text-[#A9B5AE]">Net ce mois</div>
          <div className="font-mono text-[18px] font-bold">{formatEuros(recap.net)}</div>
        </div>
      </div>

      <OuvrierForm ouvrier={ouvrier} />

      <p className="mt-4 text-[12.5px] text-muted">
        Heures, acomptes, logement et net en temps réel apparaissent sur cette fiche au fil
        des phases 5 à 8. Documents (contrat, pièce d’identité) : stockage de fichiers à
        brancher ultérieurement.
      </p>
    </div>
  );
}
