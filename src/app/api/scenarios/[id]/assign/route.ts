import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, ok, fail } from "@/lib/api";
import { requireManager } from "@/lib/auth";
import { ScenarioStatus } from "@/lib/enums";
import { nowIso } from "@/lib/utils";

const schema = z.object({
  teleproIds: z.array(z.string().uuid()),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const manager = await requireManager();
    const { id } = await params;
    const { teleproIds } = schema.parse(await req.json());

    const scenario = await prisma.scenario.findFirst({
      where: { id, organizationId: manager.organizationId },
    });
    if (!scenario) return fail(404, "Scénario introuvable.");
    if (scenario.status === ScenarioStatus.ARCHIVED) {
      return fail(409, "Scénario archivé : assignation interdite.");
    }
    if (scenario.status !== ScenarioStatus.PUBLISHED) {
      return fail(400, "Publie le scénario avant de l'assigner.");
    }

    // Vérifie que les télépros appartiennent bien à l'organisation.
    const valid = await prisma.user.findMany({
      where: { id: { in: teleproIds }, organizationId: manager.organizationId, role: "TELEPRO" },
      select: { id: true },
    });
    const validIds = new Set(valid.map((v) => v.id));
    const now = nowIso();

    // Récupère les assignations existantes pour ce scénario.
    const existing = await prisma.scenarioAssignment.findMany({
      where: { scenarioId: id },
      select: { teleproId: true },
    });
    const existingIds = new Set(existing.map((e) => e.teleproId));

    // Ajoute les nouvelles assignations.
    const toCreate = [...validIds].filter((tid) => !existingIds.has(tid));
    for (const teleproId of toCreate) {
      await prisma.scenarioAssignment.create({
        data: {
          organizationId: manager.organizationId,
          scenarioId: id,
          teleproId,
          managerId: manager.id,
          status: "ASSIGNED",
          createdAt: now,
        },
      });
    }

    // Retire les assignations décochées (si non commencées).
    const toRemove = [...existingIds].filter((tid) => !validIds.has(tid));
    if (toRemove.length > 0) {
      await prisma.scenarioAssignment.deleteMany({
        where: { scenarioId: id, teleproId: { in: toRemove }, status: "ASSIGNED" },
      });
    }

    return ok({ assigned: [...validIds] });
  });
}
