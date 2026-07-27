# Déploiement sur Render — MINDUEL

Procédure reproductible pour déployer MINDUEL sur [Render](https://render.com) avec l'image Docker
du dépôt, une base PostgreSQL managée et un bucket objet S3 compatible.

> Aucun secret réel ne figure dans le dépôt. Toutes les valeurs sensibles se configurent dans
> l'interface Render.

## Vue d'ensemble

- **PostgreSQL** : base managée Render (ou externe).
- **Web Service** (Docker) : sert l'application, commande par défaut `npm run start`.
- **Background Worker** (Docker, même image) : `npm run worker`.
- **Migrations** : via *Pre-Deploy Command* `npm run db:migrate:deploy`.
- **Stockage audio** : bucket S3 compatible (AWS S3, Cloudflare R2…). Render n'offre pas de stockage
  objet natif → utiliser un fournisseur externe.

## Commandes validées dans l'image de production

Les trois commandes ci-dessous ont été **réellement exécutées depuis l'image Docker finale**
(`docker compose up --build -d`, stack `db` + `web` + `worker`) et vérifiées :

| Rôle Render | Commande | Résultat vérifié |
| --- | --- | --- |
| Pre-Deploy (migrations) | `npm run db:migrate:deploy` | `prisma migrate deploy` s'exécute, migrations appliquées (« No pending migrations to apply » sur DB à jour) |
| Web Service (Start) | `npm run start` (→ `next start`) | serveur prêt, écoute `0.0.0.0:$PORT`, `GET /api/health` → `200` |
| Background Worker (Start) | `npm run worker` (→ `node src/worker/run.cjs`) | worker démarre, heartbeat, consomme `ProcessingJob`, reprend les jobs persistés après redémarrage |

> Le Web Service et le Background Worker utilisent **la même image**, avec chacun sa **propre Start
> Command**. Le worker tourne dans un **processus séparé** du serveur Next.js.
>
> `prisma` (CLI) et `tsx` (runtime du worker) sont volontairement présents dans l'image finale : la
> migration et le worker ne dépendent d'aucune devDependency absente en production.

## 1. Créer la base PostgreSQL

1. Render → **New** → **PostgreSQL**.
2. Choisir région et plan, créer.
3. Récupérer l'**Internal Database URL** (pour les services Render) — format
   `postgresql://user:pwd@host:5432/db`. Ajouter `?schema=public` si besoin.
4. La conserver pour `DATABASE_URL`.

## 2. Créer le bucket objet privé (S3 compatible)

Chez AWS S3 / Cloudflare R2 / autre :

1. Créer un bucket **privé** (aucun accès public, pas de public-read).
2. Créer des identifiants d'accès (clé + secret) limités à ce bucket.
3. Noter : `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, et
   `S3_ENDPOINT` (vide pour AWS S3 ; URL pour R2/MinIO), `S3_FORCE_PATH_STYLE` (`true` pour MinIO).

## 3. Créer le Web Service (Docker)

1. Render → **New** → **Web Service** → connecter le dépôt Git.
2. **Runtime : Docker** (Render détecte le `Dockerfile`).
3. **Start Command** : laisser par défaut (`npm run start` défini dans le Dockerfile), ou la
   renseigner explicitement.
4. **Health Check Path** : `/api/health`.
5. **Pre-Deploy Command** :
   ```
   npm run db:migrate:deploy
   ```
   Render exécute cette commande **avant** de router le trafic vers la nouvelle version — c'est
   l'emplacement correct pour les migrations de release.

## 4. Configurer les variables d'environnement (Web Service)

Onglet **Environment** → ajouter (voir `docs/environment-variables.md`) :

```
NODE_ENV=production
APP_URL=https://<votre-service>.onrender.com
DATABASE_URL=<Internal Database URL>
SESSION_SECRET=<openssl rand -base64 48>
AI_PROVIDER=demo                 # ou openai
OPENAI_API_KEY=                  # requis seulement si AI_PROVIDER=openai
OPENAI_REALTIME_MODEL=gpt-realtime          # session vocale (WebRTC)
OPENAI_EVALUATION_MODEL=gpt-4o-mini         # évaluation structurée (Structured Outputs) — modèle DISTINCT du Realtime
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe-diarize   # transcription diarisée (pipeline appel -> exercice)
OPENAI_ANALYSIS_MODEL=gpt-5.6-terra         # analyse structurée de l'appel modèle (Responses API)
OPENAI_SCENARIO_MODEL=gpt-5.6-terra         # génération du scénario + grille (Responses API)
OPENAI_ANALYSIS_REASONING_EFFORT=medium     # minimal|low|medium|high
OPENAI_REALTIME_VOICE=marin
STORAGE_DRIVER=s3
S3_BUCKET=<bucket>
S3_REGION=<region>
S3_ENDPOINT=                     # vide pour AWS S3
S3_ACCESS_KEY_ID=<clé>
S3_SECRET_ACCESS_KEY=<secret>
S3_FORCE_PATH_STYLE=false
SIGNED_URL_TTL_SECONDS=300
MAX_AUDIO_UPLOAD_MB=100          # appels réels 15-20 min (canonique)
AUDIO_RETENTION_DAYS=90
SPEAKER_ASSIGNMENT_CONFIDENCE_THRESHOLD=0.75
LOG_LEVEL=info
```

> **`ffmpeg`/`ffprobe` sont facultatifs.** Le pré-traitement audio détecte le format via les
> *magic bytes* et enrichit les métadonnées avec `ffprobe` **s'il est présent** ; en son absence,
> il dégrade proprement (aucune dépendance dure). Le découpage des longs fichiers est délégué au
> `chunking_strategy: auto` d'OpenAI.

> Ne pas définir `ALLOW_DEMO_SEED` en vraie production (laisser absent ou `false`).

## 5. Créer le Worker (même image)

1. Render → **New** → **Background Worker** → même dépôt, **Runtime : Docker**.
2. **Start Command** :
   ```
   npm run worker
   ```
3. **Environment** : recopier **exactement** les mêmes variables que le Web Service (le worker a
   besoin de `DATABASE_URL`, du stockage et, le cas échéant, d'OpenAI).

> **Le Background Worker est OBLIGATOIRE en `AI_PROVIDER=openai`.** L'évaluation de fin d'appel
> (« Terminer et obtenir l'analyse ») n'est plus exécutée en ligne : la route de finalisation
> enfile une tâche `EVALUATE_SIMULATION` et répond immédiatement `202` avec l'`analysisUrl`. C'est
> le worker (`npm run worker`) qui appelle réellement `OPENAI_EVALUATION_MODEL`, écrit
> l'évaluation, puis passe la simulation en `COMPLETED`.
>
> **Sans worker déployé, l'analyse reste bloquée en `EVALUATION_PENDING`** : la page
> `/app/analysis/<id>` affiche « Analyse en attente… » et interroge le statut toutes les 2 s, mais
> aucun score n'apparaît (l'UI ne redirige jamais silencieusement vers l'accueil). Le worker doit
> donc partager le **même `DATABASE_URL`** et les mêmes variables `OPENAI_*` que le Web Service.
>
> Le mode démo n'effectue pas de traitement long réel via OpenAI, mais le worker reste utile pour
> consommer la file (`ProcessingJob`) de façon fiable et idempotente (l'évaluation démo passe
> également par la même tâche).
>
> **Le pipeline appel → exercice dépend aussi du worker.** Les étapes `PREPROCESS_RECORDING`,
> `TRANSCRIBE_RECORDING`, `ANALYZE_REFERENCE_CALL` et `GENERATE_SCENARIO_FROM_CALL` s'exécutent
> exclusivement dans le worker (transcription diarisée, analyse et génération via OpenAI). Sans
> worker, un appel modèle importé reste bloqué en `PREPROCESSING` et aucun exercice n'est généré.

## 6. Déployer et vérifier

1. Lancer le déploiement (Web puis Worker).
2. Vérifier le **Pre-Deploy** : migrations appliquées sans erreur.
3. Ouvrir `https://<votre-service>.onrender.com/api/health` → doit renvoyer `200` avec la DB `up`.
4. Vérifier le **domaine HTTPS** (Render fournit un certificat automatique).
5. Se connecter, créer un compte manager réel (voir §8).

## 7. Test microphone & WebRTC

- Ouvrir l'app en **HTTPS** (obligatoire pour l'accès micro).
- Aller sur une simulation → **préparer l'appel** → autoriser le micro dans le navigateur.
- En `AI_PROVIDER=openai`, la session Realtime est créée via un **secret éphémère** côté serveur ;
  vérifier dans les logs `realtime.session_created`. La clé OpenAI n'apparaît jamais côté client.

## 8. Données de démonstration (optionnel, volontaire)

Pour un environnement de **démonstration assumé** uniquement, exécuter ponctuellement via un
*Shell* Render (ou un job unique) :

```
ALLOW_DEMO_SEED=true npm run db:seed:demo
```

Crée l'organisation démo et les comptes `demo1234`. **Ne pas** faire cela sur une production réelle.

## 9. Rollback

- **Application** : Render → onglet **Deploys** → *Rollback* vers un déploiement précédent (redéploie
  l'image correspondante).
- **Base** : sauvegarder PostgreSQL avant toute migration destructive ; restaurer si nécessaire.
- Le worker peut être arrêté indépendamment du web sans perdre la file (jobs persistants).
