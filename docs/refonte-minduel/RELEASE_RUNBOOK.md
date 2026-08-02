# RELEASE RUNBOOK — Minduel MVP V2 (gate final)

**Décision gate :** GO local — GO production **conditionnel** aux vérifications manuelles Render et aux points d'arrêt de ce runbook.

| Élément | Valeur |
|---------|--------|
| Commit cible `<target-commit>` | `9d9b38bc1293c2f5d2171ba1b632fb8b5e61919c` |
| Commit production précédent `<previous-production-commit>` | `ae61df7db304e51cfc19df86d4959bd6a8f7d262` (**à revérifier dans le dashboard Render**) |
| Branche locale du gate | `release/minduel-mvp-v2` (sans upstream configuré) |
| Branche déployée par Render (documentée) | `main` — **à revérifier dans le dashboard** |
| `main`, `minduel/main` et la cible | Même SHA (`0 0` d'écart, vérifié localement) |
| Delta production → cible | 14 commits, 50 fichiers, 1 migration ajoutée |
| Date du gate | 02/08/2026 |

> Procédure Render exécutable et réversible, **sans coût OpenAI**.
> **Aucune commande de ce runbook n'a été exécutée contre une base réelle.** Aucun déploiement, aucune migration, aucun seed, aucun backfill, aucune promotion, aucun appel réseau externe.
> Les commandes opérationnelles sont marquées **« À NE PAS EXÉCUTER DANS CE LOT »**.

---

## A. Préconditions

Toutes obligatoires **avant** la moindre action Render. Une seule case non satisfaite ⇒ **STOP**.

| # | Précondition | Vérification | OK ? |
|---|--------------|--------------|------|
| A1 | Commit cible exact `9d9b38bc1293c2f5d2171ba1b632fb8b5e61919c` | SHA complet relevé, pas un préfixe ambigu | |
| A2 | Commit production actuel = `ae61df7db304e51cfc19df86d4959bd6a8f7d262` | **Relevé dans Render → Deploys**, pas supposé depuis la doc | |
| A3 | La cible est bien la tête de la branche suivie par Render | Comparer le SHA du dashboard et celui de `main` sur GitHub | |
| A4 | Export PostgreSQL **frais** terminé | Horodatage + identifiant de l'export notés ; export **terminé**, pas « en cours » | |
| A5 | Point-in-time recovery actif et fenêtre couvrant l'opération | Dashboard Render → base de données | |
| A6 | Accès dashboard + logs (web, worker, base) | Connexion effective, pas un accès théorique | |
| A7 | Services web et worker identifiés sans ambiguïté | Noms exacts notés (deux services distincts, même image) | |
| A8 | Auto-deploy **OFF** sur le web **et** sur le worker | Vérifié séparément sur chaque service | |
| A9 | Aucun déploiement en cours ni en file | Onglet Deploys des deux services | |
| A10 | Aucune donnée réelle modifiée pendant le gate | Aucun seed, backfill, promotion, migration, simulation lancés | |
| A11 | Décision manuelle écrite sur le contenu Skills de smoke (§E) | Voir §E.3 | |

**Rappel :** l'audit local n'autorise pas la production. Il autorise seulement l'ouverture du gate dashboard (§B).

---

## B. Gate dashboard obligatoire

À relever **manuellement**, service par service, **sans afficher aucune valeur secrète**. Noter uniquement les **noms** de variables.

### B.1 Champs à relever

| Champ | Service web | Background worker |
|-------|-------------|-------------------|
| Nom exact du service | | |
| Branche liée | attendu `main` — confirmer | attendu `main` — confirmer |
| Commit actuellement déployé | attendu `ae61df7…` — confirmer | attendu `ae61df7…` — confirmer |
| Runtime / Dockerfile | attendu Docker (Dockerfile du dépôt) | attendu Docker (même image) |
| **Pre-Deploy Command** | attendu `npm run db:migrate:deploy` — **confirmer le champ réel** | attendu `npm run db:migrate:deploy` — **confirmer le champ réel** |
| Start Command | attendu `npm run start` | attendu `npm run worker` |
| Health Check Path | attendu `/api/health` | sans objet (worker) |
| Auto-deploy | attendu **OFF** | attendu **OFF** |
| Plan / type d'instance | | |
| Mécanisme one-off / Shell disponible | | |
| Noms des variables présentes | (noms seuls) | (noms seuls) |
| Flags ops présents | `ALLOW_*`, `PROMOTE_*`, `SEED_*`, `BACKFILL_*` : présents ? valeur `true` ou `false` ? | idem |

### B.2 Contrôles bloquants

| Contrôle | STOP si |
|----------|---------|
| B2.1 | Le Pre-Deploy **réel** du service à déployer en premier n'est pas confirmé dans l'UI |
| B2.2 | Le commit déployé ne correspond pas exactement au SHA cible au moment du déclenchement |
| B2.3 | L'export PostgreSQL n'est pas **terminé** |
| B2.4 | Auto-deploy est resté **ON** sur l'un des deux services |
| B2.5 | Un flag ops est présent avec la valeur `true` (voir §F du tableau variables) |
| B2.6 | La branche liée dans Render ne contient pas le commit cible |
| B2.7 | Un déploiement concurrent est déjà en cours |

### B.3 Faits établis dans le dépôt (à ne pas réinventer)

| Élément | Constat dépôt (cible) |
|---------|-----------------------|
| `render.yaml` | **Absent** — seule l'UI Render fait foi |
| Documentation ops | `docs/deployment-render.md` |
| Build image | Docker multi-stage : `npm ci` → `npm run build` → image finale `npm ci --omit=dev` puis `npx prisma generate` |
| `npm run build` | `prisma generate && next build` — **aucun seed, aucun appel OpenAI au build** |
| Start web (Dockerfile `CMD`) | `npm run start` → `next start` |
| Worker | même image, Start Command `npm run worker` → `node src/worker/run.cjs` |
| Migrations | **jamais** dans le `CMD` ; uniquement via Pre-Deploy ou one-off |
| Prisma CLI + `tsx` | présents dans l'image finale (`dependencies`) |
| Validation env au démarrage | `src/instrumentation.ts` → `getServerEnv()` (échec immédiat si config invalide) |
| Health | `GET /api/health` : `SELECT 1` + stats jobs best-effort ; `200` si DB up, `503` sinon ; **ne dépend ni d'OpenAI ni de S3 ni des tables Skills** |
| Liveness worker | logs `worker.start` puis `worker.heartbeat` (toutes les 30 s) |
| Pipeline CI | aucune pipeline détectée dans le dépôt |

---

## C. Commandes « À NE PAS EXÉCUTER DANS CE LOT »

Aucune de ces commandes n'a été exécutée. Elles ne s'exécutent qu'après §A et §B validés, depuis un Shell / one-off **de l'image du commit cible**.

### C.1 Statut des migrations (lecture seule, sûre)

```bash
# À NE PAS EXÉCUTER DANS CE LOT
npx prisma migrate status
```

Attendu **avant** bascule : 3 migrations appliquées, `20260802100000_skills_library` **en attente**.
Attendu **après** Pre-Deploy : 4 migrations appliquées, aucune en attente, aucun drift.

### C.2 Migration deploy (uniquement si un one-off est nécessaire)

À n'utiliser que si le Pre-Deploy réel n'a **pas** pu être confirmé et qu'un one-off sur l'image cible est disponible et confirmé.

```bash
# À NE PAS EXÉCUTER DANS CE LOT
npm run db:migrate:deploy
```

### C.3 Vérification Prisma sûre (lecture seule)

```bash
# À NE PAS EXÉCUTER DANS CE LOT
npx prisma validate
```

### C.4 Dry-run E2 — facultatif, contrôle uniquement

Le backfill PromptBundle a déjà été appliqué lors de la release précédente. Ce dry-run ne sert qu'à **constater** l'idempotence. Il n'écrit rien (le mode par défaut est dry-run ; `--apply` est obligatoire pour écrire).

```bash
# À NE PAS EXÉCUTER DANS CE LOT
npm run db:backfill-prompt-bundles -- --org-slug=<org-slug>
```

Attendu : `toAttach=0`, `toCreate=0`, `erreurs=0`.
Toute valeur non nulle ⇒ **anomalie** : ne pas appliquer, documenter, décision manuelle explicite requise.

### C.5 Commandes interdites par défaut dans cette release

```bash
# NE PAS LANCER
npm run db:backfill-prompt-bundles -- --org-slug=<org-slug> --apply   # aucun --apply sans anomalie validée
npm run db:seed:demo                                                  # aucun seed
npm run db:seed:exercises                                             # aucun seed
npm run db:promote-admin -- --email=<admin-email>                     # admin déjà configuré : à revérifier, pas à refaire
npm run db:reset                                                      # destructif
```

**Aucun backfill Skills n'existe et aucun n'est nécessaire :** la migration Skills ne crée aucune donnée et le catalogue démarre vide.

---

## D. Déploiement séquentiel — worker puis web

### D.0 Principe

**Les deux services ne doivent jamais être déclenchés simultanément.**

1. Web et worker partagent la **même base** et la **même image**. Deux Pre-Deploy concurrents lanceraient deux `prisma migrate deploy` en parallèle sur la même base : verrou d'avis Prisma, échec d'un des deux déploiements, et surtout état de migration ambigu au moment précis où l'on veut une preuve nette.
2. La séquence rend la **preuve** lisible : un seul service change à la fois, un seul journal à lire, un seul rollback à déclencher.
3. La migration Skills est **additive** (`CREATE TABLE` / `CREATE INDEX` / `ADD CONSTRAINT` sur des tables neuves uniquement, **zéro `ALTER` sur une table existante**). L'ancien web (`ae61df7…`) ne référence aucune table Skills : il continue à fonctionner normalement pendant et après la migration.

### D.1 Pourquoi le worker d'abord

Le worker est le porteur de migration **le moins risqué** :

* il ne sert aucun trafic utilisateur ; un échec de démarrage n'impacte pas les sessions en cours ;
* il ne référence **aucune** table Skills (vérifié statiquement) : il démarre indifféremment avant ou après la migration ;
* pendant son Pre-Deploy, l'ancien web reste **actif et intact** ;
* à l'inverse, le **nouveau web exige les tables Skills dès qu'il sert du trafic** : `/app/skills`, `/admin/skills`, le débrief et la Progression interrogent `SkillCategory` / `SkillArticleMapping`. Le déployer avant la migration produirait des erreurs serveur sur ces écrans.

**Ce chemin n'est sûr que si le Pre-Deploy du worker est réellement confirmé (§B2.1).** Si le champ Pre-Deploy du worker est vide ou différent, le worker se déploiera **sans** appliquer la migration : le web déployé ensuite tomberait sur des tables absentes.

### D.2 Alternative — web seul avec Pre-Deploy avant bascule

Acceptable **uniquement** si le dashboard garantit explicitement que le Pre-Deploy du web s'exécute **avant** le routage du trafic vers la nouvelle version (comportement documenté par Render, à **confirmer dans l'UI**, pas à supposer).

