'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { audit } from '@/lib/audit';
import { dateFromYMD } from '@/lib/dates';

const logementSchema = z.object({
  nom: z.string().trim().min(1),
  adresse: z.string().trim().optional(),
  capacite: z.coerce.number().int().min(1),
  tarifJour: z.coerce.number().min(0)
});

export async function saveLogement(formData: FormData) {
  const user = await requireAdmin();
  const id = (formData.get('id') as string) || null;
  const parsed = logementSchema.parse(Object.fromEntries(formData.entries()));
  const data = {
    nom: parsed.nom,
    adresse: parsed.adresse || null,
    capacite: parsed.capacite,
    tarifJour: parsed.tarifJour
  };

  if (id) {
    const existing = await prisma.logement.findFirst({
      where: { id, organisationId: user.organisationId }
    });
    if (!existing) throw new Error('Logement introuvable');
    await prisma.logement.update({ where: { id }, data });
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'logement.update',
      entite: 'Logement',
      entiteId: id,
      avant: existing,
      apres: data
    });
  } else {
    const created = await prisma.logement.create({
      data: { ...data, organisationId: user.organisationId }
    });
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'logement.create',
      entite: 'Logement',
      entiteId: created.id,
      apres: data
    });
  }
  revalidatePath('/admin/logements');
  redirect('/admin/logements');
}

const sejourSchema = z.object({
  logementId: z.string().min(1),
  ouvrierId: z.string().min(1),
  dateArrivee: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateDepart: z.string().optional()
});

/** Ouvre un séjour : arrivée incluse, départ exclu (règle 6). */
async function creerSejourCoeur(formData: FormData) {
  const user = await requireAdmin();
  const parsed = sejourSchema.parse(Object.fromEntries(formData.entries()));

  const [logement, ouvrier] = await Promise.all([
    prisma.logement.findFirst({
      where: { id: parsed.logementId, organisationId: user.organisationId }
    }),
    prisma.user.findFirst({
      where: { id: parsed.ouvrierId, organisationId: user.organisationId }
    })
  ]);
  if (!logement || !ouvrier) throw new Error('Logement ou ouvrier introuvable');
  if (parsed.dateDepart && parsed.dateDepart <= parsed.dateArrivee) {
    throw new Error('La date de départ doit être après l’arrivée');
  }

  const chevauchant = await prisma.sejourLogement.findFirst({
    where: {
      userId: parsed.ouvrierId,
      dateArrivee: { lt: parsed.dateDepart ? dateFromYMD(parsed.dateDepart) : new Date('2100-01-01') },
      OR: [{ dateDepart: null }, { dateDepart: { gt: dateFromYMD(parsed.dateArrivee) } }]
    }
  });
  if (chevauchant) throw new Error('Cet ouvrier a déjà un séjour sur cette période');

  const sejour = await prisma.sejourLogement.create({
    data: {
      logementId: parsed.logementId,
      userId: parsed.ouvrierId,
      dateArrivee: dateFromYMD(parsed.dateArrivee),
      dateDepart: parsed.dateDepart ? dateFromYMD(parsed.dateDepart) : null
    }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'sejour.create',
    entite: 'SejourLogement',
    entiteId: sejour.id,
    apres: parsed
  });
  revalidatePath(`/admin/logements/${parsed.logementId}`);
  revalidatePath(`/admin/ouvriers/${parsed.ouvrierId}`);
}

/** Clôt un séjour (départ, jour exclu par défaut). */
async function cloreSejourCoeur(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const dateDepart = formData.get('dateDepart') as string;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDepart)) throw new Error('Date invalide');

  const sejour = await prisma.sejourLogement.findFirst({
    where: { id, logement: { organisationId: user.organisationId } }
  });
  if (!sejour) throw new Error('Séjour introuvable');
  if (dateFromYMD(dateDepart) <= sejour.dateArrivee) {
    throw new Error('Départ avant arrivée');
  }

  await prisma.sejourLogement.update({
    where: { id },
    data: { dateDepart: dateFromYMD(dateDepart) }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'sejour.clore',
    entite: 'SejourLogement',
    entiteId: id,
    apres: { dateDepart }
  });
  revalidatePath(`/admin/logements/${sejour.logementId}`);
}


// Wrappers form-action : les messages des throw sont masqués en production →
// catch + redirect ?erreur= vers la page d'origine (bannière).
export async function creerSejour(formData: FormData) {
  const retour =
    (formData.get('retour') as string) || `/admin/logements/${formData.get('logementId')}`;
  let erreur: string | null = null;
  try {
    await creerSejourCoeur(formData);
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inattendue';
  }
  redirect(erreur ? `${retour}?erreur=${encodeURIComponent(erreur)}` : retour);
}

export async function cloreSejour(formData: FormData) {
  const retour = (formData.get('retour') as string) || '';
  let erreur: string | null = null;
  try {
    await cloreSejourCoeur(formData);
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Erreur inattendue';
  }
  if (retour) redirect(erreur ? `${retour}?erreur=${encodeURIComponent(erreur)}` : retour);
  if (erreur) throw new Error(erreur);
}

export async function supprimerSejour(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const sejour = await prisma.sejourLogement.findFirst({
    where: { id, logement: { organisationId: user.organisationId } }
  });
  if (!sejour) throw new Error('Séjour introuvable');
  await prisma.sejourLogement.delete({ where: { id } });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'sejour.delete',
    entite: 'SejourLogement',
    entiteId: id,
    avant: sejour
  });
  revalidatePath(`/admin/logements/${sejour.logementId}`);
}

export async function deleteLogement(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const logement = await prisma.logement.findFirst({
    where: { id, organisationId: user.organisationId },
    include: { _count: { select: { sejours: true } } }
  });
  if (!logement) throw new Error('Logement introuvable');
  if (logement._count.sejours > 0) {
    throw new Error('Impossible : des séjours existent pour ce logement.');
  }
  await prisma.logement.delete({ where: { id } });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'logement.delete',
    entite: 'Logement',
    entiteId: id,
    avant: logement
  });
  revalidatePath('/admin/logements');
  redirect('/admin/logements');
}
