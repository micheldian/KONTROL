'use server';

// Demandes de main-d'œuvre (spec §D.1) : CRUD + notification des recruteurs.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { audit } from '@/lib/audit';
import { dateFromYMD, ymd, formatDate } from '@/lib/dates';
import { parametresRecrutement } from '@/lib/recruteurs';
import {
  TelegramChannel,
  envoyerEtJournaliser,
  telegramToken
} from '@/lib/messaging/channel';
import { renduTemplate, type LangueCode } from '@/lib/messaging/templates';

const demandeSchema = z.object({
  titre: z.string().trim().min(1),
  nbPersonnes: z.coerce.number().int().min(1),
  dateDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateFin: z.string().optional(),
  region: z.string().trim().optional(),
  description: z.string().trim().optional(),
  conditions: z.string().trim().optional(),
  commissionParPlacement: z.string().optional()
});

export async function saveDemande(formData: FormData) {
  const user = await requireAdmin();
  const id = (formData.get('id') as string) || null;
  let erreur: string | null = null;
  try {
    const parsed = demandeSchema.parse(Object.fromEntries(formData.entries()));
    const tagIds = formData.getAll('tagIds').map(String).filter(Boolean);

    const org = await prisma.organisation.findUnique({ where: { id: user.organisationId } });
    const params = parametresRecrutement(org?.parametres);
    const commission = parsed.commissionParPlacement
      ? Number(parsed.commissionParPlacement)
      : params.commissionDefaut;
    if (!Number.isFinite(commission) || commission < 0) throw new Error('Commission invalide');

    const tagsValides = await prisma.competenceTag.findMany({
      where: { id: { in: tagIds }, organisationId: user.organisationId }
    });

    const data = {
      titre: parsed.titre,
      nbPersonnes: parsed.nbPersonnes,
      dateDebut: dateFromYMD(parsed.dateDebut),
      dateFin: parsed.dateFin ? dateFromYMD(parsed.dateFin) : null,
      region: parsed.region || null,
      description: parsed.description || null,
      conditions: parsed.conditions || null,
      commissionParPlacement: commission
    };

    if (id) {
      const existante = await prisma.demandeMainOeuvre.findFirst({
        where: { id, organisationId: user.organisationId }
      });
      if (!existante) throw new Error('Demande introuvable');
      await prisma.demandeMainOeuvre.update({ where: { id }, data });
      await prisma.demandeCompetence.deleteMany({ where: { demandeId: id } });
      await prisma.demandeCompetence.createMany({
        data: tagsValides.map((t) => ({ demandeId: id, tagId: t.id }))
      });
      await audit({
        organisationId: user.organisationId,
        userId: user.userId,
        action: 'demande.update',
        entite: 'DemandeMainOeuvre',
        entiteId: id,
        apres: data
      });
    } else {
      const creee = await prisma.demandeMainOeuvre.create({
        data: {
          ...data,
          organisationId: user.organisationId,
          creeParId: user.userId,
          competences: { create: tagsValides.map((t) => ({ tagId: t.id })) }
        }
      });
      await audit({
        organisationId: user.organisationId,
        userId: user.userId,
        action: 'demande.create',
        entite: 'DemandeMainOeuvre',
        entiteId: creee.id,
        apres: data
      });
      revalidatePath('/admin/demandes');
      redirect(`/admin/demandes/${creee.id}/notifier?creee=1`);
    }
  } catch (e) {
    if ((e as { digest?: string })?.digest?.toString().startsWith('NEXT_REDIRECT')) throw e;
    erreur = e instanceof Error ? e.message : 'Erreur inattendue';
  }
  revalidatePath('/admin/demandes');
  redirect(erreur ? `/admin/demandes?erreur=${encodeURIComponent(erreur)}` : '/admin/demandes');
}

export async function changerStatutDemande(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const statut = formData.get('statut') as 'OUVERTE' | 'POURVUE' | 'FERMEE';
  if (!['OUVERTE', 'POURVUE', 'FERMEE'].includes(statut)) throw new Error('Statut invalide');

  const demande = await prisma.demandeMainOeuvre.findFirst({
    where: { id, organisationId: user.organisationId }
  });
  if (!demande) throw new Error('Demande introuvable');
  await prisma.demandeMainOeuvre.update({ where: { id }, data: { statut } });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'demande.statut',
    entite: 'DemandeMainOeuvre',
    entiteId: id,
    avant: { statut: demande.statut },
    apres: { statut }
  });
  revalidatePath('/admin/demandes');
}

/** Notification Telegram automatique à tous les recruteurs actifs (spec §D.1). */
export async function notifierRecruteursTelegram(formData: FormData) {
  const user = await requireAdmin();
  const demandeId = formData.get('demandeId') as string;

  const [demande, org, recruteurs] = await Promise.all([
    prisma.demandeMainOeuvre.findFirst({
      where: { id: demandeId, organisationId: user.organisationId }
    }),
    prisma.organisation.findUnique({ where: { id: user.organisationId } }),
    prisma.user.findMany({
      where: { organisationId: user.organisationId, role: 'RECRUTEUR', actif: true }
    })
  ]);
  if (!demande || !org) throw new Error('Demande introuvable');

  const surcharges = (org.parametres as { templates?: unknown })?.templates;
  const channel = new TelegramChannel(telegramToken(org.parametres));
  const lien = `${process.env.NEXTAUTH_URL ?? ''}/recruteur`;

  for (const r of recruteurs) {
    const contenu = renduTemplate(
      'DEMANDE',
      r.langue as LangueCode,
      {
        organisation: org.nom,
        titre: demande.titre,
        nbPersonnes: String(demande.nbPersonnes),
        dates: `${formatDate(ymd(demande.dateDebut))}${demande.dateFin ? ` → ${formatDate(ymd(demande.dateFin))}` : ''}`,
        region: demande.region ?? '',
        commission: Number(demande.commissionParPlacement).toFixed(0),
        lien
      },
      surcharges
    );
    await envoyerEtJournaliser({
      organisationId: user.organisationId,
      canal: 'TELEGRAM',
      contexte: 'DEMANDE',
      destinataire: { id: r.id, telephone: r.telephone, telegramChatId: r.telegramChatId },
      contenu,
      channel
    });
  }

  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'demande.notifier',
    entite: 'DemandeMainOeuvre',
    entiteId: demandeId,
    apres: { recruteurs: recruteurs.length }
  });
  revalidatePath(`/admin/demandes/${demandeId}/notifier`);
}

export async function supprimerDemande(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const demande = await prisma.demandeMainOeuvre.findFirst({
    where: { id, organisationId: user.organisationId },
    include: { _count: { select: { propositions: true } } }
  });
  if (!demande) throw new Error('Demande introuvable');
  let erreur: string | null = null;
  if (demande._count.propositions > 0) {
    erreur = 'Des propositions existent sur cette demande — fermez-la plutôt.';
  } else {
    await prisma.demandeMainOeuvre.delete({ where: { id } });
  }
  revalidatePath('/admin/demandes');
  redirect(erreur ? `/admin/demandes?erreur=${encodeURIComponent(erreur)}` : '/admin/demandes');
}
