import { z } from "zod";

/**
 * Schéma de validation de la sortie d'un EvaluationProvider AVANT écriture en base.
 * Garantit qu'un échec ou une réponse malformée (ex : modèle OpenAI) n'enregistre
 * jamais une évaluation partielle comme réussie.
 */
export const SkillScoreResultSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  score: z.number().int().min(0),
  maxScore: z.number().int().min(0),
  rationale: z.string(),
  evidence: z.string(),
  recommendation: z.string(),
});

export const EvaluationResultSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  summary: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  advice: z.array(z.string()),
  betterExample: z.string(),
  keyMoments: z.array(
    z.object({
      role: z.string(),
      quote: z.string(),
      atMs: z.number().int().min(0),
    }),
  ),
  outcome: z.string(),
  skillScores: z.array(SkillScoreResultSchema).min(1),
});

export type ValidatedEvaluation = z.infer<typeof EvaluationResultSchema>;

// ---------------------------------------------------------------------------
// Pipeline appel -> exercice : schémas de revalidation des sorties de modèles.
// Toute sortie OpenAI est revalidée par Zod AVANT écriture (aucun repli silencieux).
// ---------------------------------------------------------------------------

const Importance = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const SpeakerAttributionSchema = z.object({
  commercialSpeakerId: z.string().nullable(),
  customerSpeakerId: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

export const AnonymizationSchema = z.object({
  segments: z.array(
    z.object({ idx: z.number().int().min(0), anonymizedText: z.string() }),
  ),
  entities: z.array(
    z.object({
      original: z.string(),
      placeholder: z.string(),
      type: z.string(),
    }),
  ),
});

export const CallAnalysisResultSchema = z.object({
  callType: z.string().min(1),
  callTypeConfidence: z.number().min(0).max(1),
  relationshipStage: z.string().min(1),
  language: z.string().min(1),
  summary: z.string(),
  customerProfile: z.object({
    role: z.string(),
    context: z.string(),
    needs: z.array(z.string()),
    objections: z.array(z.string()),
    signals: z.array(z.string()),
  }),
  commercialStrategy: z.object({
    objective: z.string(),
    outcome: z.string(),
    retainedPractices: z.array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        description: z.string(),
        evidenceSegmentIds: z.array(z.string()),
        importance: Importance,
      }),
    ),
    missedOpportunities: z.array(z.string()),
  }),
  facts: z.array(z.string()),
  inferences: z.array(z.string()),
  ambiguities: z.array(
    z.object({
      id: z.string().min(1),
      question: z.string().min(1),
      importance: Importance,
    }),
  ),
  referenceSuitability: z.object({
    score: z.number().int().min(0).max(100),
    usable: z.boolean(),
    rationale: z.string(),
  }),
});

export const ScenarioGenerationResultSchema = z.object({
  name: z.string().min(1),
  callType: z.string().min(1),
  level: z.string().min(1),
  offer: z.string(),
  objective: z.string(),
  prospectProfile: z.string(),
  initialSituation: z.string(),
  personality: z.string(),
  traineeBrief: z.string(),
  relationshipHistory: z.string(),
  aiProspect: z.object({
    persona: z.string(),
    behaviorRules: z.array(z.string()),
    prohibitedRevelations: z.array(z.string()),
    openingLine: z.string(),
  }),
  allowedObjections: z.array(z.string()),
  secretInfos: z.array(
    z.object({ question: z.string(), answer: z.string() }),
  ),
  successConditions: z.string(),
  failureConditions: z.string(),
  expectedNextSteps: z.array(z.string()),
  targetSkills: z.array(z.string()),
  coachingReference: z.array(z.string()),
  rubric: z
    .array(
      z.object({
        key: z.string().min(1),
        label: z.string().min(1),
        weight: z.number().int().min(0).max(100),
        description: z.string(),
        observableSignals: z.array(z.string()),
        sourcePracticeIds: z.array(z.string()),
      }),
    )
    .min(1),
  targetDurationSec: z.number().int().min(60).max(3600),
});

export type ValidatedCallAnalysis = z.infer<typeof CallAnalysisResultSchema>;
export type ValidatedScenarioGeneration = z.infer<
  typeof ScenarioGenerationResultSchema
>;
