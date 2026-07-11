# CLAUDE.md — État du projet Krontrol

SaaS de gestion de main-d'œuvre agricole saisonnière (spec : **KRONTROL-PROMPT-V3** —
V2 + rôle MANAGER + parcelles cadastrales du client + carte IGN + import de masse +
portail client lecture seule).
Organisation pilote : Pickajob. Multi-tenant : **toute** requête est scopée par
`organisationId` issu de la session.

## Avancement

- [x] **Phase 1 — Setup** : Next.js 14 (App Router) + TS + Tailwind, Prisma 6 + PostgreSQL
      (schéma complet section 5), NextAuth (email/mdp ADMIN-RH + téléphone/PIN ouvriers,
      rate-limiting 5 échecs → 15 min), i18n FR/RO/ES (next-intl, cookie), thème Krontrol
      (démo HTML), seed de dev.
- [x] **Phase 2 — CRUD back-office** : Clients, Missions + Parcelles (gestion inline sur la
      fiche mission, total d'heures validées temps réel), Ouvriers (recherche, PIN 4 chiffres
      hashé, déblocage rate-limit, taux individuel, statuts ACTIF/INACTIF/VIVIER),
      Logements (capacité, tarif/jour, occupation du jour). Server actions + zod + audit,
      tout scopé organisationId. Placeholders pour les modules des phases suivantes.
- [x] **Phase 3 — Affectations** : vue admin par jour (défaut J+1, navigation ←/→),
      création par créneau (mission → parcelle → début/fin/pause → instructions), équipes
      recomposables avec chef du jour, publication (brouillon → publiée), « Dupliquer hier »
      (copie la veille, non publiée), suivi confirmations temps réel. Écran ouvrier
      « Aujourd'hui » (+ demain dès publication) : cartes créneau/client/adresse/instructions,
      bouton Itinéraire (Google Maps), confirmation « J'y serai » (1 tap).
- [x] **Phase 4 — Messagerie** : interface `MessageChannel` (lib/messaging) — Telegram Bot API
      (token vide → statut SIMULE), WhatsApp niveau 1 en liens wa.me pré-remplis (LIEN_GENERE),
      structure prête pour Cloud API niveau 2. Templates FR/RO/ES ({prenom}, {client}, {date}…)
      surchargeables via parametres.templates. Page « ✉ Messages » par affectation : envoi
      Telegram à chacun ou au chef seul, boutons wa.me par destinataire, journal EnvoiMessage.
      Webhook /api/telegram/webhook : association chat ↔ téléphone par partage de contact.
