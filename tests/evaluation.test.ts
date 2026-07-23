import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EvaluationResultSchema } from "@/lib/providers/schemas";
import { __resetEnvCacheForTests } from "@/lib/env";

function setEnv(aiProvider: "demo" | "openai"): void {
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = "test";
  env.DATABASE_URL = "postgresql://u:p@localhost:5432/db?schema=public";
  env.SESSION_SECRET = "0123456789012345678901234567890123456789";
  env.STORAGE_DRIVER = "local";
  env.AI_PROVIDER = aiProvider;
  if (aiProvider === "openai") env.OPENAI_API_KEY = "sk-test";
  else delete env.OPENAI_API_KEY;
  __resetEnvCacheForTests();
}

describe("validation Zod de l'évaluation", () => {
  it("accepte une évaluation démo complète", async () => {
    setEnv("demo");
    const { demoEvaluation } = await import("@/lib/providers/demo");
    const result = await demoEvaluation.evaluate({
      turns: [
        { role: "PROSPECT", content: "Allô ?", atMs: 1000 },
        { role: "AGENT", content: "Bonjour, je suis Julie. Comment allez-vous ?", atMs: 4000 },
      ],
      rubric: [{ key: "accroche", label: "Accroche", weight: 20 }],
      scenarioLevel: "MOYEN",
      seed: "seed-1",
    });
    expect(() => EvaluationResultSchema.parse(result)).not.toThrow();
  });

  it("rejette une évaluation partielle/malformée", () => {
    const partial = { overallScore: 80, summary: "ok" };
    expect(() => EvaluationResultSchema.parse(partial)).toThrow();
  });

  it("rejette un score hors bornes", () => {
    expect(() =>
      EvaluationResultSchema.parse({
        overallScore: 250,
        summary: "",
        strengths: [],
        improvements: [],
        advice: [],
        betterExample: "",
        keyMoments: [],
        outcome: "RDV",
        skillScores: [
          { key: "a", label: "A", score: 1, maxScore: 2, rationale: "", evidence: "", recommendation: "" },
        ],
      }),
    ).toThrow();
  });
});

describe("séparation explicite des providers demo/openai", () => {
  const snapshot = { ...process.env };
  beforeEach(() => __resetEnvCacheForTests());
  afterEach(() => {
    process.env = { ...snapshot };
    __resetEnvCacheForTests();
  });

  it("mode démo : fournit des providers déterministes", async () => {
    setEnv("demo");
    const providers = await import("@/lib/providers");
    expect(providers.getEvaluationProvider()).toBeDefined();
    expect(providers.getTranscriptionProvider()).toBeDefined();
    expect(providers.getRealtimeSessionProvider()).toBeDefined();
  });

  it("mode openai : refuse les providers non implémentés (pas de fallback silencieux)", async () => {
    setEnv("openai");
    const providers = await import("@/lib/providers");
    expect(() => providers.getEvaluationProvider()).toThrow(/openai/i);
    expect(() => providers.getTranscriptionProvider()).toThrow(/openai/i);
    // La session Realtime, elle, est réellement implémentée en mode openai.
    expect(providers.getRealtimeSessionProvider()).toBeDefined();
  });
});
