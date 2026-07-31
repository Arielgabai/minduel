# RELEASE RUNBOOK — Gate redéploiement Minduel

**Décision gate :** GO local — GO production conditionnel aux vérifications manuelles Render et aux opérations du runbook.
**Branche :** `refonte-minduel-admin`
**Commit à déployer :** `<commit-r-fix>` (placeholder — remplacer par le SHA exact après commit/push R-FIX)
**Date :** 31/07/2026

> Procédure Render exécutable et réversible.
> **Aucune commande de ce runbook n'a été exécutée contre une base réelle dans les lots R / R-FIX / R-DOCFIX.**
> Les commandes manuelles sont marquées **« À NE PAS EXÉCUTER DANS CE LOT »**.

---

## H. GO / NO-GO

### Décision exacte

**GO local — GO production conditionnel aux vérifications manuelles Render et aux opérations du runbook.**

La production n'est **pas** déclarée préte sans :

1. confirmation du dashboard Render (gate §B.0) ;
2. choix explicite de la stratégie A, B ou C (§C) ;
3. exécution des opérations du runbook (sauvegarde, migrate, E2, flags, smoke).

Si le gate Render (§B.0) n'est pas confirmé → **STOP avant production**.

---

### Gate initial — historique (LOT R)

État au premier audit, **avant** correctif R-FIX :

| Critére | Résultat |
|---------|----------|
| `npm test` | OK — **244** tests / 17 fichiers |
| `npx tsc --noEmit` | OK |
| `npm run lint` | OK |
| `npx prisma validate` | OK |
| `git diff --check` | OK |
| `npm run build` | **ÉCHEC** — bloquant |

**Cause :** Next.js refuse les exports non autorisés depuis un fichier `page.tsx`.

1. `src/app/admin/exercises/[id]/page.tsx` — exports nommés (`resolvePromptSaveAction`, helpers, types).
2. `src/app/admin/exercises/page.tsx` — même classe de risque (`LIST_SENSITIVE_KEYS`, `listItemLooksSafe`, …).

**Décision initiale :** **NO-GO**.

**Statut :** ce défaut a **depuis été corrigé** (LOT R-FIX : extraction vers `src/lib/adminExercisesUi.ts`).

Le commit `98590f3` est le HEAD **pré-R-FIX** (interface admin). Ce n'est **pas** le commit final à déployer.

---

### Gate R-FIX — état courant

| Critére | Résultat |
|---------|----------|
| `npm test -- tests/adminExercisesUi.test.ts` | OK — **26** tests |
| `npm test` (suite) | OK — **246** tests / 17 fichiers |
| `npx tsc --noEmit` | OK |
| `npm run lint` | OK |
| `npx prisma validate` | OK |
| `npm run build` | **OK** (EXIT 0) |
| `git diff --check` | OK |
| Pages admin | uniquement `export default` |

**Non réalisé :** aucun déploiement Render, aucune migration, aucun backfill, aucune promotion, aucun seed, aucun appel OpenAI.

**Commit à déployer :** `<commit-r-fix>` — SHA exact à renseigner après commit/push du correctif R-FIX (et de ce lot documentaire si inclus). Ne pas déployer `98590f3` comme révision finale.

---

## A. Préconditions

À préparer **après** commit/push de `<commit-r-fix>`, avant toute opération Render :

