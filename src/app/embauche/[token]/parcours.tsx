'use client';

import { useMemo, useRef, useState } from 'react';
import {
  analyserIdentite,
  confirmerIdentite,
  analyserVitale,
  confirmerSecu,
  analyserRib,
  confirmerIban,
  signerMutuelle,
  signerContrat
} from '../actions';

// Parcours d'embauche mobile-first, trilingue. Sert aux deux modes : distant
// (lien token) et kiosque (rendu dans /admin/embauches/[id]/kiosque — l'ouvrier
// manipule lui-même l'appareil du manager, notamment pour signer).

type Langue = 'FR' | 'RO' | 'ES';

const T: Record<Langue, Record<string, string>> = {
  FR: {
    bienvenue: 'Bienvenue',
    intro: 'prépare votre embauche. Complétez les étapes ci-dessous (~5 minutes).',
    etape: 'Étape',
    identite: 'Pièce d’identité',
    identiteAide: 'Photographiez votre carte d’identité (recto puis verso) ou votre passeport.',
    recto: 'Photo recto',
    verso: 'Photo verso (CNI)',
    analyser: 'Analyser le document',
    analyse: 'Analyse en cours…',
    confirmez: 'Vérifiez et corrigez les informations lues sur le document :',
    ocrKo: 'Lecture automatique indisponible — remplissez les champs.',
    nom: 'Nom',
    prenoms: 'Prénom(s)',
    dateNaissance: 'Date de naissance',
    lieuNaissance: 'Lieu de naissance',
    nationalite: 'Nationalité',
    typeDocument: 'Type de document',
    numeroDocument: 'N° du document',
    dateExpiration: 'Date d’expiration',
    adresse: 'Adresse (si absente du document, saisissez-la)',
    valider: 'Confirmer',
    secu: 'Sécurité sociale',
    secuAide: 'Photographiez votre carte vitale, ou saisissez votre numéro.',
    photoVitale: 'Photo carte vitale',
    numeroSecu: 'Numéro de sécurité sociale',
    pasImmatricule: 'Je n’ai pas encore de numéro (première fois en France)',
    iban: 'Coordonnées bancaires',
    ibanAide: 'Photographiez votre RIB ou saisissez votre IBAN. Facultatif : sans IBAN, vous serez payé·e en espèces.',
    photoRib: 'Photo du RIB',
    passerEtape: 'Passer cette étape',
    mutuelle: 'Mutuelle santé',
    mutuelleAide: 'Choisissez : adhérer à la mutuelle d’entreprise, ou demander une dispense.',
    adhesion: 'J’adhère à la mutuelle',
    dispense: 'Je demande une dispense',
    motifDispense: 'Motif de la dispense',
    lireEtSigner: 'Lisez le document puis signez ci-dessous',
    contrat: 'Contrat de travail',
    contratAide: 'Lisez votre contrat puis signez au doigt dans le cadre.',
    signature: 'Votre signature (au doigt)',
    effacer: 'Effacer',
    signer: 'Signer le document',
    envoi: 'Envoi…',
    fini: 'Dossier transmis ✓',
    finiTexte: 'Merci ! Votre dossier d’embauche est transmis. Votre employeur vous confirmera votre premier jour.',
    debut: 'Début du contrat',
    continuer: 'Continuer',
    fait: 'Fait ✓',
    alerteExpiration: 'Attention : ce document expire bientôt. Prévoyez son renouvellement.',
    photoPrise: 'Photo enregistrée ✓',
    changerPhoto: 'Reprendre la photo'
  },
  RO: {
    bienvenue: 'Bun venit',
    intro: 'îți pregătește angajarea. Completează pașii de mai jos (~5 minute).',
    etape: 'Pasul',
    identite: 'Act de identitate',
    identiteAide: 'Fotografiază cartea de identitate (față, apoi verso) sau pașaportul.',
    recto: 'Poză față',
    verso: 'Poză verso (CI)',
    analyser: 'Analizează documentul',
    analyse: 'Se analizează…',
    confirmez: 'Verifică și corectează informațiile citite de pe document:',
    ocrKo: 'Citirea automată nu este disponibilă — completează câmpurile.',
    nom: 'Nume',
    prenoms: 'Prenume',
    dateNaissance: 'Data nașterii',
    lieuNaissance: 'Locul nașterii',
    nationalite: 'Naționalitate',
    typeDocument: 'Tip document',
    numeroDocument: 'Nr. document',
    dateExpiration: 'Data expirării',
    adresse: 'Adresă (dacă lipsește de pe document, scrie-o)',
    valider: 'Confirmă',
    secu: 'Securitate socială',
    secuAide: 'Fotografiază cardul vital (carte vitale) sau introdu numărul.',
    photoVitale: 'Poză carte vitale',
    numeroSecu: 'Număr de securitate socială',
    pasImmatricule: 'Nu am încă număr (prima dată în Franța)',
    iban: 'Date bancare',
    ibanAide: 'Fotografiază RIB-ul sau introdu IBAN-ul. Opțional: fără IBAN vei fi plătit în numerar.',
    photoRib: 'Poză RIB',
    passerEtape: 'Sari peste acest pas',
    mutuelle: 'Asigurare de sănătate (mutuelle)',
    mutuelleAide: 'Alege: aderă la asigurarea firmei sau cere o scutire.',
    adhesion: 'Ader la mutuelle',
    dispense: 'Cer o scutire',
    motifDispense: 'Motivul scutirii',
    lireEtSigner: 'Citește documentul apoi semnează mai jos',
    contrat: 'Contract de muncă',
    contratAide: 'Citește contractul apoi semnează cu degetul în chenar.',
    signature: 'Semnătura ta (cu degetul)',
    effacer: 'Șterge',
    signer: 'Semnează documentul',
    envoi: 'Se trimite…',
    fini: 'Dosar trimis ✓',
    finiTexte: 'Mulțumim! Dosarul tău de angajare a fost trimis. Angajatorul îți va confirma prima zi.',
    debut: 'Începutul contractului',
    continuer: 'Continuă',
    fait: 'Gata ✓',
    alerteExpiration: 'Atenție: acest document expiră în curând. Pregătește reînnoirea.',
    photoPrise: 'Poză salvată ✓',
    changerPhoto: 'Refă poza'
  },
  ES: {
    bienvenue: 'Bienvenido/a',
    intro: 'está preparando tu contratación. Completa los pasos (~5 minutos).',
    etape: 'Paso',
    identite: 'Documento de identidad',
    identiteAide: 'Fotografía tu DNI (anverso y reverso) o tu pasaporte.',
    recto: 'Foto anverso',
    verso: 'Foto reverso (DNI)',
    analyser: 'Analizar el documento',
    analyse: 'Analizando…',
    confirmez: 'Verifica y corrige la información leída del documento:',
    ocrKo: 'Lectura automática no disponible — rellena los campos.',
    nom: 'Apellidos',
    prenoms: 'Nombre(s)',
    dateNaissance: 'Fecha de nacimiento',
    lieuNaissance: 'Lugar de nacimiento',
    nationalite: 'Nacionalidad',
    typeDocument: 'Tipo de documento',
    numeroDocument: 'N.º del documento',
    dateExpiration: 'Fecha de caducidad',
    adresse: 'Dirección (si no figura en el documento, escríbela)',
    valider: 'Confirmar',
    secu: 'Seguridad social',
    secuAide: 'Fotografía tu carte vitale o escribe tu número.',
    photoVitale: 'Foto carte vitale',
    numeroSecu: 'Número de seguridad social',
    pasImmatricule: 'Aún no tengo número (primera vez en Francia)',
    iban: 'Datos bancarios',
    ibanAide: 'Fotografía tu RIB o escribe tu IBAN. Opcional: sin IBAN se te pagará en efectivo.',
    photoRib: 'Foto del RIB',
    passerEtape: 'Saltar este paso',
    mutuelle: 'Mutua de salud',
    mutuelleAide: 'Elige: adherirte a la mutua de empresa o pedir una exención.',
    adhesion: 'Me adhiero a la mutua',
    dispense: 'Pido una exención',
    motifDispense: 'Motivo de la exención',
    lireEtSigner: 'Lee el documento y firma abajo',
    contrat: 'Contrato de trabajo',
    contratAide: 'Lee tu contrato y firma con el dedo en el recuadro.',
    signature: 'Tu firma (con el dedo)',
    effacer: 'Borrar',
    signer: 'Firmar el documento',
    envoi: 'Enviando…',
    fini: 'Expediente enviado ✓',
    finiTexte: '¡Gracias! Tu expediente está enviado. Tu empleador te confirmará el primer día.',
    debut: 'Inicio del contrato',
    continuer: 'Continuar',
    fait: 'Hecho ✓',
    alerteExpiration: 'Atención: este documento caduca pronto. Prevé su renovación.',
    photoPrise: 'Foto guardada ✓',
    changerPhoto: 'Repetir la foto'
  }
};