Dans ce cas : web seul sur la cible → Pre-Deploy applique la migration → health OK → bascule → worker ensuite sur le même commit.

Si ce comportement n'est pas confirmé ⇒ ne pas choisir cette alternative.

### D.3 Séquence

| # | Étape | Preuve à conserver | Point d'arrêt |
|---|-------|--------------------|---------------|
| D3.1 | Export PostgreSQL frais **terminé** | Identifiant + horodatage de l'export | STOP si l'export n'est pas terminé |
| D3.2 | Gate dashboard §B rempli pour les **deux** services | Capture / relevé écrit des champs §B.1 | STOP si un champ n'est pas confirmé |
| D3.3 | Flags ops absents ou `false` sur les deux services | Liste des **noms** de flags et leur état | STOP si un flag ops vaut `true` |
| D3.4 | Auto-deploy OFF confirmé sur les deux services | Relevé | STOP sinon |
| D3.5 | **Déployer le worker seul** sur `9d9b38bc…` | Deploy ID + SHA affiché par Render | STOP si le SHA affiché n'est pas exactement la cible |
| D3.6 | Lire le journal de Pre-Deploy du worker | Sortie `prisma migrate deploy` (migration `20260802100000_skills_library` appliquée) | STOP sur toute erreur SQL ou drift ; ne pas relancer à l'aveugle |
| D3.7 | Attendre worker `Live` + `worker.start` puis `worker.heartbeat` dans les logs | Extrait de log (sans secret) | STOP si aucun heartbeat après deux cycles (~60 s) |
| D3.8 | Vérifier la migration **sans afficher de contenu** | `npx prisma migrate status` : 4/4 appliquées, 0 en attente | STOP si des migrations restent en attente |
| D3.9 | Vérifier que l'ancien web est toujours sain | `/api/health` → `200`, `db: up` | STOP et envisager rollback si dégradé |
| D3.10 | **Déployer le web** sur **exactement le même** `9d9b38bc…` | Deploy ID + SHA affiché | STOP si le SHA diffère de D3.5 |
| D3.11 | Pre-Deploy du web | Attendu « No pending migrations to apply » (la migration est déjà appliquée) | STOP si une migration inattendue apparaît |
| D3.12 | Attendre health `/api/health` `200` et statut `Live` | Réponse health + statut | STOP si `503` ou `db: down` |
| D3.13 | Smoke tests §E | Checklist remplie | Rollback si régression auth / rôles / débrief |
| D3.14 | Laisser l'auto-deploy **OFF** | Relevé final | — |

