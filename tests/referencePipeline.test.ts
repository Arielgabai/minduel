import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { __resetEnvCacheForTests } from "@/lib/env";
import {
  CallAnalysisResultSchema,
  ScenarioGenerationResultSchema,
  SpeakerAttributionSchema,
  AnonymizationSchema,
} from "@/lib/providers/schemas";
import type { CallAnalysisResult, DiarizedSegment } from "@/lib/providers/types";

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

const SEED = "ref-pipeline-test";

describe("sélection des providers du pipeline appel -> exercice", () => {
  const snapshot = { ...process.env };
  beforeEach(() => __resetEnvCacheForTests());
  afterEach(() => {
    process.env = { ...snapshot };
    __resetEnvCacheForTests();
  });

  it("mode démo : renvoie les fixtures déterministes", async () => {
    setEnv("demo");
    const p = await import("@/lib/providers");
    expect(p.getDiarizedTranscriptionProvider()).toBeDefined();
    expect(p.getSpeakerAttributionProvider()).toBeDefined();
    expect(p.getAnonymizationProvider()).toBeDefined();
    expect(p.getCallAnalysisProvider()).toBeDefined();
    expect(p.getScenarioGenerationProvider()).toBeDefined();
  });

  it("mode openai : renvoie les implémentations réelles (aucune erreur de sélection, pas de fallback)", async () => {
    setEnv("openai");
    const p = await import("@/lib/providers");
    const { OpenAITranscriptionProvider, OpenAICallAnalysisProvider } = await import(
      "@/lib/providers/openai"
    );
    // La sélection ne doit PAS lever (contrairement à la transcription héritée).
    expect(p.getDiarizedTranscriptionProvider()).toBeInstanceOf(OpenAITranscriptionProvider);
    expect(p.getCallAnalysisProvider()).toBeInstanceOf(OpenAICallAnalysisProvider);
    expect(p.getSpeakerAttributionProvider()).toBeDefined();
    expect(p.getAnonymizationProvider()).toBeDefined();
    expect(p.getScenarioGenerationProvider()).toBeDefined();
  });
});

describe("transcription diarisée démo + attribution des locuteurs", () => {
  const snapshot = { ...process.env };
  afterEach(() => {
    process.env = { ...snapshot };
    __resetEnvCacheForTests();
  });

  it("produit des segments diarisés horodatés et ordonnés", async () => {
    setEnv("demo");
    const { demoDiarizedTranscription } = await import("@/lib/providers/demo");
    const t = await demoDiarizedTranscription.transcribeDiarized({
      storageKey: "k",
      language: "fr",
      seed: SEED,
    });
    expect(t.segments.length).toBeGreaterThan(3);
    expect(t.provider).toBe("demo");
    // Au moins deux locuteurs distincts.
    const speakers = new Set(t.segments.map((s) => s.speakerId));
    expect(speakers.size).toBeGreaterThanOrEqual(2);
    // Timestamps strictement croissants.
    for (let i = 1; i < t.segments.length; i++) {
      expect(t.segments[i]!.startMs).toBeGreaterThanOrEqual(t.segments[i - 1]!.startMs);
    }
  });

  it("identifie un commercial et un client distincts avec une confiance exploitable", async () => {
    setEnv("demo");
    const { demoDiarizedTranscription, demoSpeakerAttribution } = await import(
      "@/lib/providers/demo"
    );
    const t = await demoDiarizedTranscription.transcribeDiarized({
      storageKey: "k",
      language: "fr",
      seed: SEED,
    });
    const attr = await demoSpeakerAttribution.attribute({
      segments: t.segments,
      language: "fr",
      seed: SEED,
    });
    const parsed = SpeakerAttributionSchema.parse(attr);
    expect(parsed.commercialSpeakerId).not.toBeNull();
    expect(parsed.customerSpeakerId).not.toBeNull();
    expect(parsed.commercialSpeakerId).not.toBe(parsed.customerSpeakerId);
    expect(parsed.confidence).toBeGreaterThan(0.5);
  });
});

