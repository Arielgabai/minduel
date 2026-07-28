import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { log, safeErrorMessage } from "./log";
import { runRecordingPipeline, markRecordingFailed } from "./recordingService";
import {
  runSimulationEvaluation,
  markSimulationEvaluationFailed,
} from "./simulationService";
import {
  preprocessRecording,
  transcribeRecording,
  analyzeReferenceCall,
  generateScenarioFromCall,
  markRecordingFailed as markReferenceCallFailed,
} from "./referenceCallService";
import { JobType, REFERENCE_CALL_JOB_TYPES } from "./jobTypes";
import { isPermanentError, PermanentJobError } from "./jobErrors";
import {
  JobStatus,
  TERMINAL_JOB_STATUSES,
  decideJobFailure,
} from "./jobStatus";

export { JobType } from "./jobTypes";
export type { JobTypeValue } from "./jobTypes";
export { PermanentJobError, isPermanentError } from "./jobErrors";
export {
  JobStatus,
  TERMINAL_JOB_STATUSES,
  isTerminalJobStatus,
  isFailedJobStatus,
  retryDelayMs,
  decideJobFailure,
} from "./jobStatus";

/**
 * File de tâches persistée dans PostgreSQL, consommée par un worker séparé
 * (`npm run worker`) et, en dev, déclenchable en ligne (endpoint /process).
 *
 * Garanties :
 * - Persistance : les tâches survivent au redémarrage (table ProcessingJob).
 * - Idempotence : unicité (type, targetId) → une seule tâche active par cible ;
 *   les traitements eux-mêmes sont idempotents (voir runRecordingPipeline).
 * - Verrouillage : claim atomique via SELECT ... FOR UPDATE SKIP LOCKED
 *   (deux workers ne traitent jamais la même tâche simultanément).
 * - Retries + backoff exponentiel plafonné, jusqu'à maxAttempts.
 * - États terminaux : une tâche COMPLETED ou FAILED_PERMANENT n'est JAMAIS
 *   relancée automatiquement (seul un retry manuel explicite la réinitialise).
 */