**Interdits pendant D3 :** lancer une nouvelle simulation, ouvrir un micro, déclencher une évaluation OpenAI, exécuter un seed, un backfill `--apply` ou une promotion.

---

## E. Smoke tests sans OpenAI

Post-déploiement, **aucune** simulation nouvelle, **aucun** micro, **aucun** appel OpenAI. Tout s'appuie sur des données déjà persistées.

### E.1 Checklist

| # | Test | Attendu | OK ? |
|---|------|---------|------|
| 1 | `GET /api/health` | `200`, `status: ok`, `db: up` | |
| 2 | Accès anonyme aux routes protégées | Redirection login ; aucune donnée exposée | |
| 3 | Login `TELEPRO` | Shell 5 destinations (Accueil, Missions, Skills, Progression, Profil) | |
| 4 | Login `MANAGER` | Espace manager accessible ; pas de lien Administration | |
| 5 | Login `PLATFORM_ADMIN` | Lien Administration présent ; `/admin` accessible | |
| 6 | `/admin` et `/api/admin/*` avec un compte MANAGER puis TELEPRO | Refus strict (`403` / redirection), aucune fuite de prompt | |
| 7 | Missions dynamiques | Niveaux, statuts, verrouillage, recommandation issus des exercices réellement assignés ; aucun compteur figé ; verrouillé = aucun lien lançable | |
| 8 | `/app/skills` (télépro) | État vide explicite si aucun contenu publié, sinon uniquement les contenus `PUBLISHED` | |
| 9 | `/admin/skills` | Création d'une catégorie/section/article **DRAFT**, modification, puis **suppression du DRAFT** | |
| 10 | Aucun contenu de test publié | Aucun `publish` sans la décision manuelle §E.3 | |
| 11 | Débrief existant `/app/analysis/<id>` | 4 onglets (Résumé, Ligne par ligne, Pourquoi, Comparatif) ; états vides explicites ; **aucun recalcul** | |
| 12 | Liens Skills dans le débrief | Présents **uniquement** si des mappings vers des articles publiés existent ; sinon absents (jamais inventés) | |
| 13 | `/app/progression` | 4 onglets (Tendances, Comparatif, Diagnostic, Badges) ; états vides si données insuffisantes | |
| 14 | `/app/call/<id>/done` sur une **simulation historique existante** | Écran de fin lisible et rechargeable ; **aucun appel à `/end`** ; `404` pour une simulation d'un autre télépro | |
| 15 | Historique et débriefs existants | Toujours accessibles, contenus inchangés | |
| 16 | Exercice archivé | Toujours masqué côté télépro | |