- [x] **Phase 5 — Heures** : « Mes heures » ouvrier pré-rempli depuis les affectations
      publiées (1 tap si conforme), ajustement début/fin/pause (stepper 15 min), ajout de
      créneau non planifié, total du jour, anti-chevauchement (lib/heures.ts), statuts
      visibles (en attente/validé/corrigé), historique du mois. Chef d'équipe : saisie
      groupée de son équipe du jour (« appliquer à tous » + ajustement individuel, règle 7
      contrôlée serveur). Admin : tableau de validation filtrable (jour/statut/mission/
      ouvrier + « tout l'en-attente »), validation ligne/masse, correction tracée
      (CORRIGE + audit avant/après), saisie manuelle directement validée. tauxApplique
      figé à la saisie (règle 2).
- [x] **Phase 6 — Acomptes** : lib/money.ts (recap mensuel complet : heures validées × taux,
      acomptes déduits APPROUVE/VERSE, logement, retenues, net — sert aussi aux phases 8/9).
      Admin : demandes du portail à approuver (mode) / refuser, enregistrement direct
      (espèces/virement), APPROUVE → « Marquer versé », historique par mois. Garde-fou
      règle 5 : blocage soft si Σ acomptes > gagné validé du mois, case « Forcer » +
      audit `.force`. Portail : « Demander un acompte » (montant + motif, 1 demande en
      attente max), statut visible.
- [x] **Phase 7 — Séjours + Retenues** : fiche logement enrichie (séjours arrivée incluse /
      départ exclu paramétrable, statuts présent/à venir/terminé, clôture de séjour, contrôle
      anti-chevauchement par ouvrier, occupation vs capacité avec alerte sur-occupation).
      Retenues : lignes libres (libellé/montant/date/note) par ouvrier, vue mensuelle,
      suppression. Le décompte logement (indépendant des jours travaillés) est déjà branché
      dans lib/money.ts.
- [x] **Phase 8 — « Mon argent »** : ticket de caisse temps réel (style démo, mono +
      pointillés + bloc net encre/ambre) — heures validées × taux (groupées par taux),
      ligne indicative « en attente (non comptées) », acomptes datés, logement (jours ×
      tarif + séjours), retenues libellées, NET À RECEVOIR. Demande d'acompte intégrée,
      historique des mois clôturés (PDF, phase 9). Bloc situation temps réel ajouté à la
      fiche ouvrier admin (spec 4.3).
- [x] **Phase 9 — Clôture mensuelle** : snapshot immuable (ClotureMois.donnees JSON), par
      ouvrier ou en masse, bloquée si heures EN_ATTENTE sur le mois. Versement tracé
      (espèces/virement + date), réouverture ADMIN seule (statut ROUVERTE + audit) puis
      re-clôture. PDF bilingue FR + langue ouvrier (@react-pdf/renderer, police DejaVu
      pour les diacritiques RO, format ticket), servi par /api/clotures/[id]/pdf (accès :
      ADMIN/RH ou l'ouvrier concerné). Export CSV compta (; + BOM Excel). Envoi du récap
      Telegram/wa.me (template RECAP). Mois clôturés visibles dans « Mon argent ».
- [x] **Phase 10 — Pennylane** : lib/pennylane.ts (API externe v2, clé par organisation ou
      env, vide → SIMULATION avec ids sim_…), mapping clients auto (ensureCustomer, id stocké).
      Composeur de facture depuis une mission (ADMIN seul) : lignes heures recalculées serveur
      sur période (groupées ou détail par ouvrier, nominatif optionnel, taux modifiable),
      ligne forfait/tâche, lignes libres, aperçu HT, envoi brouillon ou finalisée.
      Liste des factures + synchronisation du statut (brouillon/envoyée/payée).
- [x] **Phase 11 — Dashboard + alertes + crons** : lib/alertes.ts (logés sans affectation
      nominatif, heures non saisies, acomptes > gagné, synthèse du jour). Dashboard : 6
      cartes d'alerte cliquables (rouge/ambre/vert) + listes nominatives + compteurs du jour.
      Crons Vercel (vercel.json, Authorization: Bearer CRON_SECRET) : /api/cron/
      loges-sans-affectation (7h Paris ≈ 5h UTC) et rappel-heures (19h ≈ 17h UTC — push PWA
      + Telegram, simulation si vide). lib/push.ts (web-push, no-op si clés VAPID vides).
- [x] **Phase 12 — PWA + push + paramètres + sécurité** : manifest + icônes (192/512 +
      maskable + apple), service worker (push + notificationclick), abonnement push
      automatique côté portail (silencieux si VAPID vide). Push branchés : affectation
      publiée, acompte approuvé/refusé, récap dispo, rappel 19h. Page Paramètres (ADMIN) :
      tarif de base, règle départ logement, token Telegram, clé Pennylane, modèles de
      messages 3×3, tags de compétences, comptes ADMIN/RH. Durcissements : secret webhook
      Telegram, rate-limiting du login admin (5 échecs → 15 min), en-têtes sécurité.
- [x] **Phase 13 — Vivier & Recrutement** : portail public /rejoindre trilingue (formulaire
      simple, compétences en boutons, honeypot + rate-limit IP, dédoublonnage par téléphone
      → rattachement au profil existant, écran de confirmation traduit). File « Candidatures
      à valider » (approuver → VIVIER / refuser / liste noire motif obligatoire, bandeau
      rouge si téléphone en liste noire). Fiche profil : note 5★ ADMIN seul (jamais visible
      ouvrier), commentaire, tags, historique auto (saisons/heures/missions/taux de
      confirmation/logements), notes internes, liste noire tracée + sortie ADMIN.
      Recherche vivier : nom/téléphone + filtres combinables (compétences ET, note min,
      langue, statut) + tri note/nom/dernière saison. Contact wa.me/Telegram individuel et
      groupé (template VIVIER langue du profil, éditable, journalisé), réactivation 1 clic
      (historique conservé, PIN gardé ou re-saisi).
- [x] **Phase 14 (V3) — Rôles & parcelles client** : RH → MANAGER (mêmes droits back-office,
      jamais Pennylane/paramètres/comptes/notes 5★ — gardes `requireAdminStrict`), nouveau
      rôle CLIENT (email/mdp, `User.clientId`). **Parcelle rattachée au CLIENT** (règle 15) :
      champs cadastraux (INSEE/section/numéro), géométrie GeoJSON, centroïde indexé, surface,
      cépage/millésime, source, anti-doublon `(codeInsee, section, numero, clientId)`.
      Affectations **multi-parcelles** (`AffectationParcelle`), messages avec bloc parcelles
      numéroté (réf + surface + lien Maps) + Telegram `sendLocation` par parcelle, écran
      ouvrier avec itinéraire par centroïde + mini-aperçu statique IGN (WMS + SVG).
      Bases existantes : exécuter `prisma/migration-v3.sql` AVANT `prisma db push`.
- [x] **Phase 15 (V3) — Carte & import** : `/admin/carte` Leaflet plein écran, 3 fonds IGN
      Géoplateforme (ortho/Plan IGN/overlay cadastre, gratuits sans clé), polygones colorés
      par client + bordure statut (gris/orange/vert), chargement par viewport, panneau
      filtrable, saisie Mode A (autocomplétion commune API Géo → API Carto par référence)
      et Mode B (« Pointer une parcelle » → API Carto par point), multi-candidates,
      sélection multiple → affectation pré-remplie. `/admin/import-parcelles` : xlsx/xls/
      csv/geojson/kml parsés navigateur, modèle Excel, mapping interactif, aperçu +
      validation à blanc, lots résumables (`/api/import/[id]/process`, 15 lignes/appel,
      5 appels IGN max — contrainte Vercel), dédoublonnage, rapport d'erreurs .xlsx,
      reprise après rechargement. Tous les appels IGN passent par le serveur.
- [x] **Phase 16 (V3) — Portail client** : `/client` lecture seule FR (rôle CLIENT) —
      Mes missions (heures validées temps réel, tarif seulement si
      `Client.afficherTarifAuClient`), Ma carte (parcelles du client + statut dernière
      intervention), Planning (affectations publiées à venir, « N ouvriers », noms visibles
      seulement si paramètre org `afficherNomsOuvriersAuClient`, chef montré), Historique
      par parcelle (carnet de travaux : date, travaux, heures validées). Jamais de taux
      ouvriers/acomptes/logements/vivier. Mini-carte « parcelles du jour » sur le dashboard
      admin (bordure = confirmations équipe). Comptes CLIENT gérés dans Paramètres.
- [x] **Phase 17 — Module Recruteurs** : rôle RECRUTEUR (inscription publique ouverte
      `/recruteur/inscription`, suspension = `actif:false` bloque le login). Portail
      `/recruteur` **trilingue FR/RO/ES** (namespace `recruiter`, drapeaux, lien
      pré-langué `?lang=ro|es`, erreurs serveur traduites via champ caché `langueUi`,
      langue d'inscription → `User.langue` pour les notifications) : demandes ouvertes
      (commission, pourvus X/N), proposer un candidat
      (sur demande ou spontané, téléphone = clé de dédoublonnage, doublon signalé),
      « Mes candidats » (statuts), « Mes gains » (ticket généré/payé/reste dû). Admin :
      `/admin/demandes` (CRUD + notification Telegram auto + wa.me, template DEMANDE
      FR/RO/ES), propositions dans `/admin/candidatures` (badge « via [Recruteur] »,
      accepter → VIVIER + Placement si éligible), `/admin/recruteurs` (stats, fiche gains,
      paiement FIFO, annulation sous délai motivée, suspension), export CSV
      `/api/commissions/export`, 2 cartes dashboard, 3 réglages dans Paramètres. Règles
      anti-abus (spec §E) dans `lib/recruteurs.ts` : commission fixe (défaut 100 €),
      profil déjà connu jamais commissionné SAUF INACTIF > delaiRepropositionMois (12),
      premier recruteur crédité en cas de double proposition, annulation ≤
      delaiAnnulationPlacementJours (7), liste noire bloquée, tout audité. Migration base
      existante : `prisma/migration-recruteurs.sql` (déjà appliquée en prod).

- [x] **Phase 18 — Embauche digitale (onboarding)** : bouton « 🚀 Embaucher » (fiche vivier)
      → mini-formulaire (modèle de contrat, dates, taux, logement → séjour créé) → dossier
      EN_COURS + checklist 6 items. **Deux modes** : lien sécurisé `/embauche/[token]`
      (7 jours paramétrables, sans compte, trilingue FR/RO/ES) ET mode kiosque
      (`/admin/embauches/[id]/kiosque` — même parcours, l'ouvrier signe lui-même, admin
      accompagnant tracé). Étapes : pièce d'identité (photo compressée client + **OCR
      vision Claude** si clé `anthropicApiKey`/env, sinon saisie — écran de confirmation
      obligatoire règle 1, alerte expiration), n° sécu (photo carte vitale/saisie/« pas
      encore immatriculé » → FLAG MSA), IBAN facultatif (badge « espèces uniquement »),
      mutuelle adhésion/dispense + motif, contrat (moteur de templates `{{variables}}`,
      Paramètres → Modèles de documents, placeholders substituables) — **signature au
      doigt** (canvas) → PDF DejaVu + page de traçabilité (horodatage/appareil/IP/mode/
      admin) + SHA-256. **DPAE niveau 1** : écran champs TESA/MSA copiables (n° employeur
      MSA/SIRET/adresse dans Paramètres) + récépissé, alerte si début ≤ demain
      (`DpaeProvider` isolé pour l'EDI futur). **Verrou règle 5** : ACTIF impossible si
      checklist incomplète (aussi dans vivier/fiche ouvrier), forçage ADMIN motivé →
      statut FORCE + bannière rouge. **Coffre-fort** : `DocumentOuvrier` chiffré
      **AES-256-GCM** (`DOCUMENTS_ENCRYPTION_KEY`, numéro de sécu aussi chiffré),
      consultations auditées, `/api/documents/[id]`, ZIP par ouvrier + ZIP « contrôle
      MSA » par période (`/api/documents/zip`, lib/zip.ts pur TS), purge > rétention
      (Paramètres). 2 cartes dashboard (embauches en cours/DPAE urgente, pièces expirant
      < 30 j). Migration : `prisma/migration-embauche.sql` (appliquée en prod).

## Lancer le projet en local

```bash
# 1. PostgreSQL local (ou Neon/Supabase) puis .env (voir .env.example)
# 2. Installer et préparer
npm install
npx prisma db push        # crée le schéma
npx prisma db seed        # données de démo
npm run dev               # http://localhost:3000
```

> Spécifique à cet environnement de dev : les moteurs Prisma sont dans `/opt/prisma-engines`
> (variables `PRISMA_*` dans `.env`) car le proxy bloque leur téléchargeur.

## Comptes de test (seed)

| Rôle | Identifiant | Secret |
|---|---|---|
| ADMIN | admin@pickajob.fr (sur /admin/login) | admin123 |
| MANAGER | manager@pickajob.fr | admin123 |
| CLIENT (portail /client) | client@domaine-schmitt.fr (sur /client/login) | admin123 |
| Chef d'équipe | +40711111111 (sur /) | PIN 1234 |
| Ouvrier (RO) | +40722222222 | PIN 1234 |
| Ouvrier (RO) | +40733333333 | PIN 1234 |
| Ouvrier (ES) | +34644444444 | PIN 1234 |
| RECRUTEUR (portail /recruteur) | inscription libre sur /recruteur/inscription | — |

**Tester la connexion PIN** : ouvrir `http://localhost:3000`, saisir `+40722222222`
(ou `0722…` sera normalisé), taper `1234` sur le pavé — la connexion part au 4ᵉ chiffre.
5 PIN faux d'affilée → blocage 15 min (message traduit). Session 30 jours.

## Architecture

```
prisma/schema.prisma      # modèle complet (section 5) + rate-limit PIN + push
prisma/seed.ts
src/
  middleware.ts           # garde /admin (ADMIN|MANAGER), /app (ouvriers), /client (CLIENT), /recruteur (RECRUTEUR)
  i18n/request.ts         # locale par cookie NEXT_LOCale, tz Europe/Paris
  messages/{fr,ro,es}.json
  lib/
    prisma.ts  auth.ts  session.ts   # requireAdmin/requireAdminStrict/requireWorker
    dates.ts   # helpers Europe/Paris, durées, chevauchements, formats
    audit.ts   # AuditLog
  app/
    page.tsx + worker-login.tsx      # login ouvrier (pavé PIN, style démo)
    locale-action.ts                 # server action changement de langue
    admin/login  admin/(layout+dashboard placeholder)
    app/ (layout + tabbar)           # Aujourd'hui / Mes heures / Mon argent (placeholders)
    api/auth/[...nextauth]
```

## Conventions

- Mutations = **server actions** colocalisées (`actions.ts`) ; toujours `requireAdmin()`/
  `requireWorker()` puis scoper par `user.organisationId`.
- Heures `"HH:MM"` (chaînes), dates `@db.Date` via helpers de `lib/dates.ts`, argent `Decimal`.
- Actions sensibles → `audit()`.
- UI : classes utilitaires `.card .btn .btn-green .input .label .badge…` (globals.css),
  palette papier/encre/vert/ambre de la démo. Boutons ouvriers ≥ 56px.
