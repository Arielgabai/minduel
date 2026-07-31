import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EvaluationResultSchema } from "@/lib/providers/schemas";
import { __resetEnvCacheForTests } from "@/lib/env";
import { hashPromptArtifacts } from "@/lib/promptArtifacts";

const evalRunState = vi.hoisted(() => ({
  bundles: [] as Array<{
    id: string;
    organizationId: string;
    scenarioId: string;
    version: number;
    status: string;
    artifacts: string;
    contentHash: string;
  }>,
  simulations: [] as Array<{
    id: string;
    organizationId: string;
    scenarioId: string;
    teleproId: string;
    prospectName: string | null;
    promptBundleId: string | null;
    promptBundleVersion: number | null;
    promptContentHash: string | null;
    outcome: string | null;
    status: string;
  }>,
  turns: [] as Array<{ simulationId: string; role: string; content: string; atMs: number }>,
  evaluateMock: vi.fn(),
  promptBundleFindFirstCalls: [] as string[],
  scenarioFixture: {
    id: "00000000-0000-4000-8000-000000000004",
    organizationId: "00000000-0000-4000-8000-000000000001",
    name: "Exercice v1",
    level: "MOYEN",
    callType: "VENTE",
    offer: "Offre test",
    objective: "Objectif test",
    prospectProfile: "Profil test",
    successConditions: "Succès",
    failureConditions: "Échec",
    knowledgeRefs: null,
    rubric: null,
    publishedPromptBundleId: null as string | null,
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    simulation: {
      findFirstOrThrow: async ({
        where,
        include,
      }: {
        where: { id: string; organizationId: string };
        include?: { turns?: unknown };
      }) => {
        const sim = evalRunState.simulations.find(
          (s) => s.id === where.id && s.organizationId === where.organizationId,
        );
        if (!sim) throw new Error("Simulation introuvable");
        return {
          ...sim,
          scenario: evalRunState.scenarioFixture,
          turns: include?.turns
            ? evalRunState.turns.filter((t) => t.simulationId === sim.id)
            : undefined,
          evaluation: null,
        };
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const sim = evalRunState.simulations.find((s) => s.id === where.id);
        if (!sim) throw new Error("missing");
        Object.assign(sim, data);
        return sim;
      },
    },
    promptBundle: {
      findFirst: async ({ where }: { where: { id: string } }) => {
        evalRunState.promptBundleFindFirstCalls.push(where.id);
        return evalRunState.bundles.find((b) => b.id === where.id) ?? null;
      },
    },
    knowledgeItem: { findMany: async () => [] },
    scenarioAssignment: { updateMany: async () => ({ count: 1 }) },
    simulationEvaluation: { create: vi.fn(async () => ({ id: "eval-1" })) },
    $transaction: async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        simulationEvaluation: { create: vi.fn(async () => ({ id: "eval-1" })) },
        simulation: {
          update: async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            const sim = evalRunState.simulations.find((s) => s.id === where.id);
            if (sim) Object.assign(sim, data);
          },
        },
        scenarioAssignment: { updateMany: async () => ({ count: 1 }) },
      }),
  },
}));

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

