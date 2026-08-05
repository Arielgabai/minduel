-- Migration Q2 : score minimum de validation par exercice (Scenario.passingScore).
-- Additive uniquement : colonne + contrainte CHECK. Aucun INSERT, aucun UPDATE,
-- aucun DELETE, aucun seed, aucun backfill.
-- Les lignes existantes héritent de la valeur par défaut SQL 60.
--
-- ROLLBACK manuel (à n'exécuter qu'en connaissance de cause) :
--   1. Déployer d'abord une version applicative qui n'exige plus passingScore
--      (rollback applicatif avant SQL).
--   2. Puis :
--        ALTER TABLE "Scenario" DROP CONSTRAINT IF EXISTS "Scenario_passingScore_range";
--        ALTER TABLE "Scenario" DROP COLUMN IF EXISTS "passingScore";
--   3. Ne jamais supprimer d'exercices, de simulations ni d'évaluations
--      pendant ce rollback.

-- AlterTable
ALTER TABLE "Scenario"
ADD COLUMN "passingScore" INTEGER NOT NULL DEFAULT 60;

-- CheckConstraint : 0 <= passingScore <= 100
ALTER TABLE "Scenario"
ADD CONSTRAINT "Scenario_passingScore_range"
CHECK ("passingScore" >= 0 AND "passingScore" <= 100);
