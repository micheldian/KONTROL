# DECISIONS.md — décisions prises pendant le run autonome

Journal des ambiguïtés rencontrées et des choix faits (règle 4 du run autonome) :
à chaque fois, la décision la plus simple et cohérente avec la spec a été retenue.

## Phase 1 — Setup

1. **Schéma Prisma complet dès la phase 1.** La section 5 est un modèle unique et cohérent ;
   le créer entièrement dès le départ évite le churn de migrations entre phases. Chaque phase
   n'utilise que ses tables.
2. **Heures stockées en chaînes `"HH:MM"`**, dates en `@db.Date` (minuit UTC = date calendaire
   Europe/Paris). Évite tous les pièges de fuseau : la spec raisonne en heures locales Paris.
3. **Rate-limiting PIN persisté en base** (champs `pinEchecs` / `pinBloqueJusqua` sur User) :
   blocage 15 min après 5 échecs, robuste face au serverless (pas d'état mémoire).
4. **Téléphone unique globalement** (pas seulement par organisation) : la spec dit
   « telephone unique » et la connexion ouvrier se fait par téléphone seul (sans indiquer
   d'organisation), donc l'unicité doit être globale.
5. **i18n par cookie (`NEXT_LOCALE`), sans préfixe d'URL.** next-intl sans routing : plus simple
   pour une PWA (une seule URL installée), la langue est aussi persistée sur le profil User.
   Back-office en français uniquement (utilisateurs internes Pickajob), portail ouvrier et
   portail candidat entièrement trilingues.
6. **NextAuth v4 (JWT, session 30 jours)** avec deux providers credentials : `admin-credentials`
   (email/mdp) et `pin` (téléphone/PIN). Le rôle et l'organisationId voyagent dans le JWT ;
   toutes les requêtes serveur re-scoppent par `organisationId` de session.
7. **Prisma 6 (et non 7)** : le téléchargeur de moteurs de Prisma crashe derrière le proxy de
   cet environnement (ECONNRESET). Moteurs téléchargés manuellement via curl dans
   `/opt/prisma-engines`, pointés par `PRISMA_QUERY_ENGINE_LIBRARY` / `PRISMA_SCHEMA_ENGINE_BINARY`
   (variables locales à cet environnement, inutiles sur Vercel).
8. **Normalisation des téléphones** : `0X XX XX XX XX` (10 chiffres commençant par 0) → `+33…`,
   `00…` → `+…`, sinon le numéro doit être saisi au format international. Clé unique du profil.
9. **PWA manifest référencé dès la phase 1** (layout), fichiers PWA complets livrés en phase 12.
10. **`ClotureMois.donnees` (Json)** ajouté au modèle : snapshot immuable du détail du ticket
    (lignes datées) pour régénérer le PDF sans dépendre des données vivantes.
11. **`StatutEnvoi`** enum ajouté sur EnvoiMessage (ENVOYE, SIMULE, ECHEC, LIEN_GENERE) : la spec
    demande un statut sans le détailler ; SIMULE couvre le mode simulation (token vide),
    LIEN_GENERE couvre les liens wa.me (pas d'envoi serveur en niveau 1).
