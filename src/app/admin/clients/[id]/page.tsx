import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { refParcelle } from '@/lib/geo';
import ClientForm from '../client-form';
import {
  creerParcelleAdresse,
  creerParcelleParReference,
  supprimerParcelle
} from '../../parcelles/actions';

export const dynamic = 'force-dynamic';

export default async function EditClientPage({
  params
}: {
  params: { id: string };
}) {
  const user = await requireAdmin();
  const client = await prisma.client.findFirst({
    where: { id: params.id, organisationId: user.organisationId },
    include: {
      parcelles: { orderBy: [{ commune: 'asc' }, { section: 'asc' }, { numero: 'asc' }] },
      missions: { orderBy: { dateDebut: 'desc' } }
    }
  });
  if (!client) notFound();

  const surfaceTotale = client.parcelles.reduce((s, p) => s + (p.surfaceM2 ?? 0), 0);

  return (
    <div className="max-w-[760px]">
      <ClientForm client={client} />

      {/* Parcelles du client (règle 15 : la parcelle appartient au client) */}
      <div className="mb-5 mt-8 flex items-center justify-between">
        <h2 className="text-[16px] font-bold">
          Parcelles ({client.parcelles.length})
          {surfaceTotale > 0 && (
            <span className="ml-2 text-[13px] font-normal text-muted">
              {(surfaceTotale / 10000).toFixed(2).replace('.', ',')} ha
            </span>
          )}
        </h2>
        <Link href="/admin/carte" className="btn-sm btn-outline">
          🗺 Voir sur la carte
        </Link>
      </div>
      <div className="card mb-4 p-0">
        {client.parcelles.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
          >
            <div className="min-w-[220px] flex-1">
              <div className="text-[14px] font-semibold">
                📍 {refParcelle(p)}
                {p.geometry ? (
                  <span className="badge badge-ok ml-2">cadastre IGN</span>
                ) : (
                  <span className="badge badge-muted ml-2">adresse simple</span>
                )}
              </div>
              <div className="text-[12.5px] text-muted">
                {[
                  p.cepage,
                  p.millesime ? `millésime ${p.millesime}` : null,
                  p.surfaceM2 ? `${(p.surfaceM2 / 10000).toFixed(2).replace('.', ',')} ha` : null,
                  p.adresse && p.section ? p.adresse : null
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {p.instructions && (
                <div className="text-[12.5px] text-[#B07900]">⚠ {p.instructions}</div>
              )}
            </div>
            <form action={supprimerParcelle}>
              <input type="hidden" name="id" value={p.id} />
              <button className="btn-sm text-warn">Retirer</button>
            </form>
          </div>
        ))}
        {client.parcelles.length === 0 && (
          <div className="px-4 py-5 text-center text-[13.5px] text-muted">
            Aucune parcelle. Ajoutez-les ci-dessous, depuis la carte ou via l’import de masse.
          </div>
        )}
      </div>

      {/* Ajout rapide : référence cadastrale (Mode A) ou adresse simple */}
      <div className="card mb-4 space-y-3 p-4">
        <h3 className="text-[13.5px] font-bold">Ajouter par référence cadastrale (IGN)</h3>
        <form action={creerParcelleParReference} className="grid gap-2 md:grid-cols-6">
          <input type="hidden" name="clientId" value={client.id} />
          <input name="codeInsee" required placeholder="INSEE (ex. 68078)" className="input py-2" />
          <input name="section" required placeholder="Section (AB)" className="input py-2" />
          <input name="numero" required placeholder="N° (0123)" className="input py-2" />
          <input name="cepage" placeholder="Cépage" className="input py-2" />
          <input name="millesime" type="number" placeholder="Millésime" className="input py-2" />
          <button className="btn-sm btn-green">Rechercher & ajouter</button>
        </form>
        <p className="text-[12px] text-muted">
          La géométrie et la contenance sont récupérées au cadastre IGN. Pour chercher la commune
          ou pointer sur la carte : <Link href="/admin/carte" className="underline">/admin/carte</Link>.
        </p>
        <h3 className="pt-2 text-[13.5px] font-bold">Ou adresse simple (sans géométrie)</h3>
        <form action={creerParcelleAdresse} className="flex flex-wrap gap-2">
          <input type="hidden" name="clientId" value={client.id} />
          <input name="adresse" required placeholder="Adresse de la parcelle" className="input flex-1 py-2" />
          <input name="instructions" placeholder="Instructions (optionnel)" className="input flex-1 py-2" />
          <button className="btn-sm btn-green px-4">Ajouter</button>
        </form>
      </div>

      {/* Missions du client */}
      <h2 className="mb-3 mt-8 text-[16px] font-bold">Missions ({client.missions.length})</h2>
      <div className="card p-0">
        {client.missions.map((m) => (
          <Link
            key={m.id}
            href={`/admin/missions/${m.id}`}
            className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-[#F4F1E8]"
          >
            <b className="flex-1 text-[14px]">{m.libelle}</b>
            <span className="text-[12.5px] text-muted">{m.typeTravaux ?? ''}</span>
            <span className={`badge ${m.statut === 'ACTIVE' ? 'badge-ok' : 'badge-muted'}`}>
              {m.statut === 'ACTIVE' ? 'active' : 'terminée'}
            </span>
          </Link>
        ))}
        {client.missions.length === 0 && (
          <div className="px-4 py-5 text-center text-[13.5px] text-muted">Aucune mission.</div>
        )}
      </div>
    </div>
  );
}
