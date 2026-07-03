// Bannière d'erreur lisible pour les gardes-fous des server actions.
// En production Next masque les messages des actions qui « throw » — le
// pattern maison est : catch → redirect(`…?erreur=message`) → cette bannière.

export default function ErreurBanniere({ erreur }: { erreur?: string }) {
  if (!erreur) return null;
  return (
    <div className="mb-4 rounded-card border-[1.5px] border-[#F3C1A8] bg-[#FFF3EC] px-4 py-3 text-[13.5px] font-semibold text-warn">
      ⚠ {erreur}
    </div>
  );
}
