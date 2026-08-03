# État refonte Minduel

**Dernière mise à jour :** 03/08/2026

**Statut courant du gate :** **Production V2 déployée et smoke testée — GO production validé.**

## Statut des documents

| Document | Emplacement | Statut |
|----------|-------------|--------|
| DESIGN_SPEC (UX) | `docs/refonte-minduel/DESIGN_SPEC.md` | **J0** — mis à jour depuis maquette V2 (PDF p.14–41) |
| Audit technique | `docs/refonte-minduel/01-AUDIT_TECHNIQUE.md` | Rédigé (ce cycle) |
| Plan admin exercices | `docs/refonte-minduel/02-PLAN_ADMIN_EXERCICES.md` | Validé §12 |
| Audit terrain Ruben | `docs/refonte-minduel/references/audit_minduel_ruben_2026-07-29.md` | Disponible |
| Maquette HTML | `docs/refonte-minduel/references/minduel webapp mvp.html` | Référence UX (non prod) |
| Release runbook | `docs/refonte-minduel/RELEASE_RUNBOOK.md` | LOT RELEASE-CLOSE — **GO production validé** (V2 déployé + smoke OK) |

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

## Feuille de route post-J0

| Lot | Objectif | Statut |
|-----|----------|--------|
| **J1** | Schéma / service / API Skills (contenu paramétrable, zéro OpenAI) | **Livré** (lot J) |
| **J2** | UI admin Skills (`/admin/skills`) — CRUD, blocs, publish/archive, ordre | **Livré** (lot J) |
| **J3** | UI téléprospecteur Skills (catégories → sections → articles `PUBLISHED`) | **Livré** (lot J) |
| **K** | Débrief en 4 onglets + liens Skills (données persistées uniquement) | **Livré** |
| **L** | Alignement visuel Missions / appel / fin d’exercice | **Livré** |
| **M** | Progression avancée (Tendances, Comparatif, Diagnostic, Badges) | **Livré** |
| **N1** | Catalogue Missions administrable (thèmes, phases, avatars) | **Livré** (migration non exécutée) |
| **N2** | Rendu télépro Missions + portraits définitifs | **Livré** (migration N1 toujours non exécutée) |
| **N3** | Création guidée Skills + finition visuelle télépro | **Livré** (migration N1 toujours non exécutée) |
| **Ultérieur** | Upload manuel + analyse d'appels réels + écart simulé/réel (coûts IA) | Hors feuille immédiate |
| **Reporté** | Ringover (aucune connexion, synchro, env, route, ni mention « disponible ») | Reporté |

**Contenu Skills :** intégralement administrable ; **aucune donnée de production Skills n'a été créée** ni seedée au moment des lots J–M. La migration Skills a été **appliquée en production** lors du déploiement V2 (voir LOT RELEASE-CLOSE) ; aucun seed / backfill Skills.

**Prochain lot recommandé :** gate de release et smoke manuel. Migration catalogue Missions `20260803112000_mission_catalog` toujours **non exécutée**. Surveillance ops post-V2 inchangée (baseline `failed: 2`, Auto-Deploy OFF).

## Questions ouvertes (3)

1. Pipeline CI et déploiement Render documentés où ?
2. Seuil d’anonymisation et permissions exactes pour le comparatif équipe (Progression / débrief) avant lot M ?
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

## Lot I / Lot 9 — Missions et exercices dynamiques (02/08/2026)

**Objectif :** pages Accueil et Missions alimentées par les exercices PUBLISHED assignés au téléprospecteur, avec statuts calculés, déblocage de niveaux et recommandation locale.

**Livré :**

- Moteur pur `src/lib/teleproMissions.ts` : tri déterministe (`missionLevel` → `sortOrder` → `name` → `id`), statuts `COMPLETED` / `IN_PROGRESS` / `AVAILABLE` / `LOCKED`, déblocage des niveaux présents, recommandation locale, résultat précédent.
- Service serveur `src/lib/teleproMissionsService.ts` : charge assignations + tentatives (2 requêtes, isolation `organizationId` + `teleproId`, `Scenario.status === PUBLISHED`), projection sûre sans prompts / artifacts / hash / `secretInfos` / `aiProspect`.
- `/app` (Accueil) : progression terminé/total, exercice recommandé, CTA reprendre/commencer, états vide et tout terminé.
- `/app/missions` : groupes par niveau, badges, infos métier sûres, CTA selon statut, résultat précédent / débrief existant.
- Tests `tests/teleproMissions.test.ts` (visibilité, tri, déblocage, statuts, recommandation, CTA, anti-fuite).

**Règles de statut (non persistées) :**

1. Tentative runtime terminée (`FINALIZING` | `EVALUATION_PENDING` | `EVALUATING` | `COMPLETED` | `EVALUATION_FAILED`) → `COMPLETED` (sans exiger une évaluation OpenAI réussie).
2. Sinon tentative active (`CREATED` | `IN_PROGRESS`) → `IN_PROGRESS`.
3. Sinon niveau débloqué → `AVAILABLE`.
4. Sinon → `LOCKED`.
5. `COMPLETED` / `IN_PROGRESS` restent prioritaires sur le verrouillage.

**Déblocage :** plus petit `missionLevel` présent ouvert ; niveau suivant ouvert seulement si tous les exercices des niveaux précédents effectivement présents sont terminés ; trou de numéros sans blocage artificiel.

**Recommandation :** premier `IN_PROGRESS` (ordre déterministe), sinon premier `AVAILABLE`, sinon aucune.

**CTA :** `IN_PROGRESS` → `/app/call/[id]` ; `AVAILABLE` / refaire → `/app/prepare/[scenarioId]` ; `LOCKED` → aucun lien lançable ; débrief → `/app/analysis/[id]` si tentative terminée.

**Reporté (Skills / Progression) :**

- Contenu Skills (catégories, articles, scores).
- Analytics Progression (Tendances, Comparatif, Diagnostic, Badges) au-delà de l'historique existant.

**Vérifications locales :**

