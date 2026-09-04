'use client';

import { useState, useTransition } from 'react';
import { contacterProfil, envoyerSmsConnexion, type ResultatSmsConnexion } from '../actions';

type Destinataire = {
  id: string;
  nom: string;
  telephone: string;
  langue: string;
  statut: string;
  telegramConnecte: boolean;
  message: string;
  messageConnexion: string;
};

type Mode = 'MISSION' | 'CONNEXION';

type EtatSms = { texte: string; pin?: string; lienSms?: string; lienWhatsApp?: string; erreur?: boolean };

export default function ContactGroupe({
  destinataires,
  smsConfigure
}: {
  destinataires: Destinataire[];
  smsConfigure: boolean;
}) {
  const [mode, setMode] = useState<Mode>('MISSION');
  const [messages, setMessages] = useState<Record<string, string>>(
    Object.fromEntries(destinataires.map((d) => [d.id, d.message]))
  );
  const [messagesConnexion, setMessagesConnexion] = useState<Record<string, string>>(
    Object.fromEntries(destinataires.map((d) => [d.id, d.messageConnexion]))
  );
  const [etats, setEtats] = useState<Record<string, string>>({});
  const [etatsSms, setEtatsSms] = useState<Record<string, EtatSms>>({});
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

  function libelleSms(res: ResultatSmsConnexion): EtatSms {
    if (!res.ok) return { texte: res.erreur ?? 'erreur', erreur: true };
    const activation = res.active ? ' · profil activé' : '';
    switch (res.statut) {
      case 'ENVOYE':
        return { texte: `📲 SMS envoyé${activation}`, pin: res.pin };
      case 'SIMULE':
        return { texte: `📲 simulé (SMS non configuré)${activation}`, pin: res.pin };
      case 'LIEN_GENERE':
        return {
          texte: `${res.lienWhatsApp ? '🟢 WhatsApp ouvert' : '📱 à envoyer depuis votre téléphone'}${activation}`,
          pin: res.pin,
          lienSms: res.lienSms,
          lienWhatsApp: res.lienWhatsApp
        };
      default:
        return { texte: `📲 échec : ${res.detail ?? ''}`, pin: res.pin, erreur: true };
    }
  }

  /** Message de connexion : nouveau PIN généré côté serveur, lien pré-langué, profil activé. */
  function envoyerSms(ids: string[], modeEnvoi: 'SERVEUR' | 'LIEN' | 'WHATSAPP') {
    const question =
      ids.length > 1
        ? `Envoyer le message de connexion à ${ids.length} personnes ? Un NOUVEAU PIN est généré pour chacune (l’ancien ne fonctionnera plus).`
        : 'Envoyer le message de connexion ? Un NOUVEAU PIN est généré (l’ancien ne fonctionnera plus).';
    if (!window.confirm(question)) return;
    // WhatsApp : la fenêtre est ouverte pendant le geste utilisateur (sinon bloquée par
    // Safari/iOS après l'appel serveur), puis dirigée vers wa.me une fois le PIN généré.
    const fenetre = modeEnvoi === 'WHATSAPP' && ids.length === 1 ? window.open('', '_blank') : null;
    startTransition(async () => {
      for (const id of ids) {
        const res = await envoyerSmsConnexion({
          userId: id,
          contenu: messagesConnexion[id],
          mode: modeEnvoi
        });
        setEtatsSms((e) => ({ ...e, [id]: libelleSms(res) }));
        if (res.ok && res.lienWhatsApp && fenetre) {
          fenetre.location.href = res.lienWhatsApp;
        } else if (fenetre) {
          fenetre.close();
        }
        if (res.ok && res.lienSms && ids.length === 1) {
          // Ouvre l'app SMS du téléphone de l'admin, message pré-rempli
          window.location.href = res.lienSms;
        }
      }
    });
  }

  if (destinataires.length === 0) {
    return <div className="card py-8 text-center text-muted">Aucun destinataire (profils liste noire exclus).</div>;
  }

  const connexion = mode === 'CONNEXION';

  return (
    <div>
      {/* Bascule de mode */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        <button
          onClick={() => setMode('MISSION')}
          className={`btn-sm ${connexion ? 'btn-outline' : 'btn-ink'}`}
        >
          💬 Message mission
        </button>
        <button
          onClick={() => setMode('CONNEXION')}
          className={`btn-sm ${connexion ? 'btn-ink' : 'btn-outline'}`}
        >
          🔑 Message de connexion (lien + PIN)
        </button>
      </div>

      {connexion && (
        <div className="card mb-4 bg-[#FFF8E6] text-[13px]">
          <b>Message de connexion</b> : lien dans la langue du profil, téléphone pré-rempli et{' '}
          <b>nouveau PIN à 4 chiffres</b> généré à l’envoi ({'{pin}'} dans le texte). L’ancien PIN
          est remplacé ; un profil au vivier passe en <b>actif</b> pour que le lien fonctionne.
          Envoi par <b>WhatsApp</b> (comme d’habitude, wa.me pré-rempli) ou par SMS.
          {!smsConfigure && (
            <span className="mt-1 block text-muted">
              SMS serveur non configuré (Paramètres → SMS Twilio) : « SMS depuis mon téléphone »
              ouvre votre app SMS avec le message et le PIN pré-remplis.
            </span>
          )}
        </div>
      )}

      {destinataires.length > 1 && !connexion && (
        <button
          onClick={() => envoyerTelegram(destinataires.map((d) => d.id))}
          disabled={pending}
          className="btn-sm btn-ink mb-4"
        >
          ✈️ Telegram à tous ({destinataires.length})
        </button>
      )}
      {destinataires.length > 1 && connexion && smsConfigure && (
        <button
          onClick={() => envoyerSms(destinataires.map((d) => d.id), 'SERVEUR')}
          disabled={pending}
          className="btn-sm btn-ink mb-4"
        >
          📲 SMS de connexion à tous ({destinataires.length})
        </button>
      )}

      <div className="space-y-3">
        {destinataires.map((d) => {
          const sms = etatsSms[d.id];
          return (
            <div key={d.id} className="card">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <b className="text-[14.5px]">{d.nom}</b>
                <span className="badge badge-muted">{d.langue}</span>
                <span className="font-mono text-[12px] text-muted">{d.telephone}</span>
                {connexion ? (
                  <span className={`badge ${d.statut === 'ACTIF' ? 'badge-ok' : 'badge-amber'}`}>
                    {d.statut === 'ACTIF' ? 'accès actif' : `${d.statut.toLowerCase()} → sera activé`}
                  </span>
                ) : d.telegramConnecte ? (
                  <span className="badge badge-ok">Telegram connecté</span>
                ) : (
                  <span className="badge badge-warn">Telegram non connecté</span>
                )}
                {!connexion && etats[d.id] && (
                  <span className="badge badge-amber">{etats[d.id]}</span>
                )}
                <span className="ml-auto flex gap-1.5">
                  {connexion ? (
                    <>
                      <button
                        onClick={() => envoyerSms([d.id], 'WHATSAPP')}
                        disabled={pending}
                        className="btn-sm btn-green"
                      >
                        🟢 WhatsApp
                      </button>
                      <button
                        onClick={() => envoyerSms([d.id], 'LIEN')}
                        disabled={pending}
                        className="btn-sm btn-outline"
                      >
                        📱 SMS depuis mon téléphone
                      </button>
                      {smsConfigure && (
                        <button
                          onClick={() => envoyerSms([d.id], 'SERVEUR')}
                          disabled={pending}
                          className="btn-sm btn-outline"
                          title="Envoi par le serveur (Twilio)"
                        >
                          📲 SMS automatique
                        </button>
                      )}
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </span>
              </div>

              {connexion && sms && (
                <div
                  className={`mb-2 flex flex-wrap items-center gap-2 text-[13px] ${
                    sms.erreur ? 'text-warn' : ''
                  }`}
                >
                  <span className={`badge ${sms.erreur ? 'badge-warn' : 'badge-amber'}`}>
                    {sms.texte}
                  </span>
                  {sms.pin && (
                    <span>
                      PIN : <b className="font-mono text-[15px]">{sms.pin}</b>
                    </span>
                  )}
                  {sms.lienSms && (
                    <a href={sms.lienSms} className="btn-sm btn-green">
                      Ouvrir l’app SMS
                    </a>
                  )}
                  {sms.lienWhatsApp && (
                    <a href={sms.lienWhatsApp} target="_blank" rel="noopener" className="btn-sm btn-green">
                      Rouvrir WhatsApp
                    </a>
                  )}
                </div>
              )}

              <textarea
                rows={connexion ? 5 : 3}
                value={connexion ? messagesConnexion[d.id] : messages[d.id]}
                onChange={(e) =>
                  connexion
                    ? setMessagesConnexion((m) => ({ ...m, [d.id]: e.target.value }))
                    : setMessages((m) => ({ ...m, [d.id]: e.target.value }))
                }
                className="input text-[13.5px]"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
