import { handle, ok, fail } from "@/lib/api";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueJob, kickJob, JobType } from "@/lib/jobs";

/**
 * Fait avancer le traitement d'un enregistrement puis renvoie son statut.
 * En production, le worker traite la file en continu ; cet endpoint (utilisé par
 * le polling client) déclenche aussi un traitement EN LIGNE best-effort afin que
 * le dev local fonctionne sans worker séparé. Le verrouillage de la file empêche
 * tout double traitement.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const manager = await requireManager();
    const { id } = await params;

    const rec = await prisma.callRecording.findFirst({
      where: { id, organizationId: manager.organizationId },
      select: { id: true, status: true },
    });
    if (!rec) return fail(404, "Enregistrement introuvable.");

    // S'assure qu'une tâche existe (idempotent) puis tente de l'exécuter en ligne.
    await enqueueJob({
      organizationId: manager.organizationId,
      type: JobType.RECORDING_PIPELINE,
      targetId: id,
    });
    await kickJob({ type: JobType.RECORDING_PIPELINE, targetId: id });

    const updated = await prisma.callRecording.findFirst({
      where: { id, organizationId: manager.organizationId },
      select: { status: true },
    });
    return ok({ status: updated?.status ?? rec.status });
  });
}
