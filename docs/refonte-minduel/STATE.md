# État refonte Minduel

**Dernière mise à jour :** 02/08/2026

## Statut des documents

| Document | Emplacement | Statut |
|----------|-------------|--------|
| DESIGN_SPEC (UX) | `docs/refonte-minduel/DESIGN_SPEC.md` | Rédigé (réf. maquette) |
| Audit technique | `docs/refonte-minduel/01-AUDIT_TECHNIQUE.md` | Rédigé (ce cycle) |
| Plan admin exercices | `docs/refonte-minduel/02-PLAN_ADMIN_EXERCICES.md` | Validé §12 |
| Audit terrain Ruben | `docs/refonte-minduel/references/audit_minduel_ruben_2026-07-29.md` | Disponible |
| Maquette HTML | `docs/refonte-minduel/references/minduel webapp mvp.html` | Référence UX (non prod) |
| Release runbook | `docs/refonte-minduel/RELEASE_RUNBOOK.md` | LOT R-DOCFIX — **GO local / prod conditionnelle** |

## Stack confirmée (une ligne)

Next.js 15 + React 19 + TypeScript + Tailwind v4, API App Router, Prisma 6 / PostgreSQL, worker `ProcessingJob`, Docker local ; CI Render **à confirmer**.

## Lot A — Schéma exercices (30/07/2026)

**Livré :**

- Migration `20260730100000_exercise_prompt_bundles` : `Scenario.slug`, `missionLevel`, `sortOrder`, `publishedPromptBundleId` ; table `PromptBundle` ; snapshot `Simulation` (`promptBundleId`, `promptBundleVersion`, `promptContentHash`).
- Rollback documenté en en-tête du fichier SQL de migration.
- Seed idempotent `npm run db:seed:exercises` → 12 exercices **DRAFT** sur org existante (`SEED_ORG_SLUG` obligatoire). Garde-fous : base locale/test ou `ALLOW_EXERCISE_SEED=true` et `ALLOW_DEMO_SEED=true` ; pas d'exécution au démarrage app ; **aucune création d'organisation** ; exercices déjà présents (même `organizationId` + `slug`) **ignorés** sans réécriture.
- Tests : `tests/exerciseSeed.test.ts`.

## Lot B+C+D — Auth admin + service + API (30/07/2026)

**Objectif :** autorisation `PLATFORM_ADMIN` et opérations de gestion exercices / versions de prompts, **sans UI**.

**Livré :**

- `requirePlatformAdmin()` / `isPlatformAdmin()` — `src/lib/auth.ts` (session + rôle strict ; TELEPRO/MANAGER → 403).
- Service `src/lib/exerciseAdminService.ts` : list/filter, detail + historique, create draft, metadata, create/update version, duplicate, publish/unpublish exercice, publish bundle, archive, delete draft non référencé, restore→nouvelle version, preview local `{{vars}}` (zéro OpenAI).
- API `GET|POST /api/admin/exercises`, `GET|PATCH|DELETE|POST /api/admin/exercises/[id]` (actions POST : `publish`, `unpublish`, `archive`, `duplicate`, `createVersion`, `updateDraftPrompts`, `publishBundle`, `restoreVersion`, `preview`).
- Promotion ops : `npm run db:promote-admin -- --email=…` (`prisma/promoteAdmin.ts`) — `ALLOW_PROMOTE_ADMIN=true` en prod ; audit `PROMOTE_PLATFORM_ADMIN` ; pas d'auto-promotion login.
- Trace auteur (`createdById`) + note (`PromptBundle.label` / `changeNote`).
- Tests : `tests/exerciseAdmin.test.ts` (anonyme, télépro, admin, cycle de vie, archive/ref delete, 409 prompts archivé, duplication champs riches + grille, contrat télépro sans prompts, preview sans fetch).

**Non livré :** UI `/admin`, snapshot runtime à la création de simulation, remplacement hard-delete manager `DELETE /api/scenarios/[id]`, backfill bundles scénarios démo hors seed.

## État télépro avant refonte

Parcours court fonctionnel : accueil liste de scénarios assignés (`/app`), préparation, appel simulé (turn/realtime), historique, profil, débrief unique (`/app/analysis/[id]`). Nav 3 onglets (`TeleproNav`). Données réelles ; les incohérences signalées par Ruben (croisement scénarios / timestamps) proviennent des **fixtures et données de démonstration** — pas d'anomalie établie sur les appels réellement réalisés ou générés en production.


