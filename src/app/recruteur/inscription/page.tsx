import Link from 'next/link';
import { inscrireRecruteur } from '../actions';

export const dynamic = 'force-dynamic';

// Inscription publique ouverte (spec §B) : compte actif immédiatement.
export default function InscriptionRecruteurPage({
  searchParams
}: {
  searchParams: { erreur?: string };
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-[460px] flex-col justify-center px-6 py-10">
      <div className="mb-6 text-center text-[24px] font-bold tracking-wider">
        KRON<b className="text-brand">TROL</b>
        <div className="mt-1 text-[13px] font-normal tracking-normal text-muted">
          Espace recruteurs — proposez des candidats, touchez une commission par placement
        </div>
      </div>

      {searchParams.erreur && (
        <div className="mb-4 rounded-card border-[1.5px] border-[#F3C1A8] bg-[#FFF3EC] px-4 py-3 text-[13.5px] font-semibold text-warn">
          ⚠ {searchParams.erreur}
        </div>
      )}

      <form action={inscrireRecruteur} className="card space-y-3.5 p-6">
        <div>
          <label className="label">Société / agence (optionnel)</label>
          <input name="societe" className="input" placeholder="Ex. AgriRecrut SRL" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Prénom *</label>
            <input name="prenom" required className="input" />
          </div>
          <div>
            <label className="label">Nom *</label>
            <input name="nom" required className="input" />
          </div>
        </div>
        <div>
          <label className="label">Téléphone *</label>
          <input name="telephone" type="tel" required className="input" placeholder="+40 7…" />
        </div>
        <div>
          <label className="label">Email * (identifiant de connexion)</label>
          <input name="email" type="email" required className="input" />
        </div>
        <div>
          <label className="label">Mot de passe * (8 caractères minimum)</label>
          <input name="motDePasse" type="password" required minLength={8} className="input" />
        </div>
        <button type="submit" className="btn btn-green w-full">
          Créer mon compte recruteur
        </button>
        <p className="text-center text-[12px] text-muted">
          Compte actif immédiatement. Commission fixe par candidat placé, suivie dans votre
          espace « Mes gains ».
        </p>
      </form>

      <Link href="/recruteur/login" className="mt-5 text-center text-[13px] text-muted underline">
        Déjà inscrit ? Se connecter
      </Link>
    </main>
  );
}