| Précondition | Détail |
|--------------|--------|
| Branche / commit | `refonte-minduel-admin` @ `<commit-r-fix>` (pas `98590f3`) |
| Sauvegarde PostgreSQL | Snapshot / export Render Postgres **avant** toute commande de production |
| Organisation cible | Slug : `<org-slug>` (aucune création d'org) |
| Admin à promouvoir | Utilisateur **déjà existant** : `<admin-email>` |
| Accés Render | Dashboard web + worker + Shell/SSH ou one-off + variables + Deploys |
| Gate Render §B.0 | Confirmé manuellement (sinon STOP) |
| Stratégie | Choix explicite A, B ou C (§C) |
| Seeds | **Interdits** en production (`db:seed:demo`, `db:seed:exercises`) |

---

## B. Vérifications avant production

### B.0 Gate Render obligatoire (dashboard)

Vérifier **manuellement** dans le dashboard Render, **sans afficher les valeurs** des secrets :

| Contrôle | Confirmé ? |
|----------|------------|
| Service web concerné | |
| Background worker concerné | |
| Branche liée | |
| Commit ciblé = `<commit-r-fix>` | |
| État de l'auto-deploy | |
| Plan gratuit ou payant | |
| Commande Pre-Deploy **réelle** | |
| Start command web | |
| Start command worker | |
| Accés Shell/SSH ou mécanisme one-off | |
| Health check path | |
| Disponibilité du mode maintenance | |
| Variables présentes (noms seuls, jamais les valeurs) | |

**Si ces informations ne sont pas confirmées → STOP avant production.**

Aucun `render.yaml` n'existe dans le dépôt. Ne pas inventer de configuration absente. La doc `docs/deployment-render.md` décrit une procédure attendue ; seule l'UI Render fait foi pour l'état réel.

### B.1 Variables (Web + Worker)

À confirmer présents / absents (sans coller de secrets) :

- Runtime **Docker** attendu (selon doc dépôt).
- Start web documenté : `npm run start` (défaut Dockerfile) — **confirmer dans le dashboard**.
- Worker documenté : `npm run worker` — **confirmer**.
- Pre-Deploy documenté : `npm run db:migrate:deploy` — **confirmer** (pas dans le `CMD` Docker).
- Health Check Path documenté : `/api/health` — **confirmer**.
- Runtime habituels : `DATABASE_URL`, `SESSION_SECRET`, `APP_URL`, `AI_PROVIDER`, stockage S3, etc.
- Flags ops au repos **absents ou false** : `ALLOW_PROMPT_BUNDLE_BACKFILL`, `ALLOW_PROMOTE_ADMIN`, `ALLOW_DEMO_SEED`, `ALLOW_EXERCISE_SEED`.

### B.2 Migration

- Migration cible : `prisma/migrations/20260730100000_exercise_prompt_bundles`.
- Après disponibilité de l'image/commit :

```text
# À NE PAS EXÉCUTER DANS CE LOT
npx prisma migrate status
```

### B.3 Scénarios PUBLISHED / PLATFORM_ADMIN / dry-run E2

- Compter les PUBLISHED sans `publishedPromptBundleId` via dry-run E2 (pas de dump de prompts).
- Confirmer présence éventuelle d'un `PLATFORM_ADMIN` ; sinon prévoir `<admin-email>` après backfill.

```text
# À NE PAS EXÉCUTER DANS CE LOT
npm run db:backfill-prompt-bundles -- --org-slug=<org-slug>
```

Continuer uniquement si `erreurs: 0`.

---

## Matrice des variables d'environnement

Aucune valeur secréte réelle. Sources : `src/lib/env.ts`, scripts Prisma, `docs/environment-variables.md`, `.env.example`, `.env.production.example`.

| Variable | Obligatoire | Envs | Valeur attendue (descriptive) | Activation / retrait |
|----------|-------------|------|-------------------------------|----------------------|
| `DATABASE_URL` | Runtime et ops | local / staging / prod | URL PostgreSQL interne | Permanente |
| `DIRECT_URL` | Ops migrate si pooler | staging / prod | URL directe Postgres | Si pooler ; sinon absent |
| `SESSION_SECRET` | Runtime (≥32) | tous | Secret aléatoire ; pas la valeur dev | Permanent |
| `NODE_ENV` | Runtime prod : `production` | tous | `development` \| `test` \| `production` | Permanent |
| `APP_URL` | Runtime recommandé | tous | URL HTTPS publique | Permanent |
| `AI_PROVIDER` | Runtime (défaut `demo`) | tous | `demo` ou `openai` | Permanent |
| `OPENAI_API_KEY` | Si `AI_PROVIDER=openai` | staging / prod | Clé API serveur | Permanent si openai |
| `OPENAI_*` / worker / storage | Selon `env.ts` | tous | Voir `.env.production.example` | Permanent |
| `ALLOW_DEMO_SEED` | Ops seed démo | démo assumée | `true` temporaire | **Jamais** pour cette release prod |
| `ALLOW_EXERCISE_SEED` | Ops seed exercices | local / démo | `true` temporaire | **Jamais** pour cette release prod |
| `SEED_ORG_SLUG` | Ops seed exercices | local / démo | Slug org existante | Non pertinent pour cette release |
| `ALLOW_PROMPT_BUNDLE_BACKFILL` | Ops E2 `--apply` hors DB locale/test | staging / prod | `true` pendant apply | **Activer juste avant apply ; retirer / `false` immédiatement après** |
| `ALLOW_PROMOTE_ADMIN` | Ops promote si prod | staging / prod | `true` pendant promote | **Activer juste avant promote ; retirer / `false` immédiatement après** |
| `PROMOTE_ADMIN_EMAIL` | Ops promote (alt. `--email=`) | ops | Email existant | Temporaire ; retirer après |
| `BACKFILL_ORG_SLUG` | Ops backfill (alt. `--org-slug=`) | ops | Slug org cible | Temporaire ; retirer après |

**Rappels :** flags temporaires retirés après usage ; **aucun seed** exercices/démo en production pendant cette release.

---

## C. Ordre exact des opérations — trois stratégies

### Méthode Render détectée dans le dépôt (non inventée)

| Élément | Détection dépôt |
|---------|-----------------|
| `render.yaml` | **Absent** |
| Doc ops | `docs/deployment-render.md` |
| Build | Docker multi-stage : `npm ci` → `npm run build` → image finale `npm ci --omit=dev` |
| Start web (Dockerfile) | `CMD ["npm", "run", "start"]` → `next start` |
| Worker (doc) | Même image, Start Command `npm run worker` |
| Migrations (doc) | Pre-Deploy `npm run db:migrate:deploy` — **à confirmer dans le dashboard** |
| Prisma CLI + `tsx` | Présents dans l'image finale (`dependencies`) |
| CI GitHub/GitLab | Aucune pipeline détectée dans le dépôt |

### Fenétre E1A (rappel)

Après bascule vers le nouveau code, `POST /api/simulations` exige un `publishedPromptBundleId` + bundle PUBLISHED valide.
La migration est **additive** et ne crée pas les bundles.
Les simulations historiques avec snapshot null restent en **fallback legacy**.

---

### Stratégie A — préférée si réellement disponible

Un **one-off** ou environnement isolé utilisant **exactement** l'image/commit `<commit-r-fix>` (capacité à confirmer dans Render — **ne pas affirmer** qu'un Shell éphémère utilise automatiquement le nouveau commit avant son déploiement) :

