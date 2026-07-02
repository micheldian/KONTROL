import Link from 'next/link';
import type { Client, Mission } from '@prisma/client';
import { ymd } from '@/lib/dates';
import { saveMission, deleteMission } from './actions';

export default function MissionForm({
  mission,
  clients
}: {
  mission?: Mission;
  clients: Client[];
}) {
  return (
    <form action={saveMission} className="card space-y-4 p-5">
      {mission && <input type="hidden" name="id" value={mission.id} />}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Client *</label>
          <select name="clientId" required className="input" defaultValue={mission?.clientId ?? ''}>
            <option value="" disabled>
              — Choisir —
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Libellé *</label>
          <input name="libelle" required className="input" defaultValue={mission?.libelle} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label">Type de travaux</label>
          <input
            name="typeTravaux"
            className="input"
            placeholder="taille, relevage…"
            defaultValue={mission?.typeTravaux ?? ''}
          />
        </div>
        <div>
          <label className="label">Mode de facturation *</label>
          <select
            name="modeFacturation"
            className="input"
            defaultValue={mission?.modeFacturation ?? 'HEURE'}
          >
            <option value="HEURE">À l’heure</option>
            <option value="TACHE">À la tâche / forfait</option>
          </select>
        </div>
        <div>
          <label className="label">Statut</label>
          <select name="statut" className="input" defaultValue={mission?.statut ?? 'ACTIVE'}>
            <option value="ACTIVE">Active</option>
            <option value="TERMINEE">Terminée</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Taux client (€/h, si à l’heure)</label>
          <input
            name="tauxClient"
            type="number"
            step="0.01"
            min={0}
            className="input"
            defaultValue={mission?.tauxClient ? Number(mission.tauxClient) : ''}
          />
        </div>
        <div>
          <label className="label">Montant forfait (€, si à la tâche)</label>
          <input
            name="montantForfait"
            type="number"
            step="0.01"
            min={0}
            className="input"
            defaultValue={mission?.montantForfait ? Number(mission.montantForfait) : ''}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Date de début *</label>
          <input
            name="dateDebut"
            type="date"
            required
            className="input"
            defaultValue={mission ? ymd(mission.dateDebut) : ''}
          />
        </div>
        <div>
          <label className="label">Date de fin</label>
          <input
            name="dateFin"
            type="date"
            className="input"
            defaultValue={mission?.dateFin ? ymd(mission.dateFin) : ''}
          />
        </div>
      </div>
      <div>
        <label className="label">Notes / conditions</label>
        <textarea name="notes" rows={2} className="input" defaultValue={mission?.notes ?? ''} />
      </div>
      <div className="flex items-center gap-4">
        <button type="submit" className="btn-sm btn-green px-6 py-3">
          Enregistrer
        </button>
        <Link href="/admin/missions" className="btn-sm btn-outline">
          Annuler
        </Link>
      </div>
    </form>
  );
}

export function MissionDelete({ missionId }: { missionId: string }) {
  return (
    <form action={deleteMission} className="mt-4">
      <input type="hidden" name="id" value={missionId} />
      <button className="btn-sm text-warn underline">Supprimer cette mission</button>
    </form>
  );
}
