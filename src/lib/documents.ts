import 'server-only';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import type { TypeDocument } from '@prisma/client';

// Coffre-fort documentaire (phase 18) : les fichiers et le numéro de sécurité
// sociale sont chiffrés au repos (AES-256-GCM). Clé : DOCUMENTS_ENCRYPTION_KEY
// (base64, 32 octets) ou, à défaut, dérivée de NEXTAUTH_SECRET — les documents
// deviennent illisibles si ces secrets changent.

let cleCache: Buffer | null = null;
function cle(): Buffer {
  if (cleCache) return cleCache;
  const explicite = process.env.DOCUMENTS_ENCRYPTION_KEY;
  if (explicite) {
    const k = Buffer.from(explicite, 'base64');
    if (k.length !== 32) throw new Error('DOCUMENTS_ENCRYPTION_KEY doit faire 32 octets (base64)');
    cleCache = k;
  } else {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) throw new Error('NEXTAUTH_SECRET requis pour chiffrer les documents');
    cleCache = crypto.scryptSync(secret, 'krontrol-documents-v1', 32);
  }
  return cleCache;
}

/** [iv 12 | tag 16 | données chiffrées] */
export function chiffre(donnees: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', cle(), iv);
  const chiffre = Buffer.concat([cipher.update(donnees), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), chiffre]);
}

export function dechiffre(blob: Buffer): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', cle(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]);
}

/** Champ texte sensible (numéro de sécu) : préfixe enc1: + base64. */
export function chiffreChamp(texte: string): string {
  return 'enc1:' + chiffre(Buffer.from(texte, 'utf8')).toString('base64');
}

export function dechiffreChamp(valeur: string | null | undefined): string | null {
  if (!valeur) return null;
  if (!valeur.startsWith('enc1:')) return valeur; // valeur historique en clair
  try {
    return dechiffre(Buffer.from(valeur.slice(5), 'base64')).toString('utf8');
  } catch {
    return null;
  }
}

export function sha256Hex(donnees: Buffer): string {
  return crypto.createHash('sha256').update(donnees).digest('hex');
}

const TAILLE_MAX = 4 * 1024 * 1024; // 4 Mo après compression côté client

/**
 * Archive un document (chiffré). Si un document du même type existe déjà sur le
 * même dossier (re-prise de photo pendant l'onboarding), il est remplacé.
 */
export async function enregistrerDocument(params: {
  organisationId: string;
  userId: string;
  dossierId?: string | null;
  type: TypeDocument;
  nomFichier: string;
  mimeType: string;
  contenu: Buffer;
  ocrData?: unknown;
  expireAt?: Date | null;
  uploadeParId?: string | null;
}) {
  if (params.contenu.length === 0) throw new Error('Fichier vide');
  if (params.contenu.length > TAILLE_MAX) throw new Error('Fichier trop volumineux (4 Mo max)');

  if (params.dossierId) {
    await prisma.documentOuvrier.deleteMany({
      where: { dossierId: params.dossierId, type: params.type }
    });
  }
  return prisma.documentOuvrier.create({
    data: {
      organisationId: params.organisationId,
      userId: params.userId,
      dossierId: params.dossierId ?? null,
      type: params.type,
      nomFichier: params.nomFichier,
      mimeType: params.mimeType,
      taille: params.contenu.length,
      contenu: new Uint8Array(chiffre(params.contenu)),
      hashSha256: sha256Hex(params.contenu),
      ocrData: params.ocrData === undefined ? undefined : (params.ocrData as object),
      expireAt: params.expireAt ?? null,
      uploadeParId: params.uploadeParId ?? null
    }
  });
}

/** Lit et déchiffre un document ; chaque consultation admin est journalisée (règle 7). */
export async function lireDocument(params: {
  documentId: string;
  organisationId: string;
  consulteParId?: string | null;
}) {
  const doc = await prisma.documentOuvrier.findFirst({
    where: { id: params.documentId, organisationId: params.organisationId }
  });
  if (!doc) return null;
  if (params.consulteParId) {
    await audit({
      organisationId: params.organisationId,
      userId: params.consulteParId,
      action: 'document.consulter',
      entite: 'DocumentOuvrier',
      entiteId: doc.id,
      apres: { type: doc.type, ouvrier: doc.userId }
    });
  }
  return { ...doc, contenuClair: dechiffre(Buffer.from(doc.contenu)) };
}

export const LIBELLES_DOCUMENT: Record<TypeDocument, string> = {
  ID_RECTO: 'Pièce d’identité (recto)',
  ID_VERSO: 'Pièce d’identité (verso)',
  CARTE_VITALE: 'Carte vitale',
  RIB: 'RIB',
  CONTRAT_SIGNE: 'Contrat signé',
  MUTUELLE_ADHESION: 'Mutuelle — adhésion signée',
  MUTUELLE_DISPENSE: 'Mutuelle — dispense signée',
  DPAE_RECEPISSE: 'Récépissé DPAE',
  AUTRE: 'Autre document'
};
