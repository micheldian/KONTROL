'use server';

// Parcours d'embauche (phase 18) — actions token-based : aucune session requise
// (mode distant). Si une session ADMIN/MANAGER est présente sur l'appareil
// (mode kiosque), chaque étape trace l'admin accompagnant. Règle 2 : c'est
// toujours l'ouvrier qui signe, jamais l'admin à sa place.

import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import { audit } from '@/lib/audit';
import { dateFromYMD, formatDate, ymd } from '@/lib/dates';
import {
  enregistrerDocument,
  chiffreChamp,
  sha256Hex
} from '@/lib/documents';
import {
  cleOcr,
  ocrPieceIdentite,
  ocrCarteVitale,
  ocrRib,
  ibanValide,
  numeroSecuValide,
  type OcrIdentite
} from '@/lib/ocr';
import { dossierParToken, majChecklist } from '@/lib/embauche';
import {
  rendreTemplate,
  variablesDossier,
  MODELE_CONTRAT_DEFAUT,
  MODELE_MUTUELLE_ADHESION_DEFAUT,
  MODELE_MUTUELLE_DISPENSE_DEFAUT
} from '@/lib/contrats';
import { renderDocumentSignePdf } from '@/lib/pdf/document-signe-pdf';

type Reponse<T = object> = ({ ok: true } & T) | { ok: false; erreur: string };

