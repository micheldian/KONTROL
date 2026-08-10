import 'server-only';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import type { ChecklistItem, StatutChecklist, TypeChecklist } from '@prisma/client';

// Dossier d'embauche (phase 18) : checklist + verrou de complétude.
// Le passage ACTIF n'est possible que checklist complète (règle 5), sauf
// forçage ADMIN motivé (statut FORCE, bannière rouge).

export const ORDRE_CHECKLIST: TypeChecklist[] = [
  'IDENTITE',
  'SECU',
  'IBAN',
  'MUTUELLE',
  'CONTRAT',
  'DPAE'
];

export const LIBELLES_CHECKLIST: Record<TypeChecklist, string> = {
  IDENTITE: 'Identité vérifiée',
  SECU: 'N° de sécurité sociale',
  IBAN: 'IBAN (recommandé, non bloquant)',
  MUTUELLE: 'Mutuelle (adhésion ou dispense signée)',
  CONTRAT: 'Contrat signé',
  DPAE: 'DPAE déposée'
};

/** IBAN non bloquant ; SECU validée aussi par le flag « immatriculation à demander ». */
export function itemRempli(item: Pick<ChecklistItem, 'type' | 'statut'>): boolean {
  if (item.type === 'IBAN') return true;
  return item.statut === 'FAIT' || item.statut === 'FLAG';
}

export function checklistComplete(items: Array<Pick<ChecklistItem, 'type' | 'statut'>>): boolean {
  return ORDRE_CHECKLIST.every((type) => {
    const item = items.find((i) => i.type === type);
    return item ? itemRempli(item) : type === 'IBAN';
  });
}

export function genererTokenOnboarding(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function delaiTokenJours(parametresOrg: unknown): number {
  const p = (parametresOrg as Record<string, unknown>) ?? {};
  const v = Number(p.delaiTokenOnboardingJours);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 7;
}

/** Résout un token de parcours distant : dossier EN_COURS non expiré. */
export async function dossierParToken(token: string) {
  if (!token || token.length < 20) return null;
  const dossier = await prisma.dossierEmbauche.findUnique({
    where: { tokenOnboarding: token },
    include: {
      user: true,
      organisation: true,
      modeleContrat: true,
      logement: true,
      checklist: true,
      documents: { select: { id: true, type: true, nomFichier: true, uploadeAt: true } }
    }
  });
  if (!dossier) return null;
  if (dossier.statut === 'ANNULE') return null;
  if (dossier.tokenExpireAt && dossier.tokenExpireAt < new Date()) return null;
  return dossier;
}

/** Coche/valorise un item puis recalcule le statut du dossier (COMPLET + completAt). */
export async function majChecklist(params: {
  dossierId: string;
  type: TypeChecklist;
  statut: StatutChecklist;
  detail?: string | null;
  faitParId?: string | null;
}) {
  await prisma.checklistItem.upsert({
    where: { dossierId_type: { dossierId: params.dossierId, type: params.type } },
    update: {
      statut: params.statut,
      detail: params.detail ?? null,
      faitAt: params.statut === 'A_FAIRE' ? null : new Date(),
      faitParId: params.faitParId ?? null
    },
    create: {
      dossierId: params.dossierId,
      type: params.type,
      statut: params.statut,
      detail: params.detail ?? null,
      faitAt: params.statut === 'A_FAIRE' ? null : new Date(),
      faitParId: params.faitParId ?? null
    }
  });

  const dossier = await prisma.dossierEmbauche.findUnique({
    where: { id: params.dossierId },
    include: { checklist: true }
  });
  if (!dossier || dossier.statut === 'ANNULE' || dossier.statut === 'FORCE') return dossier;

  const complet = checklistComplete(dossier.checklist);
  if (complet && dossier.statut !== 'COMPLET') {
    return prisma.dossierEmbauche.update({
      where: { id: dossier.id },
      data: { statut: 'COMPLET', completAt: new Date() },
      include: { checklist: true }
    });
  }
  if (!complet && dossier.statut === 'COMPLET') {
    return prisma.dossierEmbauche.update({
      where: { id: dossier.id },
      data: { statut: 'EN_COURS', completAt: null },
      include: { checklist: true }
    });
  }
  return dossier;
}

/**
 * Verrou de complétude (règle 5) : renvoie le dossier qui bloque le passage
 * en ACTIF, ou null si rien ne bloque. Les profils sans dossier d'embauche
 * (historique d'avant la phase 18) ne sont pas bloqués.
 */
export async function dossierBloquant(organisationId: string, userId: string) {
  const dossier = await prisma.dossierEmbauche.findFirst({
    where: { organisationId, userId, statut: 'EN_COURS' },
    include: { checklist: true },
    orderBy: { creeAt: 'desc' }
  });
  if (!dossier) return null;
  return checklistComplete(dossier.checklist) ? null : dossier;
}

export function manquants(items: Array<Pick<ChecklistItem, 'type' | 'statut'>>): TypeChecklist[] {
  return ORDRE_CHECKLIST.filter((type) => {
    if (type === 'IBAN') return false;
    const item = items.find((i) => i.type === type);
    return !item || !itemRempli(item);
  });
}

// ————— Message d'envoi du lien (trilingue, wa.me / Telegram) —————

export function messageLienOnboarding(params: {
  langue: string;
  organisation: string;
  prenom: string;
  lien: string;
  jours: number;
}): string {
  const { organisation, prenom, lien, jours } = params;
  if (params.langue === 'RO') {
    return `Bună ${prenom}! ${organisation} îți pregătește angajarea. Completează dosarul tău (acte, contract, semnătură) direct de pe telefon — durează ~5 minute: ${lien}\nLinkul este valabil ${jours} zile.`;
  }
  if (params.langue === 'ES') {
    return `¡Hola ${prenom}! ${organisation} está preparando tu contratación. Completa tu expediente (documentos, contrato, firma) desde tu móvil — ~5 minutos: ${lien}\nEl enlace es válido ${jours} días.`;
  }
  return `Bonjour ${prenom} ! ${organisation} prépare votre embauche. Complétez votre dossier (documents, contrat, signature) depuis votre téléphone — ~5 minutes : ${lien}\nLien valable ${jours} jours.`;
}