## Lot R — Gate de redéploiement (31/07/2026)

**Statut gate release (LOT R initial) :** **NO-GO** (build — historique)

**Statut gate après R-FIX / R-DOCFIX :** **GO local — GO production conditionnel aux vérifications manuelles Render et aux opérations du runbook**

**Runbook :** `docs/refonte-minduel/RELEASE_RUNBOOK.md`

**Vérifications locales :**

| Commande | Résultat |
|----------|----------|
| `npm test` | OK — 244 tests / 17 fichiers (~27 s) |
| `npx tsc --noEmit` | OK (~16 s) |
| `npm run lint` | OK (~31 s) |
| `npx prisma validate` | OK (~23 s) |
| `npm run build` (LOT R) | **ÉCHEC** (~108 s) — exports pages admin |
| `npm run build` (R-FIX) | **OK** (EXIT 0, ~74 s) |
| `git diff --check` | OK |

**Blocage initial :** exports non autorisés depuis les pages App Router admin — `src/app/admin/exercises/[id]/page.tsx` (`resolvePromptSaveAction` et helpers) et même classe de risque sur `src/app/admin/exercises/page.tsx`. **Corrigé en LOT R-FIX** (voir section suivante).

**Non réalisé (volontairement) :** aucun déploiement Render, aucune migration, aucun backfill, aucune promotion admin, aucun seed, aucun appel OpenAI, aucune modification de base réelle.

**Méthode Render détectée (doc + Dockerfile) :** Docker multi-stage ; Pre-Deploy documenté `npm run db:migrate:deploy` (à confirmer dans le dashboard) ; pas de `render.yaml` ; `prisma` + `tsx` dans l'image finale.



## Lot R-FIX — Build admin + recheck gate (31/07/2026)

**Statut gate release :** **GO local — GO production conditionnel aux vérifications manuelles Render et aux opérations du runbook**

**Cause du premier NO-GO (LOT R) :** `npm run build` échouait car les pages App Router admin exportaient des helpers/types non autorisés (`resolvePromptSaveAction`, etc.).

**Correctif appliqué :** extraction vers `src/lib/adminExercisesUi.ts` ; pages limitées à `export default` ; tests mis à jour (+ assertion exports).

**Vérifications locales (recheck) :**

| Commande | Résultat |
|----------|----------|
| `npm test -- tests/adminExercisesUi.test.ts` | OK — 26 tests |
| `npx tsc --noEmit` | OK |
| `npm run lint` | OK |
| `npm run build` | **OK** (EXIT 0, ~74 s) |
| `npm test` | OK — **246** tests / 17 fichiers (~20 s) |
| `npx prisma validate` | OK |
| `git diff --check` | OK |

**Runbook :** `docs/refonte-minduel/RELEASE_RUNBOOK.md`

**Actions Render toujours non exécutées :** aucun déploiement, migration, backfill, promote admin, seed, ni appel OpenAI.



## Lot R-DOCFIX — Finalisation runbook (31/07/2026)

**Décision :** **GO local — GO production conditionnel aux vérifications manuelles Render et aux opérations du runbook**

**Livré :** réécriture cohérente de `docs/refonte-minduel/RELEASE_RUNBOOK.md` (historique LOT R vs état R-FIX, gate Render obligatoire §B.0, stratégies A/B/C, placeholder `<commit-r-fix>`, commandes npm/npx réparées, UTF-8 sans BOM + LF).

**Vérifications locales (R-FIX, inchangées) :** build OK ; suite **246** tests ; pages admin = `export default` uniquement.

**Non réalisé :** aucun déploiement, migration, backfill, promote, seed, OpenAI.

**Prochaine action :** relire le diff → commit/push → renseigner `<commit-r-fix>` → dashboard Render → choisir A/B/C → sauvegarde avant prod.

## Prochain lot recommandé

**Lot H (shell télépro) livré localement — non déployé.** Prochain : lot Missions dynamiques (niveaux, verrous, recommandation). Production shell : commit/push puis déploiement Render selon runbook, sans migration.

## Questions ouvertes (3)

1. Pipeline CI et déploiement Render documentés où ?
2. Stratégie de validation des débriefs sur de futurs appels réels ou générés avant mise en production ?
3. Backfill bundles v1 DRAFT pour scénarios démo existants : script séparé ou intégrer au seed exercices ?