describe("buildEvaluationPrompt (overrides PromptBundle)", () => {
  const baseInput = {
    turns: [
      { role: "AGENT", content: "Bonjour, je suis Julie.", atMs: 1000 },
      { role: "PROSPECT", content: "Oui, allo.", atMs: 2000 },
    ],
    rubric: [{ key: "accroche", label: "Accroche", weight: 20 }],
    scenarioLevel: "MOYEN",
    seed: "s-prompt",
    scenarioName: "Scénario Alpha",
    callType: "VENTE",
    objective: "Qualifier le besoin",
  };

  function pad(body: string): string {
    return body.length >= 20 ? body : body.padEnd(20, ".");
  }

  it("sans override conserve les prompts par défaut", async () => {
    const { buildEvaluationPrompt } = await import("@/lib/providers/openai");
    const baseline = buildEvaluationPrompt(baseInput);
    const withEmpty = buildEvaluationPrompt({
      ...baseInput,
      evaluationPromptOverrides: {},
    });
    expect(withEmpty).toEqual(baseline);
    expect(baseline.system).toContain("coach expert");
    expect(baseline.user).toContain("Scénario Alpha");
    expect(baseline.user).toContain("[0] TELEPRO: Bonjour");
  });

  it("EVALUATION_SYSTEM seul remplace le system et conserve le user par défaut", async () => {
    const { buildEvaluationPrompt } = await import("@/lib/providers/openai");
    const baseline = buildEvaluationPrompt(baseInput);
    const customSystem = pad("Coach custom pour {{scenarioName}} niveau {{level}}.");
    const result = buildEvaluationPrompt({
      ...baseInput,
      evaluationPromptOverrides: { system: customSystem },
    });
    expect(result.user).toBe(baseline.user);
    expect(result.system).toContain("Coach custom pour Scénario Alpha niveau MOYEN.");
    expect(result.system).toContain("Respecte STRICTEMENT le schéma JSON demandé.");
    expect(result.system).not.toContain("coach expert");
  });

  it("EVALUATION_USER seul remplace le user et conserve le system par défaut", async () => {
    const { buildEvaluationPrompt } = await import("@/lib/providers/openai");
    const baseline = buildEvaluationPrompt(baseInput);
    const customUser = pad("Évalue {{scenarioName}} avec transcript: {{transcript}}");
    const result = buildEvaluationPrompt({
      ...baseInput,
      evaluationPromptOverrides: { user: customUser },
    });
    expect(result.system).toBe(baseline.system);
    expect(result.user).toContain("Scénario Alpha");
    expect(result.user).toContain("[0] TELEPRO: Bonjour");
    expect(result.user).not.toContain("Conditions de réussite");
  });

  it("les deux overrides remplacent system et user", async () => {
    const { buildEvaluationPrompt } = await import("@/lib/providers/openai");
    const result = buildEvaluationPrompt({
      ...baseInput,
      evaluationPromptOverrides: {
        system: pad("System {{callType}}"),
        user: pad("User {{objective}}"),
      },
    });
    expect(result.system).toContain("System VENTE");
    expect(result.user).toContain("User Qualifier le besoin");
  });
});

