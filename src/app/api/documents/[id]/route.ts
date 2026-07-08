import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { lireDocument } from '@/lib/documents';

export const dynamic = 'force-dynamic';

// Coffre-fort documentaire : accès restreint ADMIN/MANAGER, déchiffrement à la
// volée, chaque consultation journalisée (règle 7).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
    return new NextResponse('Non autorisé', { status: 401 });
  }

  const doc = await lireDocument({
    documentId: params.id,
    organisationId: user.organisationId,
    consulteParId: user.userId
  });
  if (!doc) return new NextResponse('Introuvable', { status: 404 });

  return new NextResponse(new Uint8Array(doc.contenuClair), {
    headers: {
      'Content-Type': doc.mimeType,
      'Content-Disposition': `inline; filename="${doc.nomFichier}"`,
      'Cache-Control': 'private, no-store'
    }
  });
}