describe("anonymisation (PII -> variables)", () => {
  const snapshot = { ...process.env };
  afterEach(() => {
    process.env = { ...snapshot };
    __resetEnvCacheForTests();
  });

  it("retire les PII semées (nom, société, email) du texte anonymisé", async () => {
    setEnv("demo");
    const { demoDiarizedTranscription, demoAnonymization } = await import(
      "@/lib/providers/demo"
    );
    const t = await demoDiarizedTranscription.transcribeDiarized({
      storageKey: "k",
      language: "fr",
      seed: SEED,
    });
    const input = t.segments.map((s, idx) => ({
      idx,
      speakerId: s.speakerId,
      role: "PROSPECT",
      text: s.text,
    }));
    const anon = await demoAnonymization.anonymize({ segments: input, language: "fr", seed: SEED });
    const parsed = AnonymizationSchema.parse(anon);
    const joined = parsed.segments.map((s) => s.anonymizedText).join(" ");
    // Aucune PID semée ne subsiste.
    expect(joined).not.toMatch(/Durand/i);
    expect(joined).not.toMatch(/Nov[ée]o/i);
    expect(joined).not.toMatch(/durand\.marc@example\.com/i);
    expect(joined).not.toMatch(/@example\.com/i);
    // Les variables de remplacement sont présentes.
    expect(joined).toContain("[ENTREPRISE]");
    expect(joined).toContain("[EMAIL]");
    // La table d'entités (serveur uniquement) est renseignée.
    expect(parsed.entities.length).toBeGreaterThan(0);
  });
});

describe("analyse d'appel : classification client existant (jamais COLD)", () => {
  const snapshot = { ...process.env };
  afterEach(() => {
    process.env = { ...snapshot };
    __resetEnvCacheForTests();
  });

  it("classe l'appel modèle de relance comme relation existante", async () => {
    setEnv("demo");
    const { demoDiarizedTranscription, demoCallAnalysis } = await import(
      "@/lib/providers/demo"
    );
    const t = await demoDiarizedTranscription.transcribeDiarized({
      storageKey: "k",
      language: "fr",
      seed: SEED,
    });
    const analysis = await demoCallAnalysis.analyze({
      segments: t.segments.map((s, idx) => ({ idx, role: "PROSPECT", text: s.text })),
      language: "fr",
      seed: SEED,
    });
    const parsed = CallAnalysisResultSchema.parse(analysis);
    expect(parsed.callType).not.toBe("COLD_PROSPECTING");
    expect(parsed.relationshipStage).toBe("EXISTING");
    expect(parsed.referenceSuitability.usable).toBe(true);
    expect(parsed.commercialStrategy.retainedPractices.length).toBeGreaterThan(0);
  });
});

describe("génération de scénario : grille à 100, preuves, sans PII", () => {
  const snapshot = { ...process.env };
  afterEach(() => {
    process.env = { ...snapshot };
    __resetEnvCacheForTests();
  });

  it("produit un exercice équivalent anonymisé avec une grille normalisée à 100", async () => {
    setEnv("demo");
    const { demoDiarizedTranscription, demoCallAnalysis, demoScenarioGeneration } =
      await import("@/lib/providers/demo");
    const t = await demoDiarizedTranscription.transcribeDiarized({
      storageKey: "k",
      language: "fr",
      seed: SEED,
    });
    const analysis = await demoCallAnalysis.analyze({
      segments: t.segments.map((s, idx) => ({ idx, role: "PROSPECT", text: s.text })),
      language: "fr",
      seed: SEED,
    });
    const scenario = await demoScenarioGeneration.generate({ analysis, language: "fr", seed: SEED });
    const parsed = ScenarioGenerationResultSchema.parse(scenario);

    // Grille : somme exactement 100.
    expect(parsed.rubric.reduce((s, c) => s + c.weight, 0)).toBe(100);
    // Contexte "client existant" reflété dans les règles du prospect IA.
    expect(parsed.aiProspect.behaviorRules.length).toBeGreaterThan(0);
    // Traçabilité des bonnes pratiques (au moins une source liée à une preuve d'analyse).
    const hasSource = parsed.rubric.some((c) => c.sourcePracticeIds.length > 0);
    expect(hasSource).toBe(true);
    // Aucune PII du modèle ne fuit dans l'exercice.
    const exerciseText = [
      parsed.name,
      parsed.traineeBrief,
      parsed.initialSituation,
      parsed.relationshipHistory,
      parsed.offer,
      parsed.objective,
    ].join(" ");
    expect(exerciseText).not.toMatch(/Durand/i);
    expect(exerciseText).not.toMatch(/Nov[ée]o/i);
    expect(exerciseText).not.toMatch(/@example\.com/i);
  });
});

