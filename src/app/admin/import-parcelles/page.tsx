import { requireAdmin } from '@/lib/session';
import ImportClient from './import-client';

export const dynamic = 'force-dynamic';

export default async function ImportParcellesPage() {
  await requireAdmin();
  return (
    <div className="max-w-[900px]">
      <h1 className="mb-1 text-[21px] font-bold">Import clients & parcelles</h1>
      <p className="mb-5 text-[13px] text-muted">
        Excel (.xlsx/.xls), CSV, GeoJSON ou KML. Les géométries cadastrales sont résolues à
        l’IGN (référence commune/section/numéro, ou point latitude/longitude). Les clients
        sont créés/regroupés par nom, les parcelles dédoublonnées.
      </p>
      <ImportClient />
    </div>
  );
}
