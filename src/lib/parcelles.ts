// Création de parcelles cadastrales — logique partagée entre les server actions
// (fiche client), l'API de la carte (/api/parcelles) et l'import de masse.

import 'server-only';
import { prisma } from '@/lib/prisma';
import { audit } from '@/lib/audit';
import { centroide, surfaceM2, type GeoJSONGeometry } from '@/lib/geo';
import type { ParcelleSource, Prisma } from '@prisma/client';

export type CadastreData = {
  codeInsee: string;
  section: string;
  numero: string;
  commune?: string | null;
  contenanceM2: number | null;
  geometry: GeoJSONGeometry;
};

export type ExtraParcelle = {
  cepage?: string | null;
  millesime?: number | null;
  instructions?: string | null;
  notes?: string | null;
  adresse?: string | null;
};

/**
 * Enregistre une parcelle avec géométrie cadastrale pour un client.
 * Retourne { doublon: true } si elle existe déjà (anti-doublon règle 15).
 */
export async function enregistrerParcelleCadastrale(params: {
  organisationId: string;
  userId: string;
  clientId: string;
  cad: CadastreData;
  source: ParcelleSource;
  extra?: ExtraParcelle;
}) {
  const { cad, extra } = params;
  const existante = await prisma.parcelle.findFirst({
    where: {
      clientId: params.clientId,
      codeInsee: cad.codeInsee,
      section: cad.section,
      numero: cad.numero
    }
  });
  if (existante) return { doublon: true as const, parcelle: existante };

  const c = centroide(cad.geometry);
  const parcelle = await prisma.parcelle.create({
    data: {
      organisationId: params.organisationId,
      clientId: params.clientId,
      codeInsee: cad.codeInsee,
      commune: cad.commune ?? null,
      section: cad.section,
      numero: cad.numero,
      geometry: cad.geometry as unknown as Prisma.InputJsonValue,
      centroidLat: c?.lat ?? null,
      centroidLng: c?.lng ?? null,
      surfaceM2: cad.contenanceM2 ?? surfaceM2(cad.geometry),
      source: params.source,
      cepage: extra?.cepage ?? null,
      millesime: extra?.millesime ?? null,
      instructions: extra?.instructions ?? null,
      notes: extra?.notes ?? null,
      adresse: extra?.adresse ?? null
    }
  });
  await audit({
    organisationId: params.organisationId,
    userId: params.userId,
    action: 'parcelle.create',
    entite: 'Parcelle',
    entiteId: parcelle.id,
    apres: {
      clientId: params.clientId,
      ref: `${cad.codeInsee} ${cad.section} ${cad.numero}`,
      source: params.source
    }
  });
  return { doublon: false as const, parcelle };
}