| Commande | Résultat |
|----------|----------|
| `npm test` | OK — **286** tests / 19 fichiers (~59 s) |
| `npx tsc --noEmit` | OK (EXIT 0, ~50 s) |
| `npm run lint --if-present` | OK — No ESLint warnings or errors (~56 s) |
| `npm run build` | OK (EXIT 0, ~214 s) — routes `/app` et `/app/missions` dynamiques |
| `git diff --check` | OK |

**Non réalisé :** aucun déploiement, migration, seed, backfill, OpenAI, micro, upload, ni commit. Branche non déployée.

## Lot J0 — Spec UX depuis maquette V2 (02/08/2026)

**Objectif unique :** mettre à jour `DESIGN_SPEC.md` et la feuille de route dans `STATE.md` à partir des pages 14–41 du PDF maquette V2 (pièce jointe locale, non versionnée).

**Livré (documentaire uniquement) :**

- Missions : phases/niveaux, états terminé/courant/verrouillé, progression par exercices réels, parcours à nœuds, recommandation, mobile — ancré sur `Scenario` / `ScenarioAssignment` / `Simulation` et règles du lot I.
- Appel immersif + écran de fin (score, points forts, axe, accès débrief) — sans modifier le runtime ni OpenAI.
- Débrief 4 onglets (Résumé, Ligne par ligne, Pourquoi, Comparatif) : données persistées seulement, états absents explicites, pas de recalcul au chargement.
- Contrat fonctionnel Skills administrable (catégorie / section / article, statuts, blocs sûrs, admin `/admin`) ; catégories maquette = exemples initiaux.
- Appels réels (upload + analyse + écart simulé/réel) classés **ultérieurs** ; Ringover **reporté** (hors périmètre actif).
- Progression : Tendances, Comparatif, Diagnostic, Badges — valeurs persistées, états vides, anonymisation équipe à trancher avant M.
- Direction visuelle condensée (fond quasi noir, cartes, pilules, dégradés, a11y tactile).

**Fichiers touchés :** `docs/refonte-minduel/DESIGN_SPEC.md`, `docs/refonte-minduel/STATE.md` uniquement.

**Vérifications :** `git diff --check` ; UTF-8 sans BOM ; fins de ligne LF.

**Non réalisé :** aucun code applicatif, dépendance, migration, seed, base, réseau, OpenAI, upload, ni commit.

## Lot J — Skills MVP end-to-end (J1 + J2 + J3) (02/08/2026)

**Objectif unique :** livrer la bibliothèque Skills complète du MVP — administrable par `PLATFORM_ADMIN`, consultable par les télépros — conformément à `DESIGN_SPEC.md` (pages maquette 22–31).

**Livré :**

### J1 — Modèle, service et API

- Migration additive `prisma/migrations/20260802100000_skills_library/migration.sql` : tables `SkillCategory`, `SkillSection`, `SkillArticle`, `SkillArticleMapping` ; index et contraintes d’unicité par organisation ; **FK composites multi-tenant** (`categoryId+organizationId`, `sectionId+organizationId+categoryId`, `articleId+organizationId`) pour interdire toute relation croisée entre organisations ; rollback manuel documenté en en-tête. **Créée, jamais exécutée** (ni `migrate dev`, ni `deploy`, ni `db push`).
- Schéma Prisma : catalogue **Catégorie → Section → Article** ; distinct de `SkillScore` (scores d’évaluation) ; ancres `@@unique([id, organizationId])` (et section `@@unique([id, organizationId, categoryId])`).
- Contenu article : blocs JSON strictement validés (`src/lib/skillsContent.ts`) — `heading`, `paragraph`, `list`, `callout`, `example`, `keyIdea` ; rejet HTML/script/propriétés inconnues/URL exécutables ; tailles maximales.
- Mappings normalisés article ↔ clés de compétences (`SkillArticleMapping`) pour exploitation future par le débrief (lot K) — **non branchés au débrief dans ce lot**.
- Service admin `src/lib/skillsAdminService.ts` : arbre sans corps, détail, CRUD DRAFT, publish/unpublish/archive, hard-delete DRAFT non référencé, ordre, mappings (remplacement / vide), audit sans corps ni blocs.
- API `GET|POST /api/admin/skills` et `GET|PATCH|DELETE|POST /api/admin/skills/[id]` ; contrat `entity` = `category` | `section` | `article` ; actions POST `publish` | `unpublish` | `archive` ; `requirePlatformAdmin()` strict ; isolation `organizationId` ; enveloppes `{ data }` / `{ error }` ; 409 sur conflits.

### J2 — Interface admin

- Destination `/admin/skills` + lien dans le shell admin (`src/app/admin/layout.tsx`).
- Arbre Catégories → Sections → Articles ; création / édition / blocs structurés / tags / durée / mappings ; publish / unpublish / archive / delete avec confirmation ; ARCHIVED en lecture seule ; pas de faux succès sur `!res.ok` ; helpers purs dans `src/lib/adminSkillsUi.ts` (pages = `export default` uniquement).

### J3 — Bibliothèque télépro

- Service `src/lib/skillsTeleproService.ts` : `teleproId` + `organizationId` explicites ; uniquement hiérarchie entièrement `PUBLISHED` ; selects minimaux ; ordre `sortOrder` puis titre ; compteurs et recherche sur titres/résumés/tags publics.
- Routes : `/app/skills`, `/app/skills/[categorySlug]`, `/app/skills/[categorySlug]/[articleSlug]` ; rendu React des blocs (`SkillBlocks.tsx`) — jamais `dangerouslySetInnerHTML` ; 404 si slug masqué / hors org ; shell 5 destinations (lot H) inchangé.
- Direction visuelle : fond quasi noir, cartes sombres, accents bleu/violet/orange, état vide propre si aucun contenu publié ; aucun chiffre de maquette hardcodé.

**Cycle de vie :** DRAFT modifiable ; PUBLISHED visible selon ascendance ; ARCHIVED masqué et lecture seule ; republier un article exige catégorie + section publiées + ≥1 bloc valide ; dépublier/archiver un parent masque les descendants sans réécrire leur statut ; hard-delete DRAFT uniquement (catégorie sans section, section sans article, article + mappings).

