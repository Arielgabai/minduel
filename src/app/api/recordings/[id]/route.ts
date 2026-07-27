import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, ok, fail } from "@/lib/api";
import { requireManager } from "@/lib/auth";
import { getAudioStorage } from "@/lib/providers";
import { nowIso } from "@/lib/utils";
import { RecordingStatus } from "@/lib/enums";
import { logAudit } from "@/lib/audit";
import { enqueueJob, JobType } from "@/lib/jobs";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  retry: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const manager = await requireManager();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const rec = await prisma.callRecording.findFirst({
      where: { id, organizationId: manager.organizationId },
    });
    if (!rec) return fail(404, "Enregistrement introuvable.");

    // Relance d'un traitement en erreur.
    if (body.retry) {
      if (rec.status !== RecordingStatus.FAILED) {
        return fail(400, "Seul un traitement en échec peut être relancé.");
      }
      await prisma.callRecording.update({
        where: { id },
        data: { status: RecordingStatus.UPLOADED, errorMessage: null, updatedAt: nowIso() },
      });
      // Re-planifie le traitement dans la file persistante, au bon point d'entrée.
      await enqueueJob({
        organizationId: manager.organizationId,
        type: rec.useAsModel ? JobType.PREPROCESS_RECORDING : JobType.RECORDING_PIPELINE,
        targetId: id,
      });
      return ok({ status: RecordingStatus.UPLOADED });
    }

    // Activation / désactivation dans la base utilisée par les simulations.
    if (typeof body.enabled === "boolean") {
      await prisma.callRecording.update({
        where: { id },
        data: { enabled: body.enabled, updatedAt: nowIso() },
      });
      return ok({ enabled: body.enabled });
    }

    return ok({});
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const manager = await requireManager();
    const { id } = await params;

    const rec = await prisma.callRecording.findFirst({
      where: { id, organizationId: manager.organizationId },
    });
    if (!rec) return fail(404, "Enregistrement introuvable.");

    // Suppression réelle du fichier audio du stockage privé.
    if (rec.storageKey) {
      await getAudioStorage().deleteObject(rec.storageKey);
    }

    // Suppression en cascade du transcript et des connaissances dérivées
    // (onDelete: Cascade / SetNull dans le schéma). On supprime aussi les
    // KnowledgeItem liés pour ne conserver aucune connaissance dérivée.
    await prisma.knowledgeItem.deleteMany({ where: { recordingId: id } });
    await prisma.callRecording.delete({ where: { id } });

    await logAudit({
      organizationId: manager.organizationId,
      actorId: manager.id,
      action: "DELETE_RECORDING",
      targetType: "CallRecording",
      targetId: id,
      metadata: { title: rec.title },
    });

    return ok({ deleted: true });
  });
}
