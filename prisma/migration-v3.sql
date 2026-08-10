-- Migration V2 → V3 pour une base EXISTANTE (à exécuter AVANT `npx prisma db push`).
-- Sur une base vide/neuve : inutile, `db push` + `db seed` suffisent.
--
-- Contenu :
--   1. Rôle RH → MANAGER (+ nouveau rôle CLIENT dans l'enum)
--   2. Parcelle : rattachée au Client (clientId/organisationId copiés depuis la mission)
--   3. AffectationParcelle : reprise des liens Affectation.parcelleId existants
-- `db push` appliquera ensuite le reste (nouvelles colonnes cadastrales, ImportBatch,
-- suppression des anciennes colonnes missionId/parcelleId, index/uniques).

BEGIN;

-- 1. Enum Role : ajouter MANAGER et CLIENT, migrer les lignes RH.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MANAGER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CLIENT';
COMMIT; -- les nouvelles valeurs d'enum doivent être committées avant usage
BEGIN;
UPDATE "User" SET role = 'MANAGER' WHERE role = 'RH';

-- 2. Parcelle → Client : copier clientId + organisationId depuis la mission propriétaire.
ALTER TABLE "Parcelle" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "Parcelle" ADD COLUMN IF NOT EXISTS "organisationId" TEXT;
UPDATE "Parcelle" p
SET "clientId" = m."clientId", "organisationId" = m."organisationId"
FROM "Mission" m
WHERE p."missionId" = m.id AND p."clientId" IS NULL;

-- 3. Multi-parcelles : reprendre les liens existants dans la table de jointure.
CREATE TABLE IF NOT EXISTS "AffectationParcelle" (
  "affectationId" TEXT NOT NULL,
  "parcelleId"    TEXT NOT NULL,
  CONSTRAINT "AffectationParcelle_pkey" PRIMARY KEY ("affectationId", "parcelleId")
);
INSERT INTO "AffectationParcelle" ("affectationId", "parcelleId")
SELECT id, "parcelleId" FROM "Affectation" WHERE "parcelleId" IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;

-- Puis : npx prisma db push   (supprimera Parcelle.missionId, Affectation.parcelleId,
-- la valeur d'enum RH restera orpheline — sans effet).
