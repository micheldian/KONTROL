-- Photo de l'ouvrier (trombinoscope). Appliquée automatiquement au démarrage
-- (src/lib/migrations-auto.ts) ; ce fichier sert à une application manuelle.
CREATE TABLE IF NOT EXISTS "PhotoOuvrier" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "contenu" BYTEA NOT NULL,
    "majAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "majParId" TEXT,
    CONSTRAINT "PhotoOuvrier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PhotoOuvrier_userId_key" ON "PhotoOuvrier"("userId");
DO $$ BEGIN
  ALTER TABLE "PhotoOuvrier" ADD CONSTRAINT "PhotoOuvrier_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
