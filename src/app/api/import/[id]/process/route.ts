// Traitement par lots résumable (spec §5.14.5) : chaque appel traite ~15 lignes
// (concurrence limitée sur les appels IGN), met à jour les compteurs et renvoie
// l'état. Le navigateur boucle tant que lignesTraitees < totalLignes ; l'état
// vivant dans ImportBatch, l'import reprend même après rechargement de la page.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import {
  parcelleParReference,
  parcelleParPoint,
  chercherCommunes,
  centroide,
  surfaceM2,
  type GeoJSONGeometry
} from '@/lib/geo';
import { enregistrerParcelleCadastrale } from '@/lib/parcelles';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LOT = 15; // lignes par appel
const CONCURRENCE = 5; // appels IGN simultanés max

type Ligne = {
  client_nom?: string;
  client_contact?: string;
  client_telephone?: string;
  client_email?: string;
  commune?: string;
  code_insee?: string;
  section?: string;
  numero?: string;
  latitude?: string | number;
  longitude?: string | number;
  cepage?: string;
  millesime?: string | number;
  notes?: string;
  geometry?: GeoJSONGeometry; // fichiers GeoJSON/KML
  __ligne?: number; // n° de ligne d'origine (rapport d'erreurs)
};

type Erreur = { ligne: number; raison: string; donnees: Record<string, unknown> };

