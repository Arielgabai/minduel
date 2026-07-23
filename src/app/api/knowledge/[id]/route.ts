import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, ok, fail } from "@/lib/api";
import { requireManager } from "@/lib/auth";
import { nowIso } from "@/lib/utils";
import { ReviewStatus } from "@/lib/enums";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  reviewStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  enabled: z.boolean().optional(),
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(2000).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const manager = await requireManager();
    const { id } = await params;
    const body = schema.parse(await req.json());

    const item = await prisma.knowledgeItem.findFirst({
      where: { id, organizationId: manager.organizationId },
    });
    if (!item) return fail(404, "Connaissance introuvable.");

    const updated = await prisma.knowledgeItem.update({
      where: { id },
      data: {
        reviewStatus: body.reviewStatus ?? item.reviewStatus,
        enabled: typeof body.enabled === "boolean" ? body.enabled : item.enabled,
        title: body.title ?? item.title,
        content: body.content ?? item.content,
        updatedAt: nowIso(),
      },
    });

    if (body.reviewStatus === ReviewStatus.APPROVED) {
      await logAudit({
        organizationId: manager.organizationId,
        actorId: manager.id,
        action: "KNOWLEDGE_APPROVE",
        targetType: "KnowledgeItem",
        targetId: id,
      });
    } else if (body.reviewStatus === ReviewStatus.REJECTED) {
      await logAudit({
        organizationId: manager.organizationId,
        actorId: manager.id,
        action: "KNOWLEDGE_REJECT",
        targetType: "KnowledgeItem",
        targetId: id,
      });
    }

    return ok({
      id: updated.id,
      reviewStatus: updated.reviewStatus,
      enabled: updated.enabled,
      title: updated.title,
      content: updated.content,
    });
  });
}
