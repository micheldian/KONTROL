'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireAdminStrict } from '@/lib/session';
import { audit } from '@/lib/audit';
import { recapMois } from '@/lib/money';
import { ymd } from '@/lib/dates';
import {
  TelegramChannel,
  WhatsAppLinkChannel,
  envoyerEtJournaliser,
  telegramToken
} from '@/lib/messaging/channel';
import { renduTemplate, type LangueCode } from '@/lib/messaging/templates';

/** Clôture le mois d'un ouvrier : snapshot immuable, uniquement les heures validées. */
async function cloturerUn(params: {
  organisationId: string;
  adminId: string;
  ouvrierId: string;
  mois: number;
  annee: number;
}): Promise<{ ok: boolean; raison?: string }> {
  const { organisationId, adminId, ouvrierId, mois, annee } = params;

  const existante = await prisma.clotureMois.findUnique({
    where: {
      organisationId_userId_mois_annee: {
        organisationId,
        userId: ouvrierId,
        mois,
        annee
      }
    }
  });
  if (existante && existante.statut === 'CLOTUREE') {
    return { ok: false, raison: 'déjà clôturé' };
  }

  const recap = await recapMois({ organisationId, userId: ouvrierId, mois, annee });
  if (recap.heuresEnAttente > 0) {
    return {
      ok: false,
      raison: `${recap.heuresEnAttente} h en attente de validation — valider ou corriger d'abord`
    };
  }

  const donnees = {
    lignesHeures: recap.lignesHeures,
    acomptes: recap.acomptes.map((a) => ({
      date: ymd(a.date),
      montant: a.montant,
      mode: a.mode
    })),
    logement: recap.logement,
    retenues: recap.retenues.map((r) => ({
      date: ymd(r.date),
      libelle: r.libelle,
      montant: r.montant
    })),
    net: recap.net
  };

  const data = {
    totalHeures: recap.totalHeuresValidees,
    totalBrut: recap.totalBrut,
    totalAcomptes: recap.totalAcomptes,
    totalLogement: recap.logement.total,
    totalRetenues: recap.totalRetenues,
    netAVerser: recap.net,
    donnees,
    statut: 'CLOTUREE' as const,
    clotureAt: new Date(),
    clotureParId: adminId
  };

  const cloture = existante
    ? await prisma.clotureMois.update({ where: { id: existante.id }, data })
    : await prisma.clotureMois.create({
        data: {
          ...data,
          organisationId,
          userId: ouvrierId,
          mois,
          annee,
          pdfUrl: null
        }
      });

  await prisma.clotureMois.update({
    where: { id: cloture.id },
    data: { pdfUrl: `/api/clotures/${cloture.id}/pdf` }
  });

  await audit({
    organisationId,
    userId: adminId,
    action: existante ? 'cloture.recloturer' : 'cloture.creer',
    entite: 'ClotureMois',
    entiteId: cloture.id,
    apres: { ouvrierId, mois, annee, net: recap.net }
  });
  return { ok: true };
}

export async function cloturerOuvrier(formData: FormData) {
  const user = await requireAdmin();
  const ouvrierId = formData.get('ouvrierId') as string;
  const mois = Number(formData.get('mois'));
  const annee = Number(formData.get('annee'));

  const ouvrier = await prisma.user.findFirst({
    where: { id: ouvrierId, organisationId: user.organisationId }
  });
  if (!ouvrier) throw new Error('Ouvrier introuvable');

  const res = await cloturerUn({
    organisationId: user.organisationId,
    adminId: user.userId,
    ouvrierId,
    mois,
    annee
  });
  const moisStr = `${annee}-${String(mois).padStart(2, '0')}`;
  revalidatePath('/admin/clotures');
  redirect(
    res.ok
      ? `/admin/clotures?mois=${moisStr}`
      : `/admin/clotures?mois=${moisStr}&erreur=${encodeURIComponent(
          `${ouvrier.prenom} ${ouvrier.nom} : ${res.raison}`
        )}`
  );
}

