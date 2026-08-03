-- Migration : catalogue Missions (MissionTheme / MissionStage) + classement des exercices.
-- Additive uniquement : deux colonnes nullable sur "Scenario", deux nouvelles tables,
-- index et contraintes. Aucun INSERT, aucun seed, aucun backfill, aucune suppression,
-- aucun renommage, aucune modification d'une migration anterieure.
--
-- Integrite multi-tenant : ancres uniques (id, organizationId) et FK composites
-- (themeId, organizationId) / (missionStageId, organizationId) rendent impossible
-- toute relation entre deux organisations differentes.
--
-- Suppression d'une phase : ON DELETE RESTRICT vers "Scenario", jamais CASCADE ni
-- SET NULL. Une FK composite portant "organizationId" ne peut pas utiliser SET NULL
-- sans annuler aussi l'organisation de l'exercice. Le declassement d'un exercice
-- passe donc par l'API admin (missionStageId = NULL) avant toute suppression de phase.
--
-- Compatibilite : les exercices existants conservent missionLevel et sortOrder et
-- obtiennent missionStageId = NULL (non classe) ainsi que prospectAvatarKey = NULL.
--
-- ROLLBACK manuel (a n'executer qu'en connaissance de cause) :
--   1. Deployer d'abord une version applicative sans /admin/missions, sans
--      /api/admin/mission-catalog et sans lecture de Scenario.missionStageId ni
--      Scenario.prospectAvatarKey : le rollback applicatif precede le rollback SQL.
--   2. Puis, dans cet ordre (references avant tables) :
--        ALTER TABLE "Scenario" DROP CONSTRAINT IF EXISTS "Scenario_missionStageId_organizationId_fkey";
--        DROP INDEX IF EXISTS "Scenario_organizationId_missionStageId_idx";
--        ALTER TABLE "Scenario" DROP COLUMN IF EXISTS "missionStageId";
--        ALTER TABLE "Scenario" DROP COLUMN IF EXISTS "prospectAvatarKey";
--        DROP TABLE IF EXISTS "MissionStage";
--        DROP TABLE IF EXISTS "MissionTheme";
--   3. Ne jamais supprimer d'exercice pendant un rollback : les exercices restent
--      intacts et redeviennent simplement non classes. En revanche le contenu du
--      catalogue (themes et phases) n'est pas recuperable une fois les tables supprimees.

-- AlterTable : colonnes nullable, sans valeur par defaut, aucune reecriture de lignes
ALTER TABLE "Scenario" ADD COLUMN     "missionStageId" TEXT,
ADD COLUMN     "prospectAvatarKey" TEXT;

-- CreateTable
CREATE TABLE "MissionTheme" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "iconKey" TEXT NOT NULL DEFAULT 'target',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "publishedAt" TEXT,
    "archivedAt" TEXT,

    CONSTRAINT "MissionTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionStage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "levelNumber" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "publishedAt" TEXT,
    "archivedAt" TEXT,

    CONSTRAINT "MissionStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unicites metier + ancres uniques pour les FK composites)
CREATE UNIQUE INDEX "MissionTheme_organizationId_slug_key" ON "MissionTheme"("organizationId", "slug");

CREATE UNIQUE INDEX "MissionTheme_id_organizationId_key" ON "MissionTheme"("id", "organizationId");

CREATE INDEX "MissionTheme_organizationId_status_sortOrder_idx" ON "MissionTheme"("organizationId", "status", "sortOrder");

CREATE UNIQUE INDEX "MissionStage_themeId_slug_key" ON "MissionStage"("themeId", "slug");

CREATE UNIQUE INDEX "MissionStage_themeId_levelNumber_key" ON "MissionStage"("themeId", "levelNumber");

CREATE UNIQUE INDEX "MissionStage_id_organizationId_key" ON "MissionStage"("id", "organizationId");

CREATE INDEX "MissionStage_organizationId_idx" ON "MissionStage"("organizationId");

CREATE INDEX "MissionStage_themeId_status_sortOrder_idx" ON "MissionStage"("themeId", "status", "sortOrder");

CREATE INDEX "Scenario_organizationId_missionStageId_idx" ON "Scenario"("organizationId", "missionStageId");

-- AddForeignKey (espace obligatoire entre la parenthese fermante et REFERENCES)
ALTER TABLE "MissionTheme" ADD CONSTRAINT "MissionTheme_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MissionStage" ADD CONSTRAINT "MissionStage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MissionStage" ADD CONSTRAINT "MissionStage_themeId_organizationId_fkey" FOREIGN KEY ("themeId", "organizationId") REFERENCES "MissionTheme"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_missionStageId_organizationId_fkey" FOREIGN KEY ("missionStageId", "organizationId") REFERENCES "MissionStage"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
