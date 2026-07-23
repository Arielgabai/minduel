# MINDUEL — MVP

> SaaS d'entraînement à la téléprospection par simulations d'appels vocaux pilotées par IA.

MINDUEL permet à un **manager** d'importer de vrais appels, d'en extraire automatiquement la
connaissance métier (offre, objections, informations clés), de créer des **scénarios**, puis de
laisser ses **téléprospecteurs** s'entraîner face à un prospect IA. Chaque simulation est évaluée
et débriefée pour faire progresser l'équipe.

Le MVP est **100 % fonctionnel sans clé OpenAI** grâce à un **mode démo déterministe** (transcription,
extraction, prospect IA et évaluation simulés). Fournir une clé OpenAI bascule automatiquement sur
les intégrations réelles (session vocale Realtime WebRTC).

---

## Stack technique

- **Next.js 15** (App Router) — front-end + API routes, full-stack.
- **TypeScript** strict.
- **Tailwind CSS v4** — design system sombre/violet-électrique inspiré des maquettes.
- **Prisma ORM** + **SQLite** (aucune infra à installer en local).
- **Auth par session cookie** + `bcryptjs`, isolation multi-tenant par `organizationId`.
- **Zod** pour la validation des entrées API.
- Providers abstraits (stockage audio, transcription, extraction, session temps réel, évaluation)
  avec implémentations **Demo** et **OpenAI** interchangeables.

---

## Démarrage rapide

```bash
# 1. Installer les dépendances
npm install

# 2. Préparer l'environnement
cp .env.example .env        # (Windows : copy .env.example .env)

# 3. Créer la base et charger les données de démo (push + seed)
npm run setup

# 4. Lancer en développement
npm run dev
```

Application disponible sur http://localhost:3000

> **Réseau d'entreprise / proxy SSL** : si `npm install` échoue avec
> `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, exportez le magasin de certificats Windows vers un
> bundle PEM et pointez `NODE_EXTRA_CA_CERTS` dessus avant les commandes npm/npx.

---

## Comptes de démonstration

Après `npm run setup`, l'organisation **Démo MINDUEL** est disponible :

| Rôle    | Email                      | Mot de passe |
| ------- | -------------------------- | ------------ |
| Manager | `manager@demo.minduel.app` | `demo1234`   |
| Télépro | `ruben@demo.minduel.app`   | `demo1234`   |
| Télépro | `lina@demo.minduel.app`    | `demo1234`   |

Les données de démo incluent : une rubrique d'évaluation, 3 scénarios publiés, 2 appels réels
déjà analysés (transcription + connaissances validées) et un historique de simulations évaluées.

---

## Parcours principal

1. **Manager** importe un appel réel → transcription + extraction de connaissance → **validation**.
2. **Manager** crée un **scénario** (offre, profil prospect, objectifs, objections) et l'**assigne**.
3. **Télépro** prépare l'appel (test micro) puis lance la **simulation** face au prospect IA.
4. Fin d'appel → **évaluation** automatique (score par critère) + insights de **feedback**.
5. Suivi de la progression : historique télépro, résultats et export CSV côté manager.

---

## Scripts npm

| Script            | Description                                     |
| ----------------- | ----------------------------------------------- |
| `npm run dev`     | Serveur de développement.                       |
| `npm run build`   | Génère le client Prisma puis build de prod.     |
| `npm run start`   | Démarre le build de production.                  |
| `npm run lint`    | Analyse ESLint.                                  |
| `npm run setup`   | `prisma db push` + seed des données de démo.    |
| `npm run db:seed` | (Ré)initialise les données de démo.             |
| `npm run db:reset`| Réinitialise la base (force-reset) puis seed.   |

---

## Mode démo vs. mode réel

Le mode est déterminé par `src/lib/config.ts` :

- **Démo** (par défaut) : actif si `MINDUEL_DEMO_MODE=true` **ou** en l'absence de `OPENAI_API_KEY`.
  Tous les traitements IA sont simulés de façon **déterministe** (reproductibles, sans réseau).
- **Réel** : fournir `OPENAI_API_KEY` (et laisser `MINDUEL_DEMO_MODE` non forcé à `true`) active
  les providers OpenAI, dont la **session vocale Realtime** via secret client éphémère généré
  côté serveur (la clé API n'est jamais exposée au navigateur).

Variables d'environnement principales (voir `.env.example`) :

```
DATABASE_URL="file:./prisma/dev.db"
SESSION_SECRET="<chaîne aléatoire longue>"
MINDUEL_DEMO_MODE="true"
OPENAI_API_KEY=""              # vide = mode démo
AUDIO_STORAGE_DIR="./.storage" # stockage privé local des audios
```

---

## Structure du projet

```
prisma/
  schema.prisma      # modèle de données multi-tenant
  seed.ts            # données de démonstration
src/
  app/               # pages (App Router) + API routes
    app/             #   espace téléprospecteur (mobile-first)
    manager/         #   espace manager (desktop)
    api/             #   endpoints REST
  components/        # UI réutilisable (Card, Button, ScoreRing, Waveform…)
  lib/               # auth, db, config, providers, services, utils
    providers/       #   interfaces + impl. Demo et OpenAI
```

---

## Sécurité & RGPD (MVP)

- Isolation stricte des données par organisation sur toutes les requêtes.
- Contrôle d'accès par rôle (`PLATFORM_ADMIN`, `MANAGER`, `TELEPRO`).
- Audios stockés en privé, servis uniquement via **URL signée temporaire**.
- Secrets en variables d'environnement, jamais commités.
- Consentement requis à l'upload d'appels, journal d'audit des actions sensibles.

---

## Remarques

- SQLite est utilisé pour la simplicité locale ; le schéma Prisma peut cibler PostgreSQL en prod.
- Un avertissement de dépréciation Prisma (`package.json#prisma`) est sans impact pour le MVP.
