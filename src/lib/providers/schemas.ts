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
