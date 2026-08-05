-- Migration Q3B : mapping exercice catalogue ↔ clés de compétences.
-- Additive uniquement. Aucun INSERT, UPDATE, DELETE, seed ni backfill.
--
-- ROLLBACK manuel (à n'exécuter qu'en connaissance de cause) :
--   1. Rollback applicatif d'abord.
--   2. Puis :
--        DROP TABLE IF EXISTS "ScenarioSkillMapping";
--        DROP INDEX IF EXISTS "Scenario_id_organizationId_key";
--   3. Ne jamais supprimer de scénarios, simulations ni appels réels.

-- Ancre pour FK composite ScenarioSkillMapping → Scenario(id, organizationId).
CREATE UNIQUE INDEX "Scenario_id_organizationId_key"
ON "Scenario" ("id", "organizationId");

-- CreateTable
CREATE TABLE "ScenarioSkillMapping" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "scenarioId" TEXT NOT NULL,
  "skillKey" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL,
  CONSTRAINT "ScenarioSkillMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioSkillMapping_scenarioId_skillKey_key"
ON "ScenarioSkillMapping" ("scenarioId", "skillKey");
CREATE INDEX "ScenarioSkillMapping_organizationId_skillKey_idx"
ON "ScenarioSkillMapping" ("organizationId", "skillKey");
CREATE INDEX "ScenarioSkillMapping_organizationId_idx"
ON "ScenarioSkillMapping" ("organizationId");

-- AddForeignKey
ALTER TABLE "ScenarioSkillMapping"
ADD CONSTRAINT "ScenarioSkillMapping_organizationId_fkey"
FOREIGN KEY ("organizationId")
REFERENCES "Organization" ("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "ScenarioSkillMapping"
ADD CONSTRAINT "ScenarioSkillMapping_scenario_org_fkey"
FOREIGN KEY ("scenarioId", "organizationId")
REFERENCES "Scenario" ("id", "organizationId")
ON DELETE CASCADE
ON UPDATE CASCADE;
