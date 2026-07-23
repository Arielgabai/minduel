# Déploiement Docker générique — MINDUEL

Ce guide décrit un déploiement **portable** sur n'importe quel hébergeur de conteneurs
(Render, AWS App Runner, Fly.io, un VPS avec Docker, etc.). Pour Render pas à pas, voir
[`deployment-render.md`](deployment-render.md).

## Architecture cible

- **1 image Docker** unique (`Dockerfile`) qui sert :
  - le **web** : `npm run start` (défaut),
  - le **worker** : `npm run worker` (surcharge de commande),
  - les **migrations** : `npm run db:migrate:deploy` (étape de release).
- **PostgreSQL** managé (persistant).
- **Stockage objet privé** S3 ou compatible (persistant, cf. exigence : jamais de disque conteneur).

Le disque du conteneur est **éphémère** : aucune donnée persistante (audios, base) n'y est stockée.

## Prérequis externes (à créer manuellement)

1. Une base **PostgreSQL** managée → fournit `DATABASE_URL`.
2. Un **bucket objet privé** (AWS S3, Cloudflare R2, MinIO…) → fournit `S3_*`.
3. Un `SESSION_SECRET` aléatoire (`openssl rand -base64 48`).
4. (Optionnel) Une clé `OPENAI_API_KEY` si `AI_PROVIDER=openai`.

## Variables d'environnement

Voir [`environment-variables.md`](environment-variables.md) et `.env.production.example`.
Minimum production réelle :

```
NODE_ENV=production
APP_URL=https://votre-domaine
DATABASE_URL=postgresql://...:5432/...?sslmode=require
SESSION_SECRET=<aléatoire >= 32 caractères>
AI_PROVIDER=demo            # ou openai (+ OPENAI_API_KEY)
STORAGE_DRIVER=s3
S3_BUCKET=...
S3_REGION=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

## Build de l'image

```bash
docker build -t minduel:local .
```

L'image :
- part de `node:20-alpine` (OpenSSL installé pour Prisma),
- installe les dépendances avec le lockfile (`npm ci`),
- génère le client Prisma et construit Next.js,
- s'exécute en **utilisateur non-root**,
- écoute sur `0.0.0.0:$PORT` (défaut `3000`),
- expose un `HEALTHCHECK` sur `/api/health`.

Aucun `.env`, base SQLite ou fichier audio n'est copié dans l'image (voir `.dockerignore`).

## Ordre de déploiement (release)

Le **démarrage ne modifie jamais le schéma**. Exécuter les migrations séparément, **avant** de
router le trafic vers la nouvelle version :

```bash
# 1. Migrations (étape de release / pre-deploy, jobs ponctuel)
docker run --rm --env-file .env.production minduel:local npm run db:migrate:deploy

# 2. Démarrer le web
docker run -d --env-file .env.production -p 3000:3000 --name minduel-web minduel:local

# 3. Démarrer le worker (process séparé)
docker run -d --env-file .env.production --name minduel-worker minduel:local npm run worker
```

> Ne **jamais** lancer `prisma migrate dev` en production. Ne **jamais** lancer le seed
> automatiquement au démarrage.

## Health check

- `GET /api/health` : répond `200` si le process web répond **et** que la DB est joignable
  (requête légère `SELECT 1`). Renvoie `503` si la DB indispensable est indisponible.
- Ne dépend **pas** d'OpenAI ni de S3 pour considérer le serveur web vivant.

## Données de démonstration (optionnel, volontaire)

```bash
docker run --rm --env-file .env.production -e ALLOW_DEMO_SEED=true minduel:local npm run db:seed:demo
```

Sans `ALLOW_DEMO_SEED=true`, le seed **refuse** de s'exécuter en production.

## Développement local avec Docker Compose

`docker-compose.yml` fournit PostgreSQL (port hôte **5433**) avec healthcheck. Services `web` et
`worker` optionnels via le profil `app` :

```bash
docker compose up -d db                 # PostgreSQL seul (usage habituel)
docker compose --profile app up --build # web + worker + db en conteneurs
```

## Rollback

- **Application** : redéployer l'image (tag) précédente.
- **Base** : les migrations sont additives par défaut. Prévoir une sauvegarde PostgreSQL avant toute
  migration destructive ; restaurer la sauvegarde si nécessaire. Ne pas « annuler » une migration
  appliquée en production sans script `down` validé.
