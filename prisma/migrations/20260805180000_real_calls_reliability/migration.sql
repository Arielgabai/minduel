-- Migration Q3C : idempotence upload + etats d'annulation des appels reels.
-- Additive uniquement. Aucun INSERT, UPDATE, DELETE, seed ni backfill.
--
-- ROLLBACK manuel (a n'executer qu'en connaissance de cause) :
--   1. Rollback applicatif d'abord.
--   2. Puis :
--        DROP INDEX IF EXISTS "CallRecording_organizationId_teleproId_uploadAttemptId_key";
--        ALTER TABLE "CallRecording" DROP COLUMN IF EXISTS "uploadAttemptId";
--        ALTER TABLE "CallRecording" DROP COLUMN IF EXISTS "cancelRequestedAt";
--        ALTER TABLE "CallRecording" DROP COLUMN IF EXISTS "cancelledAt";
--   3. Ne jamais supprimer d'appels, transcripts, analyses ni jobs.

-- AlterTable
ALTER TABLE "CallRecording" ADD COLUMN "uploadAttemptId" TEXT;
ALTER TABLE "CallRecording" ADD COLUMN "cancelRequestedAt" TEXT;
ALTER TABLE "CallRecording" ADD COLUMN "cancelledAt" TEXT;

-- CreateIndex
-- NULL uploadAttemptId autorise (lignes historiques / legacy).
-- Unicite effective designe que les tentatives d'upload telepro avec UUID.
CREATE UNIQUE INDEX "CallRecording_organizationId_teleproId_uploadAttemptId_key"
ON "CallRecording" ("organizationId", "teleproId", "uploadAttemptId");
