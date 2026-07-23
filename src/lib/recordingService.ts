import "server-only";
import { prisma } from "./db";
import { nowIso } from "./utils";
import { RecordingStatus } from "./enums";
import {
  getTranscriptionProvider,
  getKnowledgeExtractionProvider,
} from "./providers";

/**
 * Exécute le pipeline complet de traitement d'un enregistrement, de façon
 * IDEMPOTENTE et rejouable : UPLOADED → TRANSCRIBING → (transcript) → ANALYZING
 * → (connaissances) → READY.
 *
 * - Ne duplique jamais un transcript ni des connaissances déjà produits.
 * - En cas d'erreur, laisse l'enregistrement dans son état intermédiaire et
 *   RELÈVE l'erreur : la couche de file de tâches (jobs) décide du retry/backoff
 *   et marque l'enregistrement FAILED uniquement en cas d'échec définitif.
 */
export async function runRecordingPipeline(
  recordingId: string,
  organizationId: string,
): Promise<{ status: string }> {
  const rec = await prisma.callRecording.findFirstOrThrow({
    where: { id: recordingId, organizationId },
    include: { transcript: true },
  });

  if (rec.status === RecordingStatus.READY) return { status: rec.status };

  // 1) Transcription (idempotent).
  if (!rec.transcript) {
    await prisma.callRecording.update({
      where: { id: rec.id },
      data: { status: RecordingStatus.TRANSCRIBING, updatedAt: nowIso() },
    });
    const result = await getTranscriptionProvider().transcribe({
      storageKey: rec.storageKey,
      language: rec.language,
      seed: rec.id,
    });
    await prisma.transcript.create({
      data: {
        recordingId: rec.id,
        language: result.language,
        segments: JSON.stringify(result.segments),
        createdAt: nowIso(),
      },
    });
  }

  // 2) Extraction de connaissances (idempotent).
  await prisma.callRecording.update({
    where: { id: rec.id },
    data: { status: RecordingStatus.ANALYZING, updatedAt: nowIso() },
  });
  const transcript = await prisma.transcript.findUnique({
    where: { recordingId: rec.id },
  });
  const existing = await prisma.knowledgeItem.count({
    where: { recordingId: rec.id },
  });
  if (existing === 0 && transcript) {
    const segments = JSON.parse(transcript.segments) as Array<{
      speaker: "AGENT" | "PROSPECT";
      text: string;
      startMs: number;
      endMs: number;
    }>;
    const drafts = await getKnowledgeExtractionProvider().extract({
      segments,
      seed: rec.id,
    });
    const now = nowIso();
    await prisma.knowledgeItem.createMany({
      data: drafts.map((d) => ({
        organizationId,
        recordingId: rec.id,
        type: d.type,
        title: d.title,
        content: d.content,
        sourceExcerpt: d.sourceExcerpt,
        startMs: d.startMs,
        endMs: d.endMs,
        confidence: d.confidence,
        reviewStatus: "PENDING",
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })),
    });
  }

  // 3) Prêt.
  await prisma.callRecording.update({
    where: { id: rec.id },
    data: { status: RecordingStatus.READY, updatedAt: nowIso() },
  });
  return { status: RecordingStatus.READY };
}

/** Marque explicitement un enregistrement en échec (appelé après épuisement des retries). */
export async function markRecordingFailed(
  recordingId: string,
  organizationId: string,
  message: string,
): Promise<void> {
  await prisma.callRecording.updateMany({
    where: { id: recordingId, organizationId },
    data: {
      status: RecordingStatus.FAILED,
      errorMessage: message.slice(0, 300),
      updatedAt: nowIso(),
    },
  });
}