function texte(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const batch = await prisma.importBatch.findFirst({
    where: { id: params.id, organisationId: user.organisationId }
  });
  if (!batch) return NextResponse.json({ error: 'Import introuvable' }, { status: 404 });
  if (batch.statut === 'TERMINE') {
    return NextResponse.json({ batch: etat(batch) });
  }

  const lignes = (batch.payload as Ligne[] | null) ?? [];
  const debut = batch.lignesTraitees;
  const lot = lignes.slice(debut, debut + LOT);

  let clientsCrees = 0;
  let parcellesCreees = 0;
  let parcellesIgnorees = 0;
  const erreurs: Erreur[] = [];

  // Caches du lot (en promesses : les lignes d'un même client traitées en
  // parallèle partagent la même résolution — pas de double création)
  const cacheClients = new Map<string, Promise<string>>();
  const cacheInsee = new Map<string, string>();

  const resoudreClient = (l: Ligne): Promise<string> => {
    const nom = texte(l.client_nom);
    if (!nom) return Promise.reject(new Error('client_nom manquant'));
    const cle = nom.toLowerCase().replace(/\s+/g, ' ');
    let promesse = cacheClients.get(cle);
    if (!promesse) {
      promesse = (async () => {
        const existant = await prisma.client.findFirst({
          where: { organisationId: user.organisationId, nom: { equals: nom, mode: 'insensitive' } }
        });
        if (existant) return existant.id;
        try {
          const cree = await prisma.client.create({
            data: {
              organisationId: user.organisationId,
              nom,
              contact: texte(l.client_contact) || null,
              telephone: texte(l.client_telephone) || null,
              email: texte(l.client_email) || null
            }
          });
          clientsCrees++;
          return cree.id;
        } catch (e) {
          // Conflit unique (créé entre-temps par un autre lot) → relire
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            const gagnant = await prisma.client.findFirst({
              where: { organisationId: user.organisationId, nom: { equals: nom, mode: 'insensitive' } }
            });
            if (gagnant) return gagnant.id;
          }
          throw e;
        }
      })();
      cacheClients.set(cle, promesse);
    }
    return promesse;
  };

  const resoudreInsee = async (l: Ligne): Promise<string | null> => {
    const direct = texte(l.code_insee);
    if (direct) return direct; // prioritaire sur le nom de commune
    const commune = texte(l.commune);
    if (!commune) return null;
    const cle = commune.toLowerCase();
    const enCache = cacheInsee.get(cle);
    if (enCache) return enCache;
    const candidats = await chercherCommunes(commune);
    if (candidats.length === 0) throw new Error(`Commune introuvable : ${commune}`);
    cacheInsee.set(cle, candidats[0].code);
    return candidats[0].code;
  };

  const traiterLigne = async (l: Ligne, index: number) => {
    const numLigne = l.__ligne ?? debut + index + 2; // +2 : en-tête + index 0
    try {
      const clientId = await resoudreClient(l);
      const extra = {
        cepage: texte(l.cepage) || null,
        millesime: Number(l.millesime) > 1900 ? Number(l.millesime) : null,
        notes: texte(l.notes) || null
      };

      // (c) Géométrie déjà présente (GeoJSON/KML) — pas d'appel IGN
      if (l.geometry && l.geometry.coordinates) {
        const c = centroide(l.geometry);
        // Anti-doublon sans référence cadastrale : même client + même centroïde
        if (c) {
          const doublon = await prisma.parcelle.findFirst({
            where: {
              clientId,
              centroidLat: { gte: c.lat - 1e-6, lte: c.lat + 1e-6 },
              centroidLng: { gte: c.lng - 1e-6, lte: c.lng + 1e-6 }
            }
          });
          if (doublon) {
            parcellesIgnorees++;
            return;
          }
        }
        await prisma.parcelle.create({
          data: {
            organisationId: user.organisationId,
            clientId,
            geometry: l.geometry as unknown as Prisma.InputJsonValue,
            centroidLat: c?.lat ?? null,
            centroidLng: c?.lng ?? null,
            surfaceM2: surfaceM2(l.geometry),
            commune: texte(l.commune) || null,
            codeInsee: texte(l.code_insee) || null,
            section: texte(l.section) || null,
            numero: texte(l.numero) || null,
            source: 'IMPORT_GEOMETRIE',
            ...extra
          }
        });
        parcellesCreees++;
        return;
      }

      // (a) Référence cadastrale → API Carto
      const section = texte(l.section);
      const numero = texte(l.numero);
      const insee = await resoudreInsee(l);
      if (insee && section && numero) {
        const trouvees = await parcelleParReference(insee, section, numero);
        if (trouvees.length === 0) {
          throw new Error(`Parcelle inexistante côté IGN : ${insee} ${section} ${numero}`);
        }
        const resultat = await enregistrerParcelleCadastrale({
          organisationId: user.organisationId,
          userId: user.userId,
          clientId,
          cad: trouvees[0],
          source: 'IMPORT_REFERENCE',
          extra
        });
        if (resultat.doublon) parcellesIgnorees++;
        else parcellesCreees++;
        return;
      }

      // (b) Point lat/lng → parcelle intersectée
      const lat = Number(l.latitude);
      const lng = Number(l.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
        const trouvees = await parcelleParPoint(lat, lng);
        if (trouvees.length === 0) {
          throw new Error(`Aucune parcelle cadastrale au point ${lat}, ${lng}`);
        }
        const resultat = await enregistrerParcelleCadastrale({
          organisationId: user.organisationId,
          userId: user.userId,
          clientId,
          cad: trouvees[0],
          source: 'IMPORT_POINT',
          extra
        });
        if (resultat.doublon) parcellesIgnorees++;
        else parcellesCreees++;
        return;
      }

      throw new Error(
        'Aucune source de géométrie (référence cadastrale ou latitude/longitude requise)'
      );
    } catch (e) {
      erreurs.push({
        ligne: numLigne,
        raison: e instanceof Error ? e.message : String(e),
        donnees: { ...l, geometry: l.geometry ? '(géométrie)' : undefined }
      });
    }
  };

  // Concurrence limitée (courtoisie API IGN)
  for (let i = 0; i < lot.length; i += CONCURRENCE) {
    await Promise.all(lot.slice(i, i + CONCURRENCE).map((l, j) => traiterLigne(l, i + j)));
  }

  const lignesTraitees = debut + lot.length;
  const termine = lignesTraitees >= lignes.length;
  const maj = await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      statut: termine ? 'TERMINE' : 'EN_COURS',
      lignesTraitees,
      clientsCrees: batch.clientsCrees + clientsCrees,
      parcellesCreees: batch.parcellesCreees + parcellesCreees,
      parcellesIgnorees: batch.parcellesIgnorees + parcellesIgnorees,
      erreurs: [
        ...(((batch.erreurs as unknown) as Erreur[]) ?? []),
        ...erreurs
      ] as unknown as Prisma.InputJsonValue,
      // Payload purgé à la fin (les lignes ne servent plus, la base reste légère)
      ...(termine ? { payload: Prisma.JsonNull } : {})
    }
  });

  return NextResponse.json({ batch: etat(maj) });
}

function etat(b: {
  id: string;
  statut: string;
  totalLignes: number;
  lignesTraitees: number;
  clientsCrees: number;
  parcellesCreees: number;
  parcellesIgnorees: number;
  erreurs: unknown;
}) {
  return {
    id: b.id,
    statut: b.statut,
    totalLignes: b.totalLignes,
    lignesTraitees: b.lignesTraitees,
    clientsCrees: b.clientsCrees,
    parcellesCreees: b.parcellesCreees,
    parcellesIgnorees: b.parcellesIgnorees,
    erreurs: (b.erreurs as Erreur[] | null) ?? []
  };
}
