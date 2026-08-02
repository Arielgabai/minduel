/**
 * Moteur pur des missions téléprospecteur (LOT I).
 * Statuts calculés, déblocage de niveaux, recommandation — sans I/O ni appel réseau.
 */

import {
  LEVEL_LABELS,
  OUTCOME_LABELS,
  ScenarioStatus,
  SimulationStatus,
} from "@/lib/enums";

/** Statuts métier affichés (non persistés). */
export const ExerciseMissionStatus = {
  COMPLETED: "COMPLETED",
  IN_PROGRESS: "IN_PROGRESS",
  AVAILABLE: "AVAILABLE",
  LOCKED: "LOCKED",
} as const;
export type ExerciseMissionStatus =
  (typeof ExerciseMissionStatus)[keyof typeof ExerciseMissionStatus];

export const EXERCISE_MISSION_STATUS_LABELS: Record<
  ExerciseMissionStatus,
  string
> = {
  COMPLETED: "Terminé",
  IN_PROGRESS: "En cours",
  AVAILABLE: "Disponible",
  LOCKED: "Verrouillé",
};

/** Tentative encore active (appel non finalisé). */
export const ACTIVE_SIMULATION_STATUSES: readonly string[] = [
  SimulationStatus.CREATED,
  SimulationStatus.IN_PROGRESS,
];

/**
 * Tentative réellement terminée côté runtime :
 * la simulation a quitté l'appel, même si l'évaluation asynchrone n'a pas réussi.
 */
export const FINISHED_SIMULATION_STATUSES: readonly string[] = [
  SimulationStatus.FINALIZING,
  SimulationStatus.EVALUATION_PENDING,
  SimulationStatus.EVALUATING,
  SimulationStatus.COMPLETED,
  SimulationStatus.EVALUATION_FAILED,
];

export function isActiveSimulationStatus(status: string): boolean {
  return ACTIVE_SIMULATION_STATUSES.includes(status);
}

export function isFinishedSimulationStatus(status: string): boolean {
  return FINISHED_SIMULATION_STATUSES.includes(status);
}

/** Champs scénario sûrs pour le modèle de vue télépro. */
export type MissionExerciseInput = {
  id: string;
  name: string;
  missionLevel: number;
  sortOrder: number;
  level: string;
  objective: string | null;
  prospectProfile: string | null;
  personality: string | null;
  successConditions: string | null;
  targetDurationSec: number;
  status: string;
  organizationId: string;
};

export type MissionAttemptInput = {
  id: string;
  scenarioId: string;
  status: string;
  outcome: string | null;
  createdAt: string;
  updatedAt: string;
  evaluation: {
    overallScore: number;
    summary: string | null;
    outcome: string | null;
  } | null;
};

export type MissionAssignmentInput = {
  teleproId: string;
  organizationId: string;
  scenarioId: string;
  scenario: MissionExerciseInput;
};

export type PreviousResultView = {
  simulationId: string;
  overallScore: number | null;
  outcomeLabel: string | null;
  summary: string | null;
  evaluationPending: boolean;
  analysisHref: string | null;
};

export type MissionExerciseView = {
  id: string;
  name: string;
  missionLevel: number;
  sortOrder: number;
  difficulty: string;
  difficultyLabel: string;
  objective: string | null;
  prospectProfile: string | null;
  personality: string | null;
  successConditions: string | null;
  targetDurationSec: number;
  status: ExerciseMissionStatus;
  statusLabel: string;
  /** Lien lançable (prepare ou call) ; null si verrouillé. */
  ctaHref: string | null;
  ctaLabel: string | null;
  activeSimulationId: string | null;
  previousResult: PreviousResultView | null;
};

export type MissionLevelGroup = {
  missionLevel: number;
  unlocked: boolean;
  exercises: MissionExerciseView[];
};

export type TeleproMissionsView = {
  groups: MissionLevelGroup[];
  exercises: MissionExerciseView[];
  completedCount: number;
  totalCount: number;
  recommended: MissionExerciseView | null;
  allCompleted: boolean;
  empty: boolean;
};

/**
 * Isolation stricte : même organisation, assigné au télépro,
 * scénario PUBLISHED uniquement.
 */
export function isVisibleAssignedScenario(
  scenario: { status: string; organizationId: string },
  assignment: { teleproId: string; organizationId: string } | null | undefined,
  teleproId: string,
  organizationId: string,
): boolean {
  if (!assignment) return false;
  if (assignment.teleproId !== teleproId) return false;
  if (assignment.organizationId !== organizationId) return false;
  if (scenario.organizationId !== organizationId) return false;
  return scenario.status === ScenarioStatus.PUBLISHED;
}