/** Clôture en masse : tous les ouvriers avec de l'activité sur le mois. */
export async function cloturerEnMasse(formData: FormData) {
  const user = await requireAdmin();
  const mois = Number(formData.get('mois'));
  const annee = Number(formData.get('annee'));
  const ouvrierIds = formData.getAll('ouvrierIds').map(String);

  let ok = 0;
  const echecs: string[] = [];
  for (const ouvrierId of ouvrierIds) {
    const ouvrier = await prisma.user.findFirst({
      where: { id: ouvrierId, organisationId: user.organisationId }
    });
    if (!ouvrier) continue;
    const res = await cloturerUn({
      organisationId: user.organisationId,
      adminId: user.userId,
      ouvrierId,
      mois,
      annee
    });
    if (res.ok) ok++;
    else echecs.push(`${ouvrier.prenom} ${ouvrier.nom} (${res.raison})`);
  }

  const moisStr = `${annee}-${String(mois).padStart(2, '0')}`;
  revalidatePath('/admin/clotures');
  redirect(
    echecs.length
      ? `/admin/clotures?mois=${moisStr}&erreur=${encodeURIComponent(
          `${ok} clôturé(s) · non clôturés : ${echecs.join(' · ')}`
        )}`
      : `/admin/clotures?mois=${moisStr}`
  );
}

/** Enregistre le versement du solde (mode + date) — règle 4.9. */
export async function enregistrerVersement(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const mode = formData.get('mode') as 'ESPECES' | 'VIREMENT';
  if (!['ESPECES', 'VIREMENT'].includes(mode)) throw new Error('Mode invalide');

  const cloture = await prisma.clotureMois.findFirst({
    where: { id, organisationId: user.organisationId, statut: 'CLOTUREE' }
  });
  if (!cloture) throw new Error('Clôture introuvable');

  await prisma.clotureMois.update({
    where: { id },
    data: { modeVersement: mode, verseAt: new Date() }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'cloture.versement',
    entite: 'ClotureMois',
    entiteId: id,
    apres: { mode }
  });
  revalidatePath('/admin/clotures');
}

/** Réouverture — ADMIN uniquement, tracée (règle 8). */
export async function rouvrirCloture(formData: FormData) {
  const user = await requireAdminStrict();
  const id = formData.get('id') as string;
  const cloture = await prisma.clotureMois.findFirst({
    where: { id, organisationId: user.organisationId, statut: 'CLOTUREE' }
  });
  if (!cloture) throw new Error('Clôture introuvable');

  await prisma.clotureMois.update({ where: { id }, data: { statut: 'ROUVERTE' } });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'cloture.rouvrir',
    entite: 'ClotureMois',
    entiteId: id,
    avant: { statut: 'CLOTUREE', net: cloture.netAVerser }
  });
  revalidatePath('/admin/clotures');
}

const MOIS_NOMS: Record<string, string[]> = {
  FR: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  RO: ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'],
  ES: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
};

/** Envoie le récap par Telegram (ou journalise wa.me) — spec 4.9. */
export async function envoyerRecap(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const canal = formData.get('canal') as 'TELEGRAM' | 'WHATSAPP';

  const cloture = await prisma.clotureMois.findFirst({
    where: { id, organisationId: user.organisationId },
    include: { user: true, organisation: true }
  });
  if (!cloture) throw new Error('Clôture introuvable');

  const langue = cloture.user.langue as LangueCode;
  const contenu = renduTemplate(
    'RECAP',
    langue,
    {
      prenom: cloture.user.prenom,
      mois: `${MOIS_NOMS[langue]?.[cloture.mois - 1] ?? cloture.mois} ${cloture.annee}`,
      net: `${Number(cloture.netAVerser).toFixed(2).replace('.', ',')} €`,
      organisation: cloture.organisation.nom
    },
    (cloture.organisation.parametres as { templates?: unknown })?.templates
  );

  await envoyerEtJournaliser({
    organisationId: user.organisationId,
    canal,
    contexte: 'RECAP',
    destinataire: {
      id: cloture.user.id,
      telephone: cloture.user.telephone,
      telegramChatId: cloture.user.telegramChatId
    },
    contenu,
    clotureId: cloture.id,
    channel:
      canal === 'TELEGRAM'
        ? new TelegramChannel(telegramToken(cloture.organisation.parametres))
        : new WhatsAppLinkChannel()
  });
  revalidatePath('/admin/clotures');
}
