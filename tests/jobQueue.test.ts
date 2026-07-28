import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  JobStatus,
  decideJobFailure,
  isTerminalJobStatus,
  retryDelayMs,
} from "@/lib/jobStatus";
import {
  PermanentJobError,
  isPermanentError,
  httpFailureToError,
  isRetriableHttpStatus,
} from "@/lib/jobErrors";

/**
 * Régression du bug de production : un TRANSCRIBE_RECORDING marqué
 * job.failed_permanent à la tentative 6 était ressuscité par la complétion
 * (rejouée) de PREPROCESS_RECORDING, puis repartait à la tentative 7.
 */

interface Row {
  id: string;
  organizationId: string;
  type: string;
  targetId: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
}

let rows: Row[] = [];
let seq = 0;

type Where = Record<string, unknown>;

function matches(r: Row, where: Where | undefined): boolean {
  if (!where) return true;
  const key = where.type_targetId as { type: string; targetId: string } | undefined;
  if (key && (r.type !== key.type || r.targetId !== key.targetId)) return false;
  if (typeof where.id === "string" && r.id !== where.id) return false;
  if (typeof where.organizationId === "string" && r.organizationId !== where.organizationId) {
    return false;
  }
  if (typeof where.targetId === "string" && r.targetId !== where.targetId) return false;

  const type = where.type as string | { in?: string[] } | undefined;
  if (typeof type === "string" && r.type !== type) return false;
  if (type && typeof type === "object" && type.in && !type.in.includes(r.type)) return false;

  const status = where.status as
    | string
    | { in?: string[]; notIn?: string[]; not?: string }
    | undefined;
  if (typeof status === "string" && r.status !== status) return false;
  if (status && typeof status === "object") {
    if (status.in && !status.in.includes(r.status)) return false;
    if (status.notIn && status.notIn.includes(r.status)) return false;
    if (status.not && r.status === status.not) return false;
  }
  return true;
}

const processingJob = {
  create: async ({ data }: { data: Partial<Row> }) => {
    const dup = rows.find(
      (r) => r.type === data.type && r.targetId === data.targetId,
    );
    if (dup) {
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      });
    }
    const row: Row = {
      id: `job-${++seq}`,
      organizationId: data.organizationId ?? "org-1",
      type: data.type ?? "",
      targetId: data.targetId ?? "",
      status: data.status ?? JobStatus.PENDING,
      attempts: data.attempts ?? 0,
      maxAttempts: data.maxAttempts ?? 5,
      runAfter: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    };
    rows.push(row);
    return row;
  },
  update: async ({ where, data }: { where: Where; data: Partial<Row> }) => {
    const row = rows.find((r) => matches(r, where));
    if (!row) throw new Error("row not found");
    Object.assign(row, data);
    return row;
  },
  updateMany: async ({ where, data }: { where?: Where; data: Partial<Row> }) => {
    const hit = rows.filter((r) => matches(r, where));
    hit.forEach((r) => Object.assign(r, data));
    return { count: hit.length };
  },
  findUnique: async ({ where }: { where: Where }) =>
    rows.find((r) => matches(r, where)) ?? null,
  deleteMany: async ({ where }: { where?: Where }) => {
    const keep = rows.filter((r) => !matches(r, where));
    const count = rows.length - keep.length;
    rows = keep;
    return { count };
  },
};

vi.mock("@/lib/db", () => ({ prisma: { processingJob } }));

// Les services métier ne sont pas le sujet : on isole la file.
const transcribeRecording = vi.fn();
const markReferenceCallFailed = vi.fn();
vi.mock("@/lib/recordingService", () => ({
  runRecordingPipeline: vi.fn(),
  markRecordingFailed: vi.fn(),
}));
vi.mock("@/lib/simulationService", () => ({
  runSimulationEvaluation: vi.fn(),
  markSimulationEvaluationFailed: vi.fn(),
}));
vi.mock("@/lib/referenceCallService", () => ({
  preprocessRecording: vi.fn(),
  transcribeRecording: (...a: unknown[]) => transcribeRecording(...a),
  analyzeReferenceCall: vi.fn(),
  generateScenarioFromCall: vi.fn(),
  markRecordingFailed: (...a: unknown[]) => markReferenceCallFailed(...a),
}));

const ORG = "org-1";
const REC = "rec-1";

function seed(row: Partial<Row> & { type: string }): Row {
  const full: Row = {
    id: `job-${++seq}`,
    organizationId: ORG,
    targetId: REC,
    status: JobStatus.PENDING,
    attempts: 0,
    maxAttempts: 6,
    runAfter: new Date(),
    lockedAt: null,
    lockedBy: null,
    lastError: null,
    ...row,
  };
  rows.push(full);
  return full;
}