## Contraintes actives (règles refonte)

- Un seul lot / un objectif ; plan ≤12 lignes + liste fichiers avant édition.
- Pas de dépendance, migration prod, seed prod, simulation live, micro, upload, ni appel OpenAI payant sans accord.
- Tests : fixtures/mocks locaux uniquement ; ne pas exposer prompts/secrets côté télépro.
- Réutiliser auth, Prisma, composants et conventions existants.

## Lot F2 — Publication manager + PromptBundle (30/07/2026)

**Livré :**

- Service `src/lib/scenarioPromptPublication.ts` : matrice A–G ; retry max 2 ``$transaction`` (P2002/P2034/race) ; convergence exacte des champs PATCH (sinon 409 concurrent).
- `PATCH /api/scenarios/[id]` délègue entièrement au service (404/409 inclus).
- UI manager : `ScenarioForm`, `ScenarioActions`, `RecordingReview` gèrent `!res.ok` sans faux succès.
- Tests `tests/scenarioPromptPublication.test.ts` (P2002 réel, faux succès, P2034, v4, connaissances, assertions UI).

**Hors périmètre :** migration, seed, backfill, admin (déjà conforme).

## Lot G — Interface /admin/exercises (31/07/2026)

**Livré :**

- Surface `/admin` protégée par `requirePlatformAdmin` ; redirect `/admin` → `/admin/exercises`.
- Liste filtrable + création DRAFT ; détail : métadonnées, prompts versionnés, preview locale, cycle de vie.
- Lien Administration dans `ManagerNav` uniquement si `PLATFORM_ADMIN`.
- Tests `tests/adminExercisesUi.test.ts`.

**Hors périmètre :** migration, seed, backfill, OpenAI, changement Prisma/métier.

## Lot H / Lot 8 — Shell téléprospecteur et navigation (02/08/2026)

**Objectif :** remplacer la navigation téléprospecteur (3 onglets) par le shell partagé 5 destinations (DESIGN_SPEC), sans logique métier Missions dynamiques.

**Livré :**

- Helpers purs `src/lib/teleproNav.ts` (items, état actif, masquage tab-bar, redirect historique).
- `TeleproShell` : cadre `max-w-[480px]`, bordure/radius desktop, `main`, `overflow-x-hidden`, tab-bar **dans** le cadre.
- `TeleproNav` : Accueil, Missions, Skills, Progression, Profil ; `aria-current="page"` ; cibles `min-h-11` ; sticky bottom (plus de nav pleine largeur viewport).
- Routes : `/app/missions`, `/app/skills`, `/app/progression` ; `/app/history` → redirect `/app/progression`.
- Tab-bar masquée sur `/app/prepare/*`, `/app/call/*`, `/app/analysis/*` (parcours immersifs ; retours existants conservés).
- Skills : état vide explicite, **aucune** donnée fictive.
- Progression : réutilise la consultation historique (simulations + skillScore), liens débrief `/app/analysis/[id]`.
- Auth layout inchangée (`getCurrentUser` / `isTelepro` / redirect login|manager) ; pages métiers gardent `requireTelepro`.

**Reporté au lot Missions dynamiques :**

- Carte de niveaux / verrouillage / recommandation prochain exercice.
- Statuts métier terminé / en cours / disponible / verrouillé calculés.
- Contenu Skills (catégories, articles, scores).
- Analytics Progression (Tendances, Comparatif, Diagnostic, Badges) au-delà de l'historique existant.

**Vérifications locales :**

| Commande | Résultat |
|----------|----------|
| `npm test` | **260 passés / 261** (18 fichiers) — `tests/teleproShell.test.ts` **15/15 OK** ; 1 échec **préexistant** hors lot : `tests/scenarioArchive.test.ts` (regex LF vs CRLF checkout Windows sur page manager non modifiée) |
| `npx tsc --noEmit` | OK (EXIT 0, ~22 s) |
| `npm run lint --if-present` | OK — No ESLint warnings or errors (~24 s) |
| `npm run build` | OK — routes `/app/missions`, `/app/skills`, `/app/progression` générées (~78 s) |
| `git diff --check` | OK |

**Non réalisé :** aucun déploiement, migration, seed, backfill, OpenAI, micro, upload, ni commit.