export function filterVisibleAssignments(
  rows: MissionAssignmentInput[],
  teleproId: string,
  organizationId: string,
): MissionExerciseInput[] {
  const visible: MissionExerciseInput[] = [];
  for (const row of rows) {
    if (
      isVisibleAssignedScenario(row.scenario, row, teleproId, organizationId)
    ) {
      visible.push(row.scenario);
    }
  }
  return visible;
}

/** Tri déterministe : missionLevel, sortOrder, name, id. */
export function compareMissionExercises(
  a: Pick<MissionExerciseInput, "missionLevel" | "sortOrder" | "name" | "id">,
  b: Pick<MissionExerciseInput, "missionLevel" | "sortOrder" | "name" | "id">,
): number {
  if (a.missionLevel !== b.missionLevel) {
    return a.missionLevel - b.missionLevel;
  }
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }
  const byName = a.name.localeCompare(b.name, "fr");
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
}

export function sortMissionExercises<
  T extends Pick<
    MissionExerciseInput,
    "missionLevel" | "sortOrder" | "name" | "id"
  >,
>(items: readonly T[]): T[] {
  return [...items].sort(compareMissionExercises);
}

function attemptRecencyKey(a: MissionAttemptInput): string {
  return a.updatedAt || a.createdAt || "";
}

function pickActiveAttempt(
  attempts: MissionAttemptInput[],
): MissionAttemptInput | null {
  const active = attempts.filter((a) => isActiveSimulationStatus(a.status));
  if (active.length === 0) return null;
  active.sort((a, b) =>
    attemptRecencyKey(b).localeCompare(attemptRecencyKey(a)),
  );
  return active[0] ?? null;
}

function pickLatestFinishedAttempt(
  attempts: MissionAttemptInput[],
): MissionAttemptInput | null {
  const finished = attempts.filter((a) => isFinishedSimulationStatus(a.status));
  if (finished.length === 0) return null;
  finished.sort((a, b) =>
    attemptRecencyKey(b).localeCompare(attemptRecencyKey(a)),
  );
  return finished[0] ?? null;
}

function buildPreviousResult(
  attempt: MissionAttemptInput | null,
): PreviousResultView | null {
  if (!attempt) return null;
  const evaluation = attempt.evaluation;
  const rawOutcome = evaluation?.outcome ?? attempt.outcome;
  const outcomeLabel = rawOutcome
    ? (OUTCOME_LABELS[rawOutcome] ?? rawOutcome)
    : null;
  const evaluationPending = !evaluation;
  return {
    simulationId: attempt.id,
    overallScore: evaluation ? evaluation.overallScore : null,
    outcomeLabel,
    summary: evaluation?.summary ?? null,
    evaluationPending,
    analysisHref: `/app/analysis/${attempt.id}`,
  };
}

/**
 * Niveaux débloqués :
 * - le plus petit missionLevel présent est ouvert ;
 * - un niveau suivant s'ouvre seulement si tous les exercices
 *   des niveaux précédents effectivement présents sont terminés ;
 * - un trou dans les numéros ne bloque pas.
 */
export function resolveUnlockedLevels(
  exercises: readonly Pick<MissionExerciseInput, "missionLevel" | "id">[],
  completedIds: ReadonlySet<string>,
): Set<number> {
  const levels = [
    ...new Set(exercises.map((e) => e.missionLevel)),
  ].sort((a, b) => a - b);
  const unlocked = new Set<number>();
  if (levels.length === 0) return unlocked;

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i]!;
    if (i === 0) {
      unlocked.add(level);
      continue;
    }
    const previousLevels = levels.slice(0, i);
    const previousExercises = exercises.filter((e) =>
      previousLevels.includes(e.missionLevel),
    );
    const allPreviousCompleted = previousExercises.every((e) =>
      completedIds.has(e.id),
    );
    if (allPreviousCompleted) {
      unlocked.add(level);
    }
  }
  return unlocked;
}

export function resolveExerciseMissionStatus(args: {
  hasFinishedAttempt: boolean;
  hasActiveAttempt: boolean;
  levelUnlocked: boolean;
}): ExerciseMissionStatus {
  if (args.hasFinishedAttempt) return ExerciseMissionStatus.COMPLETED;
  if (args.hasActiveAttempt) return ExerciseMissionStatus.IN_PROGRESS;
  if (args.levelUnlocked) return ExerciseMissionStatus.AVAILABLE;
  return ExerciseMissionStatus.LOCKED;
}