describe("runSimulationEvaluation (snapshot PromptBundle)", () => {
  const ORG = "00000000-0000-4000-8000-000000000001";
  const SCENARIO = "00000000-0000-4000-8000-000000000004";
  const TELEPRO = "00000000-0000-4000-8000-000000000002";

  function personaBody(version: number) {
    return `Tu incarnes {{prospectName}} pour la version ${version} du bundle publie.`;
  }

  function makeArtifacts(version: number, evalExtras?: { system?: string; user?: string }) {
    const artifacts: Record<string, { body: string; contentType: string }> = {
      PROSPECT_PERSONA: {
        body: personaBody(version),
        contentType: "text/plain",
      },
    };
    if (evalExtras?.system) {
      artifacts.EVALUATION_SYSTEM = {
        body:
          evalExtras.system.length >= 20
            ? evalExtras.system
            : evalExtras.system.padEnd(20, "."),
        contentType: "text/plain",
      };
    }
    if (evalExtras?.user) {
      artifacts.EVALUATION_USER = {
        body:
          evalExtras.user.length >= 20 ? evalExtras.user : evalExtras.user.padEnd(20, "."),
        contentType: "text/plain",
      };
    }
    return artifacts;
  }

  function makeBundle(
    version: number,
    status: string,
    evalExtras?: { system?: string; user?: string },
  ) {
    const artifacts = makeArtifacts(version, evalExtras);
    const contentHash = hashPromptArtifacts(artifacts);
    return {
      id: `bundle-v${version}`,
      organizationId: ORG,
      scenarioId: SCENARIO,
      version,
      status,
      artifacts: JSON.stringify(artifacts),
      contentHash,
    };
  }

  function seedSim(
    bundle: ReturnType<typeof makeBundle> | null,
    overrides?: Partial<(typeof evalRunState.simulations)[number]>,
  ) {
    const sim = {
      id: "sim-eval-1",
      organizationId: ORG,
      scenarioId: SCENARIO,
      teleproId: TELEPRO,
      prospectName: "Sophie",
      promptBundleId: bundle?.id ?? null,
      promptBundleVersion: bundle?.version ?? null,
      promptContentHash: bundle?.contentHash ?? null,
      outcome: null,
      status: "EVALUATING",
      ...overrides,
    };
    evalRunState.simulations = [sim];
    evalRunState.turns = [
      { simulationId: sim.id, role: "AGENT", content: "Bonjour", atMs: 1000 },
      { simulationId: sim.id, role: "PROSPECT", content: "Oui", atMs: 2000 },
    ];
  }

  const evaluationResultFixture = {
    overallScore: 50,
    summary: "Résumé test",
    strengths: ["Point fort"],
    improvements: ["Amélioration"],
    advice: ["Conseil"],
    betterExample: "Exemple",
    keyMoments: [{ role: "AGENT", quote: "Bonjour", atMs: 1000 }],
    outcome: "RDV",
    skillScores: [
      {
        key: "accroche",
        label: "Accroche",
        score: 50,
        maxScore: 100,
        rationale: "r",
        evidence: "e",
        recommendation: "c",
      },
    ],
  };

  beforeEach(async () => {
    evalRunState.bundles = [];
    evalRunState.simulations = [];
    evalRunState.turns = [];
    evalRunState.promptBundleFindFirstCalls = [];
    evalRunState.scenarioFixture.publishedPromptBundleId = null;
    evalRunState.evaluateMock.mockReset();
    evalRunState.evaluateMock.mockResolvedValue(evaluationResultFixture);
    const providers = await import("@/lib/providers");
    vi.spyOn(providers, "getEvaluationProvider").mockReturnValue({
      evaluate: evalRunState.evaluateMock,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("simulation v1 epinglee recoit les overrides v1 alors que le scenario pointe v2", async () => {
    const v1 = makeBundle(1, "SUPERSEDED", {
      system: "Eval system v1 {{scenarioName}}",
      user: "Eval user v1 {{transcript}}",
    });
    const v2 = makeBundle(2, "PUBLISHED", {
      system: "Eval system v2 {{scenarioName}}",
      user: "Eval user v2 {{transcript}}",
    });
    evalRunState.bundles = [v1, v2];
    seedSim(v1);
    evalRunState.scenarioFixture.publishedPromptBundleId = v2.id;

    expect(evalRunState.scenarioFixture.publishedPromptBundleId).toBe(v2.id);
    expect(evalRunState.simulations[0]!.promptBundleId).toBe(v1.id);

    const { runSimulationEvaluation } = await import("@/lib/simulationService");
    await runSimulationEvaluation("sim-eval-1", ORG);

    expect(evalRunState.promptBundleFindFirstCalls).toEqual([v1.id]);
    expect(evalRunState.promptBundleFindFirstCalls).not.toContain(v2.id);

    expect(evalRunState.evaluateMock).toHaveBeenCalledOnce();
    const input = evalRunState.evaluateMock.mock.calls[0]![0] as {
      evaluationPromptOverrides?: { system?: string; user?: string };
    };
    expect(input.evaluationPromptOverrides?.system).toContain("Eval system v1");
    expect(input.evaluationPromptOverrides?.system).not.toContain("v2");
    expect(input.evaluationPromptOverrides?.user).toContain("Eval user v1");
  });

  it("bundle valide sans artifacts d'evaluation utilise les prompts par defaut", async () => {
    const bundle = makeBundle(1, "PUBLISHED");
    evalRunState.bundles = [bundle];
    seedSim(bundle);

    const { runSimulationEvaluation } = await import("@/lib/simulationService");
    await expect(runSimulationEvaluation("sim-eval-1", ORG)).resolves.toBeUndefined();

    expect(evalRunState.evaluateMock).toHaveBeenCalledOnce();
    const input = evalRunState.evaluateMock.mock.calls[0]![0] as {
      evaluationPromptOverrides?: unknown;
    };
    expect(input.evaluationPromptOverrides).toBeUndefined();
  });

  it("bundle SUPERSEDED reste utilisable pour l'évaluation", async () => {
    const v1 = makeBundle(1, "SUPERSEDED", {
      system: "Eval superseded {{scenarioName}}",
    });
    evalRunState.bundles = [v1];
    seedSim(v1);

    const { runSimulationEvaluation } = await import("@/lib/simulationService");
    await expect(runSimulationEvaluation("sim-eval-1", ORG)).resolves.toBeUndefined();
    expect(
      evalRunState.evaluateMock.mock.calls[0]![0].evaluationPromptOverrides?.system,
    ).toContain("Eval superseded");
  });

  it("simulation historique sans snapshot n'envoie aucun override", async () => {
    seedSim(null);

    const { runSimulationEvaluation } = await import("@/lib/simulationService");
    await runSimulationEvaluation("sim-eval-1", ORG);

    const input = evalRunState.evaluateMock.mock.calls[0]![0] as {
      evaluationPromptOverrides?: unknown;
    };
    expect(input.evaluationPromptOverrides).toBeUndefined();
  });

  it("snapshot partiel refuse l'évaluation sans fallback", async () => {
    const v1 = makeBundle(1, "PUBLISHED");
    evalRunState.bundles = [v1];
    seedSim(v1, { promptBundleVersion: null, promptContentHash: null });

    const { runSimulationEvaluation } = await import("@/lib/simulationService");
    await expect(runSimulationEvaluation("sim-eval-1", ORG)).rejects.toMatchObject({
      status: 500,
      message: "Snapshot de prompts incomplet pour la simulation.",
    });
    expect(evalRunState.evaluateMock).not.toHaveBeenCalled();
  });

  it("bundle DRAFT refuse l'évaluation", async () => {
    const draft = makeBundle(1, "DRAFT", { system: "Eval draft {{scenarioName}}" });
    evalRunState.bundles = [draft];
    seedSim(draft);

    const { runSimulationEvaluation } = await import("@/lib/simulationService");
    await expect(runSimulationEvaluation("sim-eval-1", ORG)).rejects.toMatchObject({
      status: 500,
      message: "Bundle de prompts non utilisable pour la simulation.",
    });
    expect(evalRunState.evaluateMock).not.toHaveBeenCalled();
  });

  it("hash incohérent refuse l'évaluation", async () => {
    const bundle = makeBundle(1, "PUBLISHED");
    evalRunState.bundles = [bundle];
    seedSim(bundle, { promptContentHash: "deadbeef".repeat(8) });

    const { runSimulationEvaluation } = await import("@/lib/simulationService");
    await expect(runSimulationEvaluation("sim-eval-1", ORG)).rejects.toMatchObject({
      status: 500,
      message: "Hash du bundle de prompts incohérent.",
    });
    expect(evalRunState.evaluateMock).not.toHaveBeenCalled();
  });

  it("le provider demo ignore les overrides sans changer le résultat", async () => {
    setEnv("demo");
    const { demoEvaluation } = await import("@/lib/providers/demo");
    const input = {
      turns: [
        { role: "PROSPECT", content: "Allô ?", atMs: 1000 },
        {
          role: "AGENT",
          content: "Bonjour, je suis Julie de la société Novéo, au sujet de votre facture.",
          atMs: 4000,
        },
      ],
      rubric: [{ key: "accroche", label: "Accroche", weight: 20 }],
      scenarioLevel: "MOYEN",
      seed: "demo-override-seed",
      evaluationPromptOverrides: {
        system: "Override system qui ne doit rien changer",
        user: "Override user qui ne doit rien changer",
      },
    };
    const without = await demoEvaluation.evaluate({
      ...input,
      evaluationPromptOverrides: undefined,
    });
    const withOverrides = await demoEvaluation.evaluate(input);
    expect(withOverrides).toEqual(without);
    expect(() => EvaluationResultSchema.parse(withOverrides)).not.toThrow();
  });
});
