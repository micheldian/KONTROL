-- CreateEnum
CREATE TYPE "StatutDossierEmbauche" AS ENUM ('EN_COURS', 'COMPLET', 'FORCE', 'ANNULE');

-- CreateEnum
CREATE TYPE "ModeOnboarding" AS ENUM ('DISTANT', 'KIOSQUE', 'MIXTE');

-- CreateEnum
CREATE TYPE "TypeChecklist" AS ENUM ('IDENTITE', 'SECU', 'IBAN', 'MUTUELLE', 'CONTRAT', 'DPAE');

-- CreateEnum
CREATE TYPE "StatutChecklist" AS ENUM ('A_FAIRE', 'FAIT', 'FLAG', 'NON_BLOQUANT');

-- CreateEnum
CREATE TYPE "TypeDocument" AS ENUM ('ID_RECTO', 'ID_VERSO', 'CARTE_VITALE', 'RIB', 'CONTRAT_SIGNE', 'MUTUELLE_ADHESION', 'MUTUELLE_DISPENSE', 'DPAE_RECEPISSE', 'AUTRE');

-- CreateEnum
CREATE TYPE "CategorieModele" AS ENUM ('CONTRAT', 'MUTUELLE_ADHESION', 'MUTUELLE_DISPENSE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "adresse" TEXT,
ADD COLUMN     "dateNaissance" DATE,
ADD COLUMN     "immatriculationEnCours" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lieuNaissance" TEXT,
ADD COLUMN     "nationalite" TEXT,
ADD COLUMN     "numeroSecu" TEXT,
ADD COLUMN     "pieceIdentiteExpireAt" DATE;

-- CreateTable
CREATE TABLE "DossierEmbauche" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "statut" "StatutDossierEmbauche" NOT NULL DEFAULT 'EN_COURS',
    "mode" "ModeOnboarding" NOT NULL DEFAULT 'MIXTE',
    "modeleContratId" TEXT,
    "dateDebut" DATE NOT NULL,
    "dateFinPrevue" DATE,
    "tauxHoraire" DECIMAL(8,2) NOT NULL,
    "logementId" TEXT,
    "tokenOnboarding" TEXT,
    "tokenExpireAt" TIMESTAMP(3),
    "dpaeNumero" TEXT,
    "dpaeDeposeAt" TIMESTAMP(3),
    "forceMotif" TEXT,
    "forceParId" TEXT,
    "forceAt" TIMESTAMP(3),
    "annuleMotif" TEXT,
    "creeParId" TEXT NOT NULL,
    "creeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completAt" TIMESTAMP(3),

    CONSTRAINT "DossierEmbauche_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "type" "TypeChecklist" NOT NULL,
    "statut" "StatutChecklist" NOT NULL DEFAULT 'A_FAIRE',
    "detail" TEXT,
    "faitAt" TIMESTAMP(3),
    "faitParId" TEXT,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentOuvrier" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dossierId" TEXT,
    "type" "TypeDocument" NOT NULL,
    "nomFichier" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "contenu" BYTEA NOT NULL,
    "hashSha256" TEXT NOT NULL,
    "ocrData" JSONB,
    "expireAt" DATE,
    "uploadeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadeParId" TEXT,

    CONSTRAINT "DocumentOuvrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModeleContrat" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "categorie" "CategorieModele" NOT NULL DEFAULT 'CONTRAT',
    "nom" TEXT NOT NULL,
    "contenuTemplate" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModeleContrat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureElec" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "signataireUserId" TEXT NOT NULL,
    "imageSignature" TEXT NOT NULL,
    "horodatage" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAdresse" TEXT,
    "appareil" TEXT,
    "modeKiosque" BOOLEAN NOT NULL DEFAULT false,
    "adminAccompagnantId" TEXT,

    CONSTRAINT "SignatureElec_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DossierEmbauche_tokenOnboarding_key" ON "DossierEmbauche"("tokenOnboarding");

-- CreateIndex
CREATE INDEX "DossierEmbauche_organisationId_statut_idx" ON "DossierEmbauche"("organisationId", "statut");

-- CreateIndex
CREATE INDEX "DossierEmbauche_userId_idx" ON "DossierEmbauche"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistItem_dossierId_type_key" ON "ChecklistItem"("dossierId", "type");

-- CreateIndex
CREATE INDEX "DocumentOuvrier_organisationId_userId_idx" ON "DocumentOuvrier"("organisationId", "userId");

-- CreateIndex
CREATE INDEX "DocumentOuvrier_organisationId_type_idx" ON "DocumentOuvrier"("organisationId", "type");

-- CreateIndex
CREATE INDEX "ModeleContrat_organisationId_categorie_idx" ON "ModeleContrat"("organisationId", "categorie");

-- CreateIndex
CREATE UNIQUE INDEX "SignatureElec_documentId_key" ON "SignatureElec"("documentId");

-- AddForeignKey
ALTER TABLE "DossierEmbauche" ADD CONSTRAINT "DossierEmbauche_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DossierEmbauche" ADD CONSTRAINT "DossierEmbauche_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DossierEmbauche" ADD CONSTRAINT "DossierEmbauche_modeleContratId_fkey" FOREIGN KEY ("modeleContratId") REFERENCES "ModeleContrat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DossierEmbauche" ADD CONSTRAINT "DossierEmbauche_logementId_fkey" FOREIGN KEY ("logementId") REFERENCES "Logement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "DossierEmbauche"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentOuvrier" ADD CONSTRAINT "DocumentOuvrier_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentOuvrier" ADD CONSTRAINT "DocumentOuvrier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentOuvrier" ADD CONSTRAINT "DocumentOuvrier_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "DossierEmbauche"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModeleContrat" ADD CONSTRAINT "ModeleContrat_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureElec" ADD CONSTRAINT "SignatureElec_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DocumentOuvrier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureElec" ADD CONSTRAINT "SignatureElec_signataireUserId_fkey" FOREIGN KEY ("signataireUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

