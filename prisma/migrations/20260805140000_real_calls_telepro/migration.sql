-- Migration Q3A : appels réels télépro (CallRecording + CallAnalysis).
-- Additive uniquement : colonnes nullable + index + FK. Aucun INSERT, aucun UPDATE,
-- aucun DELETE, aucun seed, aucun backfill destructif.
-- Les CallRecording / CallAnalysis historiques restent valides (teleproId/source/
-- consentConfirmedAt/overallScore/coachingPayload NULL).
--
-- ROLLBACK manuel (à n'exécuter qu'en connaissance de cause) :
--   1. Déployer d'abord une version applicative qui n'exige plus ces colonnes
--      (rollback applicatif avant SQL).
--   2. Puis :
--        ALTER TABLE "CallAnalysis" DROP CONSTRAINT IF EXISTS "CallAnalysis_overallScore_range";
--        ALTER TABLE "CallRecording" DROP CONSTRAINT IF EXISTS "CallRecording_telepro_org_fkey";
--        DROP INDEX IF EXISTS "CallRecording_source_idx";
--        DROP INDEX IF EXISTS "CallRecording_org_telepro_idx";
--        DROP INDEX IF EXISTS "CallRecording_teleproId_idx";
--        ALTER TABLE "CallRecording" DROP COLUMN IF EXISTS "consentConfirmedAt";
--        ALTER TABLE "CallRecording" DROP COLUMN IF EXISTS "source";
--        ALTER TABLE "CallRecording" DROP COLUMN IF EXISTS "teleproId";
--        ALTER TABLE "CallAnalysis" DROP COLUMN IF EXISTS "coachingPayload";
--        ALTER TABLE "CallAnalysis" DROP COLUMN IF EXISTS "overallScore";
--        DROP INDEX IF EXISTS "User_id_organizationId_key";
--   3. Ne jamais supprimer d'appels, transcripts ni analyses pendant ce rollback.

-- Ancre unique pour FK composite multi-tenant (User.id + User.organizationId).
CREATE UNIQUE INDEX "User_id_organizationId_key"
ON "User" ("id", "organizationId");

-- AlterTable CallRecording
ALTER TABLE "CallRecording" ADD COLUMN "teleproId" TEXT;
ALTER TABLE "CallRecording" ADD COLUMN "source" TEXT;
ALTER TABLE "CallRecording" ADD COLUMN "consentConfirmedAt" TEXT;

-- AlterTable CallAnalysis
ALTER TABLE "CallAnalysis" ADD COLUMN "overallScore" INTEGER;
ALTER TABLE "CallAnalysis" ADD COLUMN "coachingPayload" TEXT;

-- Score coaching : null (indisponible) ou 0..100.
ALTER TABLE "CallAnalysis"
ADD CONSTRAINT "CallAnalysis_overallScore_range"
CHECK ("overallScore" IS NULL OR ("overallScore" >= 0 AND "overallScore" <= 100));

-- CreateIndex (noms <= 63 octets ; espace obligatoire après ON)
CREATE INDEX "CallRecording_teleproId_idx"
ON "CallRecording" ("teleproId");
CREATE INDEX "CallRecording_org_telepro_idx"
ON "CallRecording" ("organizationId", "teleproId");
CREATE INDEX "CallRecording_source_idx"
ON "CallRecording" ("source");

-- FK composite : telepro et enregistrement partagent la même organisation.
-- MATCH SIMPLE : teleproId NULL (legacy) n'est pas vérifié.
-- onDelete Restrict : ne jamais SET NULL organizationId.
ALTER TABLE "CallRecording"
ADD CONSTRAINT "CallRecording_telepro_org_fkey"
FOREIGN KEY ("teleproId", "organizationId")
REFERENCES "User" ("id", "organizationId")
ON DELETE RESTRICT
ON UPDATE CASCADE;