/** Compression côté client : max 1600 px, JPEG qualité 0,82 (→ ~200-600 Ko). */
async function compresser(fichier: File): Promise<File> {
  if (!fichier.type.startsWith('image/')) return fichier;
  try {
    const bitmap = await createImageBitmap(fichier);
    const echelle = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * echelle);
    canvas.height = Math.round(bitmap.height * echelle);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, 'image/jpeg', 0.82)
    );
    if (!blob) return fichier;
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
  } catch {
    return fichier;
  }
}

function PhotoInput({
  label,
  photo,
  onPhoto,
  t
}: {
  label: string;
  photo: File | null;
  onPhoto: (f: File | null) => void;
  t: Record<string, string>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          onPhoto(f ? await compresser(f) : null);
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={`flex w-full items-center justify-center gap-2 rounded-card border-2 border-dashed px-4 py-5 text-[15px] font-semibold ${
          photo ? 'border-[#BFD9C8] bg-[#EFF7F1] text-ok' : 'border-line bg-paper'
        }`}
      >
        {photo ? `✓ ${t.photoPrise}` : `📷 ${label}`}
      </button>
      {photo && (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="mt-1 text-[12.5px] text-muted underline"
        >
          {t.changerPhoto}
        </button>
      )}
    </div>
  );
}