async function contexte(token: string) {
  const dossier = await dossierParToken(token);
  if (!dossier) return null;
  // Kiosque : une session back-office est ouverte sur l'appareil qui déroule le parcours
  const session = await getSessionUser().catch(() => null);
  const admin =
    session && (session.role === 'ADMIN' || session.role === 'MANAGER') ? session : null;
  const h = headers();
  return {
    dossier,
    admin,
    appareil: (h.get('user-agent') ?? '').slice(0, 300),
    ip: (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null
  };
}

/** Mode du dossier : DISTANT/KIOSQUE, MIXTE si les deux ont servi. */
async function traceMode(dossierId: string, modeActuel: string, kiosque: boolean) {
  const nouveau = kiosque
    ? modeActuel === 'DISTANT' || modeActuel === 'MIXTE'
      ? 'MIXTE'
      : 'KIOSQUE'
    : modeActuel === 'KIOSQUE' || modeActuel === 'MIXTE'
      ? 'MIXTE'
      : 'DISTANT';
  if (nouveau !== modeActuel) {
    await prisma.dossierEmbauche.update({
      where: { id: dossierId },
      data: { mode: nouveau as 'DISTANT' | 'KIOSQUE' | 'MIXTE' }
    });
  }
}

async function fichierEnBuffer(fichier: unknown): Promise<{ buffer: Buffer; mime: string } | null> {
  if (!(fichier instanceof File) || fichier.size === 0) return null;
  const mime = fichier.type || 'image/jpeg';
  if (!/^image\/(jpeg|png|webp)$/.test(mime) && mime !== 'application/pdf') return null;
  return { buffer: Buffer.from(await fichier.arrayBuffer()), mime };
}

// ————— Étape 1 : pièce d'identité —————

export async function analyserIdentite(formData: FormData): Promise<Reponse<{
  champs: OcrIdentite;
  statutOcr: string;
}>> {
  const ctx = await contexte(formData.get('token') as string);
  if (!ctx) return { ok: false, erreur: 'Lien invalide ou expiré' };
  const { dossier } = ctx;

  const recto = await fichierEnBuffer(formData.get('recto'));
  if (!recto) return { ok: false, erreur: 'Photo recto manquante ou format non accepté' };
  const verso = await fichierEnBuffer(formData.get('verso'));

  const cle = cleOcr(dossier.organisation.parametres);
  const resultat = await ocrPieceIdentite(recto.buffer.toString('base64'), recto.mime, cle);
  let champs = resultat.champs;
  // Le verso porte parfois l'adresse (CNI) — on complète si le recto ne suffit pas
  if (verso && (!champs.adresse || !champs.dateExpiration)) {
    const dos = await ocrPieceIdentite(verso.buffer.toString('base64'), verso.mime, cle);
    champs = { ...dos.champs, ...champs, adresse: champs.adresse ?? dos.champs.adresse };
  }

  await enregistrerDocument({
    organisationId: dossier.organisationId,
    userId: dossier.userId,
    dossierId: dossier.id,
    type: 'ID_RECTO',
    nomFichier: `piece-identite-recto.jpg`,
    mimeType: recto.mime,
    contenu: recto.buffer,
    ocrData: { statut: resultat.statut, champs },
    uploadeParId: ctx.admin?.userId ?? null
  });
  if (verso) {
    await enregistrerDocument({
      organisationId: dossier.organisationId,
      userId: dossier.userId,
      dossierId: dossier.id,
      type: 'ID_VERSO',
      nomFichier: `piece-identite-verso.jpg`,
      mimeType: verso.mime,
      contenu: verso.buffer,
      uploadeParId: ctx.admin?.userId ?? null
    });
  }
  await traceMode(dossier.id, dossier.mode, !!ctx.admin);

  // Pré-remplissage avec l'existant si l'OCR n'a rien lu (règle 1 : l'humain confirme)
  champs.nom = champs.nom ?? dossier.user.nom;
  champs.prenoms = champs.prenoms ?? dossier.user.prenom;
  return { ok: true, champs, statutOcr: resultat.statut };
}

export async function confirmerIdentite(formData: FormData): Promise<Reponse<{
  alerteExpiration: string | null;
}>> {
  const ctx = await contexte(formData.get('token') as string);
  if (!ctx) return { ok: false, erreur: 'Lien invalide ou expiré' };
  const { dossier } = ctx;

  const champ = (n: string) => ((formData.get(n) as string) || '').trim();
  const nom = champ('nom');
  const prenoms = champ('prenoms');
  const dateNaissance = champ('dateNaissance');
  const adresse = champ('adresse');
  if (!nom || !prenoms) return { ok: false, erreur: 'Nom et prénom obligatoires' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateNaissance)) {
    return { ok: false, erreur: 'Date de naissance invalide' };
  }
  if (!adresse) return { ok: false, erreur: 'Adresse obligatoire (saisissez-la si absente du document)' };
  const dateExpiration = champ('dateExpiration');
  const expireAt = /^\d{4}-\d{2}-\d{2}$/.test(dateExpiration) ? dateFromYMD(dateExpiration) : null;

  await prisma.user.update({
    where: { id: dossier.userId },
    data: {
      nom,
      prenom: prenoms,
      dateNaissance: dateFromYMD(dateNaissance),
      lieuNaissance: champ('lieuNaissance') || null,
      nationalite: champ('nationalite') || null,
      adresse,
      pieceIdentiteExpireAt: expireAt
    }
  });
  if (expireAt) {
    await prisma.documentOuvrier.updateMany({
      where: { dossierId: dossier.id, type: { in: ['ID_RECTO', 'ID_VERSO'] } },
      data: { expireAt }
    });
  }

  // Alerte si le document expire avant la fin du contrat (règle 6)
  let alerteExpiration: string | null = null;
  const reference = dossier.dateFinPrevue ?? dossier.dateDebut;
  if (expireAt && expireAt < new Date()) {
    alerteExpiration = 'Document EXPIRÉ';
  } else if (expireAt && reference && expireAt < reference) {
    alerteExpiration = `Document expirant le ${formatDate(ymd(expireAt))}, avant la fin du contrat`;
  }

  await majChecklist({
    dossierId: dossier.id,
    type: 'IDENTITE',
    statut: 'FAIT',
    detail:
      [champ('typeDocument'), champ('numeroDocument')].filter(Boolean).join(' ') +
      (alerteExpiration ? ` — ⚠ ${alerteExpiration}` : ''),
    faitParId: ctx.admin?.userId ?? null
  });
  await audit({
    organisationId: dossier.organisationId,
    userId: ctx.admin?.userId ?? dossier.userId,
    action: 'embauche.identite',
    entite: 'DossierEmbauche',
    entiteId: dossier.id,
    apres: { nom, prenoms, kiosque: !!ctx.admin }
  });
  return { ok: true, alerteExpiration };
}

