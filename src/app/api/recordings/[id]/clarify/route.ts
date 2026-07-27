import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, ok, fail } from "@/lib/api";
import { requireManager } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { nowIso } from "@/lib/utils";
import { RecordingStatus } from "@/lib/enums";
import { enqueueJob, JobType } from "@/lib/jobs";
import { log } from "@/lib/log";

const bodySchema = z.object({
  // Map questionId -> réponse (choix de locuteur ou texte). Max 3 entrées utiles.
  answers: z.record(z.string(), z.string().min(1).max(500)),
});

interface ClarificationQuestion {
  id: string;
  kind?: string; // "speaker" | "text"
  question?: string;
  options?: Array<{ value: string }>;
}

/**
 * Réponses de clarification du manager. Persiste les réponses puis relance
 * l'étape appropriée du pipeline. Idempotent (rejouable) et limité en débit.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const manager = await requireManager();
    const { id } = await params;

    const rl = rateLimit(`clarify:${manager.id}`, 30, 60_000);
    if (!rl.allowed) return fail(429, "Trop de requêtes. Réessaie dans une minute.");

    const { answers } = bodySchema.parse(await req.json());

    const rec = await prisma.callRecording.findFirst({
      where: { id, organizationId: manager.organizationId },
      include: { transcript: { include: { turns: { select: { speakerId: true } } } } },
    });
    if (!rec) return fail(404, "Enregistrement introuvable.");
    if (rec.status !== RecordingStatus.WAITING_FOR_CLARIFICATION) {
      return fail(400, "Aucune clarification n'est attendue pour cet appel.");
    }

    let questions: ClarificationQuestion[] = [];
    try {
      questions = JSON.parse(rec.clarificationQuestions ?? "[]") as ClarificationQuestion[];
    } catch {
      questions = [];
    }
    if (questions.length === 0) {
      return fail(400, "Aucune question de clarification en attente.");
    }

    const isSpeakerStage = questions.some((q) => q.kind === "speaker");

    // Validation d'un éventuel choix de locuteur.
    if (isSpeakerStage) {
      const choice = answers["commercialSpeakerId"];
      if (!choice) return fail(422, "Merci d'indiquer quel interlocuteur est le commercial.");
      const validIds = new Set((rec.transcript?.turns ?? []).map((t) => t.speakerId));
      if (!validIds.has(choice)) {
        return fail(422, "Locuteur choisi invalide.");
      }
    }

    // Fusionne avec les réponses déjà fournies.
    let existing: Record<string, string> = {};
    try {
      existing = JSON.parse(rec.clarificationAnswers ?? "{}") as Record<string, string>;
    } catch {
      existing = {};
    }
    const merged = { ...existing, ...answers };

    const nextType = isSpeakerStage
      ? JobType.TRANSCRIBE_RECORDING
      : JobType.ANALYZE_REFERENCE_CALL;
    const nextStatus = isSpeakerStage
      ? RecordingStatus.TRANSCRIBING
      : RecordingStatus.ANALYZING;

    await prisma.callRecording.update({
      where: { id },
      data: {
        clarificationAnswers: JSON.stringify(merged),
        clarificationQuestions: null,
        status: nextStatus,
        updatedAt: nowIso(),
      },
    });

    await enqueueJob({
      organizationId: manager.organizationId,
      type: nextType,
      targetId: id,
    });

    log.info("recording.clarification_answered", {
      organizationId: manager.organizationId,
      recordingId: id,
      stage: isSpeakerStage ? "speaker_attribution" : "analysis",
    });

    return ok({ status: nextStatus });
  });
}
