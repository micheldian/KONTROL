import Link from 'next/link';
import type { Client } from '@prisma/client';
import { saveClient, deleteClient } from './actions';

export default function ClientForm({ client }: { client?: Client }) {
  return (
    <div className="max-w-[640px]">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[21px] font-bold">
          {client ? `Client · ${client.nom}` : 'Nouveau client'}
        </h1>
        <Link href="/admin/clients" className="btn-sm btn-outline">
          ← Retour
        </Link>
      </div>

      <form action={saveClient} className="card space-y-4 p-5">
        {client && <input type="hidden" name="id" value={client.id} />}
        <div>
          <label className="label">Nom *</label>
          <input name="nom" required className="input" defaultValue={client?.nom} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Contact</label>
            <input name="contact" className="input" defaultValue={client?.contact ?? ''} />
          </div>
          <div>
            <label className="label">Téléphone</label>
            <input name="telephone" className="input" defaultValue={client?.telephone ?? ''} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" className="input" defaultValue={client?.email ?? ''} />
          </div>
          <div>
            <label className="label">ID client Pennylane</label>
            <input
              name="pennylaneCustomerId"
              className="input"
              defaultValue={client?.pennylaneCustomerId ?? ''}
              placeholder="créé automatiquement si vide"
            />
          </div>
        </div>
        <div>
          <label className="label">Adresse</label>
          <input name="adresse" className="input" defaultValue={client?.adresse ?? ''} />
        </div>
        <div className="grid grid-cols-2 items-end gap-4">
          <div>
            <label className="label">Couleur d’affichage carte</label>
            <input
              name="couleur"
              type="color"
              className="input h-[42px] w-[80px] cursor-pointer p-1"
              defaultValue={client?.couleur ?? '#FF5722'}
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-[13.5px]">
            <input
              type="checkbox"
              name="afficherTarifAuClient"
              defaultChecked={client?.afficherTarifAuClient === true}
              className="h-4 w-4 accent-brand"
            />
            Afficher le tarif de ses missions sur son portail client
          </label>
        </div>
        <div>
          <label className="label">Notes / conditions</label>
          <textarea name="notes" rows={3} className="input" defaultValue={client?.notes ?? ''} />
        </div>
        <div className="flex gap-3 pt-1">
          <button type="submit" className="btn-sm btn-green px-6 py-3">
            Enregistrer
          </button>
        </div>
      </form>

      {client && (
        <form action={deleteClient} className="mt-4">
          <input type="hidden" name="id" value={client.id} />
          <button className="btn-sm text-warn underline">Supprimer ce client</button>
        </form>
      )}
    </div>
  );
}
