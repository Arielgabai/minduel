import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { requireTelepro } from "@/lib/auth";
import { finalizeSimulation } from "@/lib/simulationService";

const schema = z.object({
  durationSec: z.number().int().min(0).max(7200).default(0),
  abandoned: z.boolean().optional(),
});

/**
 * Finalise une simulation.
 * - Abandon : renvoie une redirection vers /app (non noté).
 * - Sinon : enfile l'évaluation (worker) et renvoie 202 + analysisUrl. Si la
 *   simulation est déjà évaluée, renvoie 200 + analysisUrl. Le client navigue
 *   TOUJOURS vers analysisUrl (jamais /app) après une réponse réussie.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireTelepro();
    const { id } = await params;
    const body = schema.parse(await req.json().catch(() => ({})));

    const result = await finalizeSimulation({
      simulationId: id,
      organizationId: user.organizationId,
      durationSec: body.durationSec,
      abandoned: body.abandoned,
    });

    if (result.kind === "abandoned") {
      return ok({ simulationId: id, abandoned: true, redirect: "/app" });
    }

    if (result.kind === "completed") {
      return ok({
        simulationId: id,
        evaluationStatus: "COMPLETED",
        analysisUrl: result.analysisUrl,
      });
    }

    // Évaluation enfilée : 202 Accepted.
    return ok(
      {
        simulationId: id,
        evaluationStatus: "PENDING",
        analysisUrl: result.analysisUrl,
      },
      202,
    );
  });
}