// ————— Étape 2 : numéro de sécurité sociale —————

export async function analyserVitale(formData: FormData): Promise<Reponse<{
  numeroSecu: string;
  statutOcr: string;
}>> {
  const ctx = await contexte(formData.get('token') as string);
  if (!ctx) return { ok: false, erreur: 'Lien invalide ou expiré' };
  const photo = await fichierEnBuffer(formData.get('photo'));
  if (!photo) return { ok: false, erreur: 'Photo manquante' };

  const resultat = await ocrCarteVitale(
    photo.buffer.toString('base64'),
    photo.mime,
    cleOcr(ctx.dossier.organisation.parametres)
  );
  await enregistrerDocument({
    organisationId: ctx.dossier.organisationId,
    userId: ctx.dossier.userId,
    dossierId: ctx.dossier.id,
    type: 'CARTE_VITALE',
    nomFichier: 'carte-vitale.jpg',
    mimeType: photo.mime,
    contenu: photo.buffer,
    ocrData: { statut: resultat.statut, champs: resultat.champs },
    uploadeParId: ctx.admin?.userId ?? null
  });
  return { ok: true, numeroSecu: resultat.champs.numeroSecu ?? '', statutOcr: resultat.statut };
}

export async function confirmerSecu(formData: FormData): Promise<Reponse> {
  const ctx = await contexte(formData.get('token') as string);
  if (!ctx) return { ok: false, erreur: 'Lien invalide ou expiré' };
  const { dossier } = ctx;

  const pasImmatricule = formData.get('pasImmatricule') === '1';
  if (pasImmatricule) {
    await prisma.user.update({
      where: { id: dossier.userId },
      data: { immatriculationEnCours: true, numeroSecu: null }
    });
    await majChecklist({
      dossierId: dossier.id,
      type: 'SECU',
      statut: 'FLAG',
      detail: 'Pas encore immatriculé — immatriculation MSA à demander',
      faitParId: ctx.admin?.userId ?? null
    });
    return { ok: true };
  }

  const numero = ((formData.get('numeroSecu') as string) || '').replace(/\s/g, '');
  if (!numeroSecuValide(numero)) {
    return { ok: false, erreur: 'Numéro invalide (13 chiffres, ou 15 avec la clé)' };
  }
  await prisma.user.update({
    where: { id: dossier.userId },
    data: { numeroSecu: chiffreChamp(numero), immatriculationEnCours: false }
  });
  await majChecklist({
    dossierId: dossier.id,
    type: 'SECU',
    statut: 'FAIT',
    faitParId: ctx.admin?.userId ?? null
  });
  await traceMode(dossier.id, dossier.mode, !!ctx.admin);
  return { ok: true };
}

// ————— Étape 3 : IBAN (facultatif) —————

export async function analyserRib(formData: FormData): Promise<Reponse<{
  iban: string;
  statutOcr: string;
}>> {
  const ctx = await contexte(formData.get('token') as string);
  if (!ctx) return { ok: false, erreur: 'Lien invalide ou expiré' };
  const photo = await fichierEnBuffer(formData.get('photo'));
  if (!photo) return { ok: false, erreur: 'Photo manquante' };

  const resultat = await ocrRib(
    photo.buffer.toString('base64'),
    photo.mime,
    cleOcr(ctx.dossier.organisation.parametres)
  );
  await enregistrerDocument({
    organisationId: ctx.dossier.organisationId,
    userId: ctx.dossier.userId,
    dossierId: ctx.dossier.id,
    type: 'RIB',
    nomFichier: 'rib.jpg',
    mimeType: photo.mime,
    contenu: photo.buffer,
    ocrData: { statut: resultat.statut, champs: resultat.champs },
    uploadeParId: ctx.admin?.userId ?? null
  });
  return { ok: true, iban: resultat.champs.iban ?? '', statutOcr: resultat.statut };
}

