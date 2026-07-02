'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireAdminStrict } from '@/lib/session';
import { audit } from '@/lib/audit';
import { dateFromYMD, todayParis } from '@/lib/dates';
import {
  ensureCustomer,
  createInvoice,
  getInvoiceStatus,
  estSimulation,
  type LigneFacture
} from '@/lib/pennylane';

export type CompositionFacture = {
  missionId: string;
  brouillon: boolean;
  heures?: {
    inclure: boolean;
    du: string; // YYYY-MM-DD
    au: string; // YYYY-MM-DD (inclus)
    detailParOuvrier: boolean;
    nominatif: boolean;
    taux: number;
  };
  forfait?: { inclure: boolean; libelle: string; montant: number };
  lignesLibres: { libelle: string; quantite: number; prixUnitaire: number }[];
};

/** Compose et envoie la facture à Pennylane (les heures sont recalculées côté serveur). */
export async function envoyerFacture(composition: CompositionFacture) {
  const user = await requireAdminStrict();

  const mission = await prisma.mission.findFirst({
    where: { id: composition.missionId, organisationId: user.organisationId },
    include: { client: true, organisation: true }
  });
  if (!mission) throw new Error('Mission introuvable');

  const lignes: LigneFacture[] = [];

  if (composition.heures?.inclure) {
    const { du, au, taux, detailParOuvrier, nominatif } = composition.heures;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(du) || !/^\d{4}-\d{2}-\d{2}$/.test(au)) {
      throw new Error('Période invalide');
    }
    const creneaux = await prisma.creneauHeures.findMany({
      where: {
        organisationId: user.organisationId,
        missionId: mission.id,
        statut: { in: ['VALIDE', 'CORRIGE'] },
        date: { gte: dateFromYMD(du), lte: dateFromYMD(au) }
      },
      include: { user: true }
    });
    if (creneaux.length === 0) throw new Error('Aucune heure validée sur la période');

    const periode = `du ${du.split('-').reverse().join('/')} au ${au.split('-').reverse().join('/')}`;
    if (detailParOuvrier) {
      const parOuvrier = new Map<string, { nom: string; heures: number }>();
      for (const c of creneaux) {
        const cle = c.userId;
        const cur = parOuvrier.get(cle) ?? {
          nom: nominatif ? `${c.user.prenom} ${c.user.nom}` : `Ouvrier ${parOuvrier.size + 1}`,
          heures: 0
        };
        cur.heures += Number(c.heuresCalculees);
        parOuvrier.set(cle, cur);
      }
      for (const o of Array.from(parOuvrier.values())) {
        lignes.push({
          libelle: `Main-d'œuvre ${mission.libelle} — ${o.nom} (${periode})`,
          quantite: Math.round(o.heures * 100) / 100,
          prixUnitaire: taux,
          unite: 'heure'
        });
      }
    } else {
      const total = creneaux.reduce((a, c) => a + Number(c.heuresCalculees), 0);
      lignes.push({
        libelle: `Main-d'œuvre ${mission.libelle} (${periode})`,
        quantite: Math.round(total * 100) / 100,
        prixUnitaire: taux,
        unite: 'heure'
      });
    }
  }

  if (composition.forfait?.inclure) {
    if (!composition.forfait.libelle.trim() || composition.forfait.montant <= 0) {
      throw new Error('Forfait invalide');
    }
    lignes.push({
      libelle: composition.forfait.libelle.trim(),
      quantite: 1,
      prixUnitaire: composition.forfait.montant,
      unite: 'forfait'
    });
  }

  for (const l of composition.lignesLibres) {
    if (!l.libelle.trim()) continue;
    lignes.push({
      libelle: l.libelle.trim(),
      quantite: l.quantite || 1,
      prixUnitaire: l.prixUnitaire
    });
  }

  if (lignes.length === 0) throw new Error('Aucune ligne à facturer');
  const montantHT =
    Math.round(lignes.reduce((a, l) => a + l.quantite * l.prixUnitaire, 0) * 100) / 100;

  // Mapping client Krontrol ↔ Pennylane (création auto si absent)
  const customerId = await ensureCustomer({
    parametres: mission.organisation.parametres,
    client: mission.client
  });
  if (!mission.client.pennylaneCustomerId) {
    await prisma.client.update({
      where: { id: mission.client.id },
      data: { pennylaneCustomerId: customerId }
    });
  }

  const simulation = estSimulation(mission.organisation.parametres);
  const invoice = await createInvoice({
    parametres: mission.organisation.parametres,
    customerId,
    lignes,
    brouillon: composition.brouillon,
    dateFacture: todayParis(),
    libelle: `${mission.client.nom} — ${mission.libelle}`
  });

  const facture = await prisma.factureClient.create({
    data: {
      organisationId: user.organisationId,
      missionId: mission.id,
      pennylaneInvoiceId: invoice.id,
      lignes: lignes as object[],
      statut: simulation ? 'SIMULEE' : invoice.statut,
      montantHT
    }
  });

  await audit({
    organisationId: user.organisationId,
    userId: user.userId,
    action: simulation ? 'facture.simuler' : 'facture.envoyer',
    entite: 'FactureClient',
    entiteId: facture.id,
    apres: { montantHT, brouillon: composition.brouillon, lignes: lignes.length }
  });

  revalidatePath('/admin/factures');
  redirect('/admin/factures');
}

/** Synchronise le statut Pennylane (brouillon / envoyée / payée). */
export async function synchroniserStatut(formData: FormData) {
  const user = await requireAdminStrict();
  const id = formData.get('id') as string;

  const facture = await prisma.factureClient.findFirst({
    where: { id, organisationId: user.organisationId },
    include: { organisation: true }
  });
  if (!facture || !facture.pennylaneInvoiceId) throw new Error('Facture introuvable');

  const statut = await getInvoiceStatus({
    parametres: facture.organisation.parametres,
    invoiceId: facture.pennylaneInvoiceId
  });
  if (statut && statut !== facture.statut) {
    await prisma.factureClient.update({ where: { id }, data: { statut } });
  }
  revalidatePath('/admin/factures');
}