**Étape 14 :** n'utiliser qu'un identifiant de simulation **déjà terminé**. Si aucun identifiant historique n'est disponible, marquer le point **« non testable sans nouvelle simulation »** et le laisser non coché — ne pas créer de simulation pour le tester.

### E.2 Interdits pendant le smoke

* démarrer une nouvelle simulation (DEMO ou Realtime) ;
* autoriser le micro / ouvrir une session WebRTC ;
* déclencher une évaluation ou un retry d'évaluation OpenAI ;
* uploader un fichier audio ;
* exécuter un seed, un backfill `--apply` ou une promotion.

### E.3 Décision manuelle — tester la visibilité d'un article `PUBLISHED`

Le point 8 ne couvre que l'état vide ou les contenus déjà présents. Vérifier la visibilité d'un article réellement `PUBLISHED` **écrit de la donnée en production** et exige donc une décision manuelle **écrite avant** l'opération. Choisir **une** option :

| Option | Description | Conséquence |
|--------|-------------|-------------|
| E3-A | **Ne pas tester** la publication pendant cette release | Point 8 limité à l'état vide / contenu existant ; aucune écriture |
| E3-B | Publier un **vrai contenu destiné à rester** (catégorie + section + article validés éditorialement) | Contenu de production permanent ; assumé et documenté |
| E3-C | Publier puis **archiver** un contenu de smoke **explicitement identifié** (titre et slug préfixés, ex. `smoke-…`) | Contenu tracé et masqué après test ; **jamais** de hard-delete d'un contenu publié |

Sans option choisie par écrit ⇒ appliquer **E3-A** par défaut.

**Rappel cycle de vie :** publier un article exige une catégorie **et** une section publiées ; l'archivage masque sans supprimer ; le hard-delete est réservé aux `DRAFT` non référencés.

---

## F. Rollback

### F.1 Rollback applicatif (voie normale)

1. Render → **Web Service** → **Deploys** → **Rollback** vers `ae61df7db304e51cfc19df86d4959bd6a8f7d262`.
2. Render → **Background Worker** → **Deploys** → **Rollback** vers le **même** `ae61df7…`.
3. Vérifier `/api/health` → `200`, `db: up`, puis les logs worker (`worker.start`, `worker.heartbeat`).
4. **Toujours préférer le rollback applicatif à toute restauration de base.**

