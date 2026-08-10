'use server';

// Gestion des recruteurs & commissions (spec §D.3, règles E.6-7).

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { audit } from '@/lib/audit';
import { dateFromYMD } from '@/lib/dates';
import { parametresRecrutement } from '@/lib/recruteurs';

/** Suspension / réactivation d'un recruteur (l'inscription est ouverte, spec §B). */
export async function basculerSuspensionRecruteur(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const recruteur = await prisma.user.findFirst({
    where: { id, organisationId: user.organisationId, role: 'RECRUTEUR' }
  });
  if (!recruteur) throw new Error('Recruteur introuvable');

  await prisma.user.update({ where: { id }, data: { actif: !recruteur.actif } });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: recruteur.actif ? 'recruteur.suspendre' : 'recruteur.reactiver',
    entite: 'User',
    entiteId: id
  });
  revalidatePath('/admin/recruteurs');
  revalidatePath(`/admin/recruteurs/${id}`);
}

/**
 * Paiement de commission : décrémente le dû ; les placements DUS sont marqués
 * PAYÉS au fil de l'eau (FIFO) tant que le montant les couvre entièrement.
 */
export async function payerCommission(formData: FormData) {
  const user = await requireAdmin();
  const recruteurId = formData.get('recruteurId') as string;
  let erreur: string | null = null;

  try {
    const montant = Number(formData.get('montant'));
    const date = (formData.get('date') as string) || '';
    const mode = formData.get('mode') as 'ESPECES' | 'VIREMENT';
    const note = ((formData.get('note') as string) || '').trim();
    if (!Number.isFinite(montant) || montant <= 0) throw new Error('Montant invalide');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date invalide');
    if (!['ESPECES', 'VIREMENT'].includes(mode)) throw new Error('Mode invalide');

    const recruteur = await prisma.user.findFirst({
      where: { id: recruteurId, organisationId: user.organisationId, role: 'RECRUTEUR' }
    });
    if (!recruteur) throw new Error('Recruteur introuvable');

    const paiement = await prisma.paiementCommission.create({
      data: {
        organisationId: user.organisationId,
        recruteurId,
        montant,
        date: dateFromYMD(date),
        mode,
        note: note || null
      }
    });

    // Marquage FIFO des placements couverts par ce paiement
    let reste = montant;
    const dus = await prisma.placement.findMany({
      where: { organisationId: user.organisationId, recruteurId, commissionStatut: 'DUE' },
      orderBy: { placeAt: 'asc' }
    });
    for (const p of dus) {
      const m = Number(p.commissionMontant);
      if (reste >= m) {
        await prisma.placement.update({
          where: { id: p.id },
          data: { commissionStatut: 'PAYEE', paiementId: paiement.id }
        });
        reste -= m;
      } else break;
    }

    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'commission.payer',
      entite: 'PaiementCommission',
      entiteId: paiement.id,
      apres: { recruteurId, montant, mode }
    });
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inattendue';
  }
  revalidatePath(`/admin/recruteurs/${recruteurId}`);
  redirect(
    erreur
      ? `/admin/recruteurs/${recruteurId}?erreur=${encodeURIComponent(erreur)}`
      : `/admin/recruteurs/${recruteurId}`
  );
}

/** Annulation d'un placement sous délai (règle 6) : commission → ANNULÉE, motif tracé. */
export async function annulerPlacement(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const motif = ((formData.get('motif') as string) || '').trim();
  let recruteurId = '';
  let erreur: string | null = null;

  try {
    if (!motif) throw new Error('Motif d’annulation obligatoire');
    const placement = await prisma.placement.findFirst({
      where: { id, organisationId: user.organisationId }
    });
    if (!placement) throw new Error('Placement introuvable');
    recruteurId = placement.recruteurId;
    if (placement.commissionStatut === 'PAYEE') {
      throw new Error('Commission déjà payée — annulation impossible');
    }
    if (placement.commissionStatut === 'ANNULEE') throw new Error('Déjà annulé');

    const org = await prisma.organisation.findUnique({ where: { id: user.organisationId } });
    const params = parametresRecrutement(org?.parametres);
    const limite = new Date(placement.placeAt);
    limite.setDate(limite.getDate() + params.delaiAnnulationPlacementJours);
    if (new Date() > limite) {
      throw new Error(
        `Délai d’annulation dépassé (${params.delaiAnnulationPlacementJours} jours après le placement)`
      );
    }

    await prisma.placement.update({
      where: { id },
      data: { commissionStatut: 'ANNULEE', motifAnnulation: motif, annuleAt: new Date() }
    });
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'placement.annuler',
      entite: 'Placement',
      entiteId: id,
      apres: { motif }
    });
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inattendue';
  }
  revalidatePath(`/admin/recruteurs/${recruteurId}`);
  redirect(
    erreur
      ? `/admin/recruteurs/${recruteurId}?erreur=${encodeURIComponent(erreur)}`
      : `/admin/recruteurs/${recruteurId}`
  );
}