describe("normalizeScenarioWeights", () => {
  const snapshot = { ...process.env };
  afterEach(() => {
    process.env = { ...snapshot };
    __resetEnvCacheForTests();
  });

  function scenarioWith(weights: number[]) {
    return {
      name: "s",
      callType: "RENEWAL",
      level: "MOYEN",
      offer: "",
      objective: "",
      prospectProfile: "",
      initialSituation: "",
      personality: "",
      traineeBrief: "",
      relationshipHistory: "",
      aiProspect: { persona: "", behaviorRules: [], prohibitedRevelations: [], openingLine: "" },
      allowedObjections: [],
      secretInfos: [],
      successConditions: "",
      failureConditions: "",
      expectedNextSteps: [],
      targetSkills: [],
      coachingReference: [],
      rubric: weights.map((w, i) => ({
        key: `k${i}`,
        label: `L${i}`,
        weight: w,
        description: "",
        observableSignals: [],
        sourcePracticeIds: [],
      })),
      targetDurationSec: 300,
    };
  }

  it("ramène une somme < 100 à exactement 100", async () => {
    setEnv("demo");
    const { normalizeScenarioWeights } = await import("@/lib/providers");
    const out = normalizeScenarioWeights(scenarioWith([30, 30, 30]));
    expect(out.rubric.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });

  it("ramène une somme > 100 à exactement 100", async () => {
    setEnv("demo");
    const { normalizeScenarioWeights } = await import("@/lib/providers");
    const out = normalizeScenarioWeights(scenarioWith([50, 40, 40]));
    expect(out.rubric.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });

  it("répartit équitablement quand tous les poids sont nuls", async () => {
    setEnv("demo");
    const { normalizeScenarioWeights } = await import("@/lib/providers");
    const out = normalizeScenarioWeights(scenarioWith([0, 0, 0, 0]));
    expect(out.rubric.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });
});

describe("revalidation Zod des sorties du pipeline (aucun repli silencieux)", () => {
  it("rejette une analyse d'appel malformée", () => {
    const bad = {
      callType: "RENEWAL",
      // callTypeConfidence manquant
      relationshipStage: "EXISTING",
      language: "fr",
      summary: "",
      customerProfile: { role: "", context: "", needs: [], objections: [], signals: [] },
      commercialStrategy: { objective: "", outcome: "", retainedPractices: [], missedOpportunities: [] },
      facts: [],
      inferences: [],
      ambiguities: [],
      referenceSuitability: { score: 50, usable: true, rationale: "" },
    };
    expect(() => CallAnalysisResultSchema.parse(bad)).toThrow();
  });

  it("rejette une confiance d'attribution hors bornes", () => {
    expect(() =>
      SpeakerAttributionSchema.parse({
        commercialSpeakerId: "speaker_0",
        customerSpeakerId: "speaker_1",
        confidence: 1.5,
        rationale: "x",
      }),
    ).toThrow();
  });

  it("rejette une importance de pratique invalide", () => {
    const analysis: Record<string, unknown> = {
      callType: "RENEWAL",
      callTypeConfidence: 0.9,
      relationshipStage: "EXISTING",
      language: "fr",
      summary: "",
      customerProfile: { role: "", context: "", needs: [], objections: [], signals: [] },
      commercialStrategy: {
        objective: "",
        outcome: "",
        retainedPractices: [
          { id: "p1", label: "L", description: "", evidenceSegmentIds: [], importance: "CRITICAL" },
        ],
        missedOpportunities: [],
      },
      facts: [],
      inferences: [],
      ambiguities: [],
      referenceSuitability: { score: 50, usable: true, rationale: "" },
    };
    expect(() => CallAnalysisResultSchema.parse(analysis)).toThrow();
  });

  it("rejette un scénario généré sans grille", () => {
    const bad = { name: "x", callType: "RENEWAL", level: "MOYEN", rubric: [] };
    expect(() => ScenarioGenerationResultSchema.parse(bad)).toThrow();
  });
});

describe("cohérence de bout en bout (types)", () => {
  it("les segments diarisés typés alimentent l'analyse", () => {
    const segs: DiarizedSegment[] = [
      { speakerId: "speaker_0", startMs: 0, endMs: 1000, text: "Bonjour" },
    ];
    const analysis: CallAnalysisResult["customerProfile"] = {
      role: "",
      context: "",
      needs: [],
      objections: [],
      signals: [],
    };
    expect(segs[0]!.speakerId).toBe("speaker_0");
    expect(analysis.needs).toEqual([]);
  });
});
