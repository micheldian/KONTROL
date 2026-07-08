import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import { dechiffre } from '@/lib/documents';
import { construireZip, type FichierZip } from '@/lib/zip';
import { audit } from '@/lib/audit';
import { ymd } from '@/lib/dates';

export const dynamic = 'force-dynamic';

const EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf'
};

function propre(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-');
}

// Export ZIP du coffre-fort :
//  ?user=ID              → tous les documents d'un ouvrier
//  ?debut=YYYY-MM-DD&fin=YYYY-MM-DD → « dossier de contrôle MSA » : documents des
//    dossiers d'embauche démarrant sur la période, un répertoire par ouvrier.
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
    return new NextResponse('Non autorisé', { status: 401 });
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get('user');
  const debut = url.searchParams.get('debut') ?? '';
  const fin = url.searchParams.get('fin') ?? '';

  const fichiers: FichierZip[] = [];
  let nomZip = 'krontrol-documents';

  if (userId) {
    const ouvrier = await prisma.user.findFirst({
      where: { id: userId, organisationId: user.organisationId }
    });
    if (!ouvrier) return new NextResponse('Introuvable', { status: 404 });
    const docs = await prisma.documentOuvrier.findMany({
      where: { organisationId: user.organisationId, userId },
      orderBy: { uploadeAt: 'asc' }
    });
    for (const d of docs) {
      fichiers.push({
        nom: `${d.type.toLowerCase()}-${ymd(d.uploadeAt)}${EXT[d.mimeType] ?? ''}`,
        contenu: dechiffre(Buffer.from(d.contenu)),
        modifieLe: d.uploadeAt
      });
    }
    nomZip = `dossier-${propre(ouvrier.nom)}-${propre(ouvrier.prenom)}`;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(debut) && /^\d{4}-\d{2}-\d{2}$/.test(fin)) {
    const dossiers = await prisma.dossierEmbauche.findMany({
      where: {
        organisationId: user.organisationId,
        statut: { not: 'ANNULE' },
        dateDebut: { gte: new Date(`${debut}T00:00:00Z`), lte: new Date(`${fin}T23:59:59Z`) }
      },
      include: { user: true, documents: true }
    });
    for (const dossier of dossiers) {
      const rep = `${propre(dossier.user.nom)}-${propre(dossier.user.prenom)}`;
      for (const d of dossier.documents) {
        fichiers.push({
          nom: `${rep}/${d.type.toLowerCase()}-${ymd(d.uploadeAt)}${EXT[d.mimeType] ?? ''}`,
          contenu: dechiffre(Buffer.from(d.contenu)),
          modifieLe: d.uploadeAt
        });
      }
    }
    nomZip = `controle-msa-${debut}_${fin}`;
  } else {
    return new NextResponse('Paramètres : ?user=ID ou ?debut&fin', { status: 400 });
  }

  if (fichiers.length === 0) return new NextResponse('Aucun document', { status: 404 });

  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: 'document.export.zip',
    entite: 'DocumentOuvrier',
    entiteId: userId ?? `${debut}_${fin}`,
    apres: { fichiers: fichiers.length }
  });

  return new NextResponse(new Uint8Array(construireZip(fichiers)), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${nomZip}.zip"`,
      'Cache-Control': 'private, no-store'
    }
  });
}
