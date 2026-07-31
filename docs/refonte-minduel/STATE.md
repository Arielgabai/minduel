# État refonte Minduel

**Dernière mise à jour :** 30/07/2026

## Statut des documents

| Document | Emplacement | Statut |
|----------|-------------|--------|
| DESIGN_SPEC (UX) | `docs/refonte-minduel/DESIGN_SPEC.md` | Rédigé (réf. maquette) |
| Audit technique | `docs/refonte-minduel/01-AUDIT_TECHNIQUE.md` | Rédigé (ce cycle) |
| Plan admin exercices | `docs/refonte-minduel/02-PLAN_ADMIN_EXERCICES.md` | Validé §12 |
| Audit terrain Ruben | `docs/refonte-minduel/references/audit_minduel_ruben_2026-07-29.md` | Disponible |
| Maquette HTML | `docs/refonte-minduel/references/minduel webapp mvp.html` | Référence UX (non prod) |

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

## Prochain lot recommandé

**Lot E** — snapshot `promptBundleId` / hash au `POST /api/simulations`, ou **Lot F** — soft-archive côté manager + seed, ou **Lot G** — UI `/admin/exercises`.

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
