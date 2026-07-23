import { handle, ok, fail } from "@/lib/api";
import { requireManager } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPersonaForScenario, opener, prospectNameFor } from "@/lib/simulationService";

/** Prévisualisation réservée au manager : persona + réplique d'ouverture. */
export async function POST(
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

    const prospectName = prospectNameFor(scenario.id);
    const persona = await getPersonaForScenario(id, manager.organizationId, prospectName);

    return ok({
      prospectName,
      opener: opener(scenario.level),
      persona,
    });
  });
}
