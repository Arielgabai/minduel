/**
 * LOT Q3A — vues API sûres pour les appels réels télépro.
 * Aucun prompt, artifact, hash, clé S3, URL signée ni transcript brut en liste.
 * JSON invalide / partiel traité défensivement (champs absents = indisponibles).
 */
import { RealCallAnalysisResultSchema } from "@/lib/providers/schemas";
import type { ValidatedRealCallAnalysis } from "@/lib/providers/schemas";
import { recommendExercisesForWeakSkills } from "@/lib/realCallRecommend";

export type RealCallListItem = {
  id: string;
  title: string;
  status: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  durationSec: number;
  language: string;
  /** Score global si persisté ; null = indisponible. */
  overallScore: number | null;
  errorMessage: string | null;
};

export type RealCallDetailView = RealCallListItem & {
  analysis: {
    available: boolean;
    summary: string | null;
    overallScore: number | null;
    skillScores: ValidatedRealCallAnalysis["skillScores"] | null;
    keyMoments: ValidatedRealCallAnalysis["keyMoments"] | null;
    dialoguePassages: ValidatedRealCallAnalysis["dialoguePassages"] | null;
    why: string[] | null;
    metrics: ValidatedRealCallAnalysis["metrics"] | null;
    weakSkillKeys: string[];
  };
  transcript: {
    available: boolean;
    language: string | null;
    segments: Array<{
      idx: number;
      role: string | null;
      startMs: number;
      endMs: number;
      /** Texte anonymisé uniquement. */
      content: string;
    }>;
  };
  associatedExercises: ReturnType<typeof recommendExercisesForWeakSkills>;
};

export function toRealCallListItem(rec: {
  id: string;
  title: string;
  status: string;
  source: string | null;
  createdAt: string;
  updatedAt: string;
  durationSec: number;
  language: string;
  errorMessage: string | null;
  analysis?: { overallScore: number | null } | null;
}): RealCallListItem {
  return {
    id: rec.id,
    title: rec.title,
    status: rec.status,
    source: rec.source ?? "UNKNOWN",
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    durationSec: rec.durationSec,
    language: rec.language,
    overallScore: rec.analysis?.overallScore ?? null,
    errorMessage: rec.errorMessage,
  };
}

/**
 * Parse défensif du payload coaching : JSON invalide / incomplet
 * → available=false et champs null (jamais de zéros inventés).
 */
export function parseCoachingPayload(
  raw: string | null | undefined,
): {
  available: boolean;
  data: ValidatedRealCallAnalysis | null;
} {
  if (raw == null || raw.trim() === "") {
    return { available: false, data: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { available: false, data: null };
  }
  const result = RealCallAnalysisResultSchema.safeParse(parsed);
  if (!result.success) {
    return { available: false, data: null };
  }
  return { available: true, data: result.data };
}

export function toRealCallDetailView(input: {
  recording: {
    id: string;
    title: string;
    status: string;
    source: string | null;
    createdAt: string;
    updatedAt: string;
    durationSec: number;
    language: string;
    errorMessage: string | null;
  };
  analysis: {
    summary: string | null;
    overallScore: number | null;
    coachingPayload: string | null;
  } | null;
  transcript: {
    language: string;
    turns: Array<{
      idx: number;
      role: string | null;
      startMs: number;
      endMs: number;
      text: string;
      anonymizedText: string | null;
    }>;
  } | null;
}): RealCallDetailView {
  const list = toRealCallListItem({
    ...input.recording,
    analysis: input.analysis
      ? { overallScore: input.analysis.overallScore }
      : null,
  });
  const coaching = parseCoachingPayload(input.analysis?.coachingPayload);
  const data = coaching.data;

  const turns = input.transcript
    ? [...input.transcript.turns].sort((a, b) => a.idx - b.idx)
    : [];

  const anonymizedTurns = turns.filter((t) => t.anonymizedText != null);

  const weakSkillKeys = data?.weakSkillKeys ?? [];

  return {
    ...list,
    overallScore:
      input.analysis?.overallScore ?? data?.overallScore ?? null,
    analysis: {
      available: coaching.available,
      summary: data?.summary ?? input.analysis?.summary ?? null,
      overallScore:
        data?.overallScore ?? input.analysis?.overallScore ?? null,
      skillScores: data?.skillScores ?? null,
      keyMoments: data?.keyMoments ?? null,
      dialoguePassages: data?.dialoguePassages ?? null,
      why: data?.why ?? null,
      metrics: data?.metrics ?? null,
      weakSkillKeys,
    },
    transcript: {
      available: anonymizedTurns.length > 0,
      language: input.transcript?.language ?? null,
      segments: anonymizedTurns.map((t) => ({
        idx: t.idx,
        role: t.role,
        startMs: t.startMs,
        endMs: t.endMs,
        content: t.anonymizedText as string,
      })),
    },
    associatedExercises: recommendExercisesForWeakSkills({
      weakSkillKeys,
    }),
  };
}
