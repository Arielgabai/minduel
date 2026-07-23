# Checklist de mise en production — MINDUEL

À dérouler avant toute exposition en bêta privée.

## Base de données

- [x] SQLite retiré du chemin de production (provider Prisma `postgresql`).
- [x] Migrations versionnées dans `prisma/migrations/` (migration initiale `*_init`).
- [x] `prisma migrate deploy` utilisé en production (jamais `db push`, jamais `migrate dev`).
- [x] `prisma generate` exécuté au build (`npm run build`) et dans l'image finale.
- [ ] `DATABASE_URL` pointant vers une base **managée persistante** (à configurer côté hébergeur).
- [ ] Sauvegarde automatique de la base activée (fournisseur).

## Stockage audio

- [x] Abstraction `AudioStorageProvider` (local + S3).
- [x] Clé d'objet = `organizationId` + UUID non prédictible (jamais le nom utilisateur).
- [x] Validation serveur MIME + extension + taille (`MAX_AUDIO_SIZE_MB`).
- [x] URLs pré-signées de courte durée (`SIGNED_URL_TTL_SECONDS`).
- [x] Suppression de l'objet à la suppression définitive de l'appel.
- [x] Compensation : nettoyage de l'objet si l'écriture DB échoue après upload.
- [x] Upload **refusé** en production si `STORAGE_DRIVER` ≠ `s3` (503).
- [ ] Bucket **privé** confirmé (aucun public-read) côté fournisseur.

## Traitements asynchrones

- [x] File persistante PostgreSQL (`ProcessingJob`) + worker séparé (`npm run worker`).
- [x] Jobs idempotents (`@@unique([type, targetId])`), `maxAttempts`, backoff, verrouillage
      `FOR UPDATE SKIP LOCKED`, reprise après redémarrage.
- [x] Journalisation sans contenu audio ni transcript complet.
- [x] Liveness worker via logs `worker.heartbeat`.

## OpenAI / Realtime

- [x] `OPENAI_API_KEY` lue **uniquement** côté serveur (`server-only`), aucune `NEXT_PUBLIC_*`.
- [x] Session Realtime via **secret éphémère** serveur.
- [x] Route Realtime : auth + organisation + scénario vérifiés, **rate limit** appliqué.
- [x] Modèles centralisés dans la configuration.
- [x] Séparation explicite demo/openai, **aucune bascule silencieuse**.
- [x] Évaluation validée par **Zod** avant écriture ; un échec n'enregistre pas d'évaluation partielle.

## Authentification & sécurité

- [x] Cookie de session `httpOnly`, `secure` en production, `sameSite`, expiration explicite.
- [x] `SESSION_SECRET` ≥ 32 caractères ; valeur par défaut interdite en production.
- [x] Comparaison bcrypt ; message de login générique (pas de distinction compte/mot de passe).
- [x] Rate limiting : login (IP + email), upload, session Realtime, export.
- [x] RBAC + contrôle `organizationId` sur chaque accès ; validation Zod des entrées.
- [x] Headers de sécurité (CSP, HSTS, X-Frame-Options, etc.).
- [x] Pas de stack trace renvoyée au client ; logs sans secret/cookie/clé/URL signée.
- [x] Seed démo **non automatique** ; refusé en prod sauf `ALLOW_DEMO_SEED=true`.

## Réseau / URL publique

- [x] Aucun `localhost:3000` codé en dur dans le code applicatif (utilise `APP_URL`).
- [x] `GET /api/health` (public, léger, teste la DB, ne dépend pas d'OpenAI/S3).
- [x] Écoute sur `0.0.0.0:$PORT`.
- [ ] Domaine HTTPS vérifié (micro/WebRTC requièrent HTTPS).

## Docker & commandes

- [x] `Dockerfile` multi-stage, Node 20 fixé, non-root, `HEALTHCHECK`, pas de `.env`/SQLite/audio.
- [x] `.dockerignore` complet.
- [x] Commandes séparées : `build`, `db:migrate:deploy`, `start`, `worker`, `db:seed:demo`.
- [x] Le démarrage ne modifie jamais le schéma.

## Vérifications exécutées (résultats réels)

| Commande | Résultat |
| --- | --- |
| `npm run typecheck` | ✅ OK (0 erreur) |
| `npm test` | ✅ 22/22 tests passés (4 fichiers) |
| `npm run lint` | ✅ Aucun avertissement/erreur ESLint |
| `npm run build` | ✅ Build réussi (25 routes, dont `/api/health`) |
| `npm run db:migrate` | ✅ Migration `*_init` créée et appliquée (PostgreSQL) |
| `npm run db:seed:demo` | ✅ Org démo + 3 comptes créés |

## Limites connues

- **Providers OpenAI transcription / extraction / évaluation non implémentés** : lèvent
  `NotImplementedProviderError` (aucun mock masqué). Seul `AI_PROVIDER=demo` effectue ces
  traitements. La session **Realtime** OpenAI est câblée (secret éphémère) mais **non testée**
  end-to-end avec une vraie clé dans cet environnement.
- **Image Docker non construite ici** : `Dockerfile`/`.dockerignore` fournis et cohérents avec le
  build Next.js validé, mais `docker build`/`docker run` restent à exécuter sur la machine cible.
- **Rate limiting en mémoire** : suffisant pour un mono-instance de bêta ; prévoir un backend
  partagé (Redis) pour du multi-instance.
- **Avertissement Prisma** `package.json#prisma` déprécié : sans impact (config seed conservée dans
  `package.json` car `prisma.config.ts` empêchait le chargement automatique de `.env`).
