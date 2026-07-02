# CLAUDE.md — État du projet Krontrol

SaaS de gestion de main-d'œuvre agricole saisonnière (spec : KRONTROL-PROMPT-V2, 13 phases).
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
- [ ] Phase 6 — Acomptes
- [ ] Phase 7 — Logements (séjours) + Retenues
- [ ] Phase 8 — « Mon argent »
- [ ] Phase 9 — Clôture mensuelle + PDF bilingue + export
- [ ] Phase 10 — Pennylane
- [ ] Phase 11 — Dashboard + alertes + crons
- [ ] Phase 12 — PWA + push + polish + sécurité
- [ ] Phase 13 — Vivier & Recrutement

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
| RH | rh@pickajob.fr | admin123 |
| Chef d'équipe | +40711111111 (sur /) | PIN 1234 |
| Ouvrier (RO) | +40722222222 | PIN 1234 |
| Ouvrier (RO) | +40733333333 | PIN 1234 |
| Ouvrier (ES) | +34644444444 | PIN 1234 |

**Tester la connexion PIN** : ouvrir `http://localhost:3000`, saisir `+40722222222`
(ou `0722…` sera normalisé), taper `1234` sur le pavé — la connexion part au 4ᵉ chiffre.
5 PIN faux d'affilée → blocage 15 min (message traduit). Session 30 jours.

## Architecture

```
prisma/schema.prisma      # modèle complet (section 5) + rate-limit PIN + push
prisma/seed.ts
src/
  middleware.ts           # garde /admin (ADMIN|RH) et /app (OUVRIER|CHEF_EQUIPE)
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