export interface ClaimedJob {
  id: string;
  organizationId: string;
  type: string;
  targetId: string;
  attempts: number;
  maxAttempts: number;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

/**
 * Ajoute une tâche pour une cible donnée, ou réveille une tâche en attente.
 * Idempotent, et surtout NON destructif : une tâche terminale (COMPLETED /
 * FAILED_PERMANENT) ou déjà en cours n'est pas ressuscitée. C'est ce qui évite
 * qu'un `PREPROCESS_RECORDING` rejoué ne relance un `TRANSCRIBE_RECORDING` déjà
 * en échec définitif.
 */
export async function enqueueJob(input: {
  organizationId: string;
  type: string;
  targetId: string;
  maxAttempts?: number;
}): Promise<void> {
  // Création d'abord : le cas nominal (nouvelle étape du pipeline) tient en une
  // requête, et l'unicité (type, targetId) arbitre les créations concurrentes.
  try {
    await prisma.processingJob.create({
      data: {
        organizationId: input.organizationId,
        type: input.type,
        targetId: input.targetId,
        maxAttempts: input.maxAttempts ?? 5,
        status: JobStatus.PENDING,
      },
    });
    log.info("job.enqueued", {
      type: input.type,
      targetId: input.targetId,
      organizationId: input.organizationId,
      created: true,
    });
    return;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }

  // La tâche existe : on ne réveille que celles réellement en attente. Les
  // tâches terminales et celles en cours d'exécution sont laissées telles quelles.
  const woken = await prisma.processingJob.updateMany({
    where: {
      type: input.type,
      targetId: input.targetId,
      status: { notIn: [...TERMINAL_JOB_STATUSES, JobStatus.RUNNING] },
    },
    data: { status: JobStatus.PENDING, runAfter: new Date(), lastError: null },
  });

  if (woken.count > 0) {
    log.info("job.enqueued", {
      type: input.type,
      targetId: input.targetId,
      organizationId: input.organizationId,
      created: false,
    });
    return;
  }

  const existing = await prisma.processingJob.findUnique({
    where: { type_targetId: { type: input.type, targetId: input.targetId } },
    select: { id: true, status: true, attempts: true },
  });
  log.warn("job.enqueue_ignored", {
    type: input.type,
    targetId: input.targetId,
    organizationId: input.organizationId,
    jobId: existing?.id,
    status: existing?.status,
    attempts: existing?.attempts,
    reason:
      existing && existing.status === JobStatus.RUNNING
        ? "already_running"
        : "terminal_state",
  });
}

/**
 * Retry manuel contrôlé : supprime les tâches (non actives) d'une cible pour
 * repartir d'un état propre (attempts = 0). Réservé à une action explicite du
 * manager — jamais déclenché par le chaînage automatique.
 */
export async function resetJobsForTarget(input: {
  organizationId: string;
  targetId: string;
  types: readonly string[];
}): Promise<number> {
  const res = await prisma.processingJob.deleteMany({
    where: {
      organizationId: input.organizationId,
      targetId: input.targetId,
      type: { in: [...input.types] },
      // Ne jamais retirer sous les pieds d'un worker une tâche en cours.
      status: { not: JobStatus.RUNNING },
    },
  });
  log.info("job.manual_reset", {
    organizationId: input.organizationId,
    targetId: input.targetId,
    types: input.types.join(","),
    removed: res.count,
  });
  return res.count;
}

/**
 * Réclame atomiquement la prochaine tâche exécutable (ou celle d'une cible
 * précise). Retourne null si aucune tâche disponible.
 */
export async function claimJob(input: {
  workerId: string;
  type?: string;
  targetId?: string;
}): Promise<ClaimedJob | null> {
  const rows =
    input.type && input.targetId
      ? await prisma.$queryRaw<ClaimedJob[]>(Prisma.sql`
          UPDATE "ProcessingJob"
          SET status = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${input.workerId},
              attempts = attempts + 1, "updatedAt" = now()
          WHERE id = (
            SELECT id FROM "ProcessingJob"
            WHERE status = 'PENDING' AND "runAfter" <= now()
              AND attempts < "maxAttempts"
              AND type = ${input.type} AND "targetId" = ${input.targetId}
            ORDER BY "runAfter" ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          RETURNING id, "organizationId", type, "targetId", attempts, "maxAttempts"
        `)
      : await prisma.$queryRaw<ClaimedJob[]>(Prisma.sql`
          UPDATE "ProcessingJob"
          SET status = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${input.workerId},
              attempts = attempts + 1, "updatedAt" = now()
          WHERE id = (
            SELECT id FROM "ProcessingJob"
            WHERE status = 'PENDING' AND "runAfter" <= now()
              AND attempts < "maxAttempts"
            ORDER BY "runAfter" ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          RETURNING id, "organizationId", type, "targetId", attempts, "maxAttempts"
        `);
  return rows[0] ?? null;
}

async function completeJob(id: string): Promise<void> {
  await prisma.processingJob.update({
    where: { id },
    data: {
      status: JobStatus.COMPLETED,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
}

async function failJob(
  job: ClaimedJob,
  error: string,
  permanent: boolean,
): Promise<void> {
  const decision = decideJobFailure({
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    permanent,
  });

  if (decision.terminal) {
    await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: JobStatus.FAILED_PERMANENT,
        lockedAt: null,
        lockedBy: null,
        lastError: error.slice(0, 500),
      },
    });
    if (job.type === JobType.RECORDING_PIPELINE) {
      await markRecordingFailed(job.targetId, job.organizationId, error);
    } else if (job.type === JobType.EVALUATE_SIMULATION) {
      await markSimulationEvaluationFailed(job.targetId, job.organizationId, error);
    } else if (REFERENCE_CALL_JOB_TYPES.includes(job.type)) {
      await markReferenceCallFailed(job.targetId, job.organizationId, error);
    }
    log.error("job.failed_permanent", {
      jobId: job.id,
      type: job.type,
      targetId: job.targetId,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      reason: decision.reason,
    });
    return;
  }

  await prisma.processingJob.update({
    where: { id: job.id },
    data: {
      status: JobStatus.PENDING,
      lockedAt: null,
      lockedBy: null,
      lastError: error.slice(0, 500),
      runAfter: new Date(Date.now() + decision.delayMs),
    },
  });
  log.warn("job.retry_scheduled", {
    jobId: job.id,
    type: job.type,
    targetId: job.targetId,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    delayMs: decision.delayMs,
  });
}

/** Exécute une tâche déjà réclamée (dispatch par type). */
export async function runClaimedJob(job: ClaimedJob): Promise<void> {
  const startedAt = Date.now();
  try {
    switch (job.type) {
      case JobType.RECORDING_PIPELINE:
        await runRecordingPipeline(job.targetId, job.organizationId);
        break;
      case JobType.EVALUATE_SIMULATION:
        await runSimulationEvaluation(job.targetId, job.organizationId);
        break;
      case JobType.PREPROCESS_RECORDING:
        await preprocessRecording(job.targetId, job.organizationId);
        break;
      case JobType.TRANSCRIBE_RECORDING:
        await transcribeRecording(job.targetId, job.organizationId);
        break;
      case JobType.ANALYZE_REFERENCE_CALL:
        await analyzeReferenceCall(job.targetId, job.organizationId);
        break;
      case JobType.GENERATE_SCENARIO_FROM_CALL:
        await generateScenarioFromCall(job.targetId, job.organizationId);
        break;
      default:
        // Un type inconnu ne deviendra pas connu en réessayant.
        throw new PermanentJobError(`Type de tâche inconnu : ${job.type}`);
    }
    await completeJob(job.id);
    log.info("job.completed", {
      jobId: job.id,
      type: job.type,
      targetId: job.targetId,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    await failJob(job, safeErrorMessage(err), isPermanentError(err));
  }
}

/**
 * Déclenche en ligne (best-effort) le traitement de la tâche d'une cible.
 * Utilisé en dev pour avancer sans worker séparé. Sûr en présence d'un worker
 * (le verrouillage empêche tout double traitement).
 */
export async function kickJob(input: {
  type: string;
  targetId: string;
}): Promise<void> {
  const job = await claimJob({
    workerId: "inline",
    type: input.type,
    targetId: input.targetId,
  });
  if (job) await runClaimedJob(job);
}

/** Statistiques de santé de la file (utilisées par /api/health). */
export async function jobQueueStats(): Promise<{
  pending: number;
  running: number;
  failed: number;
  oldestPendingAgeSec: number | null;
}> {
  const [pending, running, failed, oldest] = await Promise.all([
    prisma.processingJob.count({ where: { status: JobStatus.PENDING } }),
    prisma.processingJob.count({ where: { status: JobStatus.RUNNING } }),
    prisma.processingJob.count({
      where: { status: { in: [JobStatus.FAILED_PERMANENT, "FAILED"] } },
    }),
    prisma.processingJob.findFirst({
      where: { status: "PENDING" },
      orderBy: { runAfter: "asc" },
      select: { runAfter: true },
    }),
  ]);
  return {
    pending,
    running,
    failed,
    oldestPendingAgeSec: oldest
      ? Math.max(0, Math.round((Date.now() - oldest.runAfter.getTime()) / 1000))
      : null,
  };
}
