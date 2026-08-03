-- Migration N4 : un niveau (MissionStage) = au plus un exercice (Scenario).
-- Additive uniquement : index unique composite. Aucun INSERT, aucun seed,
-- aucun backfill, aucun UPDATE, aucune suppression, aucune modification de N1.
--
-- PostgreSQL traite les NULL comme distincts dans un index UNIQUE : plusieurs
-- Scenario avec missionStageId IS NULL restent autorises (exercices non classes).
--
-- Les FK composites multi-tenant de N1
-- (Scenario_missionStageId_organizationId_fkey) sont conservees telles quelles.
--
-- ROLLBACK manuel (a n'executer qu'en connaissance de cause) :
--   1. Deployer d'abord une version applicative qui n'exige plus l'unicite
--      applicative 1:1 niveau/exercice (rollback applicatif avant SQL).
--   2. Puis :
--        DROP INDEX IF EXISTS "Scenario_missionStageId_organizationId_key";
--   3. Ne jamais supprimer d'exercice ni de niveau pendant ce rollback.

-- Garde : refuse la migration si des doublons existent deja (aucune correction auto).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Scenario"
    WHERE "missionStageId" IS NOT NULL
    GROUP BY "missionStageId", "organizationId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'N4 refusee : doublons Scenario(missionStageId, organizationId) detectes. Corrigez manuellement avant de rejouer la migration.';
  END IF;
END $$;

-- CreateIndex : unicite 1:1 niveau / exercice (NULL exclus de la collision)
CREATE UNIQUE INDEX "Scenario_missionStageId_organizationId_key"
ON "Scenario"("missionStageId", "organizationId");