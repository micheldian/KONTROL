# RAPPORT-NUIT.md — Run autonome Krontrol (13 phases)

Les 13 phases de la section 8 de KRONTROL-PROMPT-V2 ont été réalisées, **un commit par
phase**, build `npm run build` vérifié vert et fonctionnalités testées (HTTP + base réelle)
avant chaque passage à la phase suivante. Décisions d'ambiguïté : voir `DECISIONS.md`
(32 entrées). État courant détaillé : `CLAUDE.md`.

---

## 1. Couverture de la spec (sections 3, 3bis, 4)

### Section 3 — Portail ouvrier (mobile-first, FR/RO/ES)
| Fonctionnalité | État |
|---|---|
| 3.1 Téléphone + PIN 4 chiffres (bcrypt), blocage 15 min après 5 échecs, session 30 j | ✅ |
| 3.1 Sélecteur de langue FR/RO/ES persistant (drapeaux), portail traduit | ✅ (cookie + profil) |
| 3.2 « Aujourd'hui » : affectations chronologiques, adresse, instructions | ✅ |
| 3.2 Bouton Itinéraire (Google Maps), « ✓ J'y serai » visible côté admin | ✅ |
| 3.2 « Pas de mission aujourd'hui », demain visible dès publication | ✅ |
| 3.3 Saisie par créneaux pré-remplie (1 tap), pause au stepper | ✅ |
| 3.3 Créneau non planifié (mission dans une liste), total auto | ✅ |
| 3.3 Chef d'équipe : saisie groupée + ajustement individuel (équipe du jour seulement) | ✅ |
| 3.3 Historique du mois avec statuts, rappel 19h | ✅ (cron + push/Telegram) |
| 3.4 « Mon argent » ticket temps réel, en-attente indicatif, détails datés | ✅ |
| 3.4 Historique des mois clôturés + PDF | ✅ |
| 3.4 « Demander un acompte » (montant + motif) | ✅ |

### Section 3bis — Portail public /rejoindre
| Fonctionnalité | État |
|---|---|
| Page publique trilingue, aucun compte, mobile-first | ✅ |
| Formulaire nom/prénom/téléphone/langue/expérience/compétences (cases) | ✅ |
| Écran de confirmation dans la langue | ✅ |
| Dédoublonnage par téléphone → rattachement + signalement (alerte liste noire) | ✅ |
| File « Candidatures à valider » | ✅ |
| Anti-spam : rate-limit IP + honeypot (pas de captcha) | ✅ |

