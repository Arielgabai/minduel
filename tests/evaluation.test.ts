import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

  it("mode openai : évaluation + Realtime implémentés ; transcription/extraction non (pas de fallback silencieux)", async () => {
    setEnv("openai");
    const providers = await import("@/lib/providers");
    // Évaluation OpenAI désormais réellement implémentée (exécutée par le worker).
    expect(providers.getEvaluationProvider()).toBeDefined();
    // Session Realtime réellement implémentée en mode openai.
    expect(providers.getRealtimeSessionProvider()).toBeDefined();
    // Transcription / extraction : NON implémentées → erreur explicite (jamais de démo silencieuse).
    expect(() => providers.getTranscriptionProvider()).toThrow(/openai/i);
    expect(() => providers.getKnowledgeExtractionProvider()).toThrow(/openai/i);
  });
});

describe("OpenAIEvaluationProvider (Structured Outputs + revalidation serveur)", () => {
  const snapshot = { ...process.env };

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...snapshot };
    __resetEnvCacheForTests();
  });

  function stubFetch(response: {
    ok?: boolean;
    status?: number;
    payload?: unknown;
    text?: string;
  }): void {
    const res = {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => response.payload,
      text: async () => response.text ?? JSON.stringify(response.payload ?? {}),
    };
    vi.stubGlobal("fetch", vi.fn(async () => res as unknown as Response));
  }

  function modelPayload(output: unknown) {
    return { choices: [{ message: { content: JSON.stringify(output) } }] };
  }

  const baseInput = {
    turns: [
      { role: "AGENT", content: "Bonjour, je suis Julie.", atMs: 1000 },
      { role: "PROSPECT", content: "Oui, allo.", atMs: 2000 },
    ],
    scenarioLevel: "MOYEN",
    seed: "s-1",
  };

  it("recalcule le score global (somme des critères) et borne chaque score au poids", async () => {
    setEnv("openai");
    stubFetch({
      payload: modelPayload({
        overallScore: 5, // valeur bidon du modèle : doit être IGNORÉE
        summary: "Bon appel.",
        strengths: ["Accroche claire"],
        improvements: ["Creuser le besoin"],
        advice: ["Reformuler"],
        betterExample: "Bonjour ...",
        keyMoments: [{ role: "AGENT", quote: "Bonjour", atMs: 1000 }],
        outcome: "RDV",
        skillScores: [
          { key: "accroche", label: "Accroche", score: 999, maxScore: 20, rationale: "r", evidence: "e", recommendation: "c" },
          { key: "decouverte", label: "Découverte", score: 10, maxScore: 30, rationale: "r", evidence: "e", recommendation: "c" },
        ],
      }),
    });
    const { OpenAIEvaluationProvider } = await import("@/lib/providers/openai");
    const result = await new OpenAIEvaluationProvider().evaluate({
      ...baseInput,
      rubric: [
        { key: "accroche", label: "Accroche", weight: 20 },
        { key: "decouverte", label: "Découverte", weight: 30 },
      ],
    });
    const accroche = result.skillScores.find((s) => s.key === "accroche")!;
    const decouverte = result.skillScores.find((s) => s.key === "decouverte")!;
    expect(accroche.score).toBe(20); // borné au poids
    expect(accroche.maxScore).toBe(20);
    expect(decouverte.score).toBe(10);
    // Score global = somme recalculée (20 + 10), jamais le 5 renvoyé par le modèle.
    expect(result.overallScore).toBe(30);
  });

  it("plafonne le score global à 100", async () => {
    setEnv("openai");
    stubFetch({
      payload: modelPayload({
        overallScore: 0,
        summary: "",
        strengths: [],
        improvements: [],
        advice: [],
        betterExample: "",
        keyMoments: [],
        outcome: "VENTE",
        skillScores: [
          { key: "a", label: "A", score: 60, maxScore: 60, rationale: "r", evidence: "e", recommendation: "c" },
          { key: "b", label: "B", score: 60, maxScore: 60, rationale: "r", evidence: "e", recommendation: "c" },
        ],
      }),
    });
    const { OpenAIEvaluationProvider } = await import("@/lib/providers/openai");
    const result = await new OpenAIEvaluationProvider().evaluate({
      ...baseInput,
      rubric: [
        { key: "a", label: "A", weight: 60 },
        { key: "b", label: "B", weight: 60 },
      ],
    });
    expect(result.overallScore).toBe(100);
  });

  it("ignore les clés inconnues et score 0 les critères absents (aligné sur la grille)", async () => {
    setEnv("openai");
    stubFetch({
      payload: modelPayload({
        overallScore: 99,
        summary: "s",
        strengths: [],
        improvements: [],
        advice: [],
        betterExample: "",
        keyMoments: [],
        outcome: "AUTRE",
        skillScores: [
          { key: "accroche", label: "Accroche", score: 15, maxScore: 20, rationale: "r", evidence: "e", recommendation: "c" },
          { key: "inconnu", label: "X", score: 40, maxScore: 40, rationale: "r", evidence: "e", recommendation: "c" },
        ],
      }),
    });
    const { OpenAIEvaluationProvider } = await import("@/lib/providers/openai");
    const result = await new OpenAIEvaluationProvider().evaluate({
      ...baseInput,
      rubric: [
        { key: "accroche", label: "Accroche", weight: 20 },
        { key: "closing", label: "Closing", weight: 25 },
      ],
    });
    expect(result.skillScores.map((s) => s.key).sort()).toEqual(["accroche", "closing"]);
    expect(result.skillScores.find((s) => s.key === "closing")!.score).toBe(0);
    expect(result.overallScore).toBe(15); // seul "accroche" compte
  });

  it("normalise un outcome invalide en AUTRE", async () => {
    setEnv("openai");
    stubFetch({
      payload: modelPayload({
        overallScore: 0,
        summary: "",
        strengths: [],
        improvements: [],
        advice: [],
        betterExample: "",
        keyMoments: [],
        outcome: "BANANE",
        skillScores: [
          { key: "a", label: "A", score: 5, maxScore: 10, rationale: "r", evidence: "e", recommendation: "c" },
        ],
      }),
    });
    const { OpenAIEvaluationProvider } = await import("@/lib/providers/openai");
    const result = await new OpenAIEvaluationProvider().evaluate({
      ...baseInput,
      rubric: [{ key: "a", label: "A", weight: 10 }],
    });
    expect(result.outcome).toBe("AUTRE");
  });

  it("rejette une réponse OpenAI illisible (JSON invalide)", async () => {
    setEnv("openai");
    stubFetch({ payload: { choices: [{ message: { content: "pas du json {" } }] } });
    const { OpenAIEvaluationProvider } = await import("@/lib/providers/openai");
    await expect(
      new OpenAIEvaluationProvider().evaluate({
        ...baseInput,
        rubric: [{ key: "a", label: "A", weight: 10 }],
      }),
    ).rejects.toThrow();
  });

  it("rejette un refus du modèle", async () => {
    setEnv("openai");
    stubFetch({ payload: { choices: [{ message: { refusal: "je ne peux pas" } }] } });
    const { OpenAIEvaluationProvider } = await import("@/lib/providers/openai");
    await expect(
      new OpenAIEvaluationProvider().evaluate({
        ...baseInput,
        rubric: [{ key: "a", label: "A", weight: 10 }],
      }),
    ).rejects.toThrow();
  });

  it("rejette une erreur HTTP OpenAI", async () => {
    setEnv("openai");
    stubFetch({ ok: false, status: 500, text: "server error" });
    const { OpenAIEvaluationProvider } = await import("@/lib/providers/openai");
    await expect(
      new OpenAIEvaluationProvider().evaluate({
        ...baseInput,
        rubric: [{ key: "a", label: "A", weight: 10 }],
      }),
    ).rejects.toThrow();
  });
});