1. sauvegarde PostgreSQL ;
2. `prisma migrate deploy` ;
3. dry-run E2 ;
4. activation temporaire de `ALLOW_PROMPT_BUNDLE_BACKFILL` ;
5. apply E2 **uniquement si zéro erreur** ;
6. second dry-run idempotent ;
7. désactivation du flag backfill ;
8. promotion admin si nécessaire (`ALLOW_PROMOTE_ADMIN`) ;
9. désactivation du flag promotion ;
10. déploiement / bascule web et worker sur le **même** `<commit-r-fix>` ;
11. smoke tests sans OpenAI (§G).

Si la capacité one-off sur le nouveau commit n'est **pas** confirmée → ne pas choisir A ; passer à B ou C.

---

### Stratégie B — fallback avec maintenance disponible

1. sauvegarde ;
2. activer la maintenance ;
3. déployer `<commit-r-fix>` avec migration Pre-Deploy **confirmée** dans le dashboard ;
4. exécuter **immédiatement** dry-run / apply / second dry-run E2 ;
5. promouvoir l'admin si nécessaire ;
6. retirer tous les flags temporaires ;
7. smoke tests (§G) ;
8. désactiver la maintenance.

---

### Stratégie C — plan sans maintenance ni one-off adapté

**Ce chemin n'est pas qualifié de sûr.**

Il existe une **courte fenêtre potentielle** où E1A renvoie **409** pour les scénarios PUBLISHED non backfillés, entre bascule applicative et fin du backfill.

Exiger une **décision manuelle** entre :

- accepter **explicitement** cette fenêtre et backfiller immédiatement après deploy ;
- provisionner un moyen one-off / staging plus sûr (revenir à A) ;
- **reporter** le déploiement.

Sans décision manuelle écrite → **STOP**.

---

## D. Commandes manuelles

**« À NE PAS EXÉCUTER DANS CE LOT »** — uniquement après GO local + gate Render + stratégie choisie, depuis Shell / one-off de l'image `<commit-r-fix>`.

### Migration deploy

```bash
# À NE PAS EXÉCUTER DANS CE LOT
npm run db:migrate:deploy
```

### Statut migration

```bash
# À NE PAS EXÉCUTER DANS CE LOT
npx prisma migrate status
```

### Backfill dry-run

```bash
# À NE PAS EXÉCUTER DANS CE LOT
npm run db:backfill-prompt-bundles -- --org-slug=<org-slug>
```

### Backfill apply

```bash
# À NE PAS EXÉCUTER DANS CE LOT
# Activer temporairement ALLOW_PROMPT_BUNDLE_BACKFILL=true, puis :
npm run db:backfill-prompt-bundles -- --org-slug=<org-slug> --apply
# Retirer immédiatement ALLOW_PROMPT_BUNDLE_BACKFILL
```

### Second dry-run (idempotence)

```bash
# À NE PAS EXÉCUTER DANS CE LOT
npm run db:backfill-prompt-bundles -- --org-slug=<org-slug>
```

Attendu : `toAttach=0`, `toCreate=0`, `erreurs=0`.

### Promotion admin

```bash
# À NE PAS EXÉCUTER DANS CE LOT
# Activer temporairement ALLOW_PROMOTE_ADMIN=true, puis :
npm run db:promote-admin -- --email=<admin-email>
# Retirer immédiatement ALLOW_PROMOTE_ADMIN
```

### Interdits pendant cette release

```bash
# NE PAS LANCER EN PRODUCTION
npm run db:seed:demo
npm run db:seed:exercises
npm run db:reset
```

---

