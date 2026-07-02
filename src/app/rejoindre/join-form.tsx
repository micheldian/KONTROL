'use client';

import { useState, useTransition } from 'react';
import { useLocale } from 'next-intl';
import { envoyerCandidature } from './actions';

export default function JoinForm({
  tags,
  labels
}: {
  tags: { id: string; libelle: string }[];
  labels: Record<string, string>;
}) {
  const locale = useLocale();
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [langue, setLangue] = useState(locale.toUpperCase());
  const [experience, setExperience] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [honeypot, setHoneypot] = useState('');
  const [fini, setFini] = useState<null | 'ok' | 'deja'>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (fini) {
    return (
      <div className="card mt-8 py-10 text-center">
        <div className="text-[40px]">✅</div>
        <h2 className="mt-2 text-[20px] font-bold">{labels.thanks}</h2>
        <p className="mt-2 px-6 text-[14.5px] text-muted">
          {fini === 'deja' ? labels.alreadySent : labels.thanksText}
        </p>
      </div>
    );
  }

  function envoyer() {
    setErreur(null);
    if (!nom.trim() || !prenom.trim() || !telephone.trim()) {
      setErreur(labels.errRequired);
      return;
    }
    startTransition(async () => {
      const res = await envoyerCandidature({
        nom,
        prenom,
        telephone,
        langue: ['FR', 'RO', 'ES'].includes(langue) ? langue : 'FR',
        experience,
        tagIds,
        siteweb: honeypot
      });
      if (res.ok) setFini(res.deja ? 'deja' : 'ok');
      else if (res.erreur === 'RATE') setErreur(labels.errRate);
      else if (res.erreur === 'PHONE') setErreur(labels.errPhone);
      else setErreur(labels.errRequired);
    });
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{labels.firstName} *</label>
          <input className="input" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
        </div>
        <div>
          <label className="label">{labels.lastName} *</label>
          <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="label">{labels.phone} *</label>
        <input
          type="tel"
          inputMode="tel"
          className="input font-mono text-[17px]"
          placeholder="+40 7xx xxx xxx"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
        />
      </div>

      {/* Honeypot invisible (anti-spam sans captcha) */}
      <div className="absolute -left-[9999px] top-0" aria-hidden="true">
        <label>
          Site web
          <input
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </label>
      </div>

      <div>
        <label className="label">{labels.language}</label>
        <div className="grid grid-cols-4 gap-2">
          {[
            ['FR', '🇫🇷 FR'],
            ['RO', '🇷🇴 RO'],
            ['ES', '🇪🇸 ES'],
            ['AUTRE', labels.langOther]
          ].map(([code, txt]) => (
            <button
              key={code}
              type="button"
              onClick={() => setLangue(code)}
              className={`rounded-xl border-[1.5px] px-2 py-3 text-[14px] font-semibold ${
                langue === code ? 'border-brand bg-brand text-white' : 'border-line bg-white'
              }`}
            >
              {txt}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">{labels.skills}</label>
        <div className="grid grid-cols-2 gap-2">
          {tags.map((t) => {
            const actif = tagIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  setTagIds((ids) =>
                    actif ? ids.filter((x) => x !== t.id) : [...ids, t.id]
                  )
                }
                className={`min-h-[52px] rounded-xl border-[1.5px] px-3 py-2.5 text-left text-[14px] font-semibold ${
                  actif ? 'border-brand bg-brand text-white' : 'border-line bg-white'
                }`}
              >
                {actif ? '✓ ' : ''}
                {t.libelle}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="label">{labels.experience}</label>
        <textarea
          rows={3}
          className="input"
          placeholder={labels.experiencePlaceholder}
          value={experience}
          onChange={(e) => setExperience(e.target.value)}
        />
      </div>

      {erreur && <p className="text-[14px] font-semibold text-warn">⚠ {erreur}</p>}

      <button onClick={envoyer} disabled={pending} className="btn btn-green w-full text-[17px]">
        {labels.send}
      </button>
    </div>
  );
}
