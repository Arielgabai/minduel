/**
 * LOT Q3A — backend appels réels télépro.
 * Fixtures et mocks locaux uniquement : aucun réseau, OpenAI, DB réelle, upload, micro.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { __resetEnvCacheForTests } from "@/lib/env";
import { RecordingSource, RecordingStatus } from "@/lib/enums";
import { RealCallAnalysisResultSchema } from "@/lib/providers/schemas";
import { recommendExercisesForWeakSkills } from "@/lib/realCallRecommend";
import {
  parseCoachingPayload,
  toRealCallDetailView,
  toRealCallListItem,
} from "@/lib/realCallView";
import { isTeleproRealCall } from "@/lib/referenceCallService";

function read(rel: string) {
  return readFileSync(path.resolve(rel), "utf8");
}

function setEnv(): void {
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = "test";
  env.DATABASE_URL = "postgresql://u:p@localhost:5432/db?schema=public";
  env.SESSION_SECRET = "0123456789012345678901234567890123456789";
  env.STORAGE_DRIVER = "local";
  env.AI_PROVIDER = "demo";
  delete env.OPENAI_API_KEY;
  __resetEnvCacheForTests();
}

const ORG = "org-telepro-1";
const TELEPRO = "telepro-1";

function validCoaching(overrides: Record<string, unknown> = {}) {
  return {
    summary: "Résumé anonymisé",
    overallScore: 72,
    skillScores: [
      {
        key: "decouverte",
        label: "Découverte",
        score: 8,
        maxScore: 20,
        rationale: "Peu de questions ouvertes.",
        evidence: "…",
        recommendation: "Travailler la découverte.",
      },
      {
        key: "conclusion",
        label: "Conclusion",
        score: 16,
        maxScore: 20,
        rationale: "Closing présent.",
        evidence: "jeudi",
        recommendation: "Consolider.",
      },
    ],
    keyMoments: [
      {
        role: "AGENT",
        quote: "Bonjour",
        atMs: 0,
        explanation: "Ouverture",
      },
    ],
    dialoguePassages: [
      {
        role: "AGENT",
        atMs: 0,
        content: "Bonjour {{CLIENT}}",
        explanation: "Tour commercial",
        suggestedReformulation: null,
      },
    ],
    why: ["Faiblesse découverte"],
    metrics: {
      talkRatio: 0.55,
      openQuestionsCount: 1,
      firstClosingAttemptMs: 12000,
    },
    weakSkillKeys: ["decouverte"],
    ...overrides,
  };
}

describe("Q3A — enums et discrimination appels réels", () => {
  it("RecordingSource.MANUAL_UPLOAD et PENDING_UPLOAD existent", () => {
    expect(RecordingSource.MANUAL_UPLOAD).toBe("MANUAL_UPLOAD");
    expect(RecordingStatus.PENDING_UPLOAD).toBe("PENDING_UPLOAD");
  });

  it("isTeleproRealCall exige source + teleproId", () => {
    expect(
      isTeleproRealCall({
        source: RecordingSource.MANUAL_UPLOAD,
        teleproId: TELEPRO,
      }),
    ).toBe(true);
    expect(
      isTeleproRealCall({
        source: RecordingSource.MANUAL_UPLOAD,
        teleproId: null,
      }),
    ).toBe(false);
    expect(isTeleproRealCall({ source: null, teleproId: TELEPRO })).toBe(false);
  });
});

describe("Q3A — Zod analyse coaching", () => {
  it("accepte une analyse complète valide", () => {
    const parsed = RealCallAnalysisResultSchema.parse(validCoaching());
    expect(parsed.overallScore).toBe(72);
    expect(parsed.weakSkillKeys).toEqual(["decouverte"]);
    expect(parsed.metrics.talkRatio).toBe(0.55);
  });

  it("accepte overallScore et métriques null (indisponibles)", () => {
    const parsed = RealCallAnalysisResultSchema.parse(
      validCoaching({
        overallScore: null,
        metrics: {
          talkRatio: null,
          openQuestionsCount: null,
          firstClosingAttemptMs: null,
        },
      }),
    );
    expect(parsed.overallScore).toBeNull();
    expect(parsed.metrics.openQuestionsCount).toBeNull();
  });

  it("refuse un JSON incomplet (skillScores manquants)", () => {
    const bad = { ...validCoaching() };
    delete (bad as { skillScores?: unknown }).skillScores;
    expect(RealCallAnalysisResultSchema.safeParse(bad).success).toBe(false);
  });

  it("accepte overallScore null, 0 et 100 ; refuse hors plage", () => {
    expect(
      RealCallAnalysisResultSchema.safeParse(validCoaching({ overallScore: null }))
        .success,
    ).toBe(true);
    expect(
      RealCallAnalysisResultSchema.safeParse(validCoaching({ overallScore: 0 }))
        .success,
    ).toBe(true);
    expect(
      RealCallAnalysisResultSchema.safeParse(validCoaching({ overallScore: 100 }))
        .success,
    ).toBe(true);
    expect(
      RealCallAnalysisResultSchema.safeParse(validCoaching({ overallScore: -1 }))
        .success,
    ).toBe(false);
    expect(
      RealCallAnalysisResultSchema.safeParse(validCoaching({ overallScore: 101 }))
        .success,
    ).toBe(false);
  });
});

describe("Q3A — parseCoachingPayload défensif", () => {
  it("JSON invalide → available=false", () => {
    expect(parseCoachingPayload("{not-json").available).toBe(false);
    expect(parseCoachingPayload(null).available).toBe(false);
  });

  it("JSON partiel → available=false (pas de zéros inventés)", () => {
    expect(
      parseCoachingPayload(JSON.stringify({ summary: "x" })).available,
    ).toBe(false);
  });

  it("payload valide → data exposée", () => {
    const r = parseCoachingPayload(JSON.stringify(validCoaching()));
    expect(r.available).toBe(true);
    expect(r.data?.skillScores).toHaveLength(2);
  });
});

describe("Q3A — vues liste/détail sans fuite", () => {
  it("liste : pas de transcript, analyse détaillée, hash, storageKey", () => {
    const item = toRealCallListItem({
      id: "r1",
      title: "Appel",
      status: RecordingStatus.READY,
      source: RecordingSource.MANUAL_UPLOAD,
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-01T10:05:00.000Z",
      durationSec: 120,
      language: "fr",
      errorMessage: null,
      analysis: { overallScore: 70 },
    });
    const json = JSON.stringify(item);
    expect(json).not.toContain("transcript");
    expect(json).not.toContain("coachingPayload");
    expect(json).not.toContain("storageKey");
    expect(json).not.toContain("processingHash");
    expect(json).not.toContain("prompt");
    expect(item.overallScore).toBe(70);
  });

  it("détail : transcript anonymisé privilégié + reco vide", () => {
    const detail = toRealCallDetailView({
      recording: {
        id: "r1",
        title: "Appel",
        status: RecordingStatus.READY,
        source: RecordingSource.MANUAL_UPLOAD,
        createdAt: "2026-08-01T10:00:00.000Z",
        updatedAt: "2026-08-01T10:05:00.000Z",
        durationSec: 90,
        language: "fr",
        errorMessage: null,
      },
      analysis: {
        summary: "Résumé",
        overallScore: 72,
        coachingPayload: JSON.stringify(validCoaching()),
      },
      transcript: {
        language: "fr",
        turns: [
          {
            idx: 0,
            role: "AGENT",
            startMs: 0,
            endMs: 1000,
            text: "Bonjour Jean Dupont",
            anonymizedText: "Bonjour {{CLIENT}}",
          },
        ],
      },
    });
    expect(detail.transcript.segments[0]!.content).toBe("Bonjour {{CLIENT}}");
    expect(detail.transcript.segments[0]!.content).not.toContain("Jean Dupont");
    expect(detail.associatedExercises.items).toEqual([]);
    expect(detail.associatedExercises.reason).toBe("NO_MAPPING");
    expect(detail.analysis.weakSkillKeys).toEqual(["decouverte"]);
  });
});

describe("Q3A — recommandation exercices (liste vide)", () => {
  it("sans faiblesse → NO_WEAK_SKILLS", () => {
    const r = recommendExercisesForWeakSkills({ weakSkillKeys: [] });
    expect(r.items).toEqual([]);
    expect(r.reason).toBe("NO_WEAK_SKILLS");
  });

  it("avec faiblesses → vide + mapping manquant (déterministe)", () => {
    const a = recommendExercisesForWeakSkills({
      weakSkillKeys: ["ecoute", "decouverte"],
    });
    const b = recommendExercisesForWeakSkills({
      weakSkillKeys: ["decouverte", "ecoute"],
    });
    expect(a).toEqual(b);
    expect(a.items).toEqual([]);
    expect(a.weakSkillKeys).toEqual(["decouverte", "ecoute"]);
    expect(a.reason).toBe("NO_MAPPING");
  });
});

describe("Q3A — provider démo analyse appel réel", () => {
  const snapshot = { ...process.env };
  beforeEach(() => {
    setEnv();
  });
  afterEach(() => {
    process.env = { ...snapshot };
    __resetEnvCacheForTests();
  });

  it("produit une analyse Zod-valide sans réseau", async () => {
    const { demoRealCallAnalysis } = await import("@/lib/providers/demo");
    const result = await demoRealCallAnalysis.analyze({
      language: "fr",
      seed: "seed-real-1",
      segments: [
        {
          idx: 0,
          role: "AGENT",
          text: "Bonjour, comment allez-vous ?",
          startMs: 0,
          endMs: 1000,
        },
        {
          idx: 1,
          role: "PROSPECT",
          text: "Je n'ai pas le temps.",
          startMs: 1000,
          endMs: 2000,
        },
        {
          idx: 2,
          role: "AGENT",
          text: "Je comprends. Seriez-vous disponible jeudi ?",
          startMs: 2000,
          endMs: 3500,
        },
      ],
    });
    expect(RealCallAnalysisResultSchema.safeParse(result).success).toBe(true);
    expect(result.metrics.firstClosingAttemptMs).toBe(2000);
    expect(result.skillScores.length).toBeGreaterThanOrEqual(1);
  });

  it("getRealCallAnalysisProvider est sélectionnable en démo", async () => {
    const p = await import("@/lib/providers");
    expect(p.getRealCallAnalysisProvider()).toBeDefined();
  });
});

describe("Q3A — garde-fous source (auth, isolation, pipeline)", () => {
  const serviceSrc = read("src/lib/realCallService.ts");
  const routeSrc = read("src/app/api/real-calls/route.ts");
  const detailSrc = read("src/app/api/real-calls/[id]/route.ts");
  const refSrc = read("src/lib/referenceCallService.ts");
  const schemaSrc = read("prisma/schema.prisma");
  const migSrc = read(
    "prisma/migrations/20260805140000_real_calls_telepro/migration.sql",
  );

  it("APIs exigent requireTelepro (pas requireManager)", () => {
    expect(routeSrc).toContain("requireTelepro");
    expect(detailSrc).toContain("requireTelepro");
    expect(routeSrc).not.toContain("requireManager");
    expect(detailSrc).not.toContain("requireManager");
  });

  it("filtre ownership teleproId + organizationId + MANUAL_UPLOAD", () => {
    expect(serviceSrc).toContain("teleproId: input.teleproId");
    expect(serviceSrc).toContain("organizationId: input.organizationId");
    expect(serviceSrc).toContain("RecordingSource.MANUAL_UPLOAD");
    expect(serviceSrc).toContain("throw new HttpError(404");
  });

  it("consentement / rightsConfirmed obligatoire", () => {
    expect(routeSrc).toContain("rightsConfirmed: z.literal(true)");
    expect(serviceSrc).toContain("rightsConfirmed");
    expect(serviceSrc).toContain("droit d'analyser cet appel");
  });

  it("MP3 uniquement (extension + MIME)", () => {
    expect(serviceSrc).toContain('".mp3"');
    expect(serviceSrc).toContain("audio/mpeg");
    expect(serviceSrc).toContain("415");
  });

  it("pipeline réel : jamais GENERATE, READY après coaching", () => {
    expect(refSrc).toContain("getRealCallAnalysisProvider");
    expect(refSrc).toContain("isTeleproRealCall");
    expect(refSrc).toContain("scenario.generation_skipped_real_call");
    const analyzeBlock = refSrc.slice(
      refSrc.indexOf("export async function analyzeReferenceCall"),
      refSrc.indexOf("export async function generateScenarioFromCall"),
    );
    expect(analyzeBlock).toContain("if (realCall)");
    expect(analyzeBlock).toContain("RecordingStatus.READY");
  });

  it("retry n'enfile pas GENERATE_SCENARIO_FROM_CALL", () => {
    expect(serviceSrc).toContain("JobType.PREPROCESS_RECORDING");
    expect(serviceSrc).toContain(
      "t !== JobType.GENERATE_SCENARIO_FROM_CALL",
    );
  });

  it("schéma additif + migration sans backfill/seed", () => {
    expect(schemaSrc).toContain("teleproId");
    expect(schemaSrc).toContain("coachingPayload");
    expect(schemaSrc).toContain("ownedRealCalls");
    expect(schemaSrc).toContain("consentConfirmedAt");
    expect(migSrc).toContain("ADD COLUMN");
    expect(migSrc).toContain("ROLLBACK manuel");
    const sqlOnly = migSrc
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(sqlOnly).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(sqlOnly).not.toMatch(/(?:^|\n)\s*UPDATE\s+/i);
    expect(sqlOnly).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("migration SQL : pas de jetons collés, ON espacé, identifiants <= 63 octets", () => {
    const sqlOnly = migSrc
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(sqlOnly).not.toMatch(/\)REFERENCES/i);
    expect(sqlOnly).not.toMatch(/\bON"/);
    expect(sqlOnly).not.toMatch(/"\(/); // identifiant collé à (
    expect(sqlOnly).toMatch(/\bON\s+"CallRecording"\s+\(/);
    expect(sqlOnly).toMatch(/\bON\s+"User"\s+\(/);
    expect(sqlOnly).toContain('REFERENCES "User" ("id", "organizationId")');
    expect(sqlOnly).toContain("ON DELETE RESTRICT");
    expect(sqlOnly).toContain("CallAnalysis_overallScore_range");
    expect(sqlOnly).toContain("consentConfirmedAt");
    expect(sqlOnly).toContain("User_id_organizationId_key");
    expect(sqlOnly).toContain("CallRecording_telepro_org_fkey");

    const quotedIds = [...sqlOnly.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    for (const id of quotedIds) {
      expect(Buffer.byteLength(id, "utf8")).toBeLessThanOrEqual(63);
    }
  });

  it("schéma Prisma : FK composite telepro + unique User(id, organizationId)", () => {
    expect(schemaSrc).toContain("@@unique([id, organizationId])");
    expect(schemaSrc).toContain(
      "fields: [teleproId, organizationId], references: [id, organizationId]",
    );
    expect(schemaSrc).toContain("onDelete: Restrict");
    expect(schemaSrc).toContain("consentConfirmedAt");
  });

  it("garde anti-génération : réel → pas GENERATE, generateScenario refuse MANUAL_UPLOAD", () => {
    expect(refSrc).not.toContain("GENERATE_SCENARIO_EXERCISE");
    expect(refSrc).toContain("GENERATE_SCENARIO_FROM_CALL");
    expect(refSrc).toContain("scenario.generation_skipped_real_call");
    expect(refSrc).toContain("isTeleproRealCall");
    const genBlock = refSrc.slice(
      refSrc.indexOf("export async function generateScenarioFromCall"),
    );
    expect(genBlock).toContain("isTeleproRealCall(rec)");
    expect(genBlock.indexOf("isTeleproRealCall(rec)")).toBeLessThan(
      genBlock.indexOf("prisma.scenario.create"),
    );
    expect(serviceSrc).not.toContain("prisma.scenario.create");
    expect(serviceSrc).not.toContain("prisma.promptBundle");
  });

  it("useAsModel=false pour les appels réels", () => {
    expect(serviceSrc).toContain("useAsModel: false");
  });

  it("vue liste sans champs sensibles", () => {
    const viewSrc = read("src/lib/realCallView.ts");
    expect(viewSrc).not.toContain("storageKey");
    expect(viewSrc).not.toContain("processingHash");
    expect(viewSrc).not.toContain("uploadUrl");
    expect(viewSrc).not.toContain("promptVersion");
    expect(viewSrc).not.toContain("consentConfirmedAt");
  });
});

describe("Q3A — service prepare/finalize/retry (mocks locaux)", () => {
  const snapshot = { ...process.env };

  const callRecording = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  };
  const user = {
    findFirst: vi.fn(),
  };

  beforeEach(() => {
    setEnv();
    vi.resetModules();
    callRecording.findFirst.mockReset();
    callRecording.findMany.mockReset();
    callRecording.create.mockReset();
    callRecording.updateMany.mockReset();
    user.findFirst.mockReset();
    user.findFirst.mockResolvedValue({ id: TELEPRO });

    vi.doMock("@/lib/db", () => ({
      prisma: { callRecording, user },
    }));
    vi.doMock("@/lib/audit", () => ({
      logAudit: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/jobs", () => ({
      enqueueJob: vi.fn(async () => ({ id: "job-1" })),
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
        put: vi.fn(async () => undefined),
        headObject: vi.fn(async () => ({ exists: true, size: 1024 })),
        createUploadUrl: undefined,
      }),
      isPersistentStorageConfigured: () => false,
    }));
  });

  afterEach(() => {
    process.env = { ...snapshot };
    __resetEnvCacheForTests();
    vi.resetModules();
    vi.unmock("@/lib/db");
    vi.unmock("@/lib/audit");
    vi.unmock("@/lib/jobs");
    vi.unmock("@/lib/jobTypes");
    vi.unmock("@/lib/providers");
  });

  const actor = {
    id: TELEPRO,
    organizationId: ORG,
    role: "TELEPRO",
  };

  it("prepare refuse sans consentement", async () => {
    const { prepareRealCallUpload } = await import("@/lib/realCallService");
    await expect(
      prepareRealCallUpload(actor, {
        rightsConfirmed: false as unknown as true,
        fileName: "a.mp3",
        mimeType: "audio/mpeg",
        sizeBytes: 1000,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("prepare refuse non-MP3", async () => {
    const { prepareRealCallUpload } = await import("@/lib/realCallService");
    await expect(
      prepareRealCallUpload(actor, {
        rightsConfirmed: true,
        fileName: "a.wav",
        mimeType: "audio/wav",
        sizeBytes: 1000,
      }),
    ).rejects.toMatchObject({ status: 415 });
  });

  it("prepare refuse taille excessive", async () => {
    const { prepareRealCallUpload } = await import("@/lib/realCallService");
    await expect(
      prepareRealCallUpload(actor, {
        rightsConfirmed: true,
        fileName: "a.mp3",
        mimeType: "audio/mpeg",
        sizeBytes: 999_999_999_999,
      }),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("prepare crée un PENDING_UPLOAD useAsModel=false + consentConfirmedAt serveur", async () => {
    callRecording.create.mockResolvedValue({});
    const { prepareRealCallUpload } = await import("@/lib/realCallService");
    const forged = "2000-01-01T00:00:00.000Z";
    const before = Date.now();
    const res = await prepareRealCallUpload(actor, {
      rightsConfirmed: true,
      fileName: "appel.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: 2048,
      consentConfirmedAt: forged,
    });
    const after = Date.now();
    expect(res.status).toBe(RecordingStatus.PENDING_UPLOAD);
    expect(callRecording.create).toHaveBeenCalledTimes(1);
    const data = callRecording.create.mock.calls[0]![0].data;
    expect(data.teleproId).toBe(TELEPRO);
    expect(data.organizationId).toBe(ORG);
    expect(data.source).toBe(RecordingSource.MANUAL_UPLOAD);
    expect(data.useAsModel).toBe(false);
    expect(data.consent).toBe(true);
    expect(data.consentAt).toBeTruthy();
    expect(data.consentConfirmedAt).toBeTruthy();
    expect(data.consentConfirmedAt).not.toBe(forged);
    const ts = Date.parse(data.consentConfirmedAt);
    expect(ts).toBeGreaterThanOrEqual(before - 1000);
    expect(ts).toBeLessThanOrEqual(after + 1000);
    expect(user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TELEPRO, organizationId: ORG },
      }),
    );
  });

  it("prepare refuse télépro hors organisation (couple incohérent)", async () => {
    user.findFirst.mockResolvedValue(null);
    const { prepareRealCallUpload } = await import("@/lib/realCallService");
    await expect(
      prepareRealCallUpload(
        { id: TELEPRO, organizationId: "org-other", role: "TELEPRO" },
        {
          rightsConfirmed: true,
          fileName: "a.mp3",
          mimeType: "audio/mpeg",
          sizeBytes: 1000,
        },
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(callRecording.create).not.toHaveBeenCalled();
  });

  it("finalize refuse mauvais propriétaire (404)", async () => {
    callRecording.findFirst.mockResolvedValue(null);
    const { finalizeRealCallUpload } = await import("@/lib/realCallService");
    await expect(
      finalizeRealCallUpload(actor, "other-id", {
        fileBuffer: Buffer.from("ID3"),
        fileName: "a.mp3",
        fileMimeType: "audio/mpeg",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("finalize avec fichier enfile PREPROCESS une fois", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "r1",
      status: RecordingStatus.PENDING_UPLOAD,
      storageKey: `${ORG}/uuid.mp3`,
      sizeBytes: 3,
      mimeType: "audio/mpeg",
      createdAt: new Date().toISOString(),
    });
    callRecording.updateMany.mockResolvedValue({ count: 1 });
    const jobs = await import("@/lib/jobs");
    const { finalizeRealCallUpload } = await import("@/lib/realCallService");
    const res = await finalizeRealCallUpload(actor, "r1", {
      fileBuffer: Buffer.from("ID3"),
      fileName: "a.mp3",
      fileMimeType: "audio/mpeg",
    });
    expect(res.jobEnqueued).toBe(true);
    expect(jobs.enqueueJob).toHaveBeenCalledTimes(1);
    expect(vi.mocked(jobs.enqueueJob).mock.calls[0]![0].type).toBe(
      "PREPROCESS_RECORDING",
    );
  });

  it("retry idempotent n'enfile que PREPROCESS", async () => {
    callRecording.findFirst.mockResolvedValue({
      id: "r1",
      status: RecordingStatus.FAILED,
      storageKey: `${ORG}/uuid.mp3`,
      sizeBytes: 100,
      mimeType: "audio/mpeg",
      createdAt: new Date().toISOString(),
    });
    callRecording.updateMany.mockResolvedValue({ count: 1 });
    const jobs = await import("@/lib/jobs");
    const { retryRealCallProcessing } = await import("@/lib/realCallService");
    await retryRealCallProcessing(actor, "r1");
    expect(jobs.enqueueJob).toHaveBeenCalledTimes(1);
    expect(vi.mocked(jobs.enqueueJob).mock.calls[0]![0].type).toBe(
      "PREPROCESS_RECORDING",
    );
    expect(
      vi
        .mocked(jobs.enqueueJob)
        .mock.calls.some((c) => c[0].type === "GENERATE_SCENARIO_FROM_CALL"),
    ).toBe(false);
  });

  it("liste filtre uniquement les appels du télépro", async () => {
    callRecording.findMany.mockResolvedValue([]);
    const { listRealCallsForTelepro } = await import("@/lib/realCallService");
    await listRealCallsForTelepro(actor);
    expect(callRecording.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          teleproId: TELEPRO,
          organizationId: ORG,
          source: RecordingSource.MANUAL_UPLOAD,
        }),
      }),
    );
  });
});

describe("Q3A — routes HTTP (auth manager refusé)", () => {
  const snapshot = { ...process.env };

  beforeEach(() => {
    setEnv();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...snapshot };
    __resetEnvCacheForTests();
    vi.resetModules();
    vi.unmock("@/lib/auth");
  });

  it("manager reçoit 403 sur GET /api/real-calls", async () => {
    vi.doMock("@/lib/auth", () => ({
      requireTelepro: vi.fn(async () => {
        const { HttpError } = await import("@/lib/httpError");
        throw new HttpError(403, "Accès réservé au téléprospecteur.");
      }),
    }));
    const { GET } = await import("@/app/api/real-calls/route");
    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toMatch(/téléprospecteur/i);
  });
});
