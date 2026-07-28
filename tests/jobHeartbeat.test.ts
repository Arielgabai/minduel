import { describe, it, expect, beforeEach, vi } from "vitest";
import { JobStatus } from "@/lib/jobStatus";

/**
 * Regression : pendant une transcription qui dure 5 a 10 minutes, aucun autre
 * worker ne doit reclamer le job en cours. Le heartbeat rafraichit `lockedAt`
 * periodiquement, et `reclaimStaleJobs` ne recupere QUE les jobs dont le
 * `lockedAt` est plus vieux que le seuil (worker mort, pas worker actif).
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
  if (typeof where.id === "string" && r.id !== where.id) return false;

  const status = where.status as string | undefined;
  if (typeof status === "string" && r.status !== status) return false;

  const lockedBy = where.lockedBy as string | undefined;
  if (typeof lockedBy === "string" && r.lockedBy !== lockedBy) return false;

  const lockedAt = where.lockedAt as { lt?: Date } | undefined;
  if (lockedAt && typeof lockedAt === "object") {
    if (lockedAt.lt) {
      if (!r.lockedAt) return false;
      if (r.lockedAt >= lockedAt.lt) return false;
    }
  }
  return true;
}

const processingJob = {
  updateMany: async ({ where, data }: { where?: Where; data: Partial<Row> }) => {
    const hit = rows.filter((r) => matches(r, where));
    hit.forEach((r) => Object.assign(r, data));
    return { count: hit.length };
  },
};

vi.mock("@/lib/db", () => ({ prisma: { processingJob } }));
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
  transcribeRecording: vi.fn(),
  analyzeReferenceCall: vi.fn(),
  generateScenarioFromCall: vi.fn(),
  markReferenceCallFailed: vi.fn(),
}));

function makeRow(over: Partial<Row> = {}): Row {
  const now = new Date();
  return {
    id: `job-${++seq}`,
    organizationId: "org-1",
    type: "TRANSCRIBE_RECORDING",
    targetId: `rec-${seq}`,
    status: JobStatus.RUNNING,
    attempts: 1,
    maxAttempts: 2,
    runAfter: now,
    lockedAt: now,
    lockedBy: "worker-A",
    lastError: null,
    ...over,
  };
}

beforeEach(() => {
  rows = [];
  seq = 0;
});

describe("heartbeat des jobs longs", () => {
  it("rafraichit lockedAt si le worker est toujours proprietaire", async () => {
    const { heartbeatJob } = await import("@/lib/jobs");
    const row = makeRow({ lockedAt: new Date(Date.now() - 5 * 60_000) });
    rows.push(row);

    const held = await heartbeatJob({ id: row.id, workerId: "worker-A" });
    expect(held).toBe(true);
    // Nouveau lockedAt frais.
    expect(row.lockedAt!.getTime()).toBeGreaterThan(Date.now() - 5_000);
  });

  it("retourne false si un autre worker a vole le lock", async () => {
    const { heartbeatJob } = await import("@/lib/jobs");
    const row = makeRow({ lockedBy: "worker-B" });
    rows.push(row);

    const held = await heartbeatJob({ id: row.id, workerId: "worker-A" });
    expect(held).toBe(false);
  });

  it("retourne false si le job n'est plus RUNNING", async () => {
    const { heartbeatJob } = await import("@/lib/jobs");
    const row = makeRow({ status: JobStatus.COMPLETED });
    rows.push(row);

    const held = await heartbeatJob({ id: row.id, workerId: "worker-A" });
    expect(held).toBe(false);
  });
});

describe("reclaim des jobs abandonnes", () => {
  it("ne reclame PAS un job dont le heartbeat est frais (worker actif)", async () => {
    const { reclaimStaleJobs } = await import("@/lib/jobs");
    // lockedAt < 1 minute = worker vivant.
    const fresh = makeRow({ lockedAt: new Date(Date.now() - 30_000) });
    rows.push(fresh);

    // Seuil: 20 minutes (defaut WORKER_STALE_LOCK_MS).
    const reclaimed = await reclaimStaleJobs(20 * 60_000);
    expect(reclaimed).toBe(0);
    expect(fresh.status).toBe(JobStatus.RUNNING);
    expect(fresh.lockedBy).toBe("worker-A");
  });

  it("reclame un job orphelin (lockedAt > seuil)", async () => {
    const { reclaimStaleJobs } = await import("@/lib/jobs");
    // 30 minutes d'inactivite : le worker precedent est mort.
    const stale = makeRow({ lockedAt: new Date(Date.now() - 30 * 60_000) });
    rows.push(stale);

    const reclaimed = await reclaimStaleJobs(20 * 60_000);
    expect(reclaimed).toBe(1);
    expect(stale.status).toBe(JobStatus.PENDING);
    expect(stale.lockedAt).toBeNull();
    expect(stale.lockedBy).toBeNull();
  });

  it("ne touche pas aux jobs COMPLETED ou FAILED_PERMANENT", async () => {
    const { reclaimStaleJobs } = await import("@/lib/jobs");
    const old = new Date(Date.now() - 60 * 60_000);
    const done = makeRow({ status: JobStatus.COMPLETED, lockedAt: old });
    const failed = makeRow({ status: JobStatus.FAILED_PERMANENT, lockedAt: old });
    rows.push(done, failed);

    const reclaimed = await reclaimStaleJobs(20 * 60_000);
    expect(reclaimed).toBe(0);
    expect(done.status).toBe(JobStatus.COMPLETED);
    expect(failed.status).toBe(JobStatus.FAILED_PERMANENT);
  });

  it("simulation transcription 10 min : heartbeat rafraichit -> aucun reclaim", async () => {
    const { heartbeatJob, reclaimStaleJobs } = await import("@/lib/jobs");
    const staleThreshold = 20 * 60_000;
    // Job pris il y a 12 minutes, mais heartbeat toutes les 30 s.
    const row = makeRow({ lockedAt: new Date(Date.now() - 12 * 60_000) });
    rows.push(row);

    // Le heartbeat s'execute et rafraichit le lockedAt.
    const held = await heartbeatJob({ id: row.id, workerId: "worker-A" });
    expect(held).toBe(true);

    // Immediatement apres, le reclaim ne doit pas voler le lock.
    const reclaimed = await reclaimStaleJobs(staleThreshold);
    expect(reclaimed).toBe(0);
    expect(row.status).toBe(JobStatus.RUNNING);
    expect(row.lockedBy).toBe("worker-A");
  });
});