**Sécurité :** anonyme / TELEPRO / MANAGER refusés sur l’API admin ; isolation organisation sur chaque lecture/écriture ; listes sans blocs ; détail blocs réservé admin ; aucun prompt / artifact / hash / secret dans les sélections télépro ; aucune dépendance ajoutée ; zéro OpenAI ; zéro Ringover ; **aucune donnée Skills créée ou seedée**.

**Tests :**

| Suite | Résultat |
|-------|----------|
| `tests/skillsAdmin.test.ts` | OK — **22** tests (auth, isolation, CRUD, blocs, cycle de vie, 409, mappings, audit, syntaxe SQL / FK composites) |
| `tests/skillsTelepro.test.ts` | OK — 14 tests (visibilité PUBLISHED, ordre, compteurs, recherche, 404, rendu sûr, shell H) |
| `tests/adminSkillsUi.test.ts` | OK — 17 tests (helpers purs + assertions source `!res.ok` / exports / tableaux vides) |
| Suite complète `npm test` | **339** tests passés / **22** fichiers |

**Vérifications locales :**

| Commande | Résultat |
|----------|----------|
| `npm test --` (tests Skills ciblés) | OK — **53** tests / 3 fichiers |
| `npx tsc --noEmit` | OK |
| `npm run lint --if-present` | OK — No ESLint warnings or errors |
| `npx prisma validate` | OK |
| `npm run build` | OK — 33/33 pages générées |
| `git diff --check` | OK |
| Encodage | UTF-8 sans BOM + LF sur les fichiers du lot |

**Reporté / hors périmètre :**

- Intégration des mappings Skills dans le débrief (lot **K**).
- Upload manuel + analyse d’appels réels (ultérieur).
- Ringover (reporté — aucune connexion, synchro, env, route, ni mention « disponible »).
- Exécution de la migration, seed, backfill, déploiement Render, commit.

**Non réalisé (volontairement) :** aucune base réelle touchée ; migration jamais appliquée ; aucun seed Skills ; aucun réseau / OpenAI ; aucun commit.

## Lot K — Débrief 4 onglets + liens Skills (02/08/2026)

**Objectif unique :** remplacer le débrief monolithique par une vue à 4 onglets (Résumé, Ligne par ligne, Pourquoi, Comparatif), alimentée uniquement par les données persistées, avec liens Skills publiés issus des mappings article ↔ compétence.

**Livré :**

- Modèle de vue pur `src/lib/debriefView.ts` : parsing défensif des JSON persistés (`strengths` / `improvements` / `advice` / `keyMoments`), états `available` / `empty` / `unavailable`, matching moments clés exact (atMs ou extrait inclus), comparatif tentative précédente ou message « Pas assez de tentatives pour comparer », normalisation `SkillKeySchema` (lot J), tri déterministe des liens Skills.
- Service serveur `src/lib/debriefService.ts` : `loadDebriefForTelepro` isolé par `organizationId` + `teleproId` + `simulation.id` (null → 404) ; tentative précédente COMPLETED du même scénario ; `loadPublishedSkillLinksByKeys` exige article + section + catégorie `PUBLISHED` dans la même org ; select sans corps d'article ; zéro OpenAI / recalcul / contenu fictif.
- UI client `DebriefTabs.tsx` : 4 pilules `role=tablist` / `tab` / `tabpanel`, clavier Left/Right/Home/End, cibles tactiles `min-h-11`, focus-visible ; panneaux Résumé / Ligne / Pourquoi / Comparatif ; ScoreRing ou « Score non disponible » ; états vides DESIGN_SPEC ; CTA `/app/missions` (primaire) et `/app/progression` (ghost).
- Page serveur `/app/analysis/[id]` : `requireTelepro` + `loadDebriefForTelepro` ; `export default` uniquement ; titre « Ton débrief détaillé » ; retour missions ; `AnalysisPending` si pending/failed/abandoned ; carte vide si missing ; `DebriefTabs` si ready.

**Sources persistées par onglet :**

| Onglet | Sources |
|--------|---------|
| Résumé | score, outcome, summary, listes JSON, betterExample, keyMoments, skillScores |
| Ligne par ligne | `SimulationTurn` + marqueurs moments clés ; annotations structurées absentes du schéma → message explicite |
| Pourquoi | rationale / evidence / recommendation par compétence + liens Skills mappés publiés |
| Comparatif | dernière simulation COMPLETED antérieure (même télépro / scénario / org) ou état vide |

**Liens Skills :** uniquement articles `PUBLISHED` avec parents publiés, même organisation, via `SkillArticleMapping` ; max 3 par clé ; jamais inventés.

**Tests :**

| Suite | Résultat |
|-------|----------|
| `tests/debrief.test.ts` | OK — **15** tests (parsing, 4 onglets, moments clés, comparatif, normalizeSkillKey, tri Skills, isolation, mappings PUBLISHED/DRAFT/org, assertions source) |
| Suite complète `npm test` | **354** tests passés / **23** fichiers |

**Vérifications locales :**

| Commande | Résultat |
|----------|----------|
| `npm test -- tests/debrief.test.ts` | OK — **15** / 15 |
| `npx tsc --noEmit` | OK |
| `npm run lint --if-present` | OK — No ESLint warnings or errors |
| `npx prisma validate` | OK |
| `npm test` | OK — **354** tests / 23 fichiers |
| `npm run build` | OK — 33/33 pages ; `/app/analysis/[id]` 6.62 kB |
| `git diff --check` | OK |
| Encodage | UTF-8 sans BOM + LF sur les fichiers du lot |

**Sécurité / contrats :** aucun `dangerouslySetInnerHTML` ; aucun import OpenAI/Ringover dans les nouveaux modules ; `page.tsx` = `export default` uniquement ; polling existant `AnalysisPending` conservé (pas de nouveau job).

**Données :** aucune migration créée ni exécutée ; aucun seed ; aucune donnée de production modifiée ; zéro OpenAI / réseau depuis la page.

