/**
 * LOT Q3A/Q3B — vues API sûres pour les appels réels télépro.
 * Aucun prompt, artifact, hash, clé S3, URL signée ni transcript brut en liste.
 * JSON invalide / partiel traité défensivement (champs absents = indisponibles).
 */
import { RecordingStatus } from "@/lib/enums";
import { RealCallAnalysisResultSchema } from "@/lib/providers/schemas";
import type { ValidatedRealCallAnalysis } from "@/lib/providers/schemas";
import {
  recommendExercisesForWeakSkills,
  type AssociatedExerciseRecommendation,
} from "@/lib/realCallRecommend";
import type {
  PersonalComparativeView,
  SimRealComparisonView,
} from "@/lib/realCallCompare";

export type RealCallListItem = {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  statusTone: "ready" | "processing" | "failed" | "pending";
  source: string;
  createdAt: string;
  updatedAt: string;
  durationSec: number;
  language: string;
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
      content: string;
    }>;
  };
  associatedExercises: AssociatedExerciseRecommendation;
  personalComparative: PersonalComparativeView;
  simRealComparison: SimRealComparisonView;
};

export function realCallStatusLabel(status: string): string {
  switch (status) {
    case RecordingStatus.PENDING_UPLOAD:
      return "Import incomplet";
    case RecordingStatus.UPLOADED:
      return "En attente";
    case RecordingStatus.PREPROCESSING:
      return "Préparation";
    case RecordingStatus.TRANSCRIBING:
      return "Transcription";
    case RecordingStatus.ANALYZING:
    case RecordingStatus.WAITING_FOR_CLARIFICATION:
      return "Analyse";
    case RecordingStatus.READY:
      return "Analysé";
    case RecordingStatus.FAILED:
      return "Échec";
    default:
      return status;
  }
}

export function realCallStatusTone(
  status: string,
): RealCallListItem["statusTone"] {
  if (status === RecordingStatus.READY) return "ready";
  if (status === RecordingStatus.FAILED) return "failed";
  if (status === RecordingStatus.PENDING_UPLOAD) return "pending";
  return "processing";
}

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
    statusLabel: realCallStatusLabel(rec.status),
    statusTone: realCallStatusTone(rec.status),
    source: rec.source ?? "UNKNOWN",
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    durationSec: rec.durationSec,
    language: rec.language,
    overallScore: rec.analysis?.overallScore ?? null,
    errorMessage: rec.errorMessage,
  };
}

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

const EMPTY_PERSONAL: PersonalComparativeView = {
  available: false,
  sampleSize: 0,
  currentScore: null,
  personalAverage: null,
  trend: "unavailable",
  message:
    "Pas encore assez d'historique personnel pour déterminer une tendance.",
};

const EMPTY_SIM_REAL: SimRealComparisonView = {
  available: false,
  rows: [],
  message:
    "Aucune compétence comparable entre cet appel réel et tes simulations évaluées.",
};

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
  associatedExercises?: AssociatedExerciseRecommendation;
  personalComparative?: PersonalComparativeView;
  simRealComparison?: SimRealComparisonView;
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
    associatedExercises:
      input.associatedExercises ??
      recommendExercisesForWeakSkills({ weakSkillKeys }),
    personalComparative: input.personalComparative ?? {
      ...EMPTY_PERSONAL,
      currentScore:
        input.analysis?.overallScore ?? data?.overallScore ?? null,
    },
    simRealComparison: input.simRealComparison ?? EMPTY_SIM_REAL,
  };
}