### F.2 La migration Skills reste en place

* Ne **jamais** rollback automatiquement `20260802100000_skills_library`.
* Elle est purement additive : quatre tables neuves, aucun `ALTER` sur une table existante.
* L'ancien web **ignore** totalement ces tables : leur présence est sans effet sur lui.
* Ne **pas** supprimer automatiquement les tables Skills, ni les `PromptBundle`, ni les articles ou mappings créés.
* Le SQL de rollback manuel figure en en-tête du fichier de migration (`DROP TABLE` enfants → parents). C'est un **dernier recours**, soumis à accord explicite, et il détruit définitivement le contenu Skills.

### F.3 Restauration de base

* **Dernier recours uniquement.**
* Utiliser l'export §A4 ou le point-in-time recovery.
* Une restauration fait perdre toutes les écritures postérieures à l'instant restauré : simulations, évaluations, débriefs, jobs.

### F.4 Données à préserver dans tous les cas

Simulations, transcripts, évaluations, débriefs, scores de compétences, historiques, `PromptBundle` et `ProcessingJob`. Les simulations historiques sans snapshot restent en **fallback legacy**.

---

## G. Décision GO / NO-GO

### G.1 GO local — **acquis**

| Critère | Résultat | Durée approx. |
|---------|----------|---------------|
| `npm test` | **OK — 394 tests / 25 fichiers** (réseau intégralement stubbé) | ~19 s |
| `npx tsc --noEmit` | OK (exit 0) | ~14 s |
| `npm run lint --if-present` | OK — No ESLint warnings or errors | ~17 s |
| `npx prisma validate` | OK — schéma valide | ~10 s |
| `npm run build` | OK (exit 0) — **33/33 pages générées** | ~65 s |
| `git diff --check` | OK | — |
| Migration Skills | Additive, conforme au schéma, non exécutée | — |
| Secrets suivis | Aucun secret réel détecté | — |

### G.2 GO production — **conditionnel**

La production n'est pas prête tant que **toutes** les conditions suivantes ne sont pas vérifiables et vérifiées :

| # | Condition | Vérifiable par |
|---|-----------|----------------|
| G2.1 | Export PostgreSQL frais **terminé** | Identifiant + horodatage dans le dashboard |
| G2.2 | Commit production actuel = `ae61df7…` | Render → Deploys du web et du worker |
| G2.3 | Branche Render contient exactement `9d9b38bc…` en tête | Dashboard + GitHub |
| G2.4 | Pre-Deploy **réel** du premier service déployé confirmé | Champ Pre-Deploy dans l'UI Render |
| G2.5 | Auto-deploy OFF sur web **et** worker | Dashboard, service par service |
| G2.6 | Flags ops absents ou `false` | Onglet Environment (noms seuls) |
| G2.7 | Aucun déploiement concurrent | Onglet Deploys |
| G2.8 | Décision §E.3 écrite | Trace écrite avant l'opération |
| G2.9 | Migration confirmée appliquée après le worker | `prisma migrate status` : 4/4, 0 en attente |
| G2.10 | Health web `200` / `db: up` après bascule | `/api/health` |
| G2.11 | Smoke §E sans régression auth / rôles / débrief | Checklist remplie |

### G.3 NO-GO immédiat si

* le Pre-Deploy réel du service déployé en premier n'est pas confirmé ;
* le commit affiché par Render n'est pas **exactement** `9d9b38bc1293c2f5d2171ba1b632fb8b5e61919c` ;
* la sauvegarde n'est pas terminée ;
* un flag ops est à `true` au moment du déploiement ;
* `prisma migrate status` signale un drift ou une migration inattendue ;
* une régression d'authentification, de rôle ou d'isolation d'organisation est constatée au smoke.

---

## Matrice des variables d'environnement

**Aucune valeur n'est reproduite ici.** Sources : `src/lib/env.ts`, scripts `prisma/*.ts`, `docs/environment-variables.md`, `.env.example`, `.env.production.example`.

