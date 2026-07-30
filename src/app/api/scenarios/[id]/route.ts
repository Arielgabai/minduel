import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, ok, fail } from "@/lib/api";
import { requireManager } from "@/lib/auth";
import { ScenarioStatus } from "@/lib/enums";
import { nowIso, stringifyJson } from "@/lib/utils";
import { applyManagerScenarioPatch } from "@/lib/scenarioPromptPublication";

const schema = z.object({
  name: z.string().min(2).max(160).optional(),
  callType: z.enum(["VENTE", "PITCH_INVESTISSEUR", "ENTRETIEN_EMBAUCHE"]).optional(),
  level: z.enum(["FACILE", "MOYEN", "DIFFICILE"]).optional(),
  campaign: z.string().max(160).nullable().optional(),
  offer: z.string().max(1000).nullable().optional(),
  prospectProfile: z.string().max(1000).nullable().optional(),
  initialSituation: z.string().max(1000).nullable().optional(),
  objective: z.string().max(1000).nullable().optional(),
  personality: z.string().max(1000).nullable().optional(),
  allowedObjections: z.array(z.string()).optional(),
  secretInfos: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  successConditions: z.string().max(1000).nullable().optional(),
  failureConditions: z.string().max(1000).nullable().optional(),
  targetDurationSec: z.number().int().min(60).max(1800).optional(),
  knowledgeRefs: z.array(z.string()).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const manager = await requireManager();
    const { id } = await params;
    const body = schema.parse(await req.json());

    const result = await applyManagerScenarioPatch({
      organizationId: manager.organizationId,
      actorId: manager.id,
      scenarioId: id,
      patch: body,
    });
    return ok({ id: result.id, status: result.status });
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const manager = await requireManager();
    const { id } = await params;

    const outcome = await prisma.$transaction(async (tx) => {
      const scenario = await tx.scenario.findFirst({
        where: { id, organizationId: manager.organizationId },
      });
      if (!scenario) return { kind: "not_found" as const };
      if (scenario.status === ScenarioStatus.ARCHIVED) {
        return { kind: "already" as const, id: scenario.id };
      }

      const previousStatus = scenario.status;

      const result = await tx.scenario.updateMany({
        where: {
          id,
          organizationId: manager.organizationId,
          status: { not: ScenarioStatus.ARCHIVED },
        },
        data: {
          status: ScenarioStatus.ARCHIVED,
          updatedAt: nowIso(),
        },
      });

      if (result.count === 1) {
        await tx.auditEvent.create({
          data: {
            organizationId: manager.organizationId,
            actorId: manager.id,
            action: "EXERCISE_ARCHIVE",
            targetType: "Scenario",
            targetId: scenario.id,
            metadata: stringifyJson({ previousStatus }),
            createdAt: nowIso(),
          },
        });
        return { kind: "archived" as const, id: scenario.id };
      }

      const again = await tx.scenario.findFirst({
        where: { id, organizationId: manager.organizationId },
      });
      if (again?.status === ScenarioStatus.ARCHIVED) {
        return { kind: "already" as const, id: again.id };
      }
      return { kind: "not_found" as const };
    });

    if (outcome.kind === "not_found") {
      return fail(404, "Scénario introuvable.");
    }

    return ok({
      id: outcome.id,
      status: ScenarioStatus.ARCHIVED,
      archived: true,
    });
  });
}
