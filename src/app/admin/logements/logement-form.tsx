import Link from 'next/link';
import type { Logement } from '@prisma/client';
import { saveLogement, deleteLogement } from './actions';

export default function LogementForm({ logement }: { logement?: Logement }) {
  return (
    <div className="max-w-[560px]">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[21px] font-bold">
          {logement ? `Logement · ${logement.nom}` : 'Nouveau logement'}
        </h1>
        <Link href="/admin/logements" className="btn-sm btn-outline">
          ← Retour
        </Link>
      </div>

      <form action={saveLogement} className="card space-y-4 p-5">
        {logement && <input type="hidden" name="id" value={logement.id} />}
        <div>
          <label className="label">Nom *</label>
          <input name="nom" required className="input" defaultValue={logement?.nom} />
        </div>
        <div>
          <label className="label">Adresse</label>
          <input name="adresse" className="input" defaultValue={logement?.adresse ?? ''} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Capacité (lits) *</label>
            <input
              name="capacite"
              type="number"
              min={1}
              required
              className="input"
              defaultValue={logement?.capacite ?? 1}
            />
          </div>
          <div>
            <label className="label">Tarif / jour (€) *</label>
            <input
              name="tarifJour"
              type="number"
              step="0.01"
              min={0}
              required
              className="input"
              defaultValue={logement ? Number(logement.tarifJour) : ''}
            />
          </div>
        </div>
        <button type="submit" className="btn-sm btn-green px-6 py-3">
          Enregistrer
        </button>
      </form>

      {logement && (
        <form action={deleteLogement} className="mt-4">
          <input type="hidden" name="id" value={logement.id} />
          <button className="btn-sm text-warn underline">Supprimer ce logement</button>
        </form>
      )}
    </div>
  );
}
