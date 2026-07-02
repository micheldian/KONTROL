import type { User } from '@prisma/client';
import { saveOuvrier } from './actions';

export default function OuvrierForm({ ouvrier }: { ouvrier?: User }) {
  return (
    <form action={saveOuvrier} className="card space-y-4 p-5">
      {ouvrier && <input type="hidden" name="id" value={ouvrier.id} />}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Prénom *</label>
          <input name="prenom" required className="input" defaultValue={ouvrier?.prenom} />
        </div>
        <div>
          <label className="label">Nom *</label>
          <input name="nom" required className="input" defaultValue={ouvrier?.nom} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Téléphone * (clé unique)</label>
          <input
            name="telephone"
            required
            className="input font-mono"
            placeholder="+40 7xx xxx xxx"
            defaultValue={ouvrier?.telephone}
          />
        </div>
        <div>
          <label className="label">Langue *</label>
          <select name="langue" className="input" defaultValue={ouvrier?.langue ?? 'RO'}>
            <option value="FR">Français</option>
            <option value="RO">Română</option>
            <option value="ES">Español</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label">Rôle *</label>
          <select
            name="role"
            className="input"
            defaultValue={ouvrier?.role === 'CHEF_EQUIPE' ? 'CHEF_EQUIPE' : 'OUVRIER'}
          >
            <option value="OUVRIER">Ouvrier</option>
            <option value="CHEF_EQUIPE">Chef d’équipe</option>
          </select>
        </div>
        <div>
          <label className="label">Statut *</label>
          <select
            name="statutProfil"
            className="input"
            defaultValue={ouvrier?.statutProfil ?? 'ACTIF'}
          >
            <option value="ACTIF">Actif (accès portail)</option>
            <option value="INACTIF">Inactif (retour vivier)</option>
            <option value="VIVIER">Vivier</option>
          </select>
        </div>
        <div>
          <label className="label">Taux horaire (€/h, vide = tarif de base)</label>
          <input
            name="tauxHoraire"
            type="number"
            step="0.01"
            min={0}
            className="input"
            defaultValue={ouvrier?.tauxHoraire ? Number(ouvrier.tauxHoraire) : ''}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">
            PIN 4 chiffres {ouvrier ? '(vide = inchangé)' : '*'}
          </label>
          <input
            name="pin"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            className="input font-mono"
            placeholder={ouvrier ? '••••' : '1234'}
            required={!ouvrier}
          />
        </div>
        <div>
          <label className="label">IBAN (optionnel)</label>
          <input name="iban" className="input font-mono" defaultValue={ouvrier?.iban ?? ''} />
        </div>
      </div>
      <div>
        <label className="label">Notes internes (jamais visibles par l’ouvrier)</label>
        <textarea
          name="notesInternes"
          rows={2}
          className="input"
          defaultValue={ouvrier?.notesInternes ?? ''}
        />
      </div>
      <button type="submit" className="btn-sm btn-green px-6 py-3">
        Enregistrer
      </button>
    </form>
  );
}
