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
import { isProspectAvatarKey } from "@/lib/prospectAvatars";

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
  /** Classement N1/N2 : null = exercice non classe. */
  missionStageId?: string | null;
  /** Clé catalogue local d'avatar (jamais d'URL). */
  prospectAvatarKey?: string | null;
  /**
   * Prompt publié prêt (catalogue). Optionnel :
   * le service filtre avant build ; si fourni, false exclut l'exercice.
   */
  hasPublishedPrompt?: boolean;
};

/** Theme Missions publie (projection sure). */
export type MissionThemeInput = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  iconKey: string;
  sortOrder: number;
  status: string;
};

/** Niveau Missions publié (projection sûre). */
export type MissionStageInput = {
  id: string;
  themeId: string;
  slug: string;
  name: string;
  description: string | null;
  levelNumber: number;
  sortOrder: number;
  status: string;
};

/**
 * Slug reserve du regroupement synthetique des exercices non classes.
 * Impossible a confondre avec un slug administrable (prefixe __).
 */
export const LEGACY_THEME_SLUG = "__parcours-existant__";
export const LEGACY_THEME_NAME = "Parcours existant";
export const LEGACY_THEME_ID = "__legacy-theme__";
export const LEGACY_STAGE_SLUG_PREFIX = "__niveau-";

export type MissionStageState = "OPEN" | "COMPLETED" | "LOCKED";
export type MissionThemeState =
  | "EMPTY"
  | "AVAILABLE"
  | "IN_PROGRESS"
  | "COMPLETED";

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
  prospectAvatarKey: string | null;
  recommended: boolean;
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

/** LOT O: org + PUBLISHED only (no ScenarioAssignment). */
export function isVisiblePublishedOrgScenario(
  scenario: { status: string; organizationId: string },
  organizationId: string,
): boolean {
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
  // Moteur plat lot I : pas de filtre catalogue N4 (avatar/prompt).
  // La readiness s'applique uniquement au catalogue Theme -> Niveau.
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
      prospectAvatarKey: exercise.prospectAvatarKey ?? null,
      recommended: false,
    };
  });

  const recommendedFlat = pickRecommendedExercise(views);
  if (recommendedFlat) {
    for (const view of views) {
      view.recommended = view.id === recommendedFlat.id;
    }
  }

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


// ---------------------------------------------------------------------------
// Catalogue Thème → Niveau → Exercice (LOT N4)
// ---------------------------------------------------------------------------

export type TeleproMissionExerciseNode = {
  id: string;
  name: string;
  difficulty: string;
  difficultyLabel: string;
  sortOrder: number;
  missionLevel: number;
  prospectAvatarKey: string | null;
  status: ExerciseMissionStatus;
  statusLabel: string;
  ctaHref: string | null;
  ctaLabel: string | null;
  prepareHref: string | null;
  debriefHref: string | null;
  activeSimulationId: string | null;
  previousResult: PreviousResultView | null;
  recommended: boolean;
};

export type TeleproMissionStageView = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  levelNumber: number;
  sortOrder: number;
  exerciseCount: number;
  completedCount: number;
  progressPct: number;
  state: MissionStageState;
  exercises: TeleproMissionExerciseNode[];
};

export type TeleproMissionThemeView = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  iconKey: string;
  sortOrder: number;
  stageCount: number;
  exerciseCount: number;
  completedCount: number;
  progressPct: number;
  state: MissionThemeState;
  recommended: TeleproMissionExerciseNode | null;
  stages: TeleproMissionStageView[];
  isLegacy: boolean;
};

export type TeleproMissionsCatalogView = {
  themes: TeleproMissionThemeView[];
  recommended: TeleproMissionExerciseNode | null;
  completedCount: number;
  totalCount: number;
  allCompleted: boolean;
  empty: boolean;
};

export function legacyStageSlug(levelNumberOrId: number | string): string {
  return LEGACY_STAGE_SLUG_PREFIX + String(levelNumberOrId) + "__";
}

export function isLegacyThemeSlug(slug: string): boolean {
  return slug === LEGACY_THEME_SLUG;
}

export function isPublishedMissionStatus(status: string): boolean {
  return status === "PUBLISHED";
}

function progressPct(completed: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

function compareStages(
  a: Pick<MissionStageInput, "levelNumber" | "sortOrder" | "name" | "id">,
  b: Pick<MissionStageInput, "levelNumber" | "sortOrder" | "name" | "id">,
): number {
  if (a.levelNumber !== b.levelNumber) return a.levelNumber - b.levelNumber;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const byName = a.name.localeCompare(b.name, "fr");
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
}

function compareThemes(
  a: Pick<MissionThemeInput, "sortOrder" | "name" | "id">,
  b: Pick<MissionThemeInput, "sortOrder" | "name" | "id">,
): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const byName = a.name.localeCompare(b.name, "fr");
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
}

