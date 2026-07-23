import "server-only";
import { prisma } from "./db";
import { nowIso } from "./utils";
import { RecordingStatus } from "./enums";
import {
  getTranscriptionProvider,
  getKnowledgeExtractionProvider,
} from "./providers";

/**
 * Fait avancer le pipeline de traitement d'un enregistrement d'UNE étape.
 * Idempotent et rejouable. Les étapes reflètent :
 * UPLOADED → TRANSCRIBING → ANALYZING → READY.
 * (En production, ce travail serait exécuté par un worker asynchrone avec retries.)
 */
export async function advanceRecording(
  recordingId: string,
  organizationId: string,
): Promise<{ status: string }> {
  const rec = await prisma.callRecording.findFirstOrThrow({
    where: { id: recordingId, organizationId },
    include: { transcript: true },
  });

  try {
    switch (rec.status) {
      case RecordingStatus.UPLOADED: {
        await prisma.callRecording.update({
          where: { id: rec.id },
          data: { status: RecordingStatus.TRANSCRIBING, updatedAt: nowIso() },
        });
        return { status: RecordingStatus.TRANSCRIBING };
      }

      case RecordingStatus.TRANSCRIBING: {
        // Transcription (idempotent : ne recrée pas si déjà présent).
        if (!rec.transcript) {
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
        await prisma.callRecording.update({
          where: { id: rec.id },
          data: { status: RecordingStatus.ANALYZING, updatedAt: nowIso() },
        });
        return { status: RecordingStatus.ANALYZING };
      }

      case RecordingStatus.ANALYZING: {
        const transcript = await prisma.transcript.findUnique({
          where: { recordingId: rec.id },
        });
        const segments = transcript
          ? (JSON.parse(transcript.segments) as Array<{
              speaker: "AGENT" | "PROSPECT";
              text: string;
              startMs: number;
              endMs: number;
            }>)
          : [];

        // Idempotence : ne pas dupliquer les connaissances déjà extraites.
        const existing = await prisma.knowledgeItem.count({
          where: { recordingId: rec.id },
        });
        if (existing === 0) {
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

        await prisma.callRecording.update({
          where: { id: rec.id },
          data: { status: RecordingStatus.READY, updatedAt: nowIso() },
        });
        return { status: RecordingStatus.READY };
      }

      default:
        return { status: rec.status };
    }
  } catch (err) {
    await prisma.callRecording.update({
      where: { id: rec.id },
      data: {
        status: RecordingStatus.FAILED,
        errorMessage:
          err instanceof Error ? err.message.slice(0, 300) : "Erreur de traitement.",
        updatedAt: nowIso(),
      },
    });
    return { status: RecordingStatus.FAILED };
  }
}
