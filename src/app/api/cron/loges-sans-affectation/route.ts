import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logesSansAffectation } from '@/lib/alertes';

export const dynamic = 'force-dynamic';

// Cron 7h Europe/Paris : « qui est logé mais pas affecté aujourd'hui ? »
// La liste nominative est visible sur le dashboard ; l'endpoint renvoie le détail
// (utilisable pour brancher une notification admin).
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Non autorisé', { status: 401 });
  }

  const organisations = await prisma.organisation.findMany();
  const resultats: Record<string, { nom: string; logement: string }[]> = {};
  for (const org of organisations) {
    const liste = await logesSansAffectation(org.id);
    resultats[org.nom] = liste.map((l) => ({ nom: l.nom, logement: l.logement }));
  }

  return NextResponse.json({ ok: true, logesSansAffectation: resultats });
}
