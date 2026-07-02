import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { syntheseDuJour } from '@/lib/alertes';
import { formatJour, formatEuros } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const user = await requireAdmin();
  const [org, nbOuvriers, synthese] = await Promise.all([
    prisma.organisation.findUnique({ where: { id: user.organisationId } }),
    prisma.user.count({
      where: {
        organisationId: user.organisationId,
        statutProfil: 'ACTIF',
        role: { in: ['OUVRIER', 'CHEF_EQUIPE'] }
      }
    }),
    syntheseDuJour(user.organisationId)
  ]);

  const alertes = [
    {
      n: synthese.sansAffectation.length,
      texte: 'Ouvriers logés sans affectation aujourd’hui',
      couleur: synthese.sansAffectation.length > 0 ? 'red' : 'green',
      href: '/admin/logements'
    },
    {
      n: synthese.sansHeures.length,
      texte: 'Heures non saisies aujourd’hui (rappel à 19h)',
      couleur: synthese.sansHeures.length > 0 ? 'amber' : 'green',
      href: '/admin/heures'
    },
    {
      n: synthese.depassements.length,
      texte: 'Acomptes dépassant le gagné validé du mois',
      couleur: synthese.depassements.length > 0 ? 'red' : 'green',
      href: '/admin/acomptes'
    },
    {
      n: `${synthese.confirmations.confirmees}/${synthese.confirmations.total}`,
      texte: 'Affectations confirmées « J’y serai »',
      couleur:
        synthese.confirmations.total > 0 &&
        synthese.confirmations.confirmees < synthese.confirmations.total
          ? 'amber'
          : 'green',
      href: '/admin/affectations?date=' + synthese.date
    },
    {
      n: synthese.demandesAcompte,
      texte: 'Demandes d’acompte en attente',
      couleur: synthese.demandesAcompte > 0 ? 'amber' : 'green',
      href: '/admin/acomptes'
    },
    {
      n: synthese.candidatures,
      texte:
        synthese.listeNoireCandidatures > 0
          ? `Nouvelles candidatures (dont ${synthese.listeNoireCandidatures} ⚠ liste noire)`
          : 'Nouvelles candidatures à valider',
      couleur:
        synthese.listeNoireCandidatures > 0
          ? 'red'
          : synthese.candidatures > 0
            ? 'amber'
            : 'green',
      href: '/admin/candidatures'
    }
  ] as const;

  const cls: Record<string, string> = {
    red: 'border-[#F3C1A8] bg-[#FFF3EC] [&_.n]:text-warn',
    amber: 'border-[#F2DCA6] bg-[#FFF9E8] [&_.n]:text-[#B07900]',
    green: 'border-[#BFD9C8] bg-[#EFF7F1] [&_.n]:text-ok'
  };

  return (
    <div>
      <h1 className="text-[21px] font-bold">
        Tableau de bord
        <span className="block text-[13px] font-normal text-muted">
          {formatJour(synthese.date, 'fr')} · {org?.nom} · {nbOuvriers} ouvriers actifs ·{' '}
          {synthese.missionsActives} missions actives
        </span>
      </h1>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {alertes.map((a, i) => (
          <Link
            key={i}
            href={a.href}
            className={`rounded-card border-[1.5px] p-3.5 transition-transform hover:-translate-y-0.5 ${cls[a.couleur]}`}
          >
            <div className="n font-mono text-[26px] font-bold">{a.n}</div>
            <div className="mt-0.5 text-[13.5px]">{a.texte}</div>
          </Link>
        ))}
      </div>

      {synthese.sansAffectation.length > 0 && (
        <>
          <h2 className="mb-2 mt-7 text-[16px] font-bold">
            🛏 Logés sans affectation aujourd’hui
            <span className="ml-2 text-[12.5px] font-normal text-muted">
              (alerte cron 7h)
            </span>
          </h2>
          <div className="card p-0">
            {synthese.sansAffectation.map((p) => (
              <div
                key={p.userId}
                className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
              >
                <b className="flex-1 text-[14px]">{p.nom}</b>
                <span className="text-[13px] text-muted">{p.logement}</span>
                <span className="font-mono text-[12.5px] text-muted">{p.telephone}</span>
                <Link
                  href={`/admin/affectations?date=${synthese.date}`}
                  className="btn-sm btn-green"
                >
                  Affecter
                </Link>
              </div>
            ))}
          </div>
        </>
      )}

      {synthese.depassements.length > 0 && (
        <>
          <h2 className="mb-2 mt-7 text-[16px] font-bold">💶 Acomptes &gt; gagné validé</h2>
          <div className="card p-0">
            {synthese.depassements.map((d) => (
              <div
                key={d.userId}
                className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
              >
                <b className="flex-1 text-[14px]">{d.nom}</b>
                <span className="font-mono text-[13px] text-warn">
                  {formatEuros(d.acomptes)} d’acomptes
                </span>
                <span className="font-mono text-[13px] text-muted">
                  pour {formatEuros(d.gagne)} gagnés
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {synthese.sansHeures.length > 0 && (
        <>
          <h2 className="mb-2 mt-7 text-[16px] font-bold">⏱ Heures non saisies aujourd’hui</h2>
          <div className="card p-0">
            {synthese.sansHeures.map((p) => (
              <div
                key={p.userId}
                className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
              >
                <b className="flex-1 text-[14px]">{p.nom}</b>
                <span className="font-mono text-[12.5px] text-muted">{p.telephone}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
