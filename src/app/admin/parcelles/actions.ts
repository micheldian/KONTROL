'use server';

// CRUD parcelles (rattachées au CLIENT — règle 15). Utilisé par la fiche client
// et par la carte (/admin/carte). Saisie Mode A (référence cadastrale via API
// Carto), Mode B (point → parcelle intersectée) et fallback adresse simple.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/session';
import { audit } from '@/lib/audit';
import { parcelleParReference, parcelleParPoint } from '@/lib/geo';
import { enregistrerParcelleCadastrale, type CadastreData } from '@/lib/parcelles';

const attributsSchema = z.object({
  clientId: z.string().min(1),
  cepage: z.string().trim().optional(),
  millesime: z.coerce.number().int().min(1900).max(2100).optional().or(z.literal('')),
  instructions: z.string().trim().optional(),
  notes: z.string().trim().optional()
});

async function clientDeLOrga(clientId: string, organisationId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organisationId }
  });
  if (!client) throw new Error('Client introuvable');
  return client;
}

function attributs(parsed: z.infer<typeof attributsSchema>) {
  return {
    cepage: parsed.cepage || null,
    millesime: parsed.millesime ? Number(parsed.millesime) : null,
    instructions: parsed.instructions || null,
    notes: parsed.notes || null
  };
}

async function creerDepuisCadastre(params: {
  organisationId: string;
  userId: string;
  clientId: string;
  cad: CadastreData;
  extra: ReturnType<typeof attributs>;
  source: 'MANUEL' | 'IMPORT_REFERENCE' | 'IMPORT_POINT';
}) {
  const resultat = await enregistrerParcelleCadastrale(params);
  if (resultat.doublon) throw new Error('Cette parcelle existe déjà pour ce client');
  return resultat.parcelle;
}

/** Mode A : référence cadastrale (INSEE + section + numéro) → API Carto. */
export async function creerParcelleParReference(formData: FormData) {
  const user = await requireAdmin();
  const parsed = attributsSchema.parse(Object.fromEntries(formData.entries()));
  await clientDeLOrga(parsed.clientId, user.organisationId);

  const codeInsee = ((formData.get('codeInsee') as string) || '').trim();
  const section = ((formData.get('section') as string) || '').trim();
  const numero = ((formData.get('numero') as string) || '').trim();
  if (!codeInsee || !section || !numero) {
    throw new Error('Commune (INSEE), section et numéro sont obligatoires');
  }

  const trouvees = await parcelleParReference(codeInsee, section, numero);
  if (trouvees.length === 0) {
    throw new Error('Parcelle introuvable au cadastre IGN — vérifiez la référence');
  }
  await creerDepuisCadastre({
    organisationId: user.organisationId,
    userId: user.userId,
    clientId: parsed.clientId,
    cad: trouvees[0],
    extra: attributs(parsed),
    source: 'MANUEL'
  });
  revalidatePath('/admin/carte');
  revalidatePath(`/admin/clients/${parsed.clientId}`);
}

/** Mode B : point (clic carte) → parcelle intersectée à l'IGN. */
export async function creerParcelleParPoint(formData: FormData) {
  const user = await requireAdmin();
  const parsed = attributsSchema.parse(Object.fromEntries(formData.entries()));
  await clientDeLOrga(parsed.clientId, user.organisationId);

  const lat = Number(formData.get('lat'));
  const lng = Number(formData.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Point invalide');

  const trouvees = await parcelleParPoint(lat, lng);
  if (trouvees.length === 0) {
    throw new Error('Aucune parcelle cadastrale à cet endroit');
  }
  await creerDepuisCadastre({
    organisationId: user.organisationId,
    userId: user.userId,
    clientId: parsed.clientId,
    cad: trouvees[0],
    extra: attributs(parsed),
    source: 'MANUEL'
  });
  revalidatePath('/admin/carte');
  revalidatePath(`/admin/clients/${parsed.clientId}`);
}

/** Fallback : parcelle « adresse simple » sans géométrie cadastrale. */
export async function creerParcelleAdresse(formData: FormData) {
  const user = await requireAdmin();
  const parsed = attributsSchema.parse(Object.fromEntries(formData.entries()));
  await clientDeLOrga(parsed.clientId, user.organisationId);
  const adresse = ((formData.get('adresse') as string) || '').trim();
  if (!adresse) throw new Error('Adresse obligatoire');

  const parcelle = await prisma.parcelle.create({
    data: {
      organisationId: user.organisationId,
      clientId: parsed.clientId,
      adresse,
      source: 'MANUEL',
      ...attributs(parsed)
    }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'parcelle.create',
    entite: 'Parcelle',
    entiteId: parcelle.id,
    apres: { clientId: parsed.clientId, adresse }
  });
  revalidatePath(`/admin/clients/${parsed.clientId}`);
}

/** Édition des attributs métier (cépage, millésime, notes, instructions). */
export async function majParcelle(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const parcelle = await prisma.parcelle.findFirst({
    where: { id, organisationId: user.organisationId }
  });
  if (!parcelle) throw new Error('Parcelle introuvable');

  const cepage = ((formData.get('cepage') as string) || '').trim();
  const millesime = Number(formData.get('millesime'));
  const notes = ((formData.get('notes') as string) || '').trim();
  const instructions = ((formData.get('instructions') as string) || '').trim();

  await prisma.parcelle.update({
    where: { id },
    data: {
      cepage: cepage || null,
      millesime: Number.isFinite(millesime) && millesime > 1900 ? millesime : null,
      notes: notes || null,
      instructions: instructions || null
    }
  });
  revalidatePath('/admin/carte');
  revalidatePath(`/admin/clients/${parcelle.clientId}`);
}

export async function supprimerParcelle(formData: FormData) {
  const user = await requireAdmin();
  const id = formData.get('id') as string;
  const parcelle = await prisma.parcelle.findFirst({
    where: { id, organisationId: user.organisationId },
    include: { _count: { select: { affectations: true } } }
  });
  if (!parcelle) throw new Error('Parcelle introuvable');
  if (parcelle._count.affectations > 0) {
    throw new Error('Impossible : des affectations référencent cette parcelle.');
  }
  await prisma.parcelle.delete({ where: { id } });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'parcelle.delete',
    entite: 'Parcelle',
    entiteId: id,
    avant: { clientId: parcelle.clientId, ref: parcelle.section ? `${parcelle.codeInsee} ${parcelle.section} ${parcelle.numero}` : parcelle.adresse }
  });
  revalidatePath('/admin/carte');
  revalidatePath(`/admin/clients/${parcelle.clientId}`);
}