export function resolveExerciseCta(
  status: ExerciseMissionStatus,
  exerciseId: string,
  activeSimulationId: string | null,
): { ctaHref: string | null; ctaLabel: string | null } {
  if (status === ExerciseMissionStatus.IN_PROGRESS && activeSimulationId) {
    return {
      ctaHref: `/app/call/${activeSimulationId}`,
      ctaLabel: "Reprendre",
    };
  }
  if (status === ExerciseMissionStatus.AVAILABLE) {
    return {
      ctaHref: `/app/prepare/${exerciseId}`,
      ctaLabel: "Commencer",
    };
  }
  if (status === ExerciseMissionStatus.COMPLETED) {
    return {
      ctaHref: `/app/prepare/${exerciseId}`,
      ctaLabel: "Refaire",
    };
  }
  return { ctaHref: null, ctaLabel: null };
}

/** Premier IN_PROGRESS, sinon premier AVAILABLE, sinon null. */
export function pickRecommendedExercise(
  exercises: readonly MissionExerciseView[],
): MissionExerciseView | null {
  const inProgress = exercises.find(
    (e) => e.status === ExerciseMissionStatus.IN_PROGRESS,
  );
  if (inProgress) return inProgress;
  const available = exercises.find(
    (e) => e.status === ExerciseMissionStatus.AVAILABLE,
  );
  return available ?? null;
}

/**
 * Construit le modèle de vue partagé Accueil / Missions.
 * Les exercices en entrée sont supposés déjà filtrés (PUBLISHED + assignés).
 * Les tentatives doivent appartenir au même télépro / organisation.
 */
export function buildTeleproMissionsView(
  exercisesInput: readonly MissionExerciseInput[],
  attemptsInput: readonly MissionAttemptInput[],
): TeleproMissionsView {
  const exercises = sortMissionExercises(exercisesInput);
  const attemptsByScenario = new Map<string, MissionAttemptInput[]>();
  for (const attempt of attemptsInput) {
    const list = attemptsByScenario.get(attempt.scenarioId) ?? [];
    list.push(attempt);
    attemptsByScenario.set(attempt.scenarioId, list);
  }

  const completedIds = new Set<string>();
  const activeByScenario = new Map<string, MissionAttemptInput | null>();
  const finishedByScenario = new Map<string, MissionAttemptInput | null>();

  for (const exercise of exercises) {
    const attempts = attemptsByScenario.get(exercise.id) ?? [];
    const active = pickActiveAttempt(attempts);
    const finished = pickLatestFinishedAttempt(attempts);
    activeByScenario.set(exercise.id, active);
    finishedByScenario.set(exercise.id, finished);
    if (finished) completedIds.add(exercise.id);
  }

  const unlockedLevels = resolveUnlockedLevels(exercises, completedIds);

  const views: MissionExerciseView[] = exercises.map((exercise) => {
    const active = activeByScenario.get(exercise.id) ?? null;
    const finished = finishedByScenario.get(exercise.id) ?? null;
    const levelUnlocked = unlockedLevels.has(exercise.missionLevel);
    const status = resolveExerciseMissionStatus({
      hasFinishedAttempt: Boolean(finished),
      hasActiveAttempt: Boolean(active),
      levelUnlocked,
    });
    const activeSimulationId = active?.id ?? null;
    const { ctaHref, ctaLabel } = resolveExerciseCta(
      status,
      exercise.id,
      activeSimulationId,
    );
    return {
      id: exercise.id,
      name: exercise.name,
      missionLevel: exercise.missionLevel,
      sortOrder: exercise.sortOrder,
      difficulty: exercise.level,
      difficultyLabel: LEVEL_LABELS[exercise.level] ?? exercise.level,
      objective: exercise.objective,
      prospectProfile: exercise.prospectProfile,
      personality: exercise.personality,
      successConditions: exercise.successConditions,
      targetDurationSec: exercise.targetDurationSec,
      status,
      statusLabel: EXERCISE_MISSION_STATUS_LABELS[status],
      ctaHref,
      ctaLabel,
      activeSimulationId,
      previousResult: buildPreviousResult(finished),
    };
  });

  const levelNumbers = [
    ...new Set(views.map((e) => e.missionLevel)),
  ].sort((a, b) => a - b);

  const groups: MissionLevelGroup[] = levelNumbers.map((missionLevel) => ({
    missionLevel,
    unlocked: unlockedLevels.has(missionLevel),
    exercises: views.filter((e) => e.missionLevel === missionLevel),
  }));

  const completedCount = views.filter(
    (e) => e.status === ExerciseMissionStatus.COMPLETED,
  ).length;
  const totalCount = views.length;
  const empty = totalCount === 0;
  const allCompleted = !empty && completedCount === totalCount;

  return {
    groups,
    exercises: views,
    completedCount,
    totalCount,
    recommended: pickRecommendedExercise(views),
    allCompleted,
    empty,
  };
}