function SignatureCanvas({
  t,
  onChange
}: {
  t: Record<string, string>;
  onChange: (dataUrl: string | null) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dessine = useRef(false);
  const aTrace = useRef(false);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * ref.current!.width,
      y: ((e.clientY - r.top) / r.height) * ref.current!.height
    };
  };

  return (
    <div>
      <div className="label">{t.signature}</div>
      <canvas
        ref={ref}
        width={640}
        height={260}
        className="w-full touch-none rounded-card border-2 border-ink bg-white"
        style={{ height: 160 }}
        onPointerDown={(e) => {
          e.preventDefault();
          const ctx = ref.current!.getContext('2d')!;
          const p = pos(e);
          ctx.lineWidth = 3.2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = '#15243B';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          dessine.current = true;
          ref.current!.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dessine.current) return;
          const ctx = ref.current!.getContext('2d')!;
          const p = pos(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          aTrace.current = true;
        }}
        onPointerUp={() => {
          dessine.current = false;
          if (aTrace.current) onChange(ref.current!.toDataURL('image/png'));
        }}
      />
      <button
        type="button"
        className="mt-1 text-[12.5px] text-muted underline"
        onClick={() => {
          const c = ref.current!;
          c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
          aTrace.current = false;
          onChange(null);
        }}
      >
        ✕ {t.effacer}
      </button>
    </div>
  );
}

type Props = {
  token: string;
  langue: string;
  prenom: string;
  organisation: string;
  dateDebut: string;
  checklist: Record<string, string>;
  identite: {
    nom: string;
    prenoms: string;
    dateNaissance: string;
    lieuNaissance: string;
    nationalite: string;
    adresse: string;
  };
  ibanExistant: string;
  titreContrat: string;
  texteContrat: string;
  texteMutuelleAdhesion: string;
  texteMutuelleDispense: string;
  motifsDispense: string[];
  kiosque?: boolean;
};

const ETAPES = ['IDENTITE', 'SECU', 'IBAN', 'MUTUELLE', 'CONTRAT'] as const;

