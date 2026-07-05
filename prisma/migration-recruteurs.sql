-- CreateEnum
CREATE TYPE "StatutDemande" AS ENUM ('OUVERTE', 'POURVUE', 'FERMEE');

-- CreateEnum
CREATE TYPE "StatutProposition" AS ENUM ('PROPOSEE', 'ACCEPTEE', 'REFUSEE');

-- CreateEnum
CREATE TYPE "StatutCommission" AS ENUM ('DUE', 'PAYEE', 'ANNULEE');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'RECRUTEUR';

-- AlterEnum
ALTER TYPE "SourceProfil" ADD VALUE 'RECRUTEUR';

-- AlterEnum
ALTER TYPE "ContexteMessage" ADD VALUE 'DEMANDE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "societe" TEXT;

-- CreateTable
CREATE TABLE "DemandeMainOeuvre" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "nbPersonnes" INTEGER NOT NULL,
    "dateDebut" DATE NOT NULL,
    "dateFin" DATE,
    "region" TEXT,
    "description" TEXT,
    "conditions" TEXT,
    "commissionParPlacement" DECIMAL(8,2) NOT NULL,
    "statut" "StatutDemande" NOT NULL DEFAULT 'OUVERTE',
    "creeParId" TEXT NOT NULL,
    "creeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemandeMainOeuvre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandeCompetence" (
    "id" TEXT NOT NULL,
    "demandeId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "DemandeCompetence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropositionCandidat" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "demandeId" TEXT,
    "recruteurId" TEXT NOT NULL,
    "candidatUserId" TEXT NOT NULL,
    "statut" "StatutProposition" NOT NULL DEFAULT 'PROPOSEE',
    "motifRefus" TEXT,
    "doublonDetecte" BOOLEAN NOT NULL DEFAULT false,
    "creeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traiteParId" TEXT,
    "traiteAt" TIMESTAMP(3),

    CONSTRAINT "PropositionCandidat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "propositionId" TEXT NOT NULL,
    "recruteurId" TEXT NOT NULL,
    "candidatUserId" TEXT NOT NULL,
    "demandeId" TEXT,
    "commissionMontant" DECIMAL(8,2) NOT NULL,
    "commissionStatut" "StatutCommission" NOT NULL DEFAULT 'DUE',
    "motifAnnulation" TEXT,
    "placeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "annuleAt" TIMESTAMP(3),
    "paiementId" TEXT,

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaiementCommission" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "recruteurId" TEXT NOT NULL,
    "montant" DECIMAL(10,2) NOT NULL,
    "date" DATE NOT NULL,
    "mode" "ModePaiement" NOT NULL,
    "note" TEXT,
    "creeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaiementCommission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemandeMainOeuvre_organisationId_statut_idx" ON "DemandeMainOeuvre"("organisationId", "statut");

-- CreateIndex
CREATE UNIQUE INDEX "DemandeCompetence_demandeId_tagId_key" ON "DemandeCompetence"("demandeId", "tagId");

-- CreateIndex
CREATE INDEX "PropositionCandidat_organisationId_statut_idx" ON "PropositionCandidat"("organisationId", "statut");

-- CreateIndex
CREATE INDEX "PropositionCandidat_recruteurId_idx" ON "PropositionCandidat"("recruteurId");

-- CreateIndex
CREATE INDEX "PropositionCandidat_candidatUserId_idx" ON "PropositionCandidat"("candidatUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Placement_propositionId_key" ON "Placement"("propositionId");

-- CreateIndex
CREATE INDEX "Placement_organisationId_commissionStatut_idx" ON "Placement"("organisationId", "commissionStatut");

-- CreateIndex
CREATE INDEX "Placement_recruteurId_idx" ON "Placement"("recruteurId");

-- CreateIndex
CREATE INDEX "PaiementCommission_organisationId_recruteurId_idx" ON "PaiementCommission"("organisationId", "recruteurId");

-- AddForeignKey
ALTER TABLE "DemandeMainOeuvre" ADD CONSTRAINT "DemandeMainOeuvre_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeCompetence" ADD CONSTRAINT "DemandeCompetence_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "DemandeMainOeuvre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeCompetence" ADD CONSTRAINT "DemandeCompetence_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "CompetenceTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropositionCandidat" ADD CONSTRAINT "PropositionCandidat_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropositionCandidat" ADD CONSTRAINT "PropositionCandidat_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "DemandeMainOeuvre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropositionCandidat" ADD CONSTRAINT "PropositionCandidat_recruteurId_fkey" FOREIGN KEY ("recruteurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropositionCandidat" ADD CONSTRAINT "PropositionCandidat_candidatUserId_fkey" FOREIGN KEY ("candidatUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_propositionId_fkey" FOREIGN KEY ("propositionId") REFERENCES "PropositionCandidat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_recruteurId_fkey" FOREIGN KEY ("recruteurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_candidatUserId_fkey" FOREIGN KEY ("candidatUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "DemandeMainOeuvre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_paiementId_fkey" FOREIGN KEY ("paiementId") REFERENCES "PaiementCommission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaiementCommission" ADD CONSTRAINT "PaiementCommission_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaiementCommission" ADD CONSTRAINT "PaiementCommission_recruteurId_fkey" FOREIGN KEY ("recruteurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