## E. Points de contrôle

| Étape | Résultat attendu | Continuer si | Arréter si | Info rollback |
|-------|------------------|--------------|------------|---------------|
| Gate Render §B.0 | Checklist compléte | Tout confirmé | Toute case non confirmée | — |
| Stratégie A/B/C | Choix écrit | A, B, ou C accepté explicitement | Aucun choix | — |
| Sauvegarde DB | Snapshot OK | ID/horodatage noté | Backup impossible | ID backup |
| Commit | `<commit-r-fix>` déployable | SHA connu | SHA placeholder non remplacé | SHA |
| Migrate | `migrate deploy` OK | Exit 0 | Erreur SQL / drift | SHA migration + backup |
| Dry-run E2 | `erreurs: 0` | Zéro erreur | Toute erreur plan | Compteurs |
| Apply E2 | compteurs cohérents | Exit 0 | Erreur apply | Compteurs + org |
| 2e dry-run | idempotent | `toAttach=toCreate=0` | Nouvelles erreurs | Résumé |
| Flags ops off | absents/`false` | Confirmé UI | Flag resté `true` | — |
| Promote (opt.) | promu ou déjà admin | Succés | User introuvable | Audit rôle précédent |
| Smoke §G | checklist OK | Tous points | Régression auth/admin | Deploy ID |

---

## F. Rollback

### Rollback applicatif Render

- Render → Web Service → **Deploys** → **Rollback** vers le déploiement précédent.
- Idem Background Worker (même image / commit).
- **Préférer le rollback applicatif avant toute restauration DB.**

### Migration additive

- Migration `20260730100000_exercise_prompt_bundles` additive.
- Ne pas rollback auto la migration lors d'un rollback app.
- SQL de rollback manuel en en-téte du fichier migration : dernier recours + accord explicite.

### Si le backfill a déjà créé des bundles

- **Ne pas supprimer automatiquement** les `PromptBundle` créés par E2 :
  - simulations nouvelles peuvent pointer dessus (`onDelete: Restrict`) ;
  - pointeur `publishedPromptBundleId` requis par le nouveau runtime ;
  - perte d'historique versions/hash.
- Rollback app laisse les bundles en base sans casser l'ancien runtime.

### Restauration DB

- Dernier recours uniquement.
- Préférer rollback app + conservation migration/bundles.

### Simulations et historiques

- Conserver transcripts, évaluations, débriefs.
- Historique sans snapshot → fallback legacy.

---

## G. Smoke tests sans coût OpenAI

Checklist manuelle post-déploiement. **Aucune simulation OpenAI** dans cette passe.

1. Login anonyme.
2. Login TELEPRO.
3. Login MANAGER.
4. Login PLATFORM_ADMIN.
5. Refus de `/admin` pour MANAGER/TELEPRO.
6. Liste `/admin/exercises` sans fuite de prompts.
7. Création d'un exercice DRAFT.
8. Édition des métadonnées.
9. Création/mise à jour d'un bundle DRAFT.
10. Preview locale.
11. `publishBundle`.
12. Publication exercice.
13. Assignation manager.
14. Présence côté télépro.
15. Archive → disparition accueil télépro.
16. Historique et débrief existants accessibles.

Simulation Realtime / évaluation OpenAI = accord manuel séparé.

---

## Garanties à conserver

- Migration **additive**.
- Anciennes simulations avec snapshot null → **fallback legacy**.
- E2 **dry-run par défaut** ; `--apply` obligatoire pour écrire.
- Garde prod backfill : `ALLOW_PROMPT_BUNDLE_BACKFILL`.
- Flags temporaires **retirés après usage**.
- **Aucun seed** en production pendant cette release.
- Bundles créés par E2 **non supprimés automatiquement** au rollback.
- Rollback applicatif **avant** restauration DB.
- Smoke initiaux **sans** simulation OpenAI.
- DELETE manager = soft-archive `ARCHIVED`.
- Admin = `requirePlatformAdmin` strict.

---

## Audit Git (constat LOT R — historique)

| Item | Valeur |
|------|--------|
| Branche | `refonte-minduel-admin` |
| HEAD pré-R-FIX (historique) | `98590f3` — interface admin ; **pas** le commit final |
| Commit à déployer | `<commit-r-fix>` après commit/push |
| `render.yaml` | absent |
| Secrets suivis | aucun |

---

## Prochaines actions manuelles

1. Relire le diff documentaire (ce lot).
2. Commit / push R-FIX (et ce lot documentaire si inclus).
3. Remplacer `<commit-r-fix>` par le SHA exact, ou le consigner dans la checklist Render.
4. Inspecter le dashboard Render (§B.0).
5. Choisir explicitement la stratégie **A**, **B** ou **C**.
6. Faire une sauvegarde PostgreSQL avant toute commande de production.