export default function ParcoursOnboarding(props: Props) {
  const t = T[(['FR', 'RO', 'ES'].includes(props.langue) ? props.langue : 'FR') as Langue];
  const rempli = (type: string) =>
    ['FAIT', 'FLAG', 'NON_BLOQUANT'].includes(props.checklist[type] ?? '');

  const premiereEtape = useMemo(() => {
    const i = ETAPES.findIndex((e) => !rempli(e));
    return i === -1 ? ETAPES.length : i;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [etape, setEtape] = useState(premiereEtape);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Étape identité
  const [recto, setRecto] = useState<File | null>(null);
  const [verso, setVerso] = useState<File | null>(null);
  const [champsId, setChampsId] = useState<Record<string, string> | null>(null);
  const [ocrStatut, setOcrStatut] = useState('');

  // Étape sécu / IBAN
  const [photoVitale, setPhotoVitale] = useState<File | null>(null);
  const [numeroSecu, setNumeroSecu] = useState('');
  const [photoRib, setPhotoRib] = useState<File | null>(null);
  const [iban, setIban] = useState(props.ibanExistant);

  // Mutuelle / contrat
  const [choixMutuelle, setChoixMutuelle] = useState<'ADHESION' | 'DISPENSE' | null>(null);
  const [motifDispense, setMotifDispense] = useState(props.motifsDispense[0] ?? '');
  const [signatureMutuelle, setSignatureMutuelle] = useState<string | null>(null);
  const [signatureContrat, setSignatureContrat] = useState<string | null>(null);

  async function lancer<T extends { ok: boolean }>(
    action: () => Promise<T>,
    apres?: (r: T) => void
  ) {
    setOccupe(true);
    setErreur(null);
    try {
      const r = await action();
      if (!r.ok) setErreur((r as { erreur?: string }).erreur ?? 'Erreur');
      else apres?.(r);
    } catch {
      setErreur('Erreur réseau — réessayez');
    }
    setOccupe(false);
  }

  const suivant = () => {
    setErreur(null);
    setInfo(null);
    setEtape((e) => e + 1);
  };

  const titres = [t.identite, t.secu, t.iban, t.mutuelle, t.contrat];

  return (
    <main className="mx-auto min-h-screen max-w-[520px] px-4 py-6">
      <header className="mb-4 text-center">
        <div className="text-[20px] font-bold tracking-wider">
          KRON<b className="text-brand">TROL</b>
        </div>
        <p className="mt-1 text-[14px]">
          {t.bienvenue} <b>{props.prenom}</b> — <b>{props.organisation}</b> {t.intro}
        </p>
        <p className="text-[12.5px] text-muted">
          {t.debut} : <b>{props.dateDebut}</b>
        </p>
      </header>

      {/* Barre d'étapes */}
      <div className="mb-5 flex gap-1.5">
        {titres.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < etape ? 'bg-ok' : i === etape ? 'bg-brand' : 'bg-line'
            }`}
          />
        ))}
      </div>

      {erreur && (
        <div className="mb-4 rounded-card border-[1.5px] border-[#F3C1A8] bg-[#FFF3EC] px-4 py-3 text-[13.5px] font-semibold text-warn">
          ⚠ {erreur}
        </div>
      )}
      {info && (
        <div className="mb-4 rounded-card border-[1.5px] border-[#F2DCA6] bg-[#FFF9E8] px-4 py-3 text-[13.5px] font-semibold text-[#B07900]">
          {info}
        </div>
      )}

      {etape < ETAPES.length && (
        <h1 className="mb-3 text-[18px] font-bold">
          {t.etape} {etape + 1}/{titres.length} — {titres[etape]}
        </h1>
      )}

      {/* —— 1. Identité —— */}
      {etape === 0 && !champsId && (
        <div className="card space-y-4 p-5">
          <p className="text-[13.5px] text-muted">{t.identiteAide}</p>
          <PhotoInput label={t.recto} photo={recto} onPhoto={setRecto} t={t} />
          <PhotoInput label={t.verso} photo={verso} onPhoto={setVerso} t={t} />
          <button
            className="btn btn-green w-full"
            disabled={!recto || occupe}
            onClick={() =>
              lancer(
                () => {
                  const fd = new FormData();
                  fd.set('token', props.token);
                  fd.set('recto', recto!);
                  if (verso) fd.set('verso', verso);
                  return analyserIdentite(fd);
                },
                (r) => {
                  if ('champs' in r) {
                    setChampsId(r.champs as Record<string, string>);
                    setOcrStatut((r as { statutOcr: string }).statutOcr);
                  }
                }
              )
            }
          >
            {occupe ? t.analyse : t.analyser}
          </button>
        </div>
      )}
      {etape === 0 && champsId && (
        <div className="card space-y-3 p-5">
          <p className="text-[13.5px] font-semibold">
            {ocrStatut === 'OK' ? t.confirmez : t.ocrKo}
          </p>
          {(
            [
              ['nom', t.nom, 'text'],
              ['prenoms', t.prenoms, 'text'],
              ['dateNaissance', t.dateNaissance, 'date'],
              ['lieuNaissance', t.lieuNaissance, 'text'],
              ['nationalite', t.nationalite, 'text'],
              ['typeDocument', t.typeDocument, 'text'],
              ['numeroDocument', t.numeroDocument, 'text'],
              ['dateExpiration', t.dateExpiration, 'date'],
              ['adresse', t.adresse, 'text']
            ] as Array<[string, string, string]>
          ).map(([cle, label, type]) => (
            <div key={cle}>
              <label className="label">{label}</label>
              <input
                type={type}
                className="input"
                value={champsId[cle] ?? (props.identite as Record<string, string>)[cle] ?? ''}
                onChange={(e) => setChampsId({ ...champsId, [cle]: e.target.value })}
              />
            </div>
          ))}
          <button
            className="btn btn-green w-full"
            disabled={occupe}
            onClick={() =>
              lancer(
                () => {
                  const fd = new FormData();
                  fd.set('token', props.token);
                  // Les champs affichés mais non retouchés (pré-remplis depuis le
                  // profil) doivent aussi partir : profil d'abord, saisie prioritaire.
                  const valeurs = { ...props.identite, ...champsId };
                  for (const [k, v] of Object.entries(valeurs)) fd.set(k, v ?? '');
                  return confirmerIdentite(fd);
                },
                (r) => {
                  const alerte = (r as { alerteExpiration: string | null }).alerteExpiration;
                  if (alerte) setInfo(`⚠ ${t.alerteExpiration} (${alerte})`);
                  setEtape(1);
                }
              )
            }
          >
            {occupe ? t.envoi : t.valider}
          </button>
        </div>
      )}

      {/* —— 2. Sécu —— */}
      {etape === 1 && (
        <div className="card space-y-4 p-5">
          <p className="text-[13.5px] text-muted">{t.secuAide}</p>
          <PhotoInput
            label={t.photoVitale}
            photo={photoVitale}
            onPhoto={async (f) => {
              setPhotoVitale(f);
              if (!f) return;
              const fd = new FormData();
              fd.set('token', props.token);
              fd.set('photo', f);
              await lancer(
                () => analyserVitale(fd),
                (r) => {
                  const n = (r as { numeroSecu: string }).numeroSecu;
                  if (n) setNumeroSecu(n);
                }
              );
            }}
            t={t}
          />
          <div>
            <label className="label">{t.numeroSecu}</label>
            <input
              className="input font-mono"
              inputMode="numeric"
              placeholder="1 85 03 …"
              value={numeroSecu}
              onChange={(e) => setNumeroSecu(e.target.value)}
            />
          </div>
          <button
            className="btn btn-green w-full"
            disabled={occupe || !numeroSecu.trim()}
            onClick={() =>
              lancer(() => {
                const fd = new FormData();
                fd.set('token', props.token);
                fd.set('numeroSecu', numeroSecu);
                return confirmerSecu(fd);
              }, suivant)
            }
          >
            {occupe ? t.envoi : t.valider}
          </button>
          <button
            className="w-full text-[13px] text-muted underline"
            disabled={occupe}
            onClick={() =>
              lancer(() => {
                const fd = new FormData();
                fd.set('token', props.token);
                fd.set('pasImmatricule', '1');
                return confirmerSecu(fd);
              }, suivant)
            }
          >
            {t.pasImmatricule}
          </button>
        </div>
      )}

      {/* —— 3. IBAN —— */}
      {etape === 2 && (
        <div className="card space-y-4 p-5">
          <p className="text-[13.5px] text-muted">{t.ibanAide}</p>
          <PhotoInput
            label={t.photoRib}
            photo={photoRib}
            onPhoto={async (f) => {
              setPhotoRib(f);
              if (!f) return;
              const fd = new FormData();
              fd.set('token', props.token);
              fd.set('photo', f);
              await lancer(
                () => analyserRib(fd),
                (r) => {
                  const i = (r as { iban: string }).iban;
                  if (i) setIban(i);
                }
              );
            }}
            t={t}
          />
          <div>
            <label className="label">IBAN</label>
            <input
              className="input font-mono uppercase"
              placeholder="FR76… / RO49…"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
            />
          </div>
          <button
            className="btn btn-green w-full"
            disabled={occupe || !iban.trim()}
            onClick={() =>
              lancer(() => {
                const fd = new FormData();
                fd.set('token', props.token);
                fd.set('iban', iban);
                return confirmerIban(fd);
              }, suivant)
            }
          >
            {occupe ? t.envoi : t.valider}
          </button>
          <button
            className="w-full text-[13px] text-muted underline"
            disabled={occupe}
            onClick={() =>
              lancer(() => {
                const fd = new FormData();
                fd.set('token', props.token);
                fd.set('passer', '1');
                return confirmerIban(fd);
              }, suivant)
            }
          >
            {t.passerEtape}
          </button>
        </div>
      )}

      {/* —— 4. Mutuelle —— */}
      {etape === 3 && (
        <div className="card space-y-4 p-5">
          <p className="text-[13.5px] text-muted">{t.mutuelleAide}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`rounded-card border-2 px-3 py-4 text-[14px] font-semibold ${
                choixMutuelle === 'ADHESION' ? 'border-brand bg-[#EFF7F1]' : 'border-line'
              }`}
              onClick={() => setChoixMutuelle('ADHESION')}
            >
              ✚ {t.adhesion}
            </button>
            <button
              className={`rounded-card border-2 px-3 py-4 text-[14px] font-semibold ${
                choixMutuelle === 'DISPENSE' ? 'border-brand bg-[#EFF7F1]' : 'border-line'
              }`}
              onClick={() => setChoixMutuelle('DISPENSE')}
            >
              ✋ {t.dispense}
            </button>
          </div>
          {choixMutuelle === 'DISPENSE' && (
            <div>
              <label className="label">{t.motifDispense}</label>
              <select
                className="input"
                value={motifDispense}
                onChange={(e) => setMotifDispense(e.target.value)}
              >
                {props.motifsDispense.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}
          {choixMutuelle && (
            <>
              <p className="text-[13px] font-semibold">{t.lireEtSigner} :</p>
              <pre className="max-h-[240px] overflow-y-auto whitespace-pre-wrap rounded-card border border-line bg-paper p-3 font-sans text-[12.5px]">
                {choixMutuelle === 'ADHESION'
                  ? props.texteMutuelleAdhesion
                  : props.texteMutuelleDispense.replace('____________________', motifDispense)}
              </pre>
              <SignatureCanvas t={t} onChange={setSignatureMutuelle} />
              <button
                className="btn btn-green w-full"
                disabled={occupe || !signatureMutuelle}
                onClick={() =>
                  lancer(() => {
                    const fd = new FormData();
                    fd.set('token', props.token);
                    fd.set('choix', choixMutuelle);
                    fd.set('motif', choixMutuelle === 'DISPENSE' ? motifDispense : '');
                    fd.set('signature', signatureMutuelle!);
                    return signerMutuelle(fd);
                  }, suivant)
                }
              >
                {occupe ? t.envoi : `✍ ${t.signer}`}
              </button>
            </>
          )}
        </div>
      )}

      {/* —— 5. Contrat —— */}
      {etape === 4 && (
        <div className="card space-y-4 p-5">
          <p className="text-[13.5px] text-muted">{t.contratAide}</p>
          <b className="text-[14px]">{props.titreContrat}</b>
          <pre className="max-h-[320px] overflow-y-auto whitespace-pre-wrap rounded-card border border-line bg-paper p-3 font-sans text-[12.5px]">
            {props.texteContrat}
          </pre>
          <SignatureCanvas t={t} onChange={setSignatureContrat} />
          <button
            className="btn btn-green w-full"
            disabled={occupe || !signatureContrat}
            onClick={() =>
              lancer(() => {
                const fd = new FormData();
                fd.set('token', props.token);
                fd.set('signature', signatureContrat!);
                return signerContrat(fd);
              }, suivant)
            }
          >
            {occupe ? t.envoi : `✍ ${t.signer}`}
          </button>
        </div>
      )}

      {/* —— 6. Fin —— */}
      {etape >= ETAPES.length && (
        <div className="card p-8 text-center">
          <div className="text-[46px]">✅</div>
          <h2 className="mt-2 text-[20px] font-bold">{t.fini}</h2>
          <p className="mt-2 text-[14px] text-muted">{t.finiTexte}</p>
          {props.kiosque && (
            <a href="/admin/embauches" className="btn-sm btn-outline mt-5 inline-block">
              ← Retour aux dossiers (admin)
            </a>
          )}
        </div>
      )}
    </main>
  );
}