/**
 * Déblocage des niveaux présents d'un thème :
 * 1) premier niveau ouvert ; 2) suivant si tous les précédents sont terminés ;
 * 3) trous de numérotation non bloquants.
 * Avec 1 exercice par niveau, un exercice terminé complète le niveau.
 */
export function resolveUnlockedStageIds(
  stages: readonly Pick<
    MissionStageInput,
    "id" | "levelNumber" | "sortOrder" | "name"
  >[],
  stageExercises: ReadonlyMap<string, readonly { id: string }[]>,
  completedIds: ReadonlySet<string>,
): Set<string> {
  const ordered = [...stages].sort(compareStages);
  const unlocked = new Set<string>();
  if (ordered.length === 0) return unlocked;

  for (let i = 0; i < ordered.length; i++) {
    const stage = ordered[i]!;
    if (i === 0) {
      unlocked.add(stage.id);
      continue;
    }
    const previous = ordered.slice(0, i);
    const allPreviousCompleted = previous.every((prev) => {
      const exercises = stageExercises.get(prev.id) ?? [];
      return (
        exercises.length > 0 &&
        exercises.every((ex) => completedIds.has(ex.id))
      );
    });
    if (allPreviousCompleted) unlocked.add(stage.id);
  }
  return unlocked;
}

/**
 * Exercice « prêt » pour le catalogue télépro :
 * avatar valide, personnalité non vide, prompt publié si le flag est fourni.
 * Le service filtre aussi avant build ; ce garde-fou évite les nœuds incomplets.
 */
export function isReadyCatalogExercise(exercise: MissionExerciseInput): boolean {
  if (!isProspectAvatarKey(exercise.prospectAvatarKey)) return false;
  if (!exercise.personality?.trim()) return false;
  if (exercise.hasPublishedPrompt === false) return false;
  return true;
}

function toExerciseNode(
  exercise: MissionExerciseInput,
  status: ExerciseMissionStatus,
  activeSimulationId: string | null,
  previousResult: PreviousResultView | null,
  recommended: boolean,
): TeleproMissionExerciseNode {
  const { ctaHref, ctaLabel } = resolveExerciseCta(
    status,
    exercise.id,
    activeSimulationId,
  );
  const prepareHref =
    status === ExerciseMissionStatus.LOCKED
      ? null
      : "/app/prepare/" + exercise.id;
  const debriefHref = previousResult?.analysisHref ?? null;
  return {
    id: exercise.id,
    name: exercise.name,
    difficulty: exercise.level,
    difficultyLabel: LEVEL_LABELS[exercise.level] ?? exercise.level,
    sortOrder: exercise.sortOrder,
    missionLevel: exercise.missionLevel,
    prospectAvatarKey: exercise.prospectAvatarKey ?? null,
    status,
    statusLabel: EXERCISE_MISSION_STATUS_LABELS[status],
    ctaHref,
    ctaLabel,
    prepareHref,
    debriefHref,
    activeSimulationId,
    previousResult,
    recommended,
  };
}

function themeStateFromExercises(
  nodes: readonly TeleproMissionExerciseNode[],
): MissionThemeState {
  if (nodes.length === 0) return "EMPTY";
  const completed = nodes.filter(
    (n) => n.status === ExerciseMissionStatus.COMPLETED,
  ).length;
  if (completed === nodes.length) return "COMPLETED";
  if (
    nodes.some(
      (n) =>
        n.status === ExerciseMissionStatus.IN_PROGRESS ||
        n.status === ExerciseMissionStatus.COMPLETED,
    )
  ) {
    return "IN_PROGRESS";
  }
  if (nodes.some((n) => n.status === ExerciseMissionStatus.AVAILABLE)) {
    return "AVAILABLE";
  }
  return "AVAILABLE";
}

