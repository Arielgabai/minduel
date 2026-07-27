import { prisma } from "@/lib/db";
import { handle, ok, fail } from "@/lib/api";
import { requireManager } from "@/lib/auth";
import { RecordingStatus, RECORDING_STATUS_LABELS } from "@/lib/enums";

/**
 * Statut du pipeline appel -> exercice, pour le polling côté manager.
 * Lecture seule (aucun contenu sensible : ni transcript, ni PII, ni URL signée).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const manager = await requireManager();
    const { id } = await params;

    const rec = await prisma.callRecording.findFirst({
      where: { id, organizationId: manager.organizationId },
      include: {
        generatedScenario: { select: { id: true, status: true } },
      },
    });
    if (!rec) return fail(404, "Enregistrement introuvable.");

    let clarification: unknown = null;
    if (rec.status === RecordingStatus.WAITING_FOR_CLARIFICATION && rec.clarificationQuestions) {
      try {
        clarification = { questions: JSON.parse(rec.clarificationQuestions) };
      } catch {
        clarification = null;
      }
    }

    return ok({
      id: rec.id,
      status: rec.status,
      step: RECORDING_STATUS_LABELS[rec.status] ?? rec.status,
      detectedCallType: rec.detectedCallType,
      callTypeConfidence: rec.callTypeConfidence,
      referenceSuitabilityScore: rec.referenceSuitabilityScore,
      usableAsReference: rec.usableAsReference,
      scenarioId: rec.generatedScenario?.id ?? null,
      scenarioStatus: rec.generatedScenario?.status ?? null,
      clarification,
      error: rec.errorMessage ?? null,
    });
  });
}