### Section 4 — Back-office
| Fonctionnalité | État |
|---|---|
| 4.1 Dashboard : vue du jour + 4 alertes spec (logés sans affectation nominatif, acomptes > gagné, heures non saisies, candidature liste noire) | ✅ |
| 4.2 CRUD clients + missions (mode facturation, parcelles, total heures temps réel) | ✅ |
| 4.3 CRUD ouvriers (PIN, taux individuel, IBAN, chef, statuts) + fiche avec net temps réel + bloc vivier | ✅ (documents : voir « partiel ») |
| 4.4 Affectations par créneaux, équipes recomposables + chef du jour, multi-affectations/jour, « Dupliquer hier », publication, envois WhatsApp/Telegram (chacun ou chef seul), suivi confirmations | ✅ |
| 4.5 Validation des heures (masse + ligne), correction tracée, saisie manuelle, vues jour/mission/ouvrier | ✅ |
| 4.6 Acomptes : enregistrement, traitement des demandes, garde-fou blocage soft + forcer | ✅ |
| 4.7 Logements : CRUD, séjours (arrivée incluse/départ exclu paramétrable), décompte indépendant, vue occupation | ✅ |
| 4.8 Retenues libres | ✅ |
| 4.9 Clôture : snapshot immuable, PDF bilingue ticket, versement tracé, envoi WhatsApp/Telegram, réouverture ADMIN tracée, export CSV | ✅ |
| 4.10 Pennylane : composition libre (heures groupées/détaillées/nominatif optionnel, forfait, lignes libres), aperçu, brouillon/finalisée, sync statut, mapping clients auto | ✅ (simulation sans clé — non testé contre l'API réelle) |
| 4.11 Paramètres : tarif base, règle départ logement, templates 3 langues, token Telegram, clé Pennylane, comptes ADMIN/RH, tags de compétences | ✅ |
| 4.12 Vivier : statuts, file candidatures, fiche (note 5★ ADMIN, tags, historique auto, bandeau liste noire), recherche + filtres combinables + tri, contact wa.me/Telegram individuel + groupé journalisé, réactivation 1 clic | ✅ |

### Transverse
- Multi-tenant : `organisationId` sur toutes les entités, toutes les requêtes scopées par la
  session ; middleware /admin (ADMIN|RH) et /app (OUVRIER|CHEF_EQUIPE). ✅
- Audit log sur toutes les actions sensibles. ✅
- PWA installable + push (affectation publiée, rappel 19h, acompte traité, récap dispo). ✅
- Crons Vercel : 7h logés sans affectation, 19h rappel heures (`vercel.json`). ✅
- Règles métier 1→14 de la section 7 : toutes implémentées (voir DECISIONS.md pour les
  interprétations).

## 2. Ce qui est partiel / non couvert

1. **Documents ouvrier (contrat, pièce d'identité)** : pas de stockage de fichiers (nécessite
   un bucket S3/Vercel Blob + décision RGPD). Champ notes internes disponible.
2. **Pennylane et Telegram en mode simulation** : le code d'appel réel existe mais n'a jamais
   été exécuté contre les vraies API (pas de clés). À valider au premier branchement —
   en particulier le format des lignes de facture (`customer_invoices`, TVA `FR_200`).
3. **WhatsApp niveau 2 (Cloud API Meta)** : interface `MessageChannel` prête, implémentation
   non écrite (niveau 1 wa.me livré, conforme spec).
4. **Rappel 19h / alerte 7h en heure UTC fixe** (Vercel cron) : 17h/5h UTC ≈ 19h/7h l'été,
   18h/6h l'hiver. Ajustable dans `vercel.json` deux fois par an, ou via un cron horaire +
   test de l'heure Paris.
5. **Rate-limit du formulaire public en mémoire d'instance** : suffisant contre les rafales,
   pas contre un botnet distribué (passer à Upstash/Redis si besoin).
6. **i18n back-office** : français uniquement (choix assumé, utilisateurs internes) ;
   portail ouvrier + portail candidat 100 % FR/RO/ES.
7. **Vue « demain » du portail montre demain dès publication** — la spec demandait aussi les
   heures de fin planifiées : affichées quand renseignées.

## 3. Décisions prises (résumé — détail dans DECISIONS.md)

- Schéma Prisma complet dès la phase 1 ; heures en `"HH:MM"`, dates `@db.Date`, argent Decimal.
- Téléphone unique **globalement** (clé de connexion et de dédoublonnage).
- Rate-limiting PIN persisté en base ; login admin rate-limité pareil (ajout sécurité).
- i18n par cookie sans préfixe d'URL (PWA une seule URL).
- « Dupliquer hier » copie en **brouillon** (à re-publier après contrôle).
- Clôture **bloquée** si heures EN_ATTENTE sur le mois (sinon elles disparaîtraient du récap).
- PDF générés à la volée depuis le snapshot (aucun fichier stocké), police DejaVu (diacritiques RO).
- /rejoindre mono-organisation (première org = Pickajob) ; honeypot → faux succès.
- Refus de candidature ≠ liste noire : le profil reste CANDIDAT, re-candidature possible.

## 4. À vérifier en priorité au réveil

1. **Parcours ouvrier complet sur téléphone** : login PIN `+40722222222` / `1234` →
   Aujourd'hui (2 missions démo) → « J'y serai » → Mes heures (1 tap) → Mon argent.
2. **Garde-fou acomptes** : approuver la demande de 500 € de Vasile (dépasse son gagné) —
   l'alerte + « Forcer » doivent apparaître.
3. **Clôture + PDF** : `/admin/clotures` → clôturer un ouvrier → ouvrir le PDF (vérifier les
   diacritiques roumains) → export CSV dans Excel.
4. **Chef d'équipe** : login `+40711111111` / `1234` → Mes heures → bloc « Mon équipe du
   jour » (saisie groupée).
5. **Candidature de bout en bout** : /rejoindre (en roumain) avec un nouveau numéro, puis
   avec le même numéro (dédoublonnage), puis la traiter dans /admin/candidatures.
6. **Le composer Pennylane** en simulation : facture heures groupées vs détaillées.
7. Brancher un **vrai token Telegram** de test et refaire un envoi d'affectation
   (webhook : `setWebhook` + partage de contact).

## 5. Checklist de mise en production

### Variables d'environnement (Vercel → Settings → Environment Variables)
| Variable | Valeur |
|---|---|
| `DATABASE_URL` | PostgreSQL Neon/Supabase (avec `?sslmode=require`) |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `https://krontrol.pickajob.fr` |
| `TELEGRAM_BOT_TOKEN` | token BotFather du bot Krontrol (ou vide = simulation) |
| `TELEGRAM_WEBHOOK_SECRET` | secret aléatoire, passé à `setWebhook` (`secret_token`) |
| `PENNYLANE_API_KEY` | clé API Pennylane (ou vide = simulation) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` |
| `VAPID_SUBJECT` | `mailto:contact@pickajob.fr` |
| `CRON_SECRET` | secret aléatoire (Vercel l'envoie automatiquement aux crons) |

(Les variables `PRISMA_*` du `.env` local sont spécifiques à l'environnement de dev et ne
doivent PAS être posées sur Vercel.)

### Déploiement
```bash
# 1. Base : créer la base Neon/Supabase puis
npx prisma db push          # (ou migrate deploy si vous passez aux migrations)

# 2. Vercel
npm i -g vercel
vercel link                 # lier le repo au projet
vercel --prod               # déploiement production
# vercel.json configure déjà les 2 crons (7h logés sans affectation, 19h rappel heures)

# 3. Domaine : ajouter krontrol.pickajob.fr dans Vercel → Domains (CNAME cname.vercel-dns.com)

# 4. Webhook Telegram (une fois le token posé)
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://krontrol.pickajob.fr/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

### Premier compte ADMIN
Option A — seed complet de démo (comptes de test, à réserver à un environnement de recette) :
`npx prisma db seed`

Option B — production propre, créer uniquement l'organisation + l'ADMIN :
```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
(async () => {
  const p = new PrismaClient();
  const org = await p.organisation.create({ data: { nom: 'Pickajob', tarifHoraireBase: 12.5 } });
  await p.user.create({ data: {
    organisationId: org.id, role: 'ADMIN', statutProfil: 'ACTIF',
    nom: 'Dian', prenom: 'Michel', telephone: '+33600000001',
    email: 'admin@pickajob.fr', langue: 'FR',
    motDePasseHash: await bcrypt.hash('CHANGEZ-MOI', 10)
  }});
  console.log('ADMIN créé pour', org.nom);
  await p.\$disconnect();
})();"
```
Puis : `/admin/login` → Paramètres → créer les autres comptes ADMIN/RH, poser les tags de
compétences, les modèles de messages, le token Telegram et la clé Pennylane.

### Après mise en ligne
- [ ] Créer clients, missions/parcelles, logements, ouvriers (PIN).
- [ ] Diffuser le lien `/rejoindre` (Facebook, WhatsApp, affiches).
- [ ] Faire installer la PWA aux ouvriers (Ajouter à l'écran d'accueil) et accepter les notifications.
- [ ] Vérifier le premier cron (logs Vercel → Crons).

---

## 6. Phase 17 — Module Recruteurs (ajout du 05/07/2026)

### Livré
| Fonctionnalité (spec Recruteurs §A-G) | État |
|---|---|
| B — Rôle RECRUTEUR, inscription publique ouverte `/recruteur/inscription`, suspension (login bloqué) | ✅ |
| C.1 Demandes ouvertes : titre, dates, région, conditions, commission, pourvus X/N | ✅ |
| C.2 Proposer un candidat (sur demande ou spontané), téléphone = clé, doublon signalé au recruteur | ✅ |
| C.3 Mes candidats : statuts en attente / accepté / refusé (+ motif), « 💰 placé » | ✅ |
| C.4 Mes gains : ticket généré / payé / reste dû, placements datés, historique des paiements | ✅ |
| D.1 CRUD demandes + notification auto Telegram (template DEMANDE FR/RO/ES) + wa.me par recruteur | ✅ |
| D.2 Propositions dans /admin/candidatures : badge « via [Recruteur] », doublon, accepter → vivier | ✅ |
| D.3 /admin/recruteurs : liste (propositions, placements, réussite, dû/payé), fiche, paiement, suspension | ✅ |
| D.4 Export CSV commissions (`/api/commissions/export`, ; + BOM, filtre ?debut&fin) + 2 cartes dashboard | ✅ |
| E.1-2 Commission fixe par placement (défaut 100 € dans Paramètres, surchargeable par demande) | ✅ |
| E.3 Doublon connu jamais commissionné SAUF INACTIF sans activité > 12 mois (paramétrable) | ✅ |
| E.4 Double proposition → premier recruteur (horodatage) crédité, l'autre refusée automatiquement | ✅ |
| E.5 Refus / liste noire → aucune commission ; liste noire bloque l'acceptation | ✅ |
| E.6 Annulation d'un placement ≤ 7 jours (paramétrable), motif obligatoire, commission ANNULÉE | ✅ |
| E.7-8 Audit complet (proposition, acceptation+raison d'éligibilité, placement, paiement, annulation, suspension) | ✅ |
| F — Modèle : DemandeMainOeuvre, DemandeCompetence, PropositionCandidat, Placement, PaiementCommission | ✅ |

### Choix d'implémentation
- Paiement de commission **FIFO** : un paiement marque PAYÉS les placements DUS les plus
  anciens tant que le montant les couvre entièrement (traçabilité placement → paiement).
- Candidat proposé = User `role OUVRIER, statutProfil CANDIDAT, actif false, source RECRUTEUR`
  → réutilise toute la mécanique vivier existante (fiche, tags, historique, liste noire).
- Un recruteur ne peut pas proposer un numéro appartenant à un compte interne
  (ADMIN/MANAGER/CLIENT/RECRUTEUR), ni re-proposer un candidat qu'il a déjà en attente.
- L'acceptation d'un doublon d'un ouvrier ACTIF ne touche pas à son statut (pas de retour
  vivier) et ne crée pas de placement.
- Base **déjà migrée en prod** (`prisma/migration-recruteurs.sql`, idempotente à re-jouer).

### E2E vérifié (Chromium, base locale)
Inscription → login → création de demande → notification (SIMULE) → proposition sur demande
→ doublon ouvrier actif détecté → proposition spontanée → acceptation des 3 → 2 placements
(200 € dus, doublon exclu) → annulation motivée d'un placement → paiement 100 € → reste dû 0
→ gains recruteur à jour → CSV (PAYEE + ANNULEE tracés) → suspension → login refusé. ✅
