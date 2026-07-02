'use client';

import { useState, useTransition } from 'react';
import { contacterProfil } from '../actions';

type Destinataire = {
  id: string;
  nom: string;
  telephone: string;
  langue: string;
  telegramConnecte: boolean;
  message: string;
};

export default function ContactGroupe({
  destinataires
}: {
  destinataires: Destinataire[];
}) {
  const [messages, setMessages] = useState<Record<string, string>>(
    Object.fromEntries(destinataires.map((d) => [d.id, d.message]))
  );
  const [etats, setEtats] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function envoyerTelegram(ids: string[]) {
    startTransition(async () => {
      for (const id of ids) {
        try {
          const res = await contacterProfil({
            userId: id,
            canal: 'TELEGRAM',
            contenu: messages[id]
          });
          setEtats((e) => ({
            ...e,
            [id]: res.statut === 'SIMULE' ? '✈️ simulé' : res.statut === 'ENVOYE' ? '✈️ envoyé' : `✈️ ${res.detail ?? 'échec'}`
          }));
        } catch {
          setEtats((e) => ({ ...e, [id]: 'erreur' }));
        }
      }
    });
  }

  function ouvrirWhatsApp(d: Destinataire) {
    const url = `https://wa.me/${d.telephone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(messages[d.id])}`;
    window.open(url, '_blank', 'noopener');
    startTransition(async () => {
      try {
        await contacterProfil({ userId: d.id, canal: 'WHATSAPP', contenu: messages[d.id] });
        setEtats((e) => ({ ...e, [d.id]: '🟢 lien ouvert' }));
      } catch {
        setEtats((e) => ({ ...e, [d.id]: 'erreur' }));
      }
    });
  }

  if (destinataires.length === 0) {
    return <div className="card py-8 text-center text-muted">Aucun destinataire (profils liste noire exclus).</div>;
  }

  return (
    <div>
      {destinataires.length > 1 && (
        <button
          onClick={() => envoyerTelegram(destinataires.map((d) => d.id))}
          disabled={pending}
          className="btn-sm btn-ink mb-4"
        >
          ✈️ Telegram à tous ({destinataires.length})
        </button>
      )}

      <div className="space-y-3">
        {destinataires.map((d) => (
          <div key={d.id} className="card">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <b className="text-[14.5px]">{d.nom}</b>
              <span className="badge badge-muted">{d.langue}</span>
              <span className="font-mono text-[12px] text-muted">{d.telephone}</span>
              {d.telegramConnecte ? (
                <span className="badge badge-ok">Telegram connecté</span>
              ) : (
                <span className="badge badge-warn">Telegram non connecté</span>
              )}
              {etats[d.id] && <span className="badge badge-amber">{etats[d.id]}</span>}
              <span className="ml-auto flex gap-1.5">
                <button
                  onClick={() => ouvrirWhatsApp(d)}
                  disabled={pending}
                  className="btn-sm btn-outline"
                >
                  🟢 WhatsApp
                </button>
                <button
                  onClick={() => envoyerTelegram([d.id])}
                  disabled={pending}
                  className="btn-sm btn-outline"
                >
                  ✈️ Telegram
                </button>
              </span>
            </div>
            <textarea
              rows={3}
              value={messages[d.id]}
              onChange={(e) => setMessages((m) => ({ ...m, [d.id]: e.target.value }))}
              className="input text-[13.5px]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
