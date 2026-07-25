import { handle, ok, fail, getClientIp } from "@/lib/api";
import { requireTelepro, HttpError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";
import { log } from "@/lib/log";
import { JobType } from "@/lib/jobs";
import { analysisUrlFor } from "@/lib/simulationService";
import { SimulationStatus } from "@/lib/enums";

/**
 * Retry a simulation evaluation after a permanent failure.
 *
 * Conditions:
 * - same user (owning telepro) and same organization;
 * - no evaluation already completed;
 * - no run already in progress (RUNNING job);
 * - rate limited;
 * - idempotent thanks to the queue's (type, targetId) uniqueness.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireTelepro();
    const { id } = await params;

    const rl = rateLimit(`retry-eval:${user.id}:${getClientIp(req)}`, 5, 60_000);
    if (!rl.allowed) {
      return fail(429, "Trop de relances. R\u00e9essaie dans une minute.");
    }

    const sim = await prisma.simulation.findFirst({
      where: { id, organizationId: user.organizationId, teleproId: user.id },
      select: {
        id: true,
        organizationId: true,
        evaluation: { select: { id: true } },
      },
    });
    if (!sim) throw new HttpError(404, "Simulation introuvable.");

    if (sim.evaluation) {
      return ok({
        simulationId: id,
        evaluationStatus: "COMPLETED",
        analysisUrl: analysisUrlFor(id),
      });
    }

    const job = await prisma.processingJob.findUnique({
      where: {
        type_targetId: { type: JobType.EVALUATE_SIMULATION, targetId: id },
      },
      select: { status: true },
    });
    if (job?.status === "RUNNING") {
      throw new HttpError(409, "Une \u00e9valuation est d\u00e9j\u00e0 en cours.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.processingJob.upsert({
        where: {
          type_targetId: { type: JobType.EVALUATE_SIMULATION, targetId: id },
        },
        create: {
          organizationId: sim.organizationId,
          type: JobType.EVALUATE_SIMULATION,
          targetId: id,
          status: "PENDING",
          maxAttempts: 5,
        },
        update: {
          status: "PENDING",
          attempts: 0,
          runAfter: new Date(),
          lastError: null,
        },
      });
      await tx.simulation.update({
        where: { id },
        data: {
          status: SimulationStatus.EVALUATION_PENDING,
          updatedAt: new Date().toISOString(),
        },
      });
    });

    log.info("evaluation.retry_requested", {
      organizationId: sim.organizationId,
      simulationId: id,
      userId: user.id,
    });

    return ok(
      {
        simulationId: id,
        evaluationStatus: "PENDING",
        analysisUrl: analysisUrlFor(id),
      },
      202,
    );
  });
}