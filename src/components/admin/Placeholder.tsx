export default function Placeholder({
  titre,
  phase
}: {
  titre: string;
  phase: number;
}) {
  return (
    <div>
      <h1 className="text-[21px] font-bold">{titre}</h1>
      <div className="card mt-5 py-10 text-center text-[14px] text-muted">
        Ce module arrive en phase {phase}.
      </div>
    </div>
  );
}
