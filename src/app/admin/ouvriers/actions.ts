'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { audit } from '@/lib/audit';
import { normalisePhone } from '@/lib/auth';

const ouvrierSchema = z.object({
  nom: z.string().trim().min(1),
  prenom: z.string().trim().min(1),
  telephone: z.string().trim().min(6),
  langue: z.enum(['FR', 'RO', 'ES']),
  role: z.enum(['OUVRIER', 'CHEF_EQUIPE']),
  statutProfil: z.enum(['ACTIF', 'INACTIF', 'VIVIER']),
  tauxHoraire: z.string().optional(),
  iban: z.string().trim().optional(),
  pin: z.string().optional(),
  notesInternes: z.string().trim().optional()
});

export async function saveOuvrier(formData: FormData) {
  const user = await requireAdmin();
  const id = (formData.get('id') as string) || null;
  const parsed = ouvrierSchema.parse(Object.fromEntries(formData.entries()));

  if (parsed.pin && !/^\d{4}$/.test(parsed.pin)) {
    throw new Error('Le PIN doit faire exactement 4 chiffres');
  }

  const telephone = normalisePhone(parsed.telephone);
  const conflit = await prisma.user.findFirst({
    where: { telephone, ...(id ? { NOT: { id } } : {}) }
  });
  if (conflit) throw new Error('Ce numéro de téléphone existe déjà (clé unique du profil)');

  const data = {
    nom: parsed.nom,
    prenom: parsed.prenom,
    telephone,
    langue: parsed.langue,
    role: parsed.role,
    statutProfil: parsed.statutProfil,
    estChefEquipe: parsed.role === 'CHEF_EQUIPE',
    tauxHoraire: parsed.tauxHoraire ? Number(parsed.tauxHoraire) : null,
    iban: parsed.iban || null,
    notesInternes: parsed.notesInternes || null,
    actif: parsed.statutProfil === 'ACTIF',
    ...(parsed.pin ? { pinHash: await bcrypt.hash(parsed.pin, 10) } : {})
  };

  let ouvrierId = id;
  if (id) {
    const existing = await prisma.user.findFirst({
      where: { id, organisationId: user.organisationId }
    });
    if (!existing) throw new Error('Ouvrier introuvable');

    // Verrou de complétude (phase 18, règle 5) : passage en ACTIF bloqué si un
    // dossier d'embauche en cours est incomplet — activer depuis le dossier.
    if (parsed.statutProfil === 'ACTIF' && existing.statutProfil !== 'ACTIF') {
      const { dossierBloquant, manquants, LIBELLES_CHECKLIST } = await import('@/lib/embauche');
      const bloquant = await dossierBloquant(user.organisationId, id);
      if (bloquant) {
        throw new Error(
          `Dossier d'embauche incomplet (${manquants(bloquant.checklist)
            .map((m) => LIBELLES_CHECKLIST[m])
            .join(', ')}) — activez depuis /admin/embauches ou forcez (ADMIN)`
        );
      }
    }
    await prisma.user.update({ where: { id }, data });
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'ouvrier.update',
      entite: 'User',
      entiteId: id,
      avant: { ...existing, pinHash: undefined, motDePasseHash: undefined },
      apres: { ...data, pinHash: data.pinHash ? '(modifié)' : undefined }
    });
    // Taux modifié → réaligner le taux appliqué des heures des mois NON clôturés
    // (les mois clôturés restent figés : snapshot immuable, règle 8)
    if (Number(existing.tauxHoraire ?? 0) !== Number(data.tauxHoraire ?? 0)) {
      await realignerTauxCreneaux(id, user.organisationId, user.userId);
    }
  } else {
    if (!parsed.pin) throw new Error('PIN obligatoire à la création');
    const created = await prisma.user.create({
      data: { ...data, organisationId: user.organisationId, source: 'MANUEL' }
    });
    ouvrierId = created.id;
    await audit({
      organisationId: user.organisationId,
      userId: user.userId,
      action: 'ouvrier.create',
      entite: 'User',
      entiteId: created.id,
      apres: { ...data, pinHash: '(défini)' }
    });
  }
  revalidatePath('/admin/ouvriers');
  redirect(`/admin/ouvriers/${ouvrierId}`);
}

/**
 * Réaligne CreneauHeures.tauxApplique sur le taux courant de l'ouvrier
 * (taux individuel, sinon tarif de base) pour tous les mois non clôturés.
 */
async function realignerTauxCreneaux(
  ouvrierId: string,
  organisationId: string,
  adminId: string
) {
  const [ouvrier, org, clotures] = await Promise.all([
    prisma.user.findUnique({ where: { id: ouvrierId } }),
    prisma.organisation.findUnique({ where: { id: organisationId } }),
    prisma.clotureMois.findMany({
      where: { organisationId, userId: ouvrierId, statut: 'CLOTUREE' },
      select: { mois: true, annee: true }
    })
  ]);
  if (!ouvrier) return;
  const taux = Number(ouvrier.tauxHoraire ?? org?.tarifHoraireBase ?? 0);
  if (!taux) return;

  const moisFiges = new Set(clotures.map((c) => `${c.annee}-${c.mois}`));
  const creneaux = await prisma.creneauHeures.findMany({
    where: { organisationId, userId: ouvrierId, NOT: { tauxApplique: taux } },
    select: { id: true, date: true }
  });
  const aRealigner = creneaux
    .filter((c) => !moisFiges.has(`${c.date.getUTCFullYear()}-${c.date.getUTCMonth() + 1}`))
    .map((c) => c.id);
  if (aRealigner.length === 0) return;

  await prisma.creneauHeures.updateMany({
    where: { id: { in: aRealigner } },
    data: { tauxApplique: taux }
  });
  await audit({
    organisationId,
    userId: adminId,
    action: 'ouvrier.realignerTaux',
    entite: 'User',
    entiteId: ouvrierId,
    apres: { taux, creneauxRealignes: aRealigner.length }
  });
}

/** Débloque immédiatement un PIN rate-limité. */
export async function debloquerPin(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const ouvrier = await prisma.user.findFirst({
    where: { id, organisationId: user.organisationId }
  });
  if (!ouvrier) throw new Error('Ouvrier introuvable');
  await prisma.user.update({
    where: { id },
    data: { pinEchecs: 0, pinBloqueJusqua: null }
  });
  revalidatePath(`/admin/ouvriers/${id}`);
}
