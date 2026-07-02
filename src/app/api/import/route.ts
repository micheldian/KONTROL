// Import de masse clients + parcelles (spec §5.14).
// POST : crée l'ImportBatch (payload = lignes déjà mappées côté navigateur).
// GET  : historique des imports de l'organisation.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import { audit } from '@/lib/audit';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

const MAX_LIGNES = 5000;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const body = (await req.json()) as {
    nomFichier?: string;
    mapping?: Record<string, string>;
    lignes?: Array<Record<string, unknown>>;
  };
  const lignes = body.lignes ?? [];
  if (lignes.length === 0) {
    return NextResponse.json({ error: 'Aucune ligne à importer' }, { status: 400 });
  }
  if (lignes.length > MAX_LIGNES) {
    return NextResponse.json(
      { error: `Trop de lignes (max ${MAX_LIGNES}) — découpez le fichier` },
      { status: 400 }
    );
  }

  const batch = await prisma.importBatch.create({
    data: {
      organisationId: user.organisationId,
      nomFichier: body.nomFichier ?? 'import',
      totalLignes: lignes.length,
      mapping: (body.mapping ?? {}) as Prisma.InputJsonValue,
      payload: lignes as Prisma.InputJsonValue,
      erreurs: []
    }
  });
  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'import.create',
    entite: 'ImportBatch',
    entiteId: batch.id,
    apres: { nomFichier: batch.nomFichier, totalLignes: lignes.length }
  });
  return NextResponse.json({ id: batch.id, totalLignes: lignes.length });
}

export async function GET() {
  const user = await getSessionUser();
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  const batches = await prisma.importBatch.findMany({
    where: { organisationId: user.organisationId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      nomFichier: true,
      statut: true,
      totalLignes: true,
      lignesTraitees: true,
      clientsCrees: true,
      parcellesCreees: true,
      parcellesIgnorees: true,
      createdAt: true
    }
  });
  return NextResponse.json({ batches });
}
