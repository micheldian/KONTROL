import 'server-only';
import { prisma } from '@/lib/prisma';

// Migrations idempotentes appliquées au démarrage de chaque instance (instrumentation.ts)
// et, par sécurité, avant le premier usage des fonctionnalités concernées. La base de
// production n'est pas migrée à la main au déploiement : chaque instruction doit être
// rejouable sans effet (IF NOT EXISTS). Les fichiers prisma/migration-*.sql restent la
// référence pour une application manuelle.
const INSTRUCTIONS: string[] = [
  // SMS / message de connexion (vivier)
  `ALTER TYPE "CanalMessage" ADD VALUE IF NOT EXISTS 'SMS'`,
  `ALTER TYPE "ContexteMessage" ADD VALUE IF NOT EXISTS 'CONNEXION'`,
  // Photo de l'ouvrier
  `CREATE TABLE IF NOT EXISTS "PhotoOuvrier" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "contenu" BYTEA NOT NULL,
    "majAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "majParId" TEXT,
    CONSTRAINT "PhotoOuvrier_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PhotoOuvrier_userId_key" ON "PhotoOuvrier"("userId")`,
  `DO $$ BEGIN
    ALTER TABLE "PhotoOuvrier" ADD CONSTRAINT "PhotoOuvrier_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`
];

let enCours: Promise<void> | null = null;

/** Applique toutes les migrations auto (une fois par instance ; nouvel essai en cas d'échec). */
export function assurerMigrations(): Promise<void> {
  if (!enCours) {
    enCours = (async () => {
      for (const sql of INSTRUCTIONS) {
        // Hors $transaction : ALTER TYPE … ADD VALUE ne s'exécute pas dans une transaction.
        await prisma.$executeRawUnsafe(sql);
      }
    })().catch((e) => {
      enCours = null;
      throw e;
    });
  }
  return enCours;
}
