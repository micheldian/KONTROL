import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { formatDate, ymd } from '@/lib/dates';
import { ORDRE_CHECKLIST, itemRempli } from '@/lib/embauche';
import { dpaeUrgente } from '@/lib/dpae';
import ErreurBanniere from '@/components/admin/ErreurBanniere';

export const dynamic = 'force-dynamic';

const STATUT_BADGE: Record<string, { cls: string; txt: string }> = {
  EN_COURS: { cls: 'badge-amber', txt: 'en cours' },
  COMPLET: { cls: 'badge-ok', txt: 'complet' },
  FORCE: { cls: 'badge-warn', txt: 'forcé (incomplet)' },
  ANNULE: { cls: 'badge-muted', txt: 'annulé' }
};

// Dossiers d'embauche : progression checklist, alerte DPAE avant prise de poste.
export default async function EmbauchesPage({
  searchParams
}: {
  searchParams: { erreur?: string };
}) {
  const user = await requireAdmin();
  const dossiers = await prisma.dossierEmbauche.findMany({
    where: { organisationId: user.organisationId },
    include: { user: true, checklist: true },
    orderBy: [{ statut: 'asc' }, { dateDebut: 'asc' }]
  });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-bold">
          Dossiers d’embauche
          <span className="block text-[13px] font-normal text-muted">
            Embauche digitale : documents, contrat signé, DPAE — verrou de complétude avant
            passage ACTIF
          </span>
        </h1>
        <Link href="/admin/vivier" className="btn-sm btn-outline">
          Vivier (bouton « Embaucher » sur un profil) →
        </Link>
      </div>

      {/* Export « dossier de contrôle MSA » : ZIP des dossiers d'une période */}
      <form
        action="/api/documents/zip"
        method="GET"
        className="card mb-4 flex flex-wrap items-end gap-2 p-4"
      >
        <b className="mr-2 text-[13.5px]">📦 Dossier de contrôle MSA</b>
        <div>
          <label className="label">Du</label>
          <input name="debut" type="date" required className="input" />
        </div>
        <div>
          <label className="label">Au</label>
          <input name="fin" type="date" required className="input" />
        </div>
        <button className="btn-sm btn-outline">⬇ Exporter le ZIP</button>
        <span className="text-[12px] text-muted">
          Tous les documents des embauches démarrant sur la période, un répertoire par ouvrier.
        </span>
      </form>

      <ErreurBanniere erreur={searchParams.erreur} />

      <div className="space-y-2.5">
        {dossiers.map((d) => {
          const remplis = ORDRE_CHECKLIST.filter((type) => {
            const item = d.checklist.find((c) => c.type === type);
            return item && itemRempli(item);
          }).length;
          const b = STATUT_BADGE[d.statut];
          const urgent = d.statut === 'EN_COURS' && dpaeUrgente(d);
          return (
            <Link
              key={d.id}
              href={`/admin/embauches/${d.id}`}
              className="card flex flex-wrap items-center gap-3 transition-transform hover:-translate-y-0.5"
            >
              <div className="min-w-[180px] flex-1">
                <b className="text-[15px]">
                  {d.user.prenom} {d.user.nom}
                </b>
                <div className="text-[12.5px] text-muted">
                  Début {formatDate(ymd(d.dateDebut))}
                  {d.dateFinPrevue ? ` → ${formatDate(ymd(d.dateFinPrevue))}` : ''} ·{' '}
                  {d.user.telephone}
                </div>
              </div>
              {urgent && <span className="badge badge-warn">⚠ DPAE avant prise de poste !</span>}
              <div className="flex items-center gap-1">
                {ORDRE_CHECKLIST.map((type) => {
                  const item = d.checklist.find((c) => c.type === type);
                  const okItem = item && itemRempli(item);
                  return (
                    <span
                      key={type}
                      title={type}
                      className={`inline-block h-2.5 w-2.5 rounded-full ${
                        okItem ? 'bg-ok' : 'bg-line'
                      }`}
                    />
                  );
                })}
                <span className="ml-1 font-mono text-[12.5px] text-muted">{remplis}/6</span>
              </div>
              <span className={`badge ${b.cls}`}>{b.txt}</span>
            </Link>
          );
        })}
        {dossiers.length === 0 && (
          <div className="card py-8 text-center text-muted">
            Aucun dossier. Ouvrez un profil du vivier et cliquez « 🚀 Embaucher ».
          </div>
        )}
      </div>
    </div>
  );
}