beforeEach(() => {
  rows = [];
  seq = 0;
  transcribeRecording.mockReset();
  markReferenceCallFailed.mockReset();
});

describe("machine à états de la file (logique pure)", () => {
  it("planifie un retry borné tant que les tentatives restent disponibles", () => {
    const d = decideJobFailure({ attempts: 2, maxAttempts: 6, permanent: false });
    expect(d.terminal).toBe(false);
    if (!d.terminal) expect(d.delayMs).toBe(10_000);
  });

  it("plafonne le backoff à 5 minutes", () => {
    expect(retryDelayMs(1)).toBe(5_000);
    expect(retryDelayMs(4)).toBe(40_000);
    expect(retryDelayMs(50)).toBe(300_000);
  });

  it("échoue définitivement quand les tentatives sont épuisées", () => {
    const d = decideJobFailure({ attempts: 6, maxAttempts: 6, permanent: false });
    expect(d).toEqual({ terminal: true, reason: "attempts_exhausted" });
  });

  it("échoue immédiatement sur erreur permanente, sans consommer six tentatives", () => {
    const d = decideJobFailure({ attempts: 1, maxAttempts: 6, permanent: true });
    expect(d).toEqual({ terminal: true, reason: "permanent_error" });
  });

  it("considère COMPLETED, FAILED_PERMANENT et l'ancien FAILED comme terminaux", () => {
    expect(isTerminalJobStatus(JobStatus.COMPLETED)).toBe(true);
    expect(isTerminalJobStatus(JobStatus.FAILED_PERMANENT)).toBe(true);
    expect(isTerminalJobStatus("FAILED")).toBe(true);
    expect(isTerminalJobStatus(JobStatus.PENDING)).toBe(false);
    expect(isTerminalJobStatus(JobStatus.RUNNING)).toBe(false);
  });
});

describe("classification des erreurs", () => {
  it("traite 400 comme permanent (configuration/validation)", () => {
    const err = httpFailureToError(400, "chunking_strategy is not supported with this model");
    expect(err).toBeInstanceOf(PermanentJobError);
    expect(isPermanentError(err)).toBe(true);
  });

  it("traite 429 et 5xx comme rejouables", () => {
    expect(isRetriableHttpStatus(429)).toBe(true);
    expect(isRetriableHttpStatus(503)).toBe(true);
    expect(isPermanentError(httpFailureToError(429, "rate limited"))).toBe(false);
    expect(isPermanentError(httpFailureToError(500, "server error"))).toBe(false);
  });

  it("traite 401/403/422 comme permanents", () => {
    for (const status of [401, 403, 422]) {
      expect(isPermanentError(httpFailureToError(status, "nope"))).toBe(true);
    }
  });
});

