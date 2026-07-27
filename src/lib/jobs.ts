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

export { JobType } from "./jobTypes";
export type { JobTypeValue } from "./jobTypes";

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
 */

export interface ClaimedJob {
  id: string;
  organizationId: string;
  type: string;
  targetId: string;
  attempts: number;
  maxAttempts: number;
}

/** Ajoute (ou réactive) une tâche pour une cible donnée. Idempotent. */
export async function enqueueJob(input: {
  organizationId: string;
  type: string;
  targetId: string;
  maxAttempts?: number;
}): Promise<void> {
  await prisma.processingJob.upsert({
    where: { type_targetId: { type: input.type, targetId: input.targetId } },
    create: {
      organizationId: input.organizationId,
      type: input.type,
      targetId: input.targetId,
      maxAttempts: input.maxAttempts ?? 5,
      status: "PENDING",
    },
    update: {
      status: "PENDING",
      runAfter: new Date(),
      lastError: null,
    },
  });
  log.info("job.enqueued", {
    type: input.type,
    targetId: input.targetId,
    organizationId: input.organizationId,
  });
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
    data: { status: "COMPLETED", lockedAt: null, lockedBy: null, lastError: null },
  });
}

async function failJob(job: ClaimedJob, error: string): Promise<void> {
  const permanent = job.attempts >= job.maxAttempts;
  if (permanent) {
    await prisma.processingJob.update({
      where: { id: job.id },
      data: { status: "FAILED", lockedAt: null, lockedBy: null, lastError: error.slice(0, 500) },
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
    });
  } else {
    // Backoff exponentiel plafonné (5s, 10s, 20s, 40s… max 5 min).
    const delayMs = Math.min(5_000 * 2 ** (job.attempts - 1), 300_000);
    await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: "PENDING",
        lockedAt: null,
        lockedBy: null,
        lastError: error.slice(0, 500),
        runAfter: new Date(Date.now() + delayMs),
      },
    });
    log.warn("job.retry_scheduled", {
      jobId: job.id,
      type: job.type,
      targetId: job.targetId,
      attempts: job.attempts,
      delayMs,
    });
  }
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
        throw new Error(`Type de tâche inconnu : ${job.type}`);
    }
    await completeJob(job.id);
    log.info("job.completed", {
      jobId: job.id,
      type: job.type,
      targetId: job.targetId,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    await failJob(job, safeErrorMessage(err));
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
    prisma.processingJob.count({ where: { status: "PENDING" } }),
    prisma.processingJob.count({ where: { status: "RUNNING" } }),
    prisma.processingJob.count({ where: { status: "FAILED" } }),
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
