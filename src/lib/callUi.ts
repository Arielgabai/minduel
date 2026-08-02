/**
 * Helpers purs pour l'écran d'appel immersif et l'écran de fin d'exercice (lot L).
 * Aucune dépendance React ni serveur — testable sans rendu ni réseau.
 * Ne fabrique jamais de score, de conseil ni de contenu : tout vient de données déjà persistées.
 */

import { OUTCOME_LABELS } from "@/lib/enums";

/**
 * Initiales générées localement à partir du nom du prospect (avatar sans image).
 * Deux lettres maximum, majuscules ; « ? » si aucun nom exploitable.
 */
export function generateInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }
  return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase();
}

export type ExerciseCompleteState =
  | "ready"
  | "pending"
  | "failed"
  | "unavailable"
  | "abandoned";

export type ExerciseCompleteView = {
  state: ExerciseCompleteState;
  durationSec: number;
  /** Score global uniquement s'il est persisté et l'évaluation prête. */
  overallScore: number | null;
  /** Premier point fort persisté (jamais inventé). */
  firstStrength: string | null;
  /** Premier axe d'amélioration persisté (jamais inventé). */
  firstImprovement: string | null;
  outcomeLabel: string | null;
  analysisHref: string;
  missionsHref: string;
  /** Vrai uniquement pour l'état échec : réutilise l'action retry existante. */
  canRetry: boolean;
};

type ListField = { status: "available" | "empty" | "unavailable"; items: string[] };

/**
 * Projette le modèle de débrief persisté (lot K) vers l'écran de fin.
 * L'état « missing » du débrief devient « unavailable » côté fin d'exercice.
 */
export function buildExerciseCompleteView(input: {
  simulationId: string;
  evaluationState: "ready" | "pending" | "failed" | "missing" | "abandoned";
  durationSec: number;
  overallScore: number | null;
  strengths: ListField;
  improvements: ListField;
  outcome: string | null;
}): ExerciseCompleteView {
  const state: ExerciseCompleteState =
    input.evaluationState === "missing" ? "unavailable" : input.evaluationState;

  const ready = state === "ready";

  return {
    state,
    durationSec: Number.isFinite(input.durationSec) ? input.durationSec : 0,
    overallScore: ready ? input.overallScore : null,
    firstStrength: ready ? firstItem(input.strengths) : null,
    firstImprovement: ready ? firstItem(input.improvements) : null,
    outcomeLabel: ready ? outcomeToLabel(input.outcome) : null,
    analysisHref: `/app/analysis/${input.simulationId}`,
    missionsHref: "/app/missions",
    canRetry: state === "failed",
  };
}

function firstItem(field: ListField): string | null {
  if (field.status !== "available") return null;
  const first = field.items.find((s) => typeof s === "string" && s.trim().length > 0);
  return first ? first.trim() : null;
}

function outcomeToLabel(outcome: string | null): string | null {
  if (!outcome) return null;
  return OUTCOME_LABELS[outcome] ?? outcome;
}