export async function confirmerIban(formData: FormData): Promise<Reponse> {
  const ctx = await contexte(formData.get('token') as string);
  if (!ctx) return { ok: false, erreur: 'Lien invalide ou expiré' };
  const { dossier } = ctx;

  if (formData.get('passer') === '1') {
    await majChecklist({
      dossierId: dossier.id,
      type: 'IBAN',
      statut: 'NON_BLOQUANT',
      detail: 'Non fourni — paiement espèces uniquement',
      faitParId: ctx.admin?.userId ?? null
    });
    return { ok: true };
  }
  const iban = ((formData.get('iban') as string) || '').replace(/\s/g, '').toUpperCase();
  if (!ibanValide(iban)) return { ok: false, erreur: 'IBAN invalide' };
  await prisma.user.update({ where: { id: dossier.userId }, data: { iban } });
  await majChecklist({
    dossierId: dossier.id,
    type: 'IBAN',
    statut: 'FAIT',
    faitParId: ctx.admin?.userId ?? null
  });
  return { ok: true };
}

// ————— Étapes 4 & 5 : documents signés (mutuelle, contrat) —————

function signatureValide(dataUrl: string): boolean {
  return /^data:image\/png;base64,[A-Za-z0-9+/=]{100,200000}$/.test(dataUrl);
}

async function genererDocumentSigne(params: {
  ctx: NonNullable<Awaited<ReturnType<typeof contexte>>>;
  titre: string;
  texte: string;
  type: 'CONTRAT_SIGNE' | 'MUTUELLE_ADHESION' | 'MUTUELLE_DISPENSE';
  nomFichier: string;
  signature: string;
}) {
  const { ctx, titre, texte, type, nomFichier, signature } = params;
  const { dossier } = ctx;
  const horodatage = new Date();

  const pdf = await renderDocumentSignePdf({
    titre,
    organisation: dossier.organisation.nom,
    texte,
    imageSignature: signature,
    traca: {
      signataire: `${dossier.user.prenom} ${dossier.user.nom}`,
      telephone: dossier.user.telephone,
      horodatage: horodatage.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
      mode: ctx.admin ? 'KIOSQUE' : 'DISTANT',
      appareil: ctx.appareil,
      ipAdresse: ctx.ip,
      adminAccompagnant: ctx.admin ? ctx.admin.name : null,
      hashContenu: sha256Hex(Buffer.from(texte, 'utf8'))
    }
  });

  const document = await enregistrerDocument({
    organisationId: dossier.organisationId,
    userId: dossier.userId,
    dossierId: dossier.id,
    type,
    nomFichier,
    mimeType: 'application/pdf',
    contenu: pdf,
    uploadeParId: ctx.admin?.userId ?? null
  });
  await prisma.signatureElec.create({
    data: {
      documentId: document.id,
      signataireUserId: dossier.userId,
      imageSignature: signature,
      horodatage,
      ipAdresse: ctx.ip,
      appareil: ctx.appareil,
      modeKiosque: !!ctx.admin,
      adminAccompagnantId: ctx.admin?.userId ?? null
    }
  });
  await traceMode(dossier.id, dossier.mode, !!ctx.admin);
  return document;
}

