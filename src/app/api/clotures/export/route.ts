import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Export CSV global du mois pour la compta (séparateur ; + BOM pour Excel FR).
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
    return new NextResponse('Non autorisé', { status: 401 });
  }

  const url = new URL(req.url);
  const moisParam = url.searchParams.get('mois') ?? '';
  if (!/^\d{4}-\d{2}$/.test(moisParam)) {
    return new NextResponse('Paramètre mois=YYYY-MM requis', { status: 400 });
  }
  const annee = Number(moisParam.slice(0, 4));
  const mois = Number(moisParam.slice(5, 7));

  const clotures = await prisma.clotureMois.findMany({
    where: { organisationId: user.organisationId, mois, annee },
    include: { user: true },
    orderBy: { user: { nom: 'asc' } }
  });

  const n = (v: unknown) => Number(v).toFixed(2).replace('.', ',');
  const lignes = [
    [
      'Nom',
      'Prénom',
      'Téléphone',
      'Heures validées',
      'Total brut (€)',
      'Acomptes (€)',
      'Logement (€)',
      'Retenues (€)',
      'Net à verser (€)',
      'Statut',
      'Mode versement',
      'Versé le'
    ].join(';')
  ];
  for (const c of clotures) {
    lignes.push(
      [
        c.user.nom,
        c.user.prenom,
        c.user.telephone,
        n(c.totalHeures),
        n(c.totalBrut),
        n(c.totalAcomptes),
        n(c.totalLogement),
        n(c.totalRetenues),
        n(c.netAVerser),
        c.statut,
        c.modeVersement ?? '',
        c.verseAt ? c.verseAt.toLocaleDateString('fr-FR') : ''
      ].join(';')
    );
  }

  return new NextResponse('﻿' + lignes.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="krontrol-clotures-${moisParam}.csv"`
    }
  });
}
