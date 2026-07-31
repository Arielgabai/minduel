-- Migration : exercices (missionLevel, sortOrder, slug) + PromptBundle + snapshot Simulation
--
-- ROLLBACK (executer manuellement si besoin de revenir en arriere) :
--   1. Deployer une version applicative null-safe (colonnes optionnelles ignorees).
--   2. Puis executer le SQL ci-dessous dans l'ordre inverse :
--      ALTER TABLE "Simulation" DROP CONSTRAINT IF EXISTS "Simulation_promptBundleId_fkey";
--      DROP INDEX IF EXISTS "Simulation_promptBundleId_idx";
--      ALTER TABLE "Simulation" DROP COLUMN IF EXISTS "promptContentHash";
--      ALTER TABLE "Simulation" DROP COLUMN IF EXISTS "promptBundleVersion";
--      ALTER TABLE "Simulation" DROP COLUMN IF EXISTS "promptBundleId";
--      ALTER TABLE "Scenario" DROP CONSTRAINT IF EXISTS "Scenario_publishedPromptBundleId_fkey";
--      ALTER TABLE "Scenario" DROP COLUMN IF EXISTS "publishedPromptBundleId";
--      DROP INDEX IF EXISTS "PromptBundle_scenarioId_published_key";
--      DROP INDEX IF EXISTS "PromptBundle_scenarioId_draft_key";
--      DROP TABLE IF EXISTS "PromptBundle";
--      DROP INDEX IF EXISTS "Scenario_organizationId_missionLevel_sortOrder_idx";
--      DROP INDEX IF EXISTS "Scenario_organizationId_slug_key";
--      ALTER TABLE "Scenario" DROP COLUMN IF EXISTS "sortOrder";
--      ALTER TABLE "Scenario" DROP COLUMN IF EXISTS "missionLevel";
--      ALTER TABLE "Scenario" DROP COLUMN IF EXISTS "slug";
--
--   Note : les bundles supprimes ne sont pas recuperables ; les simulations historiques
--   perdent leur snapshot de prompts (colonnes nullable, pas de perte de transcript).

-- AlterTable Scenario
ALTER TABLE "Scenario" ADD COLUMN     "slug" TEXT,
ADD COLUMN     "missionLevel" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "publishedPromptBundleId" TEXT;

-- CreateTable PromptBundle
CREATE TABLE "PromptBundle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "label" TEXT,
    "createdById" TEXT,
    "createdAt" TEXT NOT NULL,
    "publishedAt" TEXT,
    "artifacts" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,

    CONSTRAINT "PromptBundle_pkey" PRIMARY KEY ("id")
);

-- AlterTable Simulation
ALTER TABLE "Simulation" ADD COLUMN     "promptBundleId" TEXT,
ADD COLUMN     "promptBundleVersion" INTEGER,
ADD COLUMN     "promptContentHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Scenario_publishedPromptBundleId_key" ON "Scenario"("publishedPromptBundleId");

CREATE UNIQUE INDEX "Scenario_organizationId_slug_key" ON "Scenario"("organizationId", "slug");

CREATE INDEX "Scenario_organizationId_missionLevel_sortOrder_idx" ON "Scenario"("organizationId", "missionLevel", "sortOrder");

CREATE UNIQUE INDEX "PromptBundle_scenarioId_version_key" ON "PromptBundle"("scenarioId", "version");

CREATE INDEX "PromptBundle_organizationId_idx" ON "PromptBundle"("organizationId");

CREATE INDEX "PromptBundle_scenarioId_status_idx" ON "PromptBundle"("scenarioId", "status");

CREATE UNIQUE INDEX "PromptBundle_scenarioId_draft_key" ON "PromptBundle"("scenarioId") WHERE "status" = 'DRAFT';

CREATE UNIQUE INDEX "PromptBundle_scenarioId_published_key" ON "PromptBundle"("scenarioId") WHERE "status" = 'PUBLISHED';

CREATE INDEX "Simulation_promptBundleId_idx" ON "Simulation"("promptBundleId");

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_publishedPromptBundleId_fkey" FOREIGN KEY ("publishedPromptBundleId") REFERENCES "PromptBundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PromptBundle" ADD CONSTRAINT "PromptBundle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PromptBundle" ADD CONSTRAINT "PromptBundle_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Simulation" ADD CONSTRAINT "Simulation_promptBundleId_fkey" FOREIGN KEY ("promptBundleId") REFERENCES "PromptBundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
