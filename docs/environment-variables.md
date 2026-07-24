# Variables d'environnement — MINDUEL

Toutes les variables sont validées **côté serveur** par Zod dans `src/lib/env.ts`
(validation paresseuse et mémoïsée : elle n'échoue pas pendant le build, mais échoue **tôt et
avec un message clair** au démarrage — via `src/instrumentation.ts` — ou au premier usage du
service concerné).

**Aucun secret ne commence par `NEXT_PUBLIC_`.** Aucune variable n'est exposée au navigateur :
toute la configuration sensible est strictement serveur.

## Tableau exhaustif

Généré à partir des usages réels du code (`src/lib/env.ts`, `src/lib/config.ts`, `src/lib/auth.ts`,
`src/lib/db.ts`, `src/lib/log.ts`, `prisma/seed.ts`).

| Variable | Obligatoire | Environnements | Secret | Exemple | Utilité |
| --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | Non (défaut `development`) | tous | Non | `production` | Mode d'exécution. Contrôle cookies `secure`, logs Prisma, garde-fou seed. |
| `APP_URL` | Non (défaut `http://localhost:3000`) | tous | Non | `https://minduel.onrender.com` | URL publique HTTPS ; construction de liens côté serveur. |
| `DATABASE_URL` | **Oui** | tous | **Oui** | `postgresql://user:pwd@host:5432/db?schema=public&sslmode=require` | Connexion PostgreSQL (Prisma). |
| `DIRECT_URL` | Non | prod (pooler) | **Oui** | `postgresql://user:pwd@host:5432/db?schema=public` | Connexion directe pour les migrations si un pooler est utilisé (Neon/Supabase/PgBouncer). Nécessite de décommenter `directUrl` dans `schema.prisma`. |
| `SESSION_SECRET` | **Oui** (≥ 32 car.) | tous | **Oui** | `openssl rand -base64 48` | Signature des sessions et des URLs de stockage locales. Le secret par défaut est **interdit** en production. |
| `AI_PROVIDER` | Non (défaut `demo`) | tous | Non | `demo` \| `openai` | Sélectionne le fournisseur d'IA. `openai` exige `OPENAI_API_KEY`. |
| `OPENAI_API_KEY` | **Conditionnel** (si `AI_PROVIDER=openai`) | prod réelle | **Oui** | `sk-...` | Clé OpenAI, lue **uniquement** côté serveur. |
| `OPENAI_REALTIME_MODEL` | Non (défaut `gpt-realtime`) | tous | Non | `gpt-realtime` | Modèle Realtime GA (speech-to-speech WebRTC), compatible `/v1/realtime/client_secrets`. |
| `OPENAI_TRANSCRIPTION_MODEL` | Non (défaut `whisper-1`) | tous | Non | `whisper-1` | Modèle de transcription (non implémenté en OpenAI, cf. limites). |
| `OPENAI_EVALUATION_MODEL` | Non (défaut `gpt-4o-mini`) | tous | Non | `gpt-4o-mini` | Modèle d'évaluation (non implémenté en OpenAI, cf. limites). |
| `OPENAI_REALTIME_VOICE` | Non (défaut `marin`) | tous | Non | `marin` | Voix de sortie GA du prospect IA Realtime (ex. `marin`, `cedar`, `alloy`). |
| `STORAGE_DRIVER` | Non (défaut `local`) | tous | Non | `s3` | Pilote de stockage audio : `local` (dev) ou `s3` (prod). |
| `AUDIO_STORAGE_DIR` | Non (défaut `./storage`) | dev (`local`) | Non | `./storage` | Répertoire de stockage local des audios (dev uniquement). |
| `S3_BUCKET` | **Conditionnel** (si `STORAGE_DRIVER=s3`) | prod | Non | `minduel-recordings` | Bucket objet privé. |
| `S3_REGION` | **Conditionnel** (si `STORAGE_DRIVER=s3`) | prod | Non | `eu-west-3` | Région du bucket. |
| `S3_ENDPOINT` | Non (vide = AWS S3) | prod | Non | `https://<id>.r2.cloudflarestorage.com` | Endpoint pour services compatibles (R2/MinIO). Vide pour AWS S3. |
| `S3_ACCESS_KEY_ID` | **Conditionnel** (si `STORAGE_DRIVER=s3`) | prod | **Oui** | `AKIA...` | Identifiant d'accès S3. |
| `S3_SECRET_ACCESS_KEY` | **Conditionnel** (si `STORAGE_DRIVER=s3`) | prod | **Oui** | `...` | Clé secrète S3. |
| `S3_FORCE_PATH_STYLE` | Non (défaut `false`) | prod | Non | `true` | `true` pour MinIO / services nécessitant le path-style. |
| `SIGNED_URL_TTL_SECONDS` | Non (défaut `300`, 30–3600) | tous | Non | `300` | Durée de validité des URLs pré-signées. |
| `MAX_AUDIO_SIZE_MB` | Non (défaut `25`, 1–500) | tous | Non | `25` | Taille maximale d'un upload audio. |
| `RECORDING_RETENTION_DAYS` | Non (défaut `90`, 1–3650) | tous | Non | `90` | Rétention par défaut des enregistrements. |
| `LOG_LEVEL` | Non (défaut `info`) | tous | Non | `info` | Niveau de journalisation (`debug`/`info`/`warn`/`error`). |
| `ALLOW_DEMO_SEED` | Non (défaut `false`) | démo assumée | Non | `true` | Autorise le seed de démonstration en production (garde-fou). |
| `PORT` | Non (défaut `3000`) | prod | Non | `3000` | Port d'écoute (fourni par l'hébergeur ; respecté par `next start`). |
| `HOSTNAME` | Non (défaut `0.0.0.0` en Docker) | prod | Non | `0.0.0.0` | Interface d'écoute. |

> `PORT` et `HOSTNAME` sont gérés par Next.js / l'image Docker et ne sont pas validés par Zod.

## Variables conditionnelles (règles de validation)

- `AI_PROVIDER=openai` → `OPENAI_API_KEY` **obligatoire** (sinon échec au démarrage, pas de bascule
  silencieuse vers le mode démo).
- `STORAGE_DRIVER=s3` → `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
  **obligatoires**.
- `NODE_ENV=production` → `SESSION_SECRET` ne peut pas rester la valeur par défaut de développement.

## Fichiers de référence

- `.env.example` — développement local (PostgreSQL via Docker, port 5433, mode démo).
- `.env.production.example` — modèle de production **sans aucun secret réel**.

Ne jamais committer `.env` ni `.env.production`. Configurer les secrets dans l'hébergeur.