| Variable | Portée | Obligatoire ? | Changement pour cette release | Condition de retrait |
|----------|--------|---------------|-------------------------------|----------------------|
| `DATABASE_URL` | web + worker + ops | Oui | **Aucun** | Permanente |
| `DIRECT_URL` | ops migrate (si pooler) | Optionnelle | Aucun | Si pooler ; sinon absente |
| `SESSION_SECRET` | web | Oui (≥ 32 car.) | **Aucun** | Permanente |
| `NODE_ENV` | web + worker | Oui (`production`) | Aucun | Permanente |
| `APP_URL` | web | Recommandée | Aucun | Permanente |
| `AI_PROVIDER` | web + worker | Oui (défaut `demo`) | Aucun — **ne pas basculer pendant cette release** | Permanente |
| `OPENAI_API_KEY` | web + worker | Oui si `AI_PROVIDER=openai` | Aucun | Permanente si `openai` |
| `OPENAI_REALTIME_MODEL` | web + worker | Optionnelle (défaut) | Aucun | Permanente |
| `OPENAI_TRANSCRIPTION_MODEL` | worker | Imposée si `openai` (modèle diarisant) | Aucun | Permanente si `openai` |
| `OPENAI_EVALUATION_MODEL` | worker | Optionnelle (défaut) | Aucun | Permanente |
| `OPENAI_ANALYSIS_MODEL` / `OPENAI_SCENARIO_MODEL` | worker | Optionnelles (défauts) | Aucun | Permanentes |
| `OPENAI_ANALYSIS_REASONING_EFFORT` | worker | Optionnelle | Aucun | Permanente |
| `OPENAI_REALTIME_VOICE` | web | Optionnelle | Aucun | Permanente |
| `OPENAI_TRANSCRIPTION_TIMEOUT_MS` | worker | Optionnelle | Aucun | Permanente |
| `TRANSCRIBE_RECORDING_MAX_ATTEMPTS` | worker | Optionnelle | Aucun | Permanente |
| `WORKER_HEARTBEAT_MS` / `WORKER_STALE_LOCK_MS` | worker | Optionnelles (cohérence validée) | Aucun | Permanentes |
| `STORAGE_DRIVER` | web + worker | Oui (`s3` en prod) | Aucun | Permanente |
| `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | web + worker | Oui si `STORAGE_DRIVER=s3` | Aucun | Permanentes |
| `S3_ENDPOINT` / `S3_FORCE_PATH_STYLE` | web + worker | Optionnelles | Aucun | Selon fournisseur |
| `SIGNED_URL_TTL_SECONDS` | web | Optionnelle | Aucun | Permanente |
| `MAX_AUDIO_UPLOAD_MB` / `MAX_AUDIO_SIZE_MB` | web + worker | Optionnelles | Aucun | Permanentes |
| `AUDIO_RETENTION_DAYS` / `RECORDING_RETENTION_DAYS` | web + worker | Optionnelles | Aucun | Permanentes |
| `AUDIO_STORAGE_DIR` | local uniquement | Optionnelle | Aucun | Absente en production |
| `SPEAKER_ASSIGNMENT_CONFIDENCE_THRESHOLD` | worker | Optionnelle | Aucun | Permanente |
| `LOG_LEVEL` | web + worker | Optionnelle | Aucun | Permanente |
| `ALLOW_DEMO_SEED` | opération (seed) | Non | **Doit être absente ou `false`** | Jamais activée dans cette release |
| `ALLOW_EXERCISE_SEED` | opération (seed) | Non | **Doit être absente ou `false`** | Jamais activée dans cette release |
| `SEED_ORG_SLUG` | opération (seed exercices) | Non | Non pertinente (aucun seed) | Retirer si présente |
| `ALLOW_PROMPT_BUNDLE_BACKFILL` | opération (E2 `--apply`) | Non | **Doit être absente ou `false`** — le dry-run §C.4 n'en a pas besoin | N'activer que si une anomalie est explicitement validée, puis retirer immédiatement |
| `BACKFILL_ORG_SLUG` | opération (E2) | Non | Optionnelle pour un dry-run | Retirer après usage |
| `ALLOW_PROMOTE_ADMIN` | opération (promote) | Non | **Doit être absente ou `false`** — admin déjà configuré | N'activer que si la revérification montre l'absence d'admin, puis retirer immédiatement |
| `PROMOTE_ADMIN_EMAIL` | opération (promote) | Non | Non pertinente par défaut | Retirer après usage |

### Conclusions vérifiées statiquement

| Conclusion | Constat |
|------------|---------|
| Aucune nouvelle variable pour Skills / lots H–M | `src/lib/env.ts` **inchangé** entre `ae61df7…` et la cible ; aucun `process.env` dans les 13 nouveaux modules |
| Flags ops temporaires | Doivent être **absents ou `false`** au moment du déploiement (§B2.5) |
| Seed | **Aucun** pendant cette release ; aucun seed n'est déclenché au build ni au démarrage |
| Backfill Skills | **Inexistant et inutile** — la migration ne crée aucune donnée |
| E2 (PromptBundle) | Dry-run de contrôle seulement, facultatif |
| `--apply` | **Interdit** sans anomalie explicitement validée par écrit |

---

## Audit Git du gate (constat local, cible)

| Item | Valeur |
|------|--------|
| Branche locale | `release/minduel-mvp-v2` — **aucun upstream configuré** |
| HEAD local | `9d9b38bc1293c2f5d2171ba1b632fb8b5e61919c` = cible |
| `main` / `minduel/main` | Même SHA que la cible (`0 0` d'écart) |
| Remote | `minduel` → `github.com/Arielgabai/minduel.git` |
| Commits production → cible | 14 |
| Lots inclus | H (`69d4e3d`), I (`a9c892e`), J0 (`8036b1b`), J (`b94de68`), K (`60610b5`), L (`8c78ce7`), M (`f3f55db`) + leurs merges |
| Fichiers modifiés | 50 (+13 340 / −485) |
| Migrations ajoutées | 1 — `20260802100000_skills_library` |
| Migrations historiques | **Aucune modifiée** |
| `package.json` / `package-lock.json` | **Inchangés** — aucune dépendance ajoutée |
| `Dockerfile` / `next.config.ts` / `src/lib/env.ts` | **Inchangés** |
| `render.yaml` | Absent |
| Fichiers suivis modifiés (working tree) | **Aucun** |
| `git diff --check` | OK |
| Fichiers non suivis | Docs d'audit locales, `*.patch` (13), `spec_body.md`, `write_audit_docs.py` — **aucun n'est suivi, aucun n'est dans le commit, aucun n'est nécessaire au runtime** |
| Patch / script dans le commit | **Aucun** (`git ls-tree` sur la cible : aucun `*.patch`, aucun `*.py`) |
| `.env` suivi | Aucun — seuls `.env.example` et `.env.production.example` (placeholders) |

### Recherche de secrets dans les fichiers suivis (aucune valeur affichée)

| Type recherché | Résultat |
|----------------|----------|
| Clés OpenAI (`sk-…`) | **Aucune occurrence** |
| `DATABASE_URL` réelle | Aucune — toutes les occurrences pointent vers `localhost`, le service Docker local, ou des placeholders documentaires ; une seule chaîne à hôte non local se trouve dans `tests/promptBundleBackfill.test.ts` et utilise le domaine réservé `example.com` (fixture de garde-fou) |
| `SESSION_SECRET` réel | Aucun — uniquement des noms de variable, des placeholders et le secret de développement explicitement **refusé** en production par `src/lib/env.ts` |
| Credentials S3 (`AKIA…`, secret access key) | **Aucune occurrence** |
| Tokens Render (`rnd_…`) / GitHub (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`) | **Aucune occurrence** |
| Mots de passe de démonstration non autorisés | Aucun mot de passe littéral détecté ; le seed démo est protégé par `ALLOW_DEMO_SEED` et n'est pas exécuté dans cette release |