function buildStageView(args: {
  stage: MissionStageInput;
  exercises: MissionExerciseInput[];
  unlocked: boolean;
  completedIds: ReadonlySet<string>;
  activeByScenario: ReadonlyMap<string, MissionAttemptInput | null>;
  finishedByScenario: ReadonlyMap<string, MissionAttemptInput | null>;
}): TeleproMissionStageView {
  const ordered = sortMissionExercises(args.exercises);
  const nodes: TeleproMissionExerciseNode[] = ordered.map((exercise) => {
    const active = args.activeByScenario.get(exercise.id) ?? null;
    const finished = args.finishedByScenario.get(exercise.id) ?? null;
    const status = resolveExerciseMissionStatus({
      hasFinishedAttempt: Boolean(finished),
      hasActiveAttempt: Boolean(active),
      levelUnlocked: args.unlocked,
    });
    return toExerciseNode(
      exercise,
      status,
      active?.id ?? null,
      buildPreviousResult(finished),
      false,
    );
  });

  const completedCount = nodes.filter(
    (n) => n.status === ExerciseMissionStatus.COMPLETED,
  ).length;
  const exerciseCount = nodes.length;
  let state: MissionStageState = "LOCKED";
  if (args.unlocked) {
    state =
      exerciseCount > 0 && completedCount === exerciseCount
        ? "COMPLETED"
        : "OPEN";
  } else if (
    nodes.some(
      (n) =>
        n.status === ExerciseMissionStatus.COMPLETED ||
        n.status === ExerciseMissionStatus.IN_PROGRESS,
    )
  ) {
    // Priorité COMPLETED / IN_PROGRESS : le niveau reste consultable.
    state =
      completedCount === exerciseCount && exerciseCount > 0
        ? "COMPLETED"
        : "OPEN";
  }

  return {
    id: args.stage.id,
    slug: args.stage.slug,
    name: args.stage.name,
    description: args.stage.description,
    levelNumber: args.stage.levelNumber,
    sortOrder: args.stage.sortOrder,
    exerciseCount,
    completedCount,
    progressPct: progressPct(completedCount, exerciseCount),
    state,
    exercises: nodes,
  };
}

function markRecommended(
  themes: TeleproMissionThemeView[],
): TeleproMissionExerciseNode | null {
  const flat: TeleproMissionExerciseNode[] = [];
  for (const theme of themes) {
    for (const stage of theme.stages) {
      for (const ex of stage.exercises) flat.push(ex);
    }
  }
  const recommended = pickRecommendedExercise(
    flat.map((ex) => ({
      ...ex,
      objective: null,
      prospectProfile: null,
      personality: null,
      successConditions: null,
      targetDurationSec: 0,
    })),
  );
  if (!recommended) {
    for (const theme of themes) theme.recommended = null;
    return null;
  }
  for (const theme of themes) {
    let themeRec: TeleproMissionExerciseNode | null = null;
    for (const stage of theme.stages) {
      for (const ex of stage.exercises) {
        ex.recommended = ex.id === recommended.id;
        if (ex.recommended) themeRec = ex;
      }
    }
    theme.recommended = themeRec;
  }
  for (const theme of themes) {
    if (theme.recommended) return theme.recommended;
  }
  return null;
}

/**
 * Construit le catalogue télépro Thème → Niveau → Exercice.
 * Les thèmes/niveaux non PUBLISHED sont exclus.
 * Les exercices incomplets (avatar / personnalité / prompt) sont exclus.
 * Les exercices non classés forment un thème synthétique « Parcours existant »
 * (1 exercice = 1 niveau synthétique, déblocage séquentiel).
 */
