/**
 * Projection pure catalogue manager (LOT O) — lecture seule, sans télépro.
 * Réutilise le tri / readiness / legacy N4 ; aucun verrouillage, aucun CTA simu.
 */

import { LEVEL_LABELS } from "@/lib/enums";
import { isProspectAvatarKey } from "@/lib/prospectAvatars";
import {
  LEGACY_THEME_ID,
  LEGACY_THEME_NAME,
  LEGACY_THEME_SLUG,
  isPublishedMissionStatus,
  isReadyCatalogExercise,
  legacyStageSlug,
  sortMissionExercises,
  type MissionExerciseInput,
  type MissionStageInput,
  type MissionThemeInput,
} from "@/lib/teleproMissions";

export type ManagerExerciseNode = {
  id: string;
  name: string;
  difficulty: string;
  difficultyLabel: string;
  levelNumber: number;
  sortOrder: number;
  prospectAvatarKey: string | null;
  status: "PUBLISHED";
  statusLabel: string;
  detailHref: string;
};

export type ManagerExerciseStageView = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  levelNumber: number;
  sortOrder: number;
  exercise: ManagerExerciseNode;
};

export type ManagerExerciseThemeView = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  iconKey: string;
  sortOrder: number;
  stageCount: number;
  exerciseCount: number;
  isLegacy: boolean;
  stages: ManagerExerciseStageView[];
};

export type ManagerExercisesCatalogView = {
  themes: ManagerExerciseThemeView[];
  totalCount: number;
  empty: boolean;
};

export type ManagerExerciseDetailView = {
  id: string;
  name: string;
  status: string;
  difficulty: string;
  difficultyLabel: string;
  themeName: string | null;
  themeSlug: string | null;
  levelName: string | null;
  levelNumber: number | null;
  prospectAvatarKey: string | null;
  campaign: string | null;
  offer: string | null;
  objective: string | null;
  prospectProfile: string | null;
  personality: string | null;
  targetDurationSec: number;
  teleproBrief: string | null;
};

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

function toManagerNode(
  exercise: MissionExerciseInput,
  levelNumber: number,
): ManagerExerciseNode {
  const avatar = isProspectAvatarKey(exercise.prospectAvatarKey)
    ? exercise.prospectAvatarKey
    : null;
  return {
    id: exercise.id,
    name: exercise.name,
    difficulty: exercise.level,
    difficultyLabel: LEVEL_LABELS[exercise.level] ?? exercise.level,
    levelNumber,
    sortOrder: exercise.sortOrder,
    prospectAvatarKey: avatar,
    status: "PUBLISHED",
    statusLabel: "Publié",
    detailHref: "/manager/exercises/detail/" + exercise.id,
  };
}

/**
 * Catalogue manager : tous les niveaux prêts, aucun verrou, aucun télépro.
 */
export function buildManagerExercisesCatalogView(
  exercisesInput: readonly MissionExerciseInput[],
  themesInput: readonly MissionThemeInput[],
  stagesInput: readonly MissionStageInput[],
): ManagerExercisesCatalogView {
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

  const exercises = sortMissionExercises(
    exercisesInput.filter(isReadyCatalogExercise),
  );

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

  const themes: ManagerExerciseThemeView[] = [];

  for (const theme of publishedThemes) {
    const themeStages = publishedStages.filter((s) => s.themeId === theme.id);
    const presentStages = themeStages.filter((s) =>
      classified.some((e) => e.missionStageId === s.id),
    );
    if (presentStages.length === 0) continue;

    const stages: ManagerExerciseStageView[] = presentStages.map((stage) => {
      const stageExercises = sortMissionExercises(
        classified.filter((e) => e.missionStageId === stage.id),
      );
      // N4 : un exercice = un niveau (prendre le premier prêt déterministe).
      const exercise = stageExercises[0]!;
      return {
        id: stage.id,
        slug: stage.slug,
        name: stage.name,
        description: stage.description,
        levelNumber: stage.levelNumber,
        sortOrder: stage.sortOrder,
        exercise: toManagerNode(exercise, stage.levelNumber),
      };
    });

    themes.push({
      id: theme.id,
      slug: theme.slug,
      name: theme.name,
      description: theme.description,
      iconKey: theme.iconKey,
      sortOrder: theme.sortOrder,
      stageCount: stages.length,
      exerciseCount: stages.length,
      isLegacy: false,
      stages,
    });
  }

  if (unclassified.length > 0) {
    const orderedLegacy = sortMissionExercises(unclassified);
    const stages: ManagerExerciseStageView[] = orderedLegacy.map(
      (exercise, index) => {
        const levelNumber = index + 1;
        return {
          id: LEGACY_THEME_ID + "-ex-" + exercise.id,
          slug: legacyStageSlug(exercise.id),
          name: "Niveau " + String(levelNumber),
          description: null,
          levelNumber,
          sortOrder: levelNumber,
          exercise: toManagerNode(exercise, levelNumber),
        };
      },
    );
    themes.push({
      id: LEGACY_THEME_ID,
      slug: LEGACY_THEME_SLUG,
      name: LEGACY_THEME_NAME,
      description:
        "Exercices publiés non classés dans le catalogue Missions.",
      iconKey: "flag",
      sortOrder: Number.MAX_SAFE_INTEGER,
      stageCount: stages.length,
      exerciseCount: stages.length,
      isLegacy: true,
      stages,
    });
  }

  themes.sort((a, b) => {
    if (a.isLegacy !== b.isLegacy) return a.isLegacy ? 1 : -1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name, "fr");
  });

  const totalCount = themes.reduce((n, t) => n + t.exerciseCount, 0);
  return {
    themes,
    totalCount,
    empty: totalCount === 0,
  };
}

export function findManagerTheme(
  catalog: ManagerExercisesCatalogView,
  themeSlug: string,
): ManagerExerciseThemeView | null {
  return catalog.themes.find((t) => t.slug === themeSlug) ?? null;
}

/**
 * LOT O-FIX — aplatit le catalogue manager pour les KPI Équipe.
 * Ordre thème → niveau ; total = catalog.totalCount (commun à tous les télépros).
 */
export function flattenManagerCatalogExercises(
  catalog: ManagerExercisesCatalogView,
): ManagerExerciseNode[] {
  const nodes: ManagerExerciseNode[] = [];
  for (const theme of catalog.themes) {
    for (const stage of theme.stages) {
      nodes.push(stage.exercise);
    }
  }
  return nodes;
}

/** Garantit qu'aucun champ sensible n'est présent dans un objet détail. */
export function assertManagerDetailSafe(
  detail: ManagerExerciseDetailView,
): void {
  const raw = JSON.stringify(detail);
  const forbidden = [
    "systemPrompt",
    "promptBundle",
    "publishedPromptBundleId",
    "contentHash",
    "artifacts",
    "secretInfos",
    "aiProspect",
  ];
  for (const key of forbidden) {
    if (raw.includes(key)) {
      throw new Error("Fuite interdite dans la fiche manager: " + key);
    }
  }
}