**Hors périmètre / reporté :** lot **L** (alignement visuel Missions / appel / fin d'exercice) ; Progression avancée (lot M) ; upload / appels réels / écart simulé-réel ; moyennes équipe / anonymisation ; Ringover ; déploiement Render ; commit.

**Non réalisé (volontairement) :** aucune base réelle touchée ; aucun réseau / OpenAI ; aucun commit.

## Lot L — Alignement visuel Missions / appel / fin d'exercice (02/08/2026)

**Objectif unique :** aligner le parcours d'entraînement (Missions, appel immersif, fin d'exercice) sur la maquette V2 (pages 14–17), sans modifier le moteur de simulation, Realtime, l'évaluation ni les règles métier. Lot principalement visuel ; seule modification fonctionnelle strictement nécessaire = routage vers l'écran de fin.

**Livré :**

### Missions visuelles dynamiques (p.14–15)

- Rendu de parcours mobile `MissionsPath` (`src/app/app/missions/MissionsPath.tsx`) : progression globale en haut, niveaux ordonnés, chemin vertical à nœuds reliés, exercice courant mis en avant (badge GO), terminé en vert, disponible en bleu/violet, verrouillé atténué avec cadenas et sans lien lançable, résultat précédent + lien débrief, CTA reprendre/commencer/refaire selon statut.
- Données 100 % issues du moteur du lot I (`loadTeleproMissionsView` / `buildTeleproMissionsView`) : niveaux réellement présents, statuts calculés, déblocage, recommandation, trous de niveaux gérés. Aucun niveau/exercice/compteur codé en dur.
- Helpers purs `src/lib/missionsPath.ts` (progression %, variante de nœud, garde « lançable ») — aucune règle métier dupliquée. `page.tsx` conserve `loadTeleproMissionsView` + `export default` unique et l'état vide.

### Appel immersif (p.16)

- Refonte visuelle de `CallClient` (DEMO) et `RealtimeCallClient` (Realtime) : en-tête compact (nom du prospect + contexte sûr + durée), avatar par initiales générées localement (`generateInitials`), statut clair (connexion/écoute/parole/pause/fin), visualiseur audio existant, transcript discret, bouton micro accessible, bouton terminer distinct **confirmé**, accents bleu/violet, état erreur lisible, focus visible, libellés a11y. Aucune tab-bar (overlay + masquage `shouldShowTeleproNav`).
- Moteur strictement préservé : DEMO et Realtime, `useRealtimeSession` (négociation session, permissions micro, pistes, data channel), archivage transcript, garde anti double-envoi (`if (ending) return`), fin idempotente, `stop()`/cleanup au démontage, retries/erreurs, ownership télépro/org, contrats HTTP. Aucun prompt/secret supplémentaire envoyé au navigateur.

### Écran de fin d'exercice et ses états (p.17)

- Nouvelle route serveur `/app/call/[id]/done` (`page.tsx` + `ExerciseComplete.tsx`) réutilisant `loadDebriefForTelepro` (isolation `organizationId` + `teleproId` → 404 pour un autre). **Aucune nouvelle API.** Rechargeable : relit uniquement des données persistées et ne rappelle jamais `/end`.
- Projection pure `buildExerciseCompleteView` (`src/lib/callUi.ts`). États :
  - **Prête** : « Exercice terminé », score global persisté, premier point fort, premier axe, outcome, CTA `/app/analysis/[id]` + CTA Missions.
  - **En attente / en cours** : exercice terminé confirmé, « Analyse en cours », polling **borné** (`MAX_POLLS`) et nettoyé sur l'endpoint `evaluation-status` existant, jamais de relance automatique, aucun faux score.
  - **Échec / absente** : terminé confirmé, score non disponible, action retry existante (`retry-evaluation`) uniquement, aucun faux conseil.