export function buildTeleproMissionsCatalogView(
  exercisesInput: readonly MissionExerciseInput[],
  attemptsInput: readonly MissionAttemptInput[],
  themesInput: readonly MissionThemeInput[],
  stagesInput: readonly MissionStageInput[],
): TeleproMissionsCatalogView {
  const publishedThemes = themesInput
    .filter((t) => isPublishedMissionStatus(t.status))
    .slice()
    .sort(compareThemes);
  const publishedStages = stagesInput
    .filter((s) => isPublishedMissionStatus(s.status))
    .slice()
    .sort(compareStages);
  const publishedStageIds = new Set(publishedStages.map((s) => s.id));
  const publishedThemeIds = new Set(publishedThemes.map((t) => t.id));

  // Filtre readiness N4 : avatar + personnalite + prompt.
  const exercises = sortMissionExercises(
    exercisesInput.filter(isReadyCatalogExercise),
  );
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

  const classified: MissionExerciseInput[] = [];
  const unclassified: MissionExerciseInput[] = [];
  for (const exercise of exercises) {
    const stageId = exercise.missionStageId ?? null;
    if (!stageId) {
      unclassified.push(exercise);
      continue;
    }
    if (!publishedStageIds.has(stageId)) continue;
    const stage = publishedStages.find((s) => s.id === stageId);
    if (!stage || !publishedThemeIds.has(stage.themeId)) continue;
    classified.push(exercise);
  }

  const themes: TeleproMissionThemeView[] = [];

  for (const theme of publishedThemes) {
    const themeStages = publishedStages.filter((s) => s.themeId === theme.id);
    const stageExercises = new Map<string, MissionExerciseInput[]>();
    for (const stage of themeStages) {
      stageExercises.set(
        stage.id,
        classified.filter((e) => e.missionStageId === stage.id),
      );
    }
    // Ne garder que les niveaux qui ont au moins un exercice assigné visible.
    const presentStages = themeStages.filter(
      (s) => (stageExercises.get(s.id) ?? []).length > 0,
    );
    if (presentStages.length === 0) continue;

    const unlocked = resolveUnlockedStageIds(
      presentStages,
      stageExercises,
      completedIds,
    );
    const stages = presentStages.map((stage) =>
      buildStageView({
        stage,
        exercises: stageExercises.get(stage.id) ?? [],
        unlocked: unlocked.has(stage.id),
        completedIds,
        activeByScenario,
        finishedByScenario,
      }),
    );
    const allNodes = stages.flatMap((st) => st.exercises);
    const completedCount = allNodes.filter(
      (n) => n.status === ExerciseMissionStatus.COMPLETED,
    ).length;
    themes.push({
      id: theme.id,
      slug: theme.slug,
      name: theme.name,
      description: theme.description,
      iconKey: theme.iconKey,
      sortOrder: theme.sortOrder,
      stageCount: stages.length,
      exerciseCount: allNodes.length,
      completedCount,
      progressPct: progressPct(completedCount, allNodes.length),
      state: themeStateFromExercises(allNodes),
      recommended: null,
      stages,
      isLegacy: false,
    });
  }

  if (unclassified.length > 0) {
    // 1 exercice non classé = 1 niveau synthétique (ordre missionLevel → sortOrder → name → id).
    const orderedLegacy = sortMissionExercises(unclassified);
    const syntheticStages: MissionStageInput[] = orderedLegacy.map(
      (exercise, index) => {
        const levelNumber = index + 1;
        return {
          id: LEGACY_THEME_ID + "-ex-" + exercise.id,
          themeId: LEGACY_THEME_ID,
          slug: legacyStageSlug(exercise.id),
          name: "Niveau " + String(levelNumber),
          description: null,
          levelNumber,
          sortOrder: levelNumber,
          status: "PUBLISHED",
        };
      },
    );
    const stageExercises = new Map<string, MissionExerciseInput[]>();
    for (let i = 0; i < syntheticStages.length; i++) {
      const stage = syntheticStages[i]!;
      const exercise = orderedLegacy[i]!;
      stageExercises.set(stage.id, [exercise]);
    }
    const unlocked = resolveUnlockedStageIds(
      syntheticStages,
      stageExercises,
      completedIds,
    );
    const stages = syntheticStages.map((stage) =>
      buildStageView({
        stage,
        exercises: stageExercises.get(stage.id) ?? [],
        unlocked: unlocked.has(stage.id),
        completedIds,
        activeByScenario,
        finishedByScenario,
      }),
    );
    const allNodes = stages.flatMap((st) => st.exercises);
    const completedCount = allNodes.filter(
      (n) => n.status === ExerciseMissionStatus.COMPLETED,
    ).length;
    themes.push({
      id: LEGACY_THEME_ID,
      slug: LEGACY_THEME_SLUG,
      name: LEGACY_THEME_NAME,
      description:
        "Exercices assignés non classés dans le catalogue Missions.",
      iconKey: "flag",
      sortOrder: Number.MAX_SAFE_INTEGER,
      stageCount: stages.length,
      exerciseCount: allNodes.length,
      completedCount,
      progressPct: progressPct(completedCount, allNodes.length),
      state: themeStateFromExercises(allNodes),
      recommended: null,
      stages,
      isLegacy: true,
    });
  }

  themes.sort((a, b) => {
    if (a.isLegacy !== b.isLegacy) return a.isLegacy ? 1 : -1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name, "fr");
  });

  const recommended = markRecommended(themes);
  const allNodes = themes.flatMap((t) => t.stages.flatMap((st) => st.exercises));
  const completedCount = allNodes.filter(
    (n) => n.status === ExerciseMissionStatus.COMPLETED,
  ).length;
  const totalCount = allNodes.length;
  const empty = totalCount === 0;

  return {
    themes,
    recommended,
    completedCount,
    totalCount,
    allCompleted: !empty && completedCount === totalCount,
    empty,
  };
}

export function findThemeInCatalog(
  catalog: TeleproMissionsCatalogView,
  themeSlug: string,
): TeleproMissionThemeView | null {
  return catalog.themes.find((t) => t.slug === themeSlug) ?? null;
}

export function findStageInCatalog(
  catalog: TeleproMissionsCatalogView,
  themeSlug: string,
  stageSlug: string,
): { theme: TeleproMissionThemeView; stage: TeleproMissionStageView } | null {
  const theme = findThemeInCatalog(catalog, themeSlug);
  if (!theme) return null;
  const stage = theme.stages.find((s) => s.slug === stageSlug) ?? null;
  if (!stage) return null;
  return { theme, stage };
}
