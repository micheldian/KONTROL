import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Export CSV des commissions recruteurs (séparateur ; + BOM pour Excel FR).
// Filtre optionnel : ?debut=YYYY-MM-DD&fin=YYYY-MM-DD (sur la date de placement).
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
    return new NextResponse('Non autorisé', { status: 401 });
  }

  const url = new URL(req.url);
  const debut = url.searchParams.get('debut') ?? '';
  const fin = url.searchParams.get('fin') ?? '';
  const filtreDate: { gte?: Date; lte?: Date } = {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(debut)) filtreDate.gte = new Date(`${debut}T00:00:00Z`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(fin)) filtreDate.lte = new Date(`${fin}T23:59:59Z`);

  const placements = await prisma.placement.findMany({
    where: {
      organisationId: user.organisationId,
      ...(filtreDate.gte || filtreDate.lte ? { placeAt: filtreDate } : {})
    },
    include: {
      recruteur: { select: { prenom: true, nom: true, societe: true, telephone: true } },
      candidat: { select: { prenom: true, nom: true, telephone: true } },
      demande: { select: { titre: true } },
      paiement: { select: { date: true, mode: true } }
    },
    orderBy: { placeAt: 'asc' }
  });

  const n = (v: unknown) => Number(v).toFixed(2).replace('.', ',');
  const d = (v: Date | null | undefined) =>
    v ? v.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : '';
  const lignes = [
    [
      'Date placement',
      'Recruteur',
      'Société',
      'Téléphone recruteur',
      'Candidat',
      'Téléphone candidat',
      'Demande',
      'Commission (€)',
      'Statut',
      'Payé le',
      'Mode paiement',
      'Motif annulation'
    ].join(';')
  ];
  for (const p of placements) {
    lignes.push(
      [
        d(p.placeAt),
        `${p.recruteur.prenom} ${p.recruteur.nom}`,
        p.recruteur.societe ?? '',
        p.recruteur.telephone,
        `${p.candidat.prenom} ${p.candidat.nom}`,
        p.candidat.telephone,
        p.demande?.titre ?? 'spontané',
        n(p.commissionMontant),
        p.commissionStatut,
        d(p.paiement?.date),
        p.paiement ? (p.paiement.mode === 'ESPECES' ? 'Espèces' : 'Virement') : '',
        p.motifAnnulation ?? ''
      ]
        .map((c) => String(c).replace(/;/g, ','))
        .join(';')
    );
  }

  const suffixe = debut || fin ? `-${debut || 'debut'}_${fin || 'fin'}` : '';
  return new NextResponse('﻿' + lignes.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="krontrol-commissions${suffixe}.csv"`
    }
  });
}