- Redirection après appel : `CallClient`/`RealtimeCallClient` naviguent vers `/app/call/[id]/done` (au lieu de l'analyse directe) après un `/end` réussi et non abandonné ; abandon → `/app` inchangé. `/end` reste appelé une seule fois ; un refresh de l'écran final ne finalise jamais à nouveau.

**Invariants runtime préservés :** moteur de simulation, Realtime/WebRTC, micro, data channel, évaluation, worker, routes API de simulation, ownership et contrats HTTP — inchangés. Tab-bar masquée sur `/app/call/*` (dont `/done`), `prepare`, `analysis`.

**Tests :**

| Suite | Résultat |
|-------|----------|
| `tests/lotL.test.ts` | OK — **21** tests (Missions dynamiques + trous de niveaux + verrouillé sans lien + état vide ; invariants appel + un seul `/end` + cleanup + a11y + initiales ; fin prête/pending/échec/partiel/missing + ownership 404 + refresh sans `/end` + polling borné) |
| Suite complète `npm test` | **375** tests passés / **24** fichiers |

**Vérifications locales :**

| Commande | Résultat |
|----------|----------|
| `npm test -- tests/lotL.test.ts` | OK — 21 / 21 |
| `npx tsc --noEmit` | OK (EXIT 0) |
| `npm run lint --if-present` | OK — No ESLint warnings or errors |
| `npx prisma validate` | OK — schéma valide |
| `npm test` | OK — 375 tests / 24 fichiers |
| `npm run build` | OK — 33/33 pages ; route `/app/call/[id]/done` 3 kB générée |
| `git diff --check` | OK |
| Encodage | Nouveaux fichiers UTF-8 sans BOM + LF ; BOM pré-existant retiré de `RealtimeCallClient.tsx` |

**Sécurité / contrats :** aucun `dangerouslySetInnerHTML` ; aucun import OpenAI/Ringover dans les nouveaux fichiers ; `page.tsx` (missions et done) = `export default` uniquement ; aucune fuite prompt/artifact/hash/secret.

**Données :** aucune migration créée ni exécutée ; aucun changement Prisma ; aucun seed ; aucune donnée de production modifiée ; zéro OpenAI / réseau réel ; aucune simulation réelle lancée.

**Non réalisé (volontairement) :** aucune base réelle touchée ; aucun réseau / OpenAI ; aucun micro / WebRTC réel ; aucun commit. Upload d'appels réels et Ringover restent hors périmètre (reportés). **Prochain étape :** gate de release et smoke tests.


## Lot M — Progression avancée : Tendances, Comparatif, Diagnostic, Badges (02/08/2026)

**Objectif unique :** remplacer `/app/progression` par le tableau de progression mobile (maquette p.38–41) à partir des simulations et évaluations réellement persistées.

**Livré :**

- Moteur pur `src/lib/progressionView.ts` : définitions tentatives terminée / évaluée / comparable ; tendances ; comparatif personnel ; diagnostic statistique ; badges dérivés.
- Service `src/lib/progressionService.ts` : `teleproId` + `organizationId` explicites ; compteurs `count` séparés ; `findMany` limité à `MAX_DETAILED_ATTEMPTS` (120) ; select minimal ; liens Skills via `loadPublishedSkillLinksByKeys` (lot K).
- UI `ProgressionTabs.tsx` + page `/app/progression` : 4 onglets pilules (ARIA/clavier), graphique SVG/CSS sans dépendance, cartes Diagnostic, grille badges.
- Tests `tests/progression.test.ts` ; assertions lot H mises à jour dans `tests/teleproShell.test.ts` (compat page M).

**Sources et calculs des 4 vues :**

| Vue | Sources | Calculs |
|-----|---------|---------|
| Tendances | Tentatives `FINISHED_*` + `SimulationEvaluation.overallScore` | Compteurs terminées/évaluées ; moyenne / meilleur / dernier ; courbe chronologique ; historique récent → `/app/analysis/[id]` |
| Comparatif | Dernière + précédente évaluées (même scénario prioritaire, sinon globale libellée) | Delta score global + compétences à clé normalisée commune ; **aucune moyenne équipe** |
| Diagnostic | `SkillScore` persistés (`score/maxScore` si `maxScore > 0`) | Moyenne % par clé ; n observations ; plus solide / priorité si `n >= 2` ; liens Skills PUBLISHED |
| Badges | Historique évalué uniquement | Config pure (`BADGE_THRESHOLDS`) ; état gagné/verrouillé + progression + date déterministe ; **non persistés** |

**Définitions :**

1. Tentative terminée = statut dans `FINISHED_SIMULATION_STATUSES` (lot I).
2. Tentative évaluée = terminée + ligne `evaluation` avec `overallScore` fini.
3. Tentative comparable = évaluée (paire dernière/précédente).
4. Compétence comparable = même clé `normalizeSkillKey` avec `maxScore > 0` des deux côtés.

**Badges (seuils centralisés) :** première évaluation (1) ; 5 évaluations ; score ≥ 80 ; 3 améliorations successives ; 3 jours distincts.

**Comparatif équipe :** non implémenté (seuil d’anonymisation DESIGN_SPEC non tranché) — message personnel uniquement.

**Vérifications locales :**

| Commande | Résultat |
|----------|----------|
| `npm test -- tests/progression.test.ts` | OK — **19** tests |
| `npx tsc --noEmit` | OK (EXIT 0) |
| `npm run lint --if-present` | OK — No ESLint warnings or errors |
| `npx prisma validate` | OK — schéma valide |
| `npm test` | OK — **394** tests / 25 fichiers |
| `npm run build` | OK — 33/33 pages ; `/app/progression` 3.23 kB |
| `git diff --check` | OK |
| Encodage | UTF-8 sans BOM + LF (mécanisme Python après échec UTF-16 de l’éditeur) |

**Données :** aucune migration ; aucun seed ; aucune donnée de production ; zéro OpenAI / réseau ; badges non persistés.

**Hors périmètre / reporté :** moyenne équipe ; upload / appels réels ; Ringover ; administration des badges ; commit.

**Prochaine étape :** gate de release et smoke tests.

## LOT RELEASE V2 — Gate final et procédure Render (02/08/2026)

**Objectif unique :** déterminer si le MVP Minduel V2 est déployable sur Render et actualiser la procédure de production. **Audit et documentation uniquement** — aucun fichier applicatif modifié.

### Décision (préalable au déploiement)

**GO local — GO production conditionnel** aux vérifications manuelles du dashboard Render et aux points d'arrêt du runbook.

> Trace historique du gate. La décision **finale** après exécution est dans **LOT RELEASE-CLOSE** ci-dessous.

### Cible et delta

| Élément | Valeur |
|---------|--------|
| Commit cible | `9d9b38bc1293c2f5d2171ba1b632fb8b5e61919c` |
| Commit production précédent (**à revérifier dans Render**) | `ae61df7db304e51cfc19df86d4959bd6a8f7d262` |
| Branche locale du gate | `release/minduel-mvp-v2` — **aucun upstream configuré** |
| `main` / `minduel/main` | Même SHA que la cible (0 commit d'écart) |
| Delta | 14 commits, 50 fichiers (+13 340 / −485) |
| Lots inclus | H, I, J0, J, K, L, M — tous présents et vérifiés |
| Migrations ajoutées | 1 — `20260802100000_skills_library` |
| `package.json` / lockfile / `Dockerfile` / `next.config.ts` / `src/lib/env.ts` | **Inchangés** |
| Fichiers suivis modifiés / patchs ou scripts dans le commit / secrets suivis | Aucun |

### Vérifications locales (résultats exacts)

| Commande | Résultat | Durée approx. |
|----------|----------|---------------|
| `npm test` | OK — **394 tests / 25 fichiers** (réseau intégralement stubbé) | ~19 s |
| `npx tsc --noEmit` | OK (exit 0) | ~14 s |
| `npm run lint --if-present` | OK — No ESLint warnings or errors | ~17 s |
| `npx prisma validate` | OK — schéma valide | ~10 s |
| `npm run build` | OK (exit 0) — **33/33 pages générées** | ~65 s |
| `git diff --check` | OK | — |

Baseline attendue (394 tests / 25 fichiers / 33 pages) **confirmée sans forçage**.

### Migration Skills

**Toujours non exécutée** : ni `migrate dev`, ni `migrate deploy`, ni `db push`, sur aucune base.

Additive uniquement (4 tables neuves, zéro `ALTER` sur une table existante, zéro donnée) ; concordance complète avec `schema.prisma` ; index et uniques nommés ; FK composites multi-tenant ; `ON DELETE` cohérents (`CASCADE` vers `Organization` et mapping→article, `RESTRICT` sur les parents catalogue) ; ordre tables → index → FK correct ; identifiant le plus long **53 octets** ≤ 63 ; rollback manuel documenté en en-tête ; aucune migration historique modifiée ; **aucun backfill Skills nécessaire**.

### Risques et conditions Render

* La branche locale du gate n'a pas d'upstream ; Render suit `main`, qui pointe actuellement sur le même SHA — **à reconfirmer dans le dashboard**.
* Le **Pre-Deploy réel** de chaque service doit être confirmé dans l'UI : sans lui, la migration ne serait pas appliquée.
* Le **nouveau web exige les tables Skills** dès qu'il sert du trafic (`/app/skills`, `/admin/skills`, débrief, progression) ; l'**ancien web les ignore** et le **worker n'en dépend pas** pour démarrer.
* Ordre recommandé : **worker seul d'abord** (son Pre-Deploy applique la migration pendant que l'ancien web reste actif), puis le web sur le même commit. Jamais les deux simultanément.
* STOP si : Pre-Deploy non confirmé, commit déployé différent de la cible, export PostgreSQL non terminé, flag ops à `true`, auto-deploy resté ON, drift de migration.
* Aucune nouvelle variable d'environnement pour Skills / lots H–M ; flags ops attendus absents ou `false` ; aucun seed ; aucun `--apply`.
* Tester la visibilité d'un article `PUBLISHED` écrit de la donnée réelle : décision manuelle écrite exigée (§E.3 du runbook), sinon test limité à l'état vide.

**Runbook :** `docs/refonte-minduel/RELEASE_RUNBOOK.md` (préconditions, gate dashboard, commandes à ne pas exécuter, déploiement séquentiel, smoke sans OpenAI, rollback, GO/NO-GO, matrice de variables).

**Fichiers touchés par ce lot :** `docs/refonte-minduel/RELEASE_RUNBOOK.md`, `docs/refonte-minduel/STATE.md` uniquement.

**Non réalisé (volontairement, dans ce lot gate) :** **aucun déploiement Render n'a été effectué**, aucune migration, aucun seed, aucun backfill, aucune promotion, aucune base touchée, aucune application ni simulation lancée, aucun appel OpenAI ou réseau externe, aucune modification de `.env`, aucune dépendance ajoutée, aucun stage / commit / push.

**Prochaine action (à l'époque du gate) :** remplir le gate dashboard Render (§B), réaliser un export PostgreSQL frais, puis dérouler §D.3 (worker seul, puis web).

## LOT RELEASE-CLOSE — Clôture documentaire du déploiement (03/08/2026)

**Objectif unique :** consigner le déploiement réellement exécuté et validé en production. **Strictement documentaire** — aucun code applicatif, aucune config Render, aucune base, migration, commande ops, donnée ou secret modifiés dans ce lot.

### Décision finale

**Production V2 déployée et smoke testée — GO production validé.**

| Élément | Constat |
|---------|---------|
| Commit applicatif déployé | `9d9b38bc1293c2f5d2171ba1b632fb8b5e61919c` |
| Branche Render | `main` (la branche documentaire n'a **pas** été déployée) |
| Export PostgreSQL | Terminé — horodatage `2026-08-02T04_05` (téléchargé, taille non nulle) ; base Available ; PITR 3 jours |
| Ordre | Worker puis web |
| Migration Skills | **Appliquée** par le Pre-Deploy worker (`20260802100000_skills_library`) |
| Pre-Deploy web | `no pending migrations to apply` |
| Worker / web | **Live** (`worker.start` + heartbeat observés) |
| Health | `status: ok`, `db: up`, `pending: 0`, `running: 0`, `failed: 2` |
| Baseline jobs | `failed: 2` = historique à **surveiller** — ni résolu ni créé par V2 |
| Smoke test V2 | **Réussi** (opérateur) — auth/rôles, shell, Missions, Skills, admin Skills, débrief 4 onglets, Progression 4 vues, `/done` historique, historique/débrief, archivage |
| OpenAI pendant le smoke | **Aucun** (ni appel, micro, ni nouvelle simulation) |
| Auto-Deploy | **OFF** (conservé) |
| Seed / backfill Skills | **Aucun** |
| Runbook | `docs/refonte-minduel/RELEASE_RUNBOOK.md` (§I compte rendu) |

**Distinction :** gate préalable = GO production **conditionnel** (LOT RELEASE V2) ; résultat réel = **GO production validé** (ce lot).

**Fichiers touchés :** `docs/refonte-minduel/RELEASE_RUNBOOK.md`, `docs/refonte-minduel/STATE.md` uniquement.

**Non réalisé dans ce lot documentaire :** aucun déploiement, migration, seed, backfill, promotion, base, Render, OpenAI, réseau, `.env`, dépendance, `git add` / commit / push.

## Lot N1 — Catalogue Missions administrable (03/08/2026)

**Objectif unique :** fondation Prisma + admin permettant de classer chaque exercice dans **Thème → phase/niveau → ordre → avatar de prospect**. Aucune refonte des pages télépro Missions (reportée au LOT N2).

### Modèles créés

- `MissionTheme` : `id`, `organizationId`, `name`, `slug`, `description?`, `iconKey`, `sortOrder`, `status` (`DRAFT` | `PUBLISHED` | `ARCHIVED`), timestamps, `publishedAt?`, `archivedAt?` ; unicité `(organizationId, slug)` ; ancre `(id, organizationId)` ; index `(organizationId, status, sortOrder)`.
- `MissionStage` : phase/niveau rattachée à un thème ; unicités `(themeId, slug)` et `(themeId, levelNumber)` ; FK composite `(themeId, organizationId)` → `MissionTheme` (`onDelete: Restrict`) ; ancre `(id, organizationId)`.
- `Scenario` (additif uniquement) : `missionStageId?`, `prospectAvatarKey?` ; FK composite `(missionStageId, organizationId)` → `MissionStage` avec **`ON DELETE RESTRICT`** (jamais `CASCADE` ni `SET NULL` : une FK composite portant `organizationId` ne peut pas annuler uniquement la phase). Les champs legacy `missionLevel` et `sortOrder` sont **conservés**.

### Migration

- Fichier : `prisma/migrations/20260803112000_mission_catalog/migration.sql`.
- Additive : colonnes nullable sur `Scenario`, tables, index, FK. **Aucun INSERT, seed, backfill, DROP, RENAME**.
- Rollback manuel documenté en en-tête (rollback applicatif **avant** le SQL ; ne jamais supprimer d'exercice).
- **Créée, jamais exécutée** (`migrate dev` / `deploy` / `db push` / reset / seed : non lancés). La production n'a **pas** été migrée dans ce lot.

### Compatibilité legacy

- Après migration, tous les exercices existants auront `missionStageId = null` et `prospectAvatarKey = null`.
- Ils restent visibles, modifiables, utilisables par le runtime télépro actuel, et apparaissent comme **« Non classé »** dans les filtres admin.
- Aucun thème / phase de démonstration n'est créé automatiquement.

### Routes admin

| Surface | Rôle |
|---------|------|
| `GET\|POST /api/admin/mission-catalog` | Arbre thèmes → phases ; création thème/phase |
| `GET\|PATCH\|DELETE\|POST /api/admin/mission-catalog/[id]` | Lecture, mise à jour, hard-delete DRAFT, actions `publish` / `unpublish` / `archive` |
| `/admin/missions` | UI Parcours (arbre + éditeur, confirmations, lecture seule si archivé) |
| Layout admin | Destination **Parcours** |
| `/admin/exercises` | Filtres thème / phase / Non classé ; colonnes Thème, Phase, Avatar |
| Éditeur exercice | Sélection thème → phase filtrée ; avatar ; retrait classement (`null`) |

Toutes les routes API sont protégées par `requirePlatformAdmin`. Enveloppes `{ data }` / `{ error }`. Zod strict.

### Catalogue d'avatars

- Module local `src/lib/prospectAvatars.ts` : 10 clés stables (`alex`, `sarah`, …), libellés, initiales, palettes CSS.
- Composant `ProspectAvatar` : fallback déterministe, taille configurable, `aria-hidden` décoratif, **aucun** `dangerouslySetInnerHTML`, aucune URL distante / upload / S3.
- Toute clé inconnue reçue par l'API → erreur de validation (422) ; jamais stockée arbitrairement.
- Portraits illustrés définitifs : **LOT N2**.

### Sécurité multi-tenant

- Isolation stricte par `organizationId` (404 hors org) ; FK composites DB + gardes applicatives.
- Impossible de créer une phase sous un thème étranger, d'affecter un exercice à une phase étrangère, ou de contourner l'org par identifiant.
- Phase non publiable si thème non publié ; archive idempotente ; hard-delete bloqué si phases/exercices référencent ; réponses sans prompts / artifacts / hash / secrets / personas.
- Exercice archivé : métadonnées (dont classement) non modifiables (409).

### Tests

| Suite | Résultat |
|-------|----------|
| `tests/missionCatalogAdmin.test.ts` | OK — **24** tests (CRUD, isolation, publication, archive, hard-delete, anti-fuite, migration additive / FK / anciennes migrations intactes, pages, avatars) |
| `tests/adminExercisesUi.test.ts` | OK — **35** tests (helpers classement + assertions UI `!res.ok` / exports / avatar) |
| `tests/exerciseAdmin.test.ts` | OK — **24** tests (affectation, inter-org, null, avatar, archivé, filtres liste) |
| Suite complète `npm test` | **435** tests passés / **26** fichiers |

### Vérifications locales

| Commande | Résultat |
|----------|----------|
| `npm test -- tests/missionCatalogAdmin.test.ts tests/adminExercisesUi.test.ts tests/exerciseAdmin.test.ts` | OK — **83** / 83 |
| `npx prisma validate` | OK — schéma valide |
| `npx tsc --noEmit` | OK |
| `npm run lint --if-present` | OK — No ESLint warnings or errors |
| `npm test` | OK — **435** tests / 26 fichiers |
| `npm run build` | OK — routes `/admin/missions`, `/api/admin/mission-catalog` générées |
| `git diff --check` | OK |
| Encodage | Nouveaux fichiers du lot : UTF-8 sans BOM + LF ; fichiers déjà suivis : worktree CRLF (`core.autocrlf=true`), index LF |

### Reporté au LOT N2

- Rendu télépro Missions (parcours, nœuds, avatars illustrés) branché sur `MissionTheme` / `MissionStage`.
- Portraits de prospect définitifs (assets) à la place du rendu CSS N1.
- Exécution de la migration en production, seed, backfill, déploiement Render, commit.

### Confirmations

- **Aucune** migration / base / seed / backfill / réseau / OpenAI dans ce lot.
- **Aucun** commit.
- Migration **non exécutée** ; production **non migrée**.

---

## Lot N2 — Parcours Missions télépro + avatars + nav basse (03/08/2026)

**Objectif unique :** connecter le catalogue Missions N1 à l'expérience télépro (Thème → Phase → Exercices), portraits administrables, personnalité par exercice, navigation basse persistante.

### Livré

- Catalogue télépro Thème → Phase → Exercice (`buildTeleproMissionsCatalogView` / `loadTeleproMissionsCatalogView`).
- Compatibilité des exercices non classés via thème synthétique « Parcours existant » (slug réservé `__parcours-existant__`, phases dérivées de `missionLevel`, aucun seed/backfill).
- Dix avatars WebP locaux (`public/avatars/prospects/prospect-01.webp` … `10`, 512×512) associés aux clés N1 stables.
- Photo configurable côté admin (section **Prospect simulé**, grille ≥ 44 px) → `Scenario.prospectAvatarKey`.
- Personnalité configurable par exercice (`Scenario.personality`) ; indépendante de la photo ; alimente `buildProspectPersona` / `PROSPECT_PERSONA` local.
- Relation explicite avec PromptBundle : mise à jour métadonnées **ne régénère pas** un bundle publié ; avertissement admin + republication explicite requise.
- Navigation basse persistante : `TeleproShell` en `100dvh` flex colonne, contenu seul scrollable, nav `flex-shrink-0` hors flux (plus de `sticky` après contenu) ; masquée sur prepare/call/done/analysis.
- Pages `/app/missions`, `/app/missions/[themeSlug]`, `/app/missions/[themeSlug]/[stageSlug]` ; accueil aligné sur la recommandation et l'aperçu des thèmes.
- Portrait sur préparation + `CallClient` + `RealtimeCallClient` (invariants DEMO/Realtime préservés).

### Vérifications

| Contrôle | Résultat |
|---|---|
| `npm test -- tests/teleproMissions.test.ts tests/teleproShell.test.ts tests/lotN2.test.ts tests/adminExercisesUi.test.ts tests/exerciseAdmin.test.ts` | OK — **119** tests |
| `npx tsc --noEmit` | OK |
| `npm run lint --if-present` | OK — No ESLint warnings or errors |
| `npx prisma validate` | OK |
| `npm test` | OK — **455** tests / 27 fichiers |
| `npm run build` | OK — routes `/app/missions/[themeSlug]` et `/[stageSlug]` générées |
| `git diff --check` | OK |
| 10 WebP 512×512 | OK |
| Migration N1 | **Toujours non exécutée** |
| Prisma schema / migrations / package / lockfile | Non modifiés |

## LOT N3 — Création guidée Skills + finition visuelle (03/08/2026)

**Livré :**

- Parcours de création Skills guidé (Catégorie → Section → Article → Contenu → Publication) sur `/admin/skills`.
- Identité persistée de l'article (`persistedArticleId`) : premier save POST, suivants PATCH ; aucun second POST après échec de publication.
- Premier bloc paragraphe automatique non fictif ; sanitize → `[]` pour DRAFT ; aucun texte de démonstration persisté.
- Aperçu local « Aperçu télépro » via `SkillBlocks` (état formulaire uniquement, aucun fetch).
- `Enregistrer le brouillon` et `Enregistrer et publier` (sauvegarde puis action publish explicite).
- Gestion des prérequis parents (DRAFT/ARCHIVED bloquent la publication article uniquement ; parents jamais auto-publiés).
- Absence de faux succès (`!res.ok`, panneau confirmation conservé, formulaires isolés).
- Rendu télépro finalisé (cartes, tags, padding nav, fil d'Ariane article, `SkillBlocks` défensif).

### Vérifications

| Commande | Résultat |
|---|---|
| `npm test -- tests/adminSkillsUi.test.ts tests/skillsAdmin.test.ts tests/skillsTelepro.test.ts tests/lotN3.test.ts` | OK — **80** tests |
| `npx tsc --noEmit` | OK |
| `npm run lint --if-present` | OK — No ESLint warnings or errors |
| `npx prisma validate` | OK |
| `npm test` | OK — **482** tests / 28 fichiers |
| `npm run build` | OK — `/admin/skills`, `/app/skills/*` générés |
| `git diff --check` | OK |
| Migration N1 | **Toujours non exécutée** |
| Prisma schema / migrations / package / lockfile | Non modifiés |

### Prochaine étape

- Gate de release et smoke manuel.
- Exécution contrôlée de la migration catalogue, seed, backfill, déploiement, commit.

### Confirmations

- **Aucune** migration / base / seed / backfill / OpenAI / réseau / simulation / micro / WebRTC réel.
- **Aucun** commit.

---

## Lot N4 — Un exercice = un niveau (03/08/2026)

**Objectif unique :** Thème → Niveau avec **un exercice = un niveau**, catalogue entièrement dynamique, admin + télépro + migration de suivi — **sans exécuter la migration N4**.

### Livré

- Logique finale : un exercice = un niveau (`MissionStage.scenario Scenario?` + `@@unique([missionStageId, organizationId])`).
- Nombre de thèmes et de niveaux entièrement configurable (aucun plafond métier 5 thèmes / 7 niveaux).
- `MissionStage` conservé techniquement, présenté partout comme **Niveau** ; `Scenario.level` libellé **Difficulté**.
- Migration de suivi écrite : `prisma/migrations/20260804100000_mission_stage_single_scenario` (garde anti-doublons + index unique ; NULL autorisés ; aucun INSERT/UPDATE/seed/backfill).
- Admin `/admin/missions` : arbre Thème → Niveau → exercice, association/retrait, checklist readiness, publish gates.
- Télépro : page thème = parcours portraits (p.15) ; route stage historique = redirect prepare / thème sans bypass verrou ; legacy « Parcours existant » = 1 nœud / exercice.
- Déblocage dynamique par thème (`levelNumber` → `sortOrder` → ordre déterministe) ; trous non bloquants ; `COMPLETED` / `IN_PROGRESS` prioritaires.

### Vérifications

| Contrôle | Résultat |
|---|---|
| Batterie ciblée N4/N1/N2 | OK — **158** / 158 (~9 s) |
| `npm test` (suite complète) | OK — **512** / 512 (~20 s) |
| `npx prisma validate` | OK |
| `npx tsc --noEmit` | OK |
| `npm run lint --if-present` | OK (exit 0) |
| `npm run build` | OK — routes missions thème/stage + admin missions générées |
| `git diff --check` | OK (warnings LF/CRLF autocrlf uniquement) |
| Migration N4 | **Écrite, NON exécutée** |
| Migration N1 | Contenu **inchangé** ; déjà appliquée en production selon ops (hors scope N4) |
| `package.json` / lock | **Inchangés** |

### Risques restants

- Doublons `(missionStageId, organizationId)` éventuels en base bloqueront le `RAISE` N4 au moment de l'appliquer (aucune correction auto).
- Appliquer N4 **après** déploiement applicatif qui refuse déjà le 2ᵉ exercice (409).
- Smoke manuel admin (association 1:1, publish readiness) et télépro (portraits, redirect stage) encore à faire.
- `tests/lotL.test.ts` adapté hors allowlist initiale (assertions source `MissionsPath` devenues obsolètes) pour garder `npm test` vert.

### Confirmations

- **Aucune** exécution de migration N4 / seed / backfill / base réelle / production / Render.
- **Aucun** appel OpenAI / réseau externe / simulation / micro / WebRTC.
- **Aucun** commit / push / PR.
- **Aucune** affirmation que la migration N4 a été appliquée en production.