export async function signerMutuelle(formData: FormData): Promise<Reponse> {
  const ctx = await contexte(formData.get('token') as string);
  if (!ctx) return { ok: false, erreur: 'Lien invalide ou expiré' };
  const { dossier } = ctx;

  const choix = formData.get('choix') as string;
  const motif = ((formData.get('motif') as string) || '').trim();
  const signature = (formData.get('signature') as string) || '';
  if (!['ADHESION', 'DISPENSE'].includes(choix)) return { ok: false, erreur: 'Choix invalide' };
  if (choix === 'DISPENSE' && !motif) return { ok: false, erreur: 'Motif de dispense obligatoire' };
  if (!signatureValide(signature)) return { ok: false, erreur: 'Signature manquante' };

  const modele = await prisma.modeleContrat.findFirst({
    where: {
      organisationId: dossier.organisationId,
      categorie: choix === 'ADHESION' ? 'MUTUELLE_ADHESION' : 'MUTUELLE_DISPENSE',
      actif: true
    },
    orderBy: { createdAt: 'desc' }
  });
  const template =
    modele?.contenuTemplate ??
    (choix === 'ADHESION' ? MODELE_MUTUELLE_ADHESION_DEFAUT : MODELE_MUTUELLE_DISPENSE_DEFAUT);
  const texte = rendreTemplate(template, {
    ...variablesDossier({
      dossier,
      ouvrier: dossier.user,
      organisation: dossier.organisation,
      logement: dossier.logement
    }),
    motifDispense: motif
  });

  await genererDocumentSigne({
    ctx,
    titre: choix === 'ADHESION' ? 'Mutuelle — bulletin d’adhésion' : 'Mutuelle — dispense d’adhésion',
    texte,
    type: choix === 'ADHESION' ? 'MUTUELLE_ADHESION' : 'MUTUELLE_DISPENSE',
    nomFichier: choix === 'ADHESION' ? 'mutuelle-adhesion.pdf' : 'mutuelle-dispense.pdf',
    signature
  });
  await majChecklist({
    dossierId: dossier.id,
    type: 'MUTUELLE',
    statut: 'FAIT',
    detail: choix === 'ADHESION' ? 'Adhésion' : `Dispense — ${motif}`,
    faitParId: ctx.admin?.userId ?? null
  });
  await audit({
    organisationId: dossier.organisationId,
    userId: ctx.admin?.userId ?? dossier.userId,
    action: 'embauche.mutuelle',
    entite: 'DossierEmbauche',
    entiteId: dossier.id,
    apres: { choix, motif, kiosque: !!ctx.admin }
  });
  return { ok: true };
}

export async function signerContrat(formData: FormData): Promise<Reponse> {
  const ctx = await contexte(formData.get('token') as string);
  if (!ctx) return { ok: false, erreur: 'Lien invalide ou expiré' };
  const { dossier } = ctx;

  const signature = (formData.get('signature') as string) || '';
  if (!signatureValide(signature)) return { ok: false, erreur: 'Signature manquante' };

  const template = dossier.modeleContrat?.contenuTemplate ?? MODELE_CONTRAT_DEFAUT;
  const texte = rendreTemplate(
    template,
    variablesDossier({
      dossier,
      ouvrier: dossier.user,
      organisation: dossier.organisation,
      logement: dossier.logement
    })
  );

  await genererDocumentSigne({
    ctx,
    titre: dossier.modeleContrat?.nom ?? 'Contrat de travail saisonnier',
    texte,
    type: 'CONTRAT_SIGNE',
    nomFichier: 'contrat-signe.pdf',
    signature
  });
  await majChecklist({
    dossierId: dossier.id,
    type: 'CONTRAT',
    statut: 'FAIT',
    detail: dossier.modeleContrat?.nom ?? 'Modèle par défaut',
    faitParId: ctx.admin?.userId ?? null
  });
  await audit({
    organisationId: dossier.organisationId,
    userId: ctx.admin?.userId ?? dossier.userId,
    action: 'embauche.contrat.signe',
    entite: 'DossierEmbauche',
    entiteId: dossier.id,
    apres: { kiosque: !!ctx.admin }
  });
  return { ok: true };
}
