'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { reactiverProfilDepuisListe, remettreAuVivierDepuisListe } from './actions';

type Profil = {
  id: string;
  nom: string;
  telephone: string;
  langue: string;
  statut: string;
  note: number | null;
  tags: string[];
  derniereSaison: number | null;
  telegramConnecte: boolean;
  listeNoire: boolean;
  aPin: boolean;
};

function Etoiles({ note }: { note: number | null }) {
  if (!note) return <span className="text-muted">—</span>;
  return (
    <span className="text-[13px] text-[#B07900]">
      {'★'.repeat(note)}
      <span className="text-line">{'★'.repeat(5 - note)}</span>
    </span>
  );
}

const STATUT_BADGE: Record<string, string> = {
  CANDIDAT: 'badge-amber',
  VIVIER: 'badge-ok',
  ACTIF: 'badge-ok',
  INACTIF: 'badge-muted',
  LISTE_NOIRE: 'badge-warn'
};

/** Table triable + sélection multiple → contact groupé WhatsApp/Telegram. */
export default function SelectionContact({
  profils,
  lienTriNote,
  lienTriNom,
  lienTriSaison
}: {
  profils: Profil[];
  lienTriNote: string;
  lienTriNom: string;
  lienTriSaison: string;
}) {
  const [selection, setSelection] = useState<string[]>([]);
  const [pinPour, setPinPour] = useState<string | null>(null); // profil sans PIN : mini-saisie
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selectionnables = profils.filter((p) => !p.listeNoire);

  function basculer(id: string) {
    setSelection((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  /** VIVIER/INACTIF → ouvrier ACTIF (PIN demandé s'il n'en a pas). */
  function versActifs(p: Profil) {
    if (!p.aPin && pinPour !== p.id) {
      setPinPour(p.id);
      setPin('');
      return;
    }
    if (!p.aPin && !/^\d{4}$/.test(pin)) {
      setMessage(`${p.nom} : saisissez un PIN à 4 chiffres pour activer son accès.`);
      return;
    }
    const fd = new FormData();
    fd.set('id', p.id);
    if (!p.aPin) fd.set('pin', pin);
    setMessage(null);
    startTransition(async () => {
      const r = await reactiverProfilDepuisListe(fd);
      if (r.ok) {
        setPinPour(null);
        setMessage(`✓ ${p.nom} est maintenant dans vos ouvriers actifs.`);
      } else {
        setMessage(r.erreur ?? 'Erreur');
      }
    });
  }

  /** ACTIF → retour au vivier (fin de mission). */
  function versVivier(p: Profil) {
    if (!window.confirm(`Remettre ${p.nom} au vivier ? Son accès au portail sera coupé (historique et PIN conservés).`)) return;
    const fd = new FormData();
    fd.set('id', p.id);
    setMessage(null);
    startTransition(async () => {
      const r = await remettreAuVivierDepuisListe(fd);
      setMessage(r.ok ? `✓ ${p.nom} est de retour au vivier.` : r.erreur ?? 'Erreur');
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() =>
            setSelection(
              selection.length === selectionnables.length
                ? []
                : selectionnables.map((p) => p.id)
            )
          }
          className="btn-sm btn-outline"
        >
          {selection.length === selectionnables.length && selectionnables.length > 0
            ? 'Tout désélectionner'
            : 'Tout sélectionner'}
        </button>
        {selection.length > 0 && (
          <Link
            href={`/admin/vivier/contact?ids=${selection.join(',')}`}
            className="btn-sm btn-green"
          >
            💬 Contacter la sélection ({selection.length})
          </Link>
        )}
        {message && (
          <span className={`badge ${message.startsWith('✓') ? 'badge-ok' : 'badge-warn'}`}>
            {message}
          </span>
        )}
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table-admin">
          <thead>
            <tr>
              <th></th>
              <th>
                <Link href={lienTriNom} className="hover:underline">
                  Nom ⇅
                </Link>
              </th>
              <th>Téléphone</th>
              <th>Langue</th>
              <th>
                <Link href={lienTriNote} className="hover:underline">
                  Note ⇅
                </Link>
              </th>
              <th>Compétences</th>
              <th>
                <Link href={lienTriSaison} className="hover:underline">
                  Dernière saison ⇅
                </Link>
              </th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {profils.map((p) => (
              <tr key={p.id} className={p.listeNoire ? 'bg-[#FFF3EC]' : ''}>
                <td>
                  {!p.listeNoire && (
                    <input
                      type="checkbox"
                      checked={selection.includes(p.id)}
                      onChange={() => basculer(p.id)}
                      className="h-4 w-4 accent-brand"
                    />
                  )}
                </td>
                <td className="font-semibold">{p.nom}</td>
                <td className="font-mono text-[12.5px]">{p.telephone}</td>
                <td>{p.langue}</td>
                <td>
                  <Etoiles note={p.note} />
                </td>
                <td>
                  <div className="flex max-w-[220px] flex-wrap gap-1">
                    {p.tags.slice(0, 4).map((t) => (
                      <span key={t} className="badge badge-muted">
                        {t}
                      </span>
                    ))}
                    {p.tags.length > 4 && (
                      <span className="text-[11px] text-muted">+{p.tags.length - 4}</span>
                    )}
                  </div>
                </td>
                <td className="font-mono text-[12.5px]">{p.derniereSaison ?? '—'}</td>
                <td>
                  <span className={`badge ${STATUT_BADGE[p.statut] ?? 'badge-muted'}`}>
                    {p.statut.replace('_', ' ').toLowerCase()}
                  </span>
                </td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {(p.statut === 'VIVIER' || p.statut === 'INACTIF') && (
                      <>
                        {pinPour === p.id && !p.aPin && (
                          <input
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            placeholder="PIN"
                            inputMode="numeric"
                            maxLength={4}
                            className="input w-[64px] py-1 text-center font-mono text-[13px]"
                            autoFocus
                          />
                        )}
                        <button
                          onClick={() => versActifs(p)}
                          disabled={pending}
                          className="btn-sm btn-green"
                          title="Passer dans les ouvriers actifs (accès portail PIN)"
                        >
                          ➕ Ouvrier
                        </button>
                      </>
                    )}
                    {p.statut === 'ACTIF' && (
                      <button
                        onClick={() => versVivier(p)}
                        disabled={pending}
                        className="btn-sm btn-outline"
                        title="Fin de mission : retour au vivier (historique conservé)"
                      >
                        ↩ Vivier
                      </button>
                    )}
                    <Link href={`/admin/vivier/${p.id}`} className="btn-sm btn-outline">
                      Fiche
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {profils.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted">
                  Aucun profil pour ces critères.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