---

## Audit de la migration Skills — `20260802100000_skills_library`

**Non exécutée.** Ni `migrate dev`, ni `migrate deploy`, ni `db push`, ni contre une base locale, ni contre une base distante.

| Contrôle | Résultat |
|----------|----------|
| Additive uniquement | **Oui** — uniquement `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE … ADD CONSTRAINT` sur les nouvelles tables ; **zéro `ALTER` sur une table existante**, zéro `DROP`, zéro `UPDATE` |
| Quatre tables attendues | `SkillCategory`, `SkillSection`, `SkillArticle`, `SkillArticleMapping` |
| Données / seed | **Aucun** `INSERT` |
| Concordance avec `schema.prisma` | **Complète** — colonnes, types, valeurs par défaut, index, uniques, FK et actions `ON DELETE` correspondent modèle par modèle |
| Diff `schema.prisma` | **Purement additif** : 0 ligne supprimée ; seuls 4 champs de relation ajoutés sur `Organization` (sans effet SQL) et les 4 nouveaux modèles |
| Convention de types | `createdAt` / `updatedAt` en `TEXT`, conforme à la convention des migrations existantes (`init`) et au schéma (`String`) |
| Syntaxe SQL | Lisible, espacée, une instruction par bloc, espace présent entre la parenthèse fermante et `REFERENCES` |
| Index | 5 index simples/composites + 8 index uniques, tous nommés explicitement |
| Uniques métier | `SkillCategory(organizationId, slug)`, `SkillSection(categoryId, slug)`, `SkillArticle(organizationId, slug)`, `SkillArticleMapping(articleId, skillKey)` |
| Ancres FK composites | `(id, organizationId)` sur les trois entités + `(id, organizationId, categoryId)` sur `SkillSection` |
| FK composites multi-tenant | `SkillSection(categoryId, organizationId)` → `SkillCategory`; `SkillArticle(categoryId, organizationId)` → `SkillCategory`; `SkillArticle(sectionId, organizationId, categoryId)` → `SkillSection`; `SkillArticleMapping(articleId, organizationId)` → `SkillArticle` — **aucune relation croisée entre organisations possible** |
| Cohérence catégorie / section / article / mapping | Garantie par les FK composites : l'article partage obligatoirement l'organisation **et** la catégorie de sa section |
| Actions `ON DELETE` | `CASCADE` vers `Organization` (suppression d'org) et de `SkillArticleMapping` vers `SkillArticle` ; `RESTRICT` sur section→catégorie, article→catégorie et article→section (pas de suppression d'un parent référencé) |
| Ordre de création | Tables → index (dont les ancres uniques) → contraintes de clé étrangère : **correct**, chaque FK trouve son index unique déjà créé |
| Identifiants PostgreSQL | Le plus long fait **53 octets** (`SkillArticle_sectionId_organizationId_categoryId_fkey`) ≤ 63 — aucune troncature silencieuse |
| Rollback manuel | Documenté en en-tête du fichier (`DROP TABLE` enfants → parents), avec avertissement de perte définitive |
| Migration historique modifiée | **Aucune** |
| Backfill Skills | **Aucun nécessaire** — la migration ne crée aucune donnée, le catalogue démarre vide et l'UI gère l'état vide |
| Risque Pre-Deploy | Faible : opérations DDL sur des tables neuves, aucun verrou long sur les tables existantes |

