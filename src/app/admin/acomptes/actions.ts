'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { audit } from '@/lib/audit';
import { verifieDepassementAcompte } from '@/lib/money';
import { dateFromYMD } from '@/lib/dates';
import { envoyerPushAUtilisateur } from '@/lib/push';
import { PUSH_MESSAGES } from '@/lib/push-messages';

const acompteSchema = z.object({
  ouvrierId: z.string().min(1),
  montant: z.coerce.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(['ESPECES', 'VIREMENT']),
  note: z.string().trim().optional(),
  forcer: z.string().optional()
});

/** Enregistrement direct d'un acompte versé (espèces/virement). */
export async function enregistrerAcompte(formData: FormData) {
  const user = await requireAdmin();
  const parsed = acompteSchema.parse(Object.fromEntries(formData.entries()));

  const ouvrier = await prisma.user.findFirst({
    where: { id: parsed.ouvrierId, organisationId: user.organisationId }
  });
  if (!ouvrier) throw new Error('Ouvrier introuvable');

  // Garde-fou : blocage soft, l'admin peut forcer avec confirmation
  const [annee, mois] = [Number(parsed.date.slice(0, 4)), Number(parsed.date.slice(5, 7))];
  const controle = await verifieDepassementAcompte({
    organisationId: user.organisationId,
    userId: parsed.ouvrierId,
    montantNouveau: parsed.montant,
    mois,
    annee
  });
  if (controle.depasse && parsed.forcer !== 'on') {
    redirect(
      `/admin/acomptes?alerte=depassement&ouvrier=${encodeURIComponent(
        `${ouvrier.prenom} ${ouvrier.nom}`
      )}&gagne=${controle.gagneValide.toFixed(2)}&total=${controle.totalApres.toFixed(2)}`
    );
  }

  const acompte = await prisma.acompte.create({
    data: {
      organisationId: user.organisationId,
      userId: parsed.ouvrierId,
      montant: parsed.montant,
      date: dateFromYMD(parsed.date),
      mode: parsed.mode,
      note: parsed.note || null,
      statut: 'VERSE',
      traiteParId: user.userId
    }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: controle.depasse ? 'acompte.verser.force' : 'acompte.verser',
    entite: 'Acompte',
    entiteId: acompte.id,
    apres: { ...parsed, depassement: controle.depasse }
  });
  revalidatePath('/admin/acomptes');
  redirect('/admin/acomptes');
}

const traitementSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(['approuver', 'refuser']),
  mode: z.enum(['ESPECES', 'VIREMENT']).optional(),
  note: z.string().trim().optional(),
  forcer: z.string().optional()
});

/** Traite une demande d'acompte du portail : approuver (déduit) ou refuser. */
export async function traiterDemande(formData: FormData) {
  const user = await requireAdmin();
  const parsed = traitementSchema.parse(Object.fromEntries(formData.entries()));

  const demande = await prisma.acompte.findFirst({
    where: { id: parsed.id, organisationId: user.organisationId, statut: 'DEMANDE' },
    include: { user: true }
  });
  if (!demande) throw new Error('Demande introuvable ou déjà traitée');

  if (parsed.decision === 'refuser') {
    await prisma.acompte.update({
      where: { id: demande.id },
      data: { statut: 'REFUSE', traiteParId: user.userId, note: parsed.note || demande.note }
    });
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'acompte.refuser',
      entite: 'Acompte',
      entiteId: demande.id
    });
    await envoyerPushAUtilisateur(
      demande.userId,
      PUSH_MESSAGES.ACOMPTE_REFUSE[demande.user.langue]
    ).catch(() => {});
  } else {
    const [annee, mois] = [
      demande.date.getUTCFullYear(),
      demande.date.getUTCMonth() + 1
    ];
    const controle = await verifieDepassementAcompte({
      organisationId: user.organisationId,
      userId: demande.userId,
      montantNouveau: Number(demande.montant),
      mois,
      annee
    });
    if (controle.depasse && parsed.forcer !== 'on') {
      redirect(
        `/admin/acomptes?alerte=depassement&ouvrier=${encodeURIComponent(
          `${demande.user.prenom} ${demande.user.nom}`
        )}&gagne=${controle.gagneValide.toFixed(2)}&total=${controle.totalApres.toFixed(2)}`
      );
    }
    await prisma.acompte.update({
      where: { id: demande.id },
      data: {
        statut: 'APPROUVE',
        mode: parsed.mode ?? 'ESPECES',
        traiteParId: user.userId
      }
    });
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: controle.depasse ? 'acompte.approuver.force' : 'acompte.approuver',
      entite: 'Acompte',
      entiteId: demande.id,
      apres: { depassement: controle.depasse }
    });
    await envoyerPushAUtilisateur(
      demande.userId,
      PUSH_MESSAGES.ACOMPTE_APPROUVE[demande.user.langue]
    ).catch(() => {});
  }
  revalidatePath('/admin/acomptes');
  redirect('/admin/acomptes');
}

/** APPROUVE → VERSE (remise effective de l'argent). */
export async function marquerVerse(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const acompte = await prisma.acompte.findFirst({
    where: { id, organisationId: user.organisationId, statut: 'APPROUVE' }
  });
  if (!acompte) throw new Error('Acompte introuvable');
  await prisma.acompte.update({
    where: { id },
    data: { statut: 'VERSE', traiteParId: user.userId }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'acompte.marquerVerse',
    entite: 'Acompte',
    entiteId: id
  });
  revalidatePath('/admin/acomptes');
}
