-- Migration P2 : organisation propriétaire technique du catalogue pédagogique global.
-- Additive uniquement : colonne + index unique partiel. Aucun INSERT, aucun seed,
-- aucun backfill, aucun UPDATE, aucune suppression, aucune désignation automatique.
-- Aucun slug ni identifiant réel dans cette migration.
--
-- Le runtime MVP lit thèmes / niveaux / exercices / PromptBundles / Skills depuis
-- l'unique organisation marquée isPlatformCatalog = true (via script ops séparé).
-- Les utilisateurs, simulations, résultats et données métier restent isolés par
-- organisation d'appartenance et ne deviennent jamais globaux.
--
-- Les FK composites multi-tenant de N1/N4
-- (Scenario_missionStageId_organizationId_fkey, etc.) sont conservées telles quelles.
--
-- ROLLBACK manuel (a n'exécuter qu'en connaissance de cause) :
--   1. Déployer d'abord une version applicative qui n'exige plus isPlatformCatalog
--      (rollback applicatif avant SQL).
--   2. Puis :
--        DROP INDEX IF EXISTS "Organization_isPlatformCatalog_unique";
--        ALTER TABLE "Organization" DROP COLUMN IF EXISTS "isPlatformCatalog";
--   3. Ne jamais supprimer d'organisation, de thème, d'exercice ni de Skill
--      pendant ce rollback.

-- AlterTable
ALTER TABLE "Organization"
ADD COLUMN "isPlatformCatalog" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex : au plus une organisation catalogue (partial unique)
CREATE UNIQUE INDEX "Organization_isPlatformCatalog_unique"
ON "Organization" ("isPlatformCatalog")
WHERE "isPlatformCatalog" = true;
