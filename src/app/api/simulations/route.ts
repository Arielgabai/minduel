import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, ok, fail } from "@/lib/api";
import { requireTelepro } from "@/lib/auth";
import { nowIso } from "@/lib/utils";
import { isDemoMode } from "@/lib/config";
import {
  PromptBundleStatus,
  ScenarioStatus,
  SimulationMode,
  SimulationStatus,
} from "@/lib/enums";
import { opener, prospectNameFor } from "@/lib/simulationService";
import {
  parsePromptArtifacts,
  verifyPromptArtifactsHash,
} from "@/lib/promptArtifacts";

const schema = z.object({ scenarioId: z.string().uuid() });

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireTelepro();
    const { scenarioId } = schema.parse(await req.json());

    const scenario = await prisma.scenario.findFirst({
      where: { id: scenarioId, organizationId: user.organizationId },
    });
    if (!scenario) {
      return fail(404, "Scénario introuvable ou non publié.");
    }
    if (scenario.status === ScenarioStatus.ARCHIVED) {
      return fail(403, "Ce scénario est archivé.");
    }
    if (scenario.status !== ScenarioStatus.PUBLISHED) {
      return fail(404, "Scénario introuvable ou non publié.");
    }

    const assignment = await prisma.scenarioAssignment.findFirst({
      where: { scenarioId, teleproId: user.id },
    });
    if (!assignment) return fail(403, "Ce scénario ne t'est pas assigné.");

    if (!scenario.publishedPromptBundleId) {
      return fail(409, "Aucun bundle de prompts publié pour ce scénario.");
    }

    const bundle = await prisma.promptBundle.findFirst({
      where: {
        id: scenario.publishedPromptBundleId,
        organizationId: user.organizationId,
        scenarioId: scenario.id,
        status: PromptBundleStatus.PUBLISHED,
      },
    });
    if (!bundle) {
      return fail(409, "Bundle de prompts publié invalide pour ce scénario.");
    }

    let artifacts;
    try {
      artifacts = parsePromptArtifacts(bundle.artifacts);
    } catch {
      return fail(409, "Bundle de prompts incohérent.");
    }
    if (!verifyPromptArtifactsHash(artifacts, bundle.contentHash)) {
      return fail(409, "Bundle de prompts incohérent.");
    }

    const now = nowIso();
    const prospectName = prospectNameFor(scenarioId + user.id + now);

    const sim = await prisma.simulation.create({
      data: {
        organizationId: user.organizationId,
        scenarioId,
        teleproId: user.id,
        mode: isDemoMode() ? SimulationMode.DEMO : SimulationMode.REALTIME,
        status: SimulationStatus.CREATED,
        prospectName,
        promptBundleId: bundle.id,
        promptBundleVersion: bundle.version,
        promptContentHash: bundle.contentHash,
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Réplique d'ouverture du prospect (mode démo).
    const openingLine = opener(scenario.level);
    await prisma.simulationTurn.create({
      data: {
        simulationId: sim.id,
        role: "PROSPECT",
        content: openingLine,
        atMs: 1000,
        createdAt: now,
      },
    });

    if (assignment.status === "ASSIGNED") {
      await prisma.scenarioAssignment.update({
        where: { id: assignment.id },
        data: { status: "IN_PROGRESS" },
      });
    }

    return ok(
      {
        id: sim.id,
        prospectName,
        mode: sim.mode,
        demo: isDemoMode(),
        opener: openingLine,
        level: scenario.level,
        scenarioName: scenario.name,
      },
      201,
    );
  });
}