describe("séquence de production : job permanent relancé", () => {
  it("marque FAILED_PERMANENT à l'épuisement des tentatives", async () => {
    const { runClaimedJob, JobType } = await import("@/lib/jobs");
    const row = seed({
      type: JobType.TRANSCRIBE_RECORDING,
      status: JobStatus.RUNNING,
      attempts: 6,
      maxAttempts: 6,
    });
    transcribeRecording.mockRejectedValue(new Error("OpenAI transcription error 400"));

    await runClaimedJob({
      id: row.id,
      organizationId: ORG,
      type: JobType.TRANSCRIBE_RECORDING,
      targetId: REC,
      attempts: 6,
      maxAttempts: 6,
    });

    expect(row.status).toBe(JobStatus.FAILED_PERMANENT);
    expect(markReferenceCallFailed).toHaveBeenCalledOnce();
  });

  it("ne ressuscite PAS le job terminal quand PREPROCESS_RECORDING se re-termine", async () => {
    const { enqueueJob, JobType } = await import("@/lib/jobs");
    const row = seed({
      type: JobType.TRANSCRIBE_RECORDING,
      status: JobStatus.FAILED_PERMANENT,
      attempts: 6,
      maxAttempts: 6,
      lastError: "OpenAI transcription error 400",
    });

    // C'est exactement ce que faisait l'étape amont rejouée en production.
    await enqueueJob({
      organizationId: ORG,
      type: JobType.TRANSCRIBE_RECORDING,
      targetId: REC,
    });

    expect(row.status).toBe(JobStatus.FAILED_PERMANENT);
    expect(row.attempts).toBe(6); // ni 7, ni remise à zéro
    expect(rows).toHaveLength(1); // aucune tâche parallèle créée
  });

  it("ne recrée pas non plus de doublon pour une tâche déjà terminée", async () => {
    const { enqueueJob, JobType } = await import("@/lib/jobs");
    const row = seed({
      type: JobType.TRANSCRIBE_RECORDING,
      status: JobStatus.COMPLETED,
      attempts: 1,
    });

    await enqueueJob({
      organizationId: ORG,
      type: JobType.TRANSCRIBE_RECORDING,
      targetId: REC,
    });

    expect(row.status).toBe(JobStatus.COMPLETED);
    expect(rows).toHaveLength(1);
  });

  it("échoue dès la première tentative sur une erreur permanente (pas six retries)", async () => {
    const { runClaimedJob, JobType } = await import("@/lib/jobs");
    const row = seed({
      type: JobType.TRANSCRIBE_RECORDING,
      status: JobStatus.RUNNING,
      attempts: 1,
      maxAttempts: 6,
    });
    transcribeRecording.mockRejectedValue(
      new PermanentJobError("chunking_strategy is not supported with this model"),
    );

    await runClaimedJob({
      id: row.id,
      organizationId: ORG,
      type: JobType.TRANSCRIBE_RECORDING,
      targetId: REC,
      attempts: 1,
      maxAttempts: 6,
    });

    expect(row.status).toBe(JobStatus.FAILED_PERMANENT);
  });

  it("replanifie avec backoff une erreur rejouable", async () => {
    const { runClaimedJob, JobType } = await import("@/lib/jobs");
    const row = seed({
      type: JobType.TRANSCRIBE_RECORDING,
      status: JobStatus.RUNNING,
      attempts: 1,
      maxAttempts: 6,
    });
    transcribeRecording.mockRejectedValue(new Error("OpenAI transcription error 503"));

    await runClaimedJob({
      id: row.id,
      organizationId: ORG,
      type: JobType.TRANSCRIBE_RECORDING,
      targetId: REC,
      attempts: 1,
      maxAttempts: 6,
    });

    expect(row.status).toBe(JobStatus.PENDING);
    expect(row.runAfter.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("enqueue idempotent et retry manuel", () => {
  it("crée la tâche absente puis reste idempotent", async () => {
    const { enqueueJob, JobType } = await import("@/lib/jobs");
    for (let i = 0; i < 3; i++) {
      await enqueueJob({
        organizationId: ORG,
        type: JobType.PREPROCESS_RECORDING,
        targetId: REC,
      });
    }
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe(JobStatus.PENDING);
  });

  it("réveille une tâche en attente sans réinitialiser ses tentatives", async () => {
    const { enqueueJob, JobType } = await import("@/lib/jobs");
    const row = seed({
      type: JobType.TRANSCRIBE_RECORDING,
      status: JobStatus.PENDING,
      attempts: 3,
      runAfter: new Date(Date.now() + 120_000),
    });

    await enqueueJob({
      organizationId: ORG,
      type: JobType.TRANSCRIBE_RECORDING,
      targetId: REC,
    });

    expect(row.status).toBe(JobStatus.PENDING);
    expect(row.attempts).toBe(3);
    expect(row.runAfter.getTime()).toBeLessThanOrEqual(Date.now() + 1_000);
  });

  it("le retry manuel efface les tâches terminales pour repartir à zéro", async () => {
    const { resetJobsForTarget, enqueueJob, JobType } = await import("@/lib/jobs");
    seed({
      type: JobType.TRANSCRIBE_RECORDING,
      status: JobStatus.FAILED_PERMANENT,
      attempts: 6,
    });
    seed({ type: JobType.PREPROCESS_RECORDING, status: JobStatus.COMPLETED, attempts: 1 });

    const removed = await resetJobsForTarget({
      organizationId: ORG,
      targetId: REC,
      types: [JobType.PREPROCESS_RECORDING, JobType.TRANSCRIBE_RECORDING],
    });
    expect(removed).toBe(2);

    await enqueueJob({
      organizationId: ORG,
      type: JobType.PREPROCESS_RECORDING,
      targetId: REC,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.attempts).toBe(0);
    expect(rows[0]?.status).toBe(JobStatus.PENDING);
  });

  it("ne retire jamais une tâche en cours d'exécution", async () => {
    const { resetJobsForTarget, JobType } = await import("@/lib/jobs");
    seed({ type: JobType.TRANSCRIBE_RECORDING, status: JobStatus.RUNNING, attempts: 2 });

    const removed = await resetJobsForTarget({
      organizationId: ORG,
      targetId: REC,
      types: [JobType.TRANSCRIBE_RECORDING],
    });

    expect(removed).toBe(0);
    expect(rows).toHaveLength(1);
  });
});
