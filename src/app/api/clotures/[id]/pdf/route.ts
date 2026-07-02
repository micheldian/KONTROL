import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import { renderRecapPdf } from '@/lib/pdf/recap-pdf';

export const dynamic = 'force-dynamic';

// PDF bilingue du récap mensuel — accessible à l'ADMIN/MANAGER de l'organisation
// et à l'ouvrier concerné (depuis « Mon argent »).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return new NextResponse('Non autorisé', { status: 401 });

  const cloture = await prisma.clotureMois.findFirst({
    where: { id: params.id, organisationId: user.organisationId },
    include: { user: true, organisation: true }
  });
  if (!cloture) return new NextResponse('Introuvable', { status: 404 });

  const estAdmin = user.role === 'ADMIN' || user.role === 'MANAGER';
  if (!estAdmin && cloture.userId !== user.userId) {
    return new NextResponse('Non autorisé', { status: 403 });
  }

  const pdf = await renderRecapPdf({
    cloture,
    ouvrier: cloture.user,
    organisation: cloture.organisation
  });

  const nom = `krontrol-recap-${cloture.annee}-${String(cloture.mois).padStart(2, '0')}-${cloture.user.nom.toLowerCase()}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${nom}"`
    }
  });
}
