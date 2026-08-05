/**
 * LOT Q3C — upload fiable, idempotence, annulation et suppression.
 * Aucun réseau / OpenAI / S3 / worker réel.
 */
import { readFileSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordingStatus, RecordingSource } from "@/lib/enums";
import { realCallStatusLabel, realCallStatusTone } from "@/lib/realCallView";

const ROOT = path.resolve(__dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

const ATTEMPT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ATTEMPT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG = "org-telepro-1";
const TELEPRO = "telepro-1";

describe("Q3C — schéma et migration additive", () => {
  const schema = read("prisma/schema.prisma");
  const mig = read(
    "prisma/migrations/20260805180000_real_calls_reliability/migration.sql",
  );

  it("ajoute uploadAttemptId + unicité + dates cancel", () => {
    expect(schema).toContain("uploadAttemptId");
    expect(schema).toContain("cancelRequestedAt");
    expect(schema).toContain("cancelledAt");
    expect(schema).toContain(
      "@@unique([organizationId, teleproId, uploadAttemptId])",
    );
    expect(mig).toContain('ADD COLUMN "uploadAttemptId"');
    expect(mig).toContain(
      'CallRecording_organizationId_teleproId_uploadAttemptId_key',
    );
    expect(mig).not.toMatch(/(?:^|\n)\s*INSERT\s+INTO/i);
    expect(mig).toContain("ROLLBACK manuel");
  });

  it("n'altère pas les migrations Q3A/Q3B", () => {
    const q3a = read(
      "prisma/migrations/20260805140000_real_calls_telepro/migration.sql",
    );
    const q3b = read(
      "prisma/migrations/20260805160000_scenario_skill_mapping/migration.sql",
    );
    expect(q3a).not.toContain("uploadAttemptId");
    expect(q3b).not.toContain("uploadAttemptId");
  });
});

describe("Q3C — libellés d'annulation", () => {
  it("CANCEL_* distincts de FAILED", () => {
    expect(RecordingStatus.CANCEL_REQUESTED).toBe("CANCEL_REQUESTED");
    expect(RecordingStatus.CANCELLED).toBe("CANCELLED");
    expect(realCallStatusLabel(RecordingStatus.CANCEL_REQUESTED)).toBe(
      "Arrêt en cours",
    );
    expect(realCallStatusLabel(RecordingStatus.CANCELLED)).toBe(
      "Analyse arrêtée",
    );
    expect(realCallStatusTone(RecordingStatus.CANCELLED)).toBe("cancelled");
    expect(realCallStatusTone(RecordingStatus.FAILED)).toBe("failed");
  });
});

describe("Q3C — client upload / récupération", () => {
  const listClient = read("src/app/app/real-calls/RealCallsClient.tsx");
  const detailClient = read(
    "src/app/app/real-calls/[id]/RealCallDetailClient.tsx",
  );
  const prepareRoute = read("src/app/api/real-calls/route.ts");

  it("génère uploadAttemptId et le réutilise au retry fichier inchangé", () => {
    expect(listClient).toContain("uploadAttemptIdRef");
    expect(listClient).toContain("fileFingerprintRef");
    expect(listClient).toContain("uploadAttemptId");
    expect(prepareRoute).toContain("uploadAttemptId: z.string().uuid()");
  });

  it("anti-double-submit + phases séparées", () => {
    expect(listClient).toContain("uploadInFlightRef");
    expect(listClient).toContain('"préparation"');
    expect(listClient).toContain('"envoi"');
    expect(listClient).toContain('"finalisation"');
    expect(listClient).toContain("analyse en arrière-plan");
  });

  it("récupération finalize / GET après perte réseau", () => {
    expect(listClient).toContain("recoverAccepted");
    expect(listClient).toContain("finalizePresigned");
    expect(listClient).toContain("acceptedRef");
    expect(listClient).toContain("Analyse lancée en arrière-plan");
  });

  it("aucune erreur réseau après acceptation", () => {
    expect(listClient).toMatch(
      /if \(acceptedRef\.current && recordingIdRef\.current\)/,
    );
    expect(listClient).toContain('setError("Erreur réseau.")');
  });

  it("confirmations UI arrêt / suppression", () => {
    expect(listClient).toContain(
      "Arrêter cette analyse ? L'étape actuellement envoyée au fournisseur",
    );
    expect(listClient).toContain(
      "Supprimer définitivement cet appel, son audio, son transcript et son analyse ?",
    );
    expect(detailClient).toContain("Arrêter l'analyse");
    expect(detailClient).toContain("Supprimer");
    expect(detailClient).toContain("window.confirm");
  });

  it("!res.ok sans faux succès", () => {
    expect(listClient).toContain("if (!res.ok)");
    expect(listClient).toContain("if (!prepareRes.ok)");
    expect(detailClient).toContain("if (!res.ok)");
  });

  it("cleanup timers polling détail", () => {
    expect(detailClient).toContain("clearInterval(timerRef.current)");
    expect(detailClient).toContain("MAX_POLLS");
  });

  it("pas de localStorage / Ringover / dangerouslySetInnerHTML", () => {
    expect(listClient).not.toContain("localStorage");
    expect(listClient).not.toMatch(/Ringover/i);
    expect(listClient).not.toContain("dangerouslySetInnerHTML");
    expect(detailClient).not.toContain("dangerouslySetInnerHTML");
  });
});

describe("Q3C — worker checkpoints et isolation", () => {
  const ref = read("src/lib/referenceCallService.ts");
  const service = read("src/lib/realCallService.ts");

  it("abortRealCallIfCancelled et setStatus bloquent CANCEL→READY", () => {
    expect(ref).toContain("abortRealCallIfCancelled");
    expect(ref).toContain("RecordingStatus.CANCEL_REQUESTED");
    expect(ref).toContain("RecordingStatus.CANCELLED");
    expect(ref).toMatch(/status:\s*\{\s*notIn:[\s\S]*CANCEL_REQUESTED/);
  });

  it("ignore résultat provider après annulation", () => {
    const analyzeIdx = ref.lastIndexOf("getRealCallAnalysisProvider().analyze");
    expect(analyzeIdx).toBeGreaterThan(0);
    const after = ref.slice(analyzeIdx, analyzeIdx + 1800);
    expect(after).toContain("abortRealCallIfCancelled");
    expect(after.indexOf("abortRealCallIfCancelled")).toBeLessThan(
      after.indexOf("callAnalysis.upsert"),
    );
  });

  it("markRecordingFailed ne convertit pas cancel en FAILED", () => {
    expect(ref).toContain("real_call_cancelled_on_failure");
    expect(ref).toContain("CANCEL_REQUESTED");
  });

  it("pipeline manager legacy inchangé fonctionnellement", () => {
    expect(ref).toContain("GENERATE_SCENARIO_FROM_CALL");
    expect(ref).toContain("getCallAnalysisProvider().analyze");
    expect(service).not.toContain("prisma.scenario.create");
  });

  it("annulation non présentée comme retry technique", () => {
    expect(service).toContain("cancelled_by_user");
    expect(service).toContain("REAL_CALL_CANCEL");
  });
});

describe("Q3C — routes cancel/delete", () => {
  const cancelRoute = read("src/app/api/real-calls/[id]/cancel/route.ts");
  const idRoute = read("src/app/api/real-calls/[id]/route.ts");

  it("expose POST cancel et DELETE", () => {
    expect(cancelRoute).toContain("cancelRealCallProcessing");
    expect(cancelRoute).toContain("requireTelepro");
    expect(idRoute).toContain("export async function DELETE");
    expect(idRoute).toContain("deleteRealCall");
  });
});

describe("Q3C — service mocks (idempotence / cancel / delete)", () => {
  const snapshot = { ...process.env };

  const callRecording = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  };
  const user = { findFirst: vi.fn() };
  const processingJob = {
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
  };
  const knowledgeItem = { deleteMany: vi.fn() };
  const scenario = { updateMany: vi.fn() };
  const headObject = vi.fn();
  const deleteObject = vi.fn();
  const put = vi.fn();
  const enqueueJob = vi.fn();
  const ensureProcessingJobExists = vi.fn();
  const prismaTx = vi.fn();

  const txClient = {
    callRecording,
    processingJob,
  };

  function setEnv() {
    process.env = {
      ...snapshot,
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://u:p@localhost:5432/t",
      SESSION_SECRET: "x".repeat(32),
      STORAGE_DRIVER: "local",
      MAX_UPLOAD_MB: "25",
    };
  }

  beforeEach(() => {
    setEnv();
    vi.resetModules();
    for (const fn of [
      callRecording.findFirst,
      callRecording.findMany,
      callRecording.create,
      callRecording.updateMany,
      callRecording.deleteMany,
      user.findFirst,
      processingJob.create,
      processingJob.updateMany,
      processingJob.deleteMany,
      processingJob.findUnique,
      knowledgeItem.deleteMany,
      scenario.updateMany,
      headObject,
      deleteObject,
      put,
      enqueueJob,
      ensureProcessingJobExists,
      prismaTx,
    ]) {
      fn.mockReset();
    }
    user.findFirst.mockResolvedValue({ id: TELEPRO });
    processingJob.create.mockResolvedValue({ id: "job-1" });
    processingJob.updateMany.mockResolvedValue({ count: 0 });
    processingJob.deleteMany.mockResolvedValue({ count: 0 });
    knowledgeItem.deleteMany.mockResolvedValue({ count: 0 });
    scenario.updateMany.mockResolvedValue({ count: 0 });
    deleteObject.mockResolvedValue(undefined);
    put.mockResolvedValue(undefined);
    enqueueJob.mockResolvedValue(undefined);
    headObject.mockResolvedValue({ exists: true, size: 1024 });

    // Défaut : ensure crée le job (created: true) via le client fourni.
    ensureProcessingJobExists.mockImplementation(
      async (
        input: { organizationId: string; type: string; targetId: string },
        client?: { processingJob: typeof processingJob },
      ) => {
        const c = client ?? { processingJob };
        await c.processingJob.create({
          data: {
            organizationId: input.organizationId,
            type: input.type,
            targetId: input.targetId,
            maxAttempts: 5,
            status: "PENDING",
          },
        });
        return { created: true };
      },
    );

    prismaTx.mockImplementation(async (fn: (tx: typeof txClient) => unknown) =>
      fn(txClient),
    );

    vi.doMock("@/lib/db", () => ({
      prisma: {
        callRecording,
        user,
        processingJob,
        knowledgeItem,
        scenario,
        $transaction: prismaTx,
      },
    }));
    vi.doMock("@/lib/audit", () => ({
      logAudit: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/jobs", () => ({
      enqueueJob,
      ensureProcessingJobExists,
      resetJobsForTarget: vi.fn(async () => 1),
      JobType: {
        PREPROCESS_RECORDING: "PREPROCESS_RECORDING",
        GENERATE_SCENARIO_FROM_CALL: "GENERATE_SCENARIO_FROM_CALL",
      },
    }));
    vi.doMock("@/lib/jobTypes", () => ({
      REFERENCE_CALL_JOB_TYPES: [
        "PREPROCESS_RECORDING",
        "TRANSCRIBE_RECORDING",
        "ANALYZE_REFERENCE_CALL",
        "GENERATE_SCENARIO_FROM_CALL",
      ],
      JobType: {
        PREPROCESS_RECORDING: "PREPROCESS_RECORDING",
        GENERATE_SCENARIO_FROM_CALL: "GENERATE_SCENARIO_FROM_CALL",
      },
    }));
    vi.doMock("@/lib/providers", () => ({
      getAudioStorage: () => ({
        put,
        headObject,
        deleteObject,
        createUploadUrl: undefined,
      }),
      isPersistentStorageConfigured: () => false,
    }));
  });

  afterEach(() => {
    process.env = { ...snapshot };
    vi.resetModules();
    vi.unmock("@/lib/db");
    vi.unmock("@/lib/audit");
    vi.unmock("@/lib/jobs");
    vi.unmock("@/lib/jobTypes");
    vi.unmock("@/lib/providers");
  });

  const actor = { id: TELEPRO, organizationId: ORG, role: "TELEPRO" };

  it("même uploadAttemptId → même CallRecording", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "rec-1",
      status: RecordingStatus.PENDING_UPLOAD,
      storageKey: `${ORG}/a.mp3`,
      mimeType: "audio/mpeg",
      createdAt: new Date().toISOString(),
    });
    const { prepareRealCallUpload } = await import("@/lib/realCallService");
    const a = await prepareRealCallUpload(actor, {
      rightsConfirmed: true,
      fileName: "a.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 1000,
      uploadAttemptId: ATTEMPT_A,
    });
    const b = await prepareRealCallUpload(actor, {
      rightsConfirmed: true,
      fileName: "a.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 1000,
      uploadAttemptId: ATTEMPT_A,
    });
    expect(a.id).toBe("rec-1");
    expect(b.id).toBe("rec-1");
    expect(callRecording.create).not.toHaveBeenCalled();
  });

  it("deux clés différentes → deux enregistrements", async () => {
    callRecording.findFirst.mockResolvedValue(null);
    callRecording.create.mockResolvedValue({});
    const { prepareRealCallUpload } = await import("@/lib/realCallService");
    await prepareRealCallUpload(actor, {
      rightsConfirmed: true,
      fileName: "a.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 1000,
      uploadAttemptId: ATTEMPT_A,
    });
    await prepareRealCallUpload(actor, {
      rightsConfirmed: true,
      fileName: "b.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 1000,
      uploadAttemptId: ATTEMPT_B,
    });
    expect(callRecording.create).toHaveBeenCalledTimes(2);
    expect(callRecording.create.mock.calls[0]![0].data.uploadAttemptId).toBe(
      ATTEMPT_A,
    );
    expect(callRecording.create.mock.calls[1]![0].data.uploadAttemptId).toBe(
      ATTEMPT_B,
    );
  });

  it("isolation org/télépro de la clé", async () => {
    callRecording.findFirst.mockResolvedValue(null);
    callRecording.create.mockResolvedValue({});
    const { prepareRealCallUpload } = await import("@/lib/realCallService");
    await prepareRealCallUpload(actor, {
      rightsConfirmed: true,
      fileName: "a.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 1000,
      uploadAttemptId: ATTEMPT_A,
    });
    expect(callRecording.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG,
          teleproId: TELEPRO,
          uploadAttemptId: ATTEMPT_A,
          source: RecordingSource.MANUAL_UPLOAD,
        }),
      }),
    );
  });

  it("P2002 concurrent → convergence", async () => {
    const { Prisma } = await import("@prisma/client");
    callRecording.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "rec-race",
        status: RecordingStatus.PENDING_UPLOAD,
        storageKey: `${ORG}/a.mp3`,
        mimeType: "audio/mpeg",
        createdAt: new Date().toISOString(),
      });
    callRecording.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    const { prepareRealCallUpload } = await import("@/lib/realCallService");
    const res = await prepareRealCallUpload(actor, {
      rightsConfirmed: true,
      fileName: "a.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 1000,
      uploadAttemptId: ATTEMPT_A,
    });
    expect(res.id).toBe("rec-race");
    expect(res.alreadyAccepted).toBe(false);
  });

  it("prepare retry après finalisation → alreadyAccepted", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "rec-1",
      status: RecordingStatus.UPLOADED,
      storageKey: `${ORG}/a.mp3`,
      mimeType: "audio/mpeg",
      createdAt: new Date().toISOString(),
    });
    const { prepareRealCallUpload } = await import("@/lib/realCallService");
    const res = await prepareRealCallUpload(actor, {
      rightsConfirmed: true,
      fileName: "a.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 1000,
      uploadAttemptId: ATTEMPT_A,
    });
    expect(res.alreadyAccepted).toBe(true);
    expect(res.uploadUrl).toBeNull();
    expect(callRecording.create).not.toHaveBeenCalled();
  });

  it("PENDING_UPLOAD → statut et job créés dans la même transaction", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "r1",
      status: RecordingStatus.PENDING_UPLOAD,
      storageKey: `${ORG}/a.mp3`,
      sizeBytes: 3,
      mimeType: "audio/mpeg",
      createdAt: new Date().toISOString(),
    });
    callRecording.updateMany.mockResolvedValue({ count: 1 });
    const { finalizeRealCallUpload } = await import("@/lib/realCallService");
    const res = await finalizeRealCallUpload(actor, "r1", {
      fileBuffer: Buffer.from("ID3"),
      fileName: "a.mp3",
      fileMimeType: "audio/mpeg",
    });
    expect(res.status).toBe(RecordingStatus.UPLOADED);
    expect(res.jobEnqueued).toBe(true);
    expect(prismaTx).toHaveBeenCalledTimes(1);
    expect(callRecording.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: RecordingStatus.PENDING_UPLOAD,
        }),
        data: expect.objectContaining({
          status: RecordingStatus.UPLOADED,
        }),
      }),
    );
    expect(ensureProcessingJobExists).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PREPROCESS_RECORDING",
        targetId: "r1",
      }),
      txClient,
    );
    expect(processingJob.create).toHaveBeenCalledTimes(1);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("erreur de création du job → rollback (transaction rejette)", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "r1",
      status: RecordingStatus.PENDING_UPLOAD,
      storageKey: `${ORG}/a.mp3`,
      sizeBytes: 3,
      mimeType: "audio/mpeg",
      createdAt: new Date().toISOString(),
    });
    callRecording.updateMany.mockResolvedValue({ count: 1 });
    ensureProcessingJobExists.mockRejectedValue(new Error("job create boom"));
    prismaTx.mockImplementation(async (fn: (tx: typeof txClient) => unknown) => {
      // Simule le rollback Prisma : toute erreur dans fn propage.
      return fn(txClient);
    });
    const { finalizeRealCallUpload } = await import("@/lib/realCallService");
    await expect(
      finalizeRealCallUpload(actor, "r1", {
        fileBuffer: Buffer.from("ID3"),
        fileName: "a.mp3",
        fileMimeType: "audio/mpeg",
      }),
    ).rejects.toThrow("job create boom");
    expect(prismaTx).toHaveBeenCalled();
    // Pas de succès « accepté » : l'appelant doit pouvoir réessayer depuis PENDING.
  });

  it("UPLOADED sans job → finalize répare le job", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "r1",
      status: RecordingStatus.UPLOADED,
      storageKey: `${ORG}/a.mp3`,
      sizeBytes: 1024,
      mimeType: "audio/mpeg",
      createdAt: new Date().toISOString(),
    });
    ensureProcessingJobExists.mockResolvedValue({ created: true });
    const { finalizeRealCallUpload } = await import("@/lib/realCallService");
    const res = await finalizeRealCallUpload(actor, "r1", {});
    expect(res.alreadyAccepted).toBe(true);
    expect(res.jobEnqueued).toBe(true);
    expect(res.status).toBe(RecordingStatus.UPLOADED);
    expect(ensureProcessingJobExists).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PREPROCESS_RECORDING",
        targetId: "r1",
      }),
    );
    expect(prismaTx).not.toHaveBeenCalled();
  });

  it("UPLOADED avec job → aucun doublon", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "r1",
      status: RecordingStatus.UPLOADED,
      storageKey: `${ORG}/a.mp3`,
      sizeBytes: 1024,
      mimeType: "audio/mpeg",
      createdAt: new Date().toISOString(),
    });
    ensureProcessingJobExists.mockResolvedValue({ created: false });
    const { finalizeRealCallUpload } = await import("@/lib/realCallService");
    const res = await finalizeRealCallUpload(actor, "r1", {});
    expect(res.alreadyAccepted).toBe(true);
    expect(res.jobEnqueued).toBe(false);
    expect(ensureProcessingJobExists).toHaveBeenCalledTimes(1);
    expect(processingJob.create).not.toHaveBeenCalled();
  });

  it("finalize concurrent → exactement un job créé (created:true)", async () => {
    // 1er appel : PENDING → UPLOADED + create
    callRecording.findFirst.mockResolvedValueOnce({
      id: "r1",
      status: RecordingStatus.PENDING_UPLOAD,
      storageKey: `${ORG}/a.mp3`,
      sizeBytes: 1024,
      mimeType: "audio/mpeg",
      createdAt: new Date().toISOString(),
    });
    callRecording.updateMany.mockResolvedValueOnce({ count: 1 });
    ensureProcessingJobExists.mockResolvedValueOnce({ created: true });

    const { finalizeRealCallUpload } = await import("@/lib/realCallService");
    const first = await finalizeRealCallUpload(actor, "r1", {});
    expect(first.jobEnqueued).toBe(true);

    // 2e appel concurrent perdu : updateMany 0 → UPLOADED → ensure created:false
    callRecording.findFirst
      .mockResolvedValueOnce({
        id: "r1",
        status: RecordingStatus.PENDING_UPLOAD,
        storageKey: `${ORG}/a.mp3`,
        sizeBytes: 1024,
        mimeType: "audio/mpeg",
        createdAt: new Date().toISOString(),
      })
      .mockResolvedValue({
        id: "r1",
        status: RecordingStatus.UPLOADED,
        storageKey: `${ORG}/a.mp3`,
        sizeBytes: 1024,
        mimeType: "audio/mpeg",
        createdAt: new Date().toISOString(),
      });
    callRecording.updateMany.mockResolvedValueOnce({ count: 0 });
    ensureProcessingJobExists.mockResolvedValueOnce({ created: false });

    const second = await finalizeRealCallUpload(actor, "r1", {});
    expect(second.alreadyAccepted).toBe(true);
    expect(second.jobEnqueued).toBe(false);

    const createdTrue = ensureProcessingJobExists.mock.results.filter(
      (r) =>
        r.type === "return" &&
        (r.value as Promise<{ created: boolean }> | { created: boolean }),
    );
    // Deux appels ensure max ; une seule création effective.
    expect(ensureProcessingJobExists).toHaveBeenCalledTimes(2);
    expect([first.jobEnqueued, second.jobEnqueued].filter(Boolean)).toEqual([
      true,
    ]);
    void createdTrue;
  });

  it("PREPROCESSING → aucun nouveau job", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "r1",
      status: RecordingStatus.PREPROCESSING,
      storageKey: `${ORG}/a.mp3`,
      sizeBytes: 1024,
      mimeType: "audio/mpeg",
      createdAt: new Date().toISOString(),
    });
    const { finalizeRealCallUpload } = await import("@/lib/realCallService");
    const res = await finalizeRealCallUpload(actor, "r1", {});
    expect(res.alreadyAccepted).toBe(true);
    expect(res.jobEnqueued).toBe(false);
    expect(ensureProcessingJobExists).not.toHaveBeenCalled();
    expect(prismaTx).not.toHaveBeenCalled();
  });

  it("READY → aucun nouveau job", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "r1",
      status: RecordingStatus.READY,
      storageKey: `${ORG}/a.mp3`,
      sizeBytes: 1024,
      mimeType: "audio/mpeg",
      createdAt: new Date().toISOString(),
    });
    const { finalizeRealCallUpload } = await import("@/lib/realCallService");
    const res = await finalizeRealCallUpload(actor, "r1", {});
    expect(res.alreadyAccepted).toBe(true);
    expect(res.jobEnqueued).toBe(false);
    expect(ensureProcessingJobExists).not.toHaveBeenCalled();
  });

  it("CANCEL_REQUESTED → aucun job", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "r1",
      status: RecordingStatus.CANCEL_REQUESTED,
      storageKey: `${ORG}/a.mp3`,
      sizeBytes: 1024,
      mimeType: "audio/mpeg",
      createdAt: new Date().toISOString(),
    });
    const { finalizeRealCallUpload } = await import("@/lib/realCallService");
    const res = await finalizeRealCallUpload(actor, "r1", {});
    expect(res.jobEnqueued).toBe(false);
    expect(ensureProcessingJobExists).not.toHaveBeenCalled();
    expect(prismaTx).not.toHaveBeenCalled();
  });

  it("CANCELLED → aucun job", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "r1",
      status: RecordingStatus.CANCELLED,
      storageKey: `${ORG}/a.mp3`,
      sizeBytes: 1024,
      mimeType: "audio/mpeg",
      createdAt: new Date().toISOString(),
    });
    const { finalizeRealCallUpload } = await import("@/lib/realCallService");
    const res = await finalizeRealCallUpload(actor, "r1", {});
    expect(res.jobEnqueued).toBe(false);
    expect(ensureProcessingJobExists).not.toHaveBeenCalled();
  });

  it("race cancel/finalize → aucun job laissé PENDING après annulation", async () => {
    // finalize voit UPLOADED, crée le job, puis relit CANCELLED → kill PENDING
    callRecording.findFirst
      .mockResolvedValueOnce({
        id: "r1",
        status: RecordingStatus.UPLOADED,
        storageKey: `${ORG}/a.mp3`,
        sizeBytes: 1024,
        mimeType: "audio/mpeg",
        createdAt: new Date().toISOString(),
      })
      .mockResolvedValueOnce({
        id: "r1",
        status: RecordingStatus.UPLOADED,
        storageKey: `${ORG}/a.mp3`,
        sizeBytes: 1024,
        mimeType: "audio/mpeg",
        createdAt: new Date().toISOString(),
      })
      .mockResolvedValueOnce({
        id: "r1",
        status: RecordingStatus.CANCELLED,
        storageKey: `${ORG}/a.mp3`,
        sizeBytes: 1024,
        mimeType: "audio/mpeg",
        createdAt: new Date().toISOString(),
      });
    ensureProcessingJobExists.mockResolvedValue({ created: true });
    processingJob.updateMany.mockResolvedValue({ count: 1 });
    const { finalizeRealCallUpload } = await import("@/lib/realCallService");
    const res = await finalizeRealCallUpload(actor, "r1", {});
    expect(res.status).toBe(RecordingStatus.CANCELLED);
    expect(res.jobEnqueued).toBe(false);
    expect(processingJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: "PREPROCESS_RECORDING",
          status: "PENDING",
        }),
        data: expect.objectContaining({
          status: "FAILED_PERMANENT",
          lastError: "cancelled_by_user",
        }),
      }),
    );
  });

  it("PUT erreur mais objet présent → finalize via head (tx)", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "r1",
      status: RecordingStatus.PENDING_UPLOAD,
      storageKey: `${ORG}/a.mp3`,
      sizeBytes: 1024,
      mimeType: "audio/mpeg",
      createdAt: new Date().toISOString(),
    });
    callRecording.updateMany.mockResolvedValue({ count: 1 });
    headObject.mockResolvedValue({ exists: true, size: 1024 });
    const { finalizeRealCallUpload } = await import("@/lib/realCallService");
    const res = await finalizeRealCallUpload(actor, "r1", {});
    expect(res.jobEnqueued).toBe(true);
    expect(headObject).toHaveBeenCalled();
    expect(prismaTx).toHaveBeenCalled();
  });

  it("objet réellement absent → vraie erreur upload", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "r1",
      status: RecordingStatus.PENDING_UPLOAD,
      storageKey: `${ORG}/a.mp3`,
      sizeBytes: 1024,
      mimeType: "audio/mpeg",
      createdAt: new Date().toISOString(),
    });
    headObject.mockResolvedValue({ exists: false });
    const { finalizeRealCallUpload } = await import("@/lib/realCallService");
    await expect(finalizeRealCallUpload(actor, "r1", {})).rejects.toMatchObject(
      { status: 409 },
    );
    expect(prismaTx).not.toHaveBeenCalled();
  });

  it("cancel PENDING → CANCELLED immédiat", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "r1",
      status: RecordingStatus.UPLOADED,
      title: "x",
      storageKey: `${ORG}/a.mp3`,
    });
    callRecording.updateMany.mockResolvedValue({ count: 1 });
    const { cancelRealCallProcessing } = await import("@/lib/realCallService");
    const res = await cancelRealCallProcessing(actor, "r1");
    expect(res.status).toBe(RecordingStatus.CANCELLED);
    expect(processingJob.updateMany).toHaveBeenCalled();
  });

  it("cancel job actif → CANCEL_REQUESTED", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "r1",
      status: RecordingStatus.ANALYZING,
      title: "x",
      storageKey: `${ORG}/a.mp3`,
    });
    callRecording.updateMany.mockResolvedValue({ count: 1 });
    const { cancelRealCallProcessing } = await import("@/lib/realCallService");
    const res = await cancelRealCallProcessing(actor, "r1");
    expect(res.status).toBe(RecordingStatus.CANCEL_REQUESTED);
  });

  it("cancel idempotent sur terminal", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "r1",
      status: RecordingStatus.CANCELLED,
      title: "x",
    });
    const { cancelRealCallProcessing } = await import("@/lib/realCallService");
    const res = await cancelRealCallProcessing(actor, "r1");
    expect(res.status).toBe(RecordingStatus.CANCELLED);
    expect(callRecording.updateMany).not.toHaveBeenCalled();
  });

  it("ownership cancel 404", async () => {
    callRecording.findFirst.mockResolvedValue(null);
    const { cancelRealCallProcessing } = await import("@/lib/realCallService");
    await expect(cancelRealCallProcessing(actor, "other")).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it("DELETE terminal réussi + storage", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "r1",
      status: RecordingStatus.READY,
      title: "x",
      storageKey: `${ORG}/a.mp3`,
    });
    callRecording.deleteMany.mockResolvedValue({ count: 1 });
    const { deleteRealCall } = await import("@/lib/realCallService");
    const res = await deleteRealCall(actor, "r1");
    expect(res.deleted).toBe(true);
    expect(deleteObject).toHaveBeenCalledWith(`${ORG}/a.mp3`);
    expect(processingJob.deleteMany).toHaveBeenCalled();
    expect(knowledgeItem.deleteMany).toHaveBeenCalled();
    expect(scenario.updateMany).toHaveBeenCalled();
    expect(callRecording.deleteMany).toHaveBeenCalled();
  });

  it("DELETE actif → 409", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "r1",
      status: RecordingStatus.TRANSCRIBING,
      title: "x",
      storageKey: `${ORG}/a.mp3`,
    });
    const { deleteRealCall } = await import("@/lib/realCallService");
    await expect(deleteRealCall(actor, "r1")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("DELETE autre télépro/org → 404", async () => {
    callRecording.findFirst.mockResolvedValue(null);
    const { deleteRealCall } = await import("@/lib/realCallService");
    await expect(deleteRealCall(actor, "alien")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("suppression sans impact scénario/simulation (détache FK seulement)", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "r1",
      status: RecordingStatus.FAILED,
      title: "x",
      storageKey: null,
    });
    callRecording.deleteMany.mockResolvedValue({ count: 1 });
    const { deleteRealCall } = await import("@/lib/realCallService");
    await deleteRealCall(actor, "r1");
    expect(scenario.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sourceRecordingId: "r1" },
        data: { sourceRecordingId: null },
      }),
    );
  });
});

describe("Q3C — pages Next export default", () => {
  it("pages real-calls n'exportent que default", () => {
    const listPage = read("src/app/app/real-calls/page.tsx");
    const detailPage = read("src/app/app/real-calls/[id]/page.tsx");
    expect(listPage).toMatch(/export default/);
    expect(detailPage).toMatch(/export default/);
    expect(listPage).not.toMatch(/export (async )?function (?!default)/);
  });
});
