// API de la carte admin — GET : parcelles par viewport (+ filtres),
// POST : enregistrer une parcelle depuis une géométrie cadastrale choisie.
// ADMIN/MANAGER uniquement, toujours scopé organisationId.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import { statutsParcelles } from '@/lib/parcelle-statut';
import { refParcelle } from '@/lib/geo';
import { enregistrerParcelleCadastrale } from '@/lib/parcelles';

export const dynamic = 'force-dynamic';

async function adminOu401() {
  const user = await getSessionUser();
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) return null;
  return user;
}

export async function GET(req: Request) {
  const user = await adminOu401();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const url = new URL(req.url);
  const bboxParam = url.searchParams.get('bbox'); // minLng,minLat,maxLng,maxLat
  const clientId = url.searchParams.get('clientId') || undefined;

  // Filtre viewport par centroïde (index B-tree) — les parcelles sans géométrie
  // ne sont renvoyées que si un filtre client est actif (elles n'ont pas de centroïde).
  const where: Record<string, unknown> = { organisationId: user.organisationId };
  if (clientId) where.clientId = clientId;
  if (bboxParam) {
    const [minLng, minLat, maxLng, maxLat] = bboxParam.split(',').map(Number);
    if ([minLng, minLat, maxLng, maxLat].every(Number.isFinite)) {
      where.centroidLat = { gte: minLat, lte: maxLat };
      where.centroidLng = { gte: minLng, lte: maxLng };
    }
  }

  const parcelles = await prisma.parcelle.findMany({
    where,
    include: { client: { select: { id: true, nom: true, couleur: true } } },
    take: 1500,
    orderBy: { createdAt: 'desc' }
  });

  const statuts = await statutsParcelles(
    parcelles.map((p) => p.id),
    user.organisationId
  );

  return NextResponse.json({
    parcelles: parcelles.map((p) => ({
      id: p.id,
      ref: refParcelle(p),
      commune: p.commune,
      codeInsee: p.codeInsee,
      section: p.section,
      numero: p.numero,
      adresse: p.adresse,
      cepage: p.cepage,
      millesime: p.millesime,
      surfaceM2: p.surfaceM2,
      centroidLat: p.centroidLat,
      centroidLng: p.centroidLng,
      geometry: p.geometry,
      client: p.client,
      statut: statuts[p.id]
    }))
  });
}

export async function POST(req: Request) {
  const user = await adminOu401();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = (await req.json()) as {
    clientId?: string;
    codeInsee?: string;
    section?: string;
    numero?: string;
    commune?: string;
    contenanceM2?: number | null;
    geometry?: unknown;
    cepage?: string;
    millesime?: number;
    notes?: string;
    instructions?: string;
  };

  const client = await prisma.client.findFirst({
    where: { id: body.clientId ?? '', organisationId: user.organisationId }
  });
  if (!client) return NextResponse.json({ error: 'Client introuvable' }, { status: 400 });
  if (!body.codeInsee || !body.section || !body.numero || !body.geometry) {
    return NextResponse.json({ error: 'Référence ou géométrie manquante' }, { status: 400 });
  }

  const resultat = await enregistrerParcelleCadastrale({
    organisationId: user.organisationId,
    userId: user.userId,
    clientId: client.id,
    cad: {
      codeInsee: body.codeInsee,
      section: body.section,
      numero: body.numero,
      commune: body.commune ?? null,
      contenanceM2: body.contenanceM2 ?? null,
      geometry: body.geometry as never
    },
    source: 'MANUEL',
    extra: {
      cepage: body.cepage || null,
      millesime: body.millesime || null,
      notes: body.notes || null,
      instructions: body.instructions || null
    }
  });
  if (resultat.doublon) {
    return NextResponse.json({ error: 'Cette parcelle existe déjà pour ce client' }, { status: 409 });
  }
  return NextResponse.json({ ok: true, id: resultat.parcelle.id });
}

/** Édition des attributs métier depuis la carte (cépage, millésime, notes, instructions). */
export async function PATCH(req: Request) {
  const user = await adminOu401();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = (await req.json()) as {
    id?: string;
    cepage?: string;
    millesime?: number | null;
    notes?: string;
    instructions?: string;
  };
  const parcelle = await prisma.parcelle.findFirst({
    where: { id: body.id ?? '', organisationId: user.organisationId }
  });
  if (!parcelle) return NextResponse.json({ error: 'Parcelle introuvable' }, { status: 404 });

  await prisma.parcelle.update({
    where: { id: parcelle.id },
    data: {
      cepage: body.cepage?.trim() || null,
      millesime: body.millesime && body.millesime > 1900 ? body.millesime : null,
      notes: body.notes?.trim() || null,
      instructions: body.instructions?.trim() || null
    }
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await adminOu401();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';

  const parcelle = await prisma.parcelle.findFirst({
    where: { id, organisationId: user.organisationId },
    include: { _count: { select: { affectations: true } } }
  });
  if (!parcelle) return NextResponse.json({ error: 'Parcelle introuvable' }, { status: 404 });
  if (parcelle._count.affectations > 0) {
    return NextResponse.json(
      { error: 'Des affectations référencent cette parcelle' },
      { status: 409 }
    );
  }
  await prisma.parcelle.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
