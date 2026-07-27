-- AlterTable
ALTER TABLE "CallRecording" ADD COLUMN     "audioBitrate" INTEGER,
ADD COLUMN     "audioChannels" INTEGER,
ADD COLUMN     "audioCodec" TEXT,
ADD COLUMN     "audioSampleRate" INTEGER,
ADD COLUMN     "callTypeConfidence" DOUBLE PRECISION,
ADD COLUMN     "clarificationAnswers" TEXT,
ADD COLUMN     "clarificationQuestions" TEXT,
ADD COLUMN     "consentAt" TEXT,
ADD COLUMN     "detectedCallType" TEXT,
ADD COLUMN     "referenceSuitabilityScore" INTEGER,
ADD COLUMN     "usableAsReference" BOOLEAN,
ADD COLUMN     "useAsModel" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN     "aiProspect" TEXT,
ADD COLUMN     "coachingReference" TEXT,
ADD COLUMN     "expectedNextSteps" TEXT,
ADD COLUMN     "generatedByModel" TEXT,
ADD COLUMN     "promptVersion" TEXT,
ADD COLUMN     "relationshipHistory" TEXT,
ADD COLUMN     "sourceAnalysisId" TEXT,
ADD COLUMN     "sourceRecordingId" TEXT,
ADD COLUMN     "targetSkills" TEXT,
ADD COLUMN     "traineeBrief" TEXT;

-- AlterTable
ALTER TABLE "Transcript" ADD COLUMN     "commercialSpeakerId" TEXT,
ADD COLUMN     "customerSpeakerId" TEXT,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "speakerAssignmentConfidence" DOUBLE PRECISION,
ADD COLUMN     "speakerAssignmentRationale" TEXT;

-- CreateTable
CREATE TABLE "TranscriptSegment" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL DEFAULT 0,
    "speakerId" TEXT NOT NULL,
    "role" TEXT,
    "startMs" INTEGER NOT NULL DEFAULT 0,
    "endMs" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL,
    "anonymizedText" TEXT,
    "confidence" DOUBLE PRECISION,

    CONSTRAINT "TranscriptSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallAnalysis" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "callType" TEXT,
    "callTypeConfidence" DOUBLE PRECISION,
    "relationshipStage" TEXT,
    "referenceSuitabilityScore" INTEGER DEFAULT 0,
    "usable" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'fr',
    "model" TEXT,
    "promptVersion" TEXT,
    "summary" TEXT,
    "customerProfile" TEXT,
    "commercialStrategy" TEXT,
    "ambiguities" TEXT,
    "referenceSuitability" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "CallAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TranscriptSegment_transcriptId_idx" ON "TranscriptSegment"("transcriptId");

-- CreateIndex
CREATE INDEX "TranscriptSegment_transcriptId_idx_idx" ON "TranscriptSegment"("transcriptId", "idx");

-- CreateIndex
CREATE UNIQUE INDEX "CallAnalysis_recordingId_key" ON "CallAnalysis"("recordingId");

-- CreateIndex
CREATE INDEX "CallAnalysis_organizationId_idx" ON "CallAnalysis"("organizationId");

-- CreateIndex
CREATE INDEX "CallAnalysis_callType_idx" ON "CallAnalysis"("callType");

-- CreateIndex
CREATE UNIQUE INDEX "Scenario_sourceRecordingId_key" ON "Scenario"("sourceRecordingId");

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_sourceRecordingId_fkey" FOREIGN KEY ("sourceRecordingId") REFERENCES "CallRecording"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptSegment" ADD CONSTRAINT "TranscriptSegment_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAnalysis" ADD CONSTRAINT "CallAnalysis_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAnalysis" ADD CONSTRAINT "CallAnalysis_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "CallRecording"("id") ON DELETE CASCADE ON UPDATE CASCADE;