---

## Compatibilité applicative de la bascule

| Affirmation | Vérification statique |
|-------------|-----------------------|
| Ancien web compatible avec la migration additive | L'ancien web (`ae61df7…`) ne contient aucune référence Skills, et la migration ne touche aucune table existante |
| Worker ne dépend pas des tables Skills pour démarrer | Aucune occurrence de `SkillCategory` / `SkillSection` / `SkillArticle` dans `src/worker/` ni dans `src/lib/jobs.ts` |
| Nouveau web exige les tables Skills **après** sa bascule | `/app/skills`, `/admin/skills`, `loadPublishedSkillLinksByKeys` (débrief + progression) interrogent les tables Skills à la requête, jamais au build |
| Health check indépendant de Skills | `/api/health` : `SELECT 1` + stats jobs uniquement |
| Rollback applicatif possible sans supprimer les tables Skills | Oui — l'ancien web ignore ces tables |
| Aucune route Ringover | Aucune occurrence de « ringover » dans `src/` ni `prisma/` |
| Aucun seed automatique | Aucun seed dans `next.config.ts`, le `Dockerfile`, `src/instrumentation.ts` ni le script `build` |
| Aucune exécution OpenAI au build | `npm run build` = `prisma generate && next build` ; toutes les pages Skills / Missions / Progression / débrief sont rendues à la demande (`ƒ`) |
| Tests sans réseau | Toutes les suites touchant OpenAI stubbent `fetch` (`vi.stubGlobal`) ; aucun `setGlobalDispatcher` global |

---

## Garanties à conserver

* Migration Skills **additive** ; ne jamais la rollback automatiquement.
* Un seul service déployé à la fois ; worker d'abord si et seulement si son Pre-Deploy est confirmé.
* Aucun seed, aucun backfill `--apply`, aucune promotion par défaut.
* Flags ops absents ou `false` ; s'ils sont activés, retrait **immédiat** après usage.
* Auto-deploy **OFF** avant, pendant et après la release.
* Smoke tests **sans** OpenAI, sans micro, sans nouvelle simulation.
* Rollback applicatif **avant** toute restauration de base.
* Simulations, évaluations, débriefs et historiques préservés dans tous les scénarios.
* Contenu Skills publié uniquement sur décision manuelle écrite (§E.3).
* Admin = `requirePlatformAdmin` strict ; DELETE manager = soft-archive `ARCHIVED`.

---

## Prochaines actions manuelles

1. Relire le diff documentaire de ce lot (deux fichiers).
2. Confirmer dans le dashboard Render **chacun** des points de §B (branche, commit déployé, Dockerfile, Pre-Deploy réel, Start Command, health, auto-deploy, flags).
3. Réaliser et **terminer** un export PostgreSQL frais ; vérifier le point-in-time recovery.
4. Décider par écrit de l'option §E.3.
5. Dérouler §D.3 dans l'ordre, sans jamais déclencher les deux services simultanément.
6. Remplir la checklist §E puis consigner les preuves (deploy IDs, extraits de logs sans secret).
