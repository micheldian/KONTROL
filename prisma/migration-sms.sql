-- SMS de connexion depuis le vivier (lien pré-langué + PIN).
-- Bases existantes : exécuter ce fichier AVANT `prisma db push`
-- (Postgres ne permet pas d'ajouter une valeur d'enum dans une transaction avec son usage).

-- AlterEnum
ALTER TYPE "CanalMessage" ADD VALUE IF NOT EXISTS 'SMS';

-- AlterEnum
ALTER TYPE "ContexteMessage" ADD VALUE IF NOT EXISTS 'CONNEXION';
