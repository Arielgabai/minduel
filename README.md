# MINDUEL — MVP

> SaaS d'entraînement à la téléprospection par simulations d'appels vocaux pilotées par IA.

MINDUEL permet à un **manager** d'importer de vrais appels, d'en extraire automatiquement la
connaissance métier (offre, objections, informations clés), de créer des **scénarios**, puis de
laisser ses **téléprospecteurs** s'entraîner face à un prospect IA. Chaque simulation est évaluée
et débriefée pour faire progresser l'équipe.

Le MVP est **100 % fonctionnel sans clé OpenAI** grâce à un **mode démo déterministe** (transcription,
extraction, prospect IA et évaluation simulés). Le mode réel (OpenAI Realtime WebRTC) est activé
**explicitement** via `AI_PROVIDER=openai` (aucune bascule silencieuse).

---

## Stack technique

- **Next.js 15** (App Router) — front-end + API routes, full-stack.
- **TypeScript** strict.
- **Tailwind CSS v4** — design system sombre/violet-électrique.
- **Prisma ORM** + **PostgreSQL** (SQLite n'est plus utilisé).
- **Auth par session cookie** + `bcryptjs`, isolation multi-tenant par `organizationId`.
- **Zod** pour la validation des entrées API **et des variables d'environnement**.
- Providers abstraits (stockage audio, transcription, extraction, session temps réel, évaluation)
  avec implémentations **Demo** et **OpenAI** interchangeables.
- **Stockage objet** privé (local en dev, **S3 / compatible S3** en production).
- **File de tâches persistante** en PostgreSQL + **worker Node séparé** pour les traitements longs.

---

## Démarrage rapide (développement local)

Prérequis : **Node 20+**, **Docker** (pour PostgreSQL local).

```bash
# 1. Préparer l'environnement
cp .env.example .env          # PowerShell : Copy-Item .env.example .env

# 2. Démarrer PostgreSQL (port hôte 5433, cf. docker-compose.yml)
docker compose up -d db

# 3. Installer les dépendances
npm install

# 4. Appliquer les migrations et charger les données de démo
npm run db:migrate
npm run db:seed:demo

# 5. Lancer en développement
npm run dev
```

Application disponible sur http://localhost:3000

> **Traitements longs** : en développement, l'endpoint `/api/recordings/[id]/process` déclenche le
> traitement en ligne. En production, lancer le **worker** (`npm run worker`) pour consommer la file.

> **Réseau d'entreprise / proxy SSL** : si `npm install` échoue avec
> `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, exportez le magasin de certificats Windows vers un
> bundle PEM et pointez `NODE_EXTRA_CA_CERTS` dessus avant les commandes npm/npx.

---

## Comptes de démonstration

Après `npm run db:seed:demo`, l'organisation **Démo MINDUEL** est disponible :

| Rôle    | Email                      | Mot de passe |
| ------- | -------------------------- | ------------ |
| Manager | `manager@demo.minduel.app` | `demo1234`   |
| Télépro | `ruben@demo.minduel.app`   | `demo1234`   |
| Télépro | `lina@demo.minduel.app`    | `demo1234`   |

> ⚠️ Ces comptes utilisent un mot de passe public. Le seed **refuse de s'exécuter en production**
> sauf si `ALLOW_DEMO_SEED=true` est défini explicitement (environnement de démonstration assumé).
> Ne jamais activer ce seed sur une vraie production.

---

## Parcours principal

1. **Manager** importe un appel réel → transcription + extraction de connaissance → **validation**.
2. **Manager** crée un **scénario** (offre, profil prospect, objectifs, objections) et l'**assigne**.
3. **Télépro** prépare l'appel (test micro) puis lance la **simulation** face au prospect IA.
4. Fin d'appel → **évaluation** automatique (score par critère) + insights de **feedback**.
5. Suivi de la progression : historique télépro, résultats et export CSV côté manager.

---

## Scripts npm

| Script                     | Description                                                     |
| -------------------------- | -------------------------------------------------------------- |
| `npm run dev`              | Serveur de développement.                                      |
| `npm run build`            | Génère le client Prisma puis build de production.              |
| `npm run start`            | Démarre le serveur web de production (ne migre pas le schéma). |
| `npm run worker`           | Démarre le worker de traitements asynchrones.                  |
| `npm run lint`             | Analyse ESLint.                                                |
| `npm run typecheck`        | Vérification TypeScript (`tsc --noEmit`).                      |
| `npm test`                 | Suite de tests Vitest.                                         |
| `npm run db:generate`      | Génère le client Prisma.                                       |
| `npm run db:migrate`       | Crée/applique une migration en développement.                 |
| `npm run db:migrate:deploy`| Applique les migrations en production (release).               |
| `npm run db:seed:demo`     | (Ré)initialise les données de démonstration (idempotent).     |
| `npm run db:studio`        | Ouvre Prisma Studio.                                           |
| `npm run db:reset`         | Réinitialise la base (force-reset) puis rejoue les migrations. |

---

## Mode démo vs. mode réel

Le fournisseur d'IA est déterminé **uniquement** par `AI_PROVIDER` (`src/lib/env.ts`) :

- **`AI_PROVIDER=demo`** (par défaut) : tous les traitements IA sont **déterministes**
  (reproductibles, sans appel réseau ni coût). Fonctionne même sans stockage S3.
- **`AI_PROVIDER=openai`** : active les providers OpenAI. La clé `OPENAI_API_KEY` est **obligatoire**
  et validée au démarrage ; **aucune bascule silencieuse** vers le mode démo n'est possible. La
  session vocale Realtime utilise un **secret client éphémère** généré côté serveur — la clé API
  n'est jamais exposée au navigateur.

> Les providers de **transcription / extraction / évaluation** en mode OpenAI ne sont pas encore
> implémentés (`NotImplementedProviderError`). Seul le mode démo effectue ces traitements. Voir
> [Limites connues](docs/production-checklist.md).

---

## Déploiement

- Guide générique Docker : [`docs/deployment.md`](docs/deployment.md)
- Guide **Render** pas à pas : [`docs/deployment-render.md`](docs/deployment-render.md)
- Référence des variables : [`docs/environment-variables.md`](docs/environment-variables.md)
- Checklist de mise en production : [`docs/production-checklist.md`](docs/production-checklist.md)

Commandes de déploiement (séparées, jamais de migration au démarrage) :

```bash
npm ci
npm run build
npm run db:migrate:deploy   # étape de release / pre-deploy
npm run start               # process web
npm run worker              # process worker (séparé)
```

---

## Structure du projet

```
prisma/
  schema.prisma      # modèle de données multi-tenant (PostgreSQL)
  migrations/        # migrations versionnées
  seed.ts            # données de démonstration (garde-fou production)
src/
  app/               # pages (App Router) + API routes
    api/health/      #   endpoint de santé (liveness + DB)
  lib/
    env.ts           #   validation Zod centralisée des variables d'env
    config.ts        #   configuration serveur (adossée à env.ts)
    log.ts           #   journalisation structurée (JSON lines)
    jobs.ts          #   file de tâches persistante (PostgreSQL)
    providers/       #   interfaces + impl. Demo/OpenAI + stockage (local/S3)
  worker/            # worker de traitements asynchrones
tests/               # tests Vitest (env, storage, signed URLs, évaluation…)
Dockerfile           # image de production multi-stage
docker-compose.yml   # PostgreSQL local (+ services web/worker optionnels)
```

---

## Sécurité & RGPD (MVP)

- Isolation stricte des données par organisation sur toutes les requêtes.
- Contrôle d'accès par rôle (`PLATFORM_ADMIN`, `MANAGER`, `TELEPRO`).
- Audios stockés en **objet privé**, servis uniquement via **URL signée temporaire**.
- Cookies de session `httpOnly`, `secure` en production, `sameSite`.
- Limitation de débit sur login, upload, création de session Realtime et export.
- Headers de sécurité (CSP, HSTS, X-Frame-Options…).
- Secrets en variables d'environnement, jamais commités.
- Consentement requis à l'upload d'appels, journal d'audit des actions sensibles.
