import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api";
import { requireManager } from "@/lib/auth";
import { nowIso, stringifyJson } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(2).max(160),
  callType: z.enum(["VENTE", "PITCH_INVESTISSEUR", "ENTRETIEN_EMBAUCHE"]).default("VENTE"),
  level: z.enum(["FACILE", "MOYEN", "DIFFICILE"]).default("MOYEN"),
  campaign: z.string().max(160).optional(),
  offer: z.string().max(1000).optional(),
  prospectProfile: z.string().max(1000).optional(),
  initialSituation: z.string().max(1000).optional(),
  objective: z.string().max(1000).optional(),
  personality: z.string().max(1000).optional(),
  allowedObjections: z.array(z.string()).default([]),
  secretInfos: z.array(z.object({ question: z.string(), answer: z.string() })).default([]),
  successConditions: z.string().max(1000).optional(),
  failureConditions: z.string().max(1000).optional(),
  targetDurationSec: z.number().int().min(60).max(1800).default(300),
  knowledgeRefs: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  return handle(async () => {
    const manager = await requireManager();
    const body = schema.parse(await req.json());
    const now = nowIso();

    const scenario = await prisma.scenario.create({
      data: {
        organizationId: manager.organizationId,
        authorId: manager.id,
        name: body.name,
        callType: body.callType,
        level: body.level,
        campaign: body.campaign ?? null,
        offer: body.offer ?? null,
        prospectProfile: body.prospectProfile ?? null,
        initialSituation: body.initialSituation ?? null,
        objective: body.objective ?? null,
        personality: body.personality ?? null,
        allowedObjections: stringifyJson(body.allowedObjections),
        secretInfos: stringifyJson(body.secretInfos),
        successConditions: body.successConditions ?? null,
        failureConditions: body.failureConditions ?? null,
        targetDurationSec: body.targetDurationSec,
        knowledgeRefs: stringifyJson(body.knowledgeRefs),
        status: "DRAFT",
        createdAt: now,
        updatedAt: now,
      },
    });

    return ok({ id: scenario.id }, 201);
  });
}
