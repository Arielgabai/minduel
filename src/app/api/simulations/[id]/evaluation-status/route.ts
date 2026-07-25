import { handle, ok } from "@/lib/api";
import { requireTelepro, HttpError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serverConfig } from "@/lib/config";
import { kickJob, JobType } from "@/lib/jobs";
import { analysisUrlFor } from "@/lib/simulationService";
import { EVALUATION_IN_PROGRESS_STATUSES, SimulationStatus } from "@/lib/enums";

/**
 * Evaluation status of a simulation (polled by the analysis page every 2s while
 * the status is PENDING/EVALUATING).
 *
 * In DEVELOPMENT ONLY, also kicks the job inline (best-effort) so local works
 * without a separate worker. In production the evaluation is handled by the
 * dedicated worker (`npm run worker`); without it the status stays PENDING and
 * the UI shows it (it never silently returns to /app).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireTelepro();
    const { id } = await params;

    const sim = await prisma.simulation.findFirst({
      where: { id, organizationId: user.organizationId, teleproId: user.id },
      select: { id: true, status: true },
    });
    if (!sim) throw new HttpError(404, "Simulation introuvable.");

    if (
      EVALUATION_IN_PROGRESS_STATUSES.includes(sim.status) &&
      serverConfig.nodeEnv !== "production"
    ) {
      await kickJob({
        type: JobType.EVALUATE_SIMULATION,
        targetId: id,
      }).catch(() => {});
    }

    const fresh = await prisma.simulation.findFirst({
      where: { id, organizationId: user.organizationId, teleproId: user.id },
      select: { status: true, evaluation: { select: { id: true } } },
    });
    const status = fresh?.status ?? sim.status;
    const ready = !!fresh?.evaluation && status === SimulationStatus.COMPLETED;

    let error: string | null = null;
    if (status === SimulationStatus.EVALUATION_FAILED) {
      const job = await prisma.processingJob.findUnique({
        where: {
          type_targetId: { type: JobType.EVALUATE_SIMULATION, targetId: id },
        },
        select: { lastError: true },
      });
      error = cleanError(job?.lastError) ?? "L'\u00e9valuation a \u00e9chou\u00e9.";
    }

    return ok({
      simulationId: id,
      status,
      ready,
      analysisUrl: analysisUrlFor(id),
      error,
    });
  });
}

function cleanError(msg?: string | null): string | null {
  if (!msg) return null;
  return msg.replace(/\s+/g, " ").trim().slice(0, 200) || null;
}