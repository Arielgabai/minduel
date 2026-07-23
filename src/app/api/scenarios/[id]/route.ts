import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, ok, fail } from "@/lib/api";
import { requireManager } from "@/lib/auth";
import { nowIso, stringifyJson } from "@/lib/utils";

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

    const scenario = await prisma.scenario.findFirst({
      where: { id, organizationId: manager.organizationId },
    });
    if (!scenario) return fail(404, "Scénario introuvable.");

    const updated = await prisma.scenario.update({
      where: { id },
      data: {
        name: body.name ?? scenario.name,
        callType: body.callType ?? scenario.callType,
        level: body.level ?? scenario.level,
        campaign: body.campaign !== undefined ? body.campaign : scenario.campaign,
        offer: body.offer !== undefined ? body.offer : scenario.offer,
        prospectProfile: body.prospectProfile !== undefined ? body.prospectProfile : scenario.prospectProfile,
        initialSituation: body.initialSituation !== undefined ? body.initialSituation : scenario.initialSituation,
        objective: body.objective !== undefined ? body.objective : scenario.objective,
        personality: body.personality !== undefined ? body.personality : scenario.personality,
        allowedObjections: body.allowedObjections ? stringifyJson(body.allowedObjections) : scenario.allowedObjections,
        secretInfos: body.secretInfos ? stringifyJson(body.secretInfos) : scenario.secretInfos,
        successConditions: body.successConditions !== undefined ? body.successConditions : scenario.successConditions,
        failureConditions: body.failureConditions !== undefined ? body.failureConditions : scenario.failureConditions,
        targetDurationSec: body.targetDurationSec ?? scenario.targetDurationSec,
        knowledgeRefs: body.knowledgeRefs ? stringifyJson(body.knowledgeRefs) : scenario.knowledgeRefs,
        status: body.status ?? scenario.status,
        updatedAt: nowIso(),
      },
    });

    return ok({ id: updated.id, status: updated.status });
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const manager = await requireManager();
    const { id } = await params;
    const scenario = await prisma.scenario.findFirst({
      where: { id, organizationId: manager.organizationId },
    });
    if (!scenario) return fail(404, "Scénario introuvable.");
    await prisma.scenario.delete({ where: { id } });
    return ok({ deleted: true });
  });
}
