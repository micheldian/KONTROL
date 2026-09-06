import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import { assurerMigrations } from '@/lib/migrations-auto';

export const dynamic = 'force-dynamic';

// Photo de l'ouvrier : ADMIN/MANAGER de la même organisation uniquement.
// ?v=<timestamp> sert uniquement à contourner le cache du navigateur après remplacement.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
    return new NextResponse('Non autorisé', { status: 401 });
  }
  await assurerMigrations();
  const photo = await prisma.photoOuvrier.findFirst({
    where: { userId: params.id, organisationId: user.organisationId }
  });
  if (!photo) return new NextResponse('Introuvable', { status: 404 });

  return new NextResponse(new Uint8Array(photo.contenu), {
    headers: {
      'Content-Type': photo.mimeType,
      'Cache-Control': 'private, max-age=3600',
      'Last-Modified': photo.majAt.toUTCString()
    }
  });
}
