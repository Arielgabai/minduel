import "server-only";

import { prisma } from "@/lib/db";
import { LEVEL_LABELS, ScenarioStatus } from "@/lib/enums";
import { isProspectAvatarKey } from "@/lib/prospectAvatars";
import {
  isReadyCatalogExercise,
  type MissionExerciseInput,
  type MissionStageInput,
  type MissionThemeInput,
} from "@/lib/teleproMissions";
import {
  assertManagerDetailSafe,
  buildManagerExercisesCatalogView,
  findManagerTheme,
  type ManagerExerciseDetailView,
  type ManagerExerciseThemeView,
  type ManagerExercisesCatalogView,
} from "@/lib/managerExercisesView";

/** Select sûr manager : aucun prompt, artifact, hash, secret. */
const SCENARIO_MANAGER_SELECT = {
  id: true,
  name: true,
  missionLevel: true,
  sortOrder: true,
  level: true,
  objective: true,
  prospectProfile: true,
  personality: true,
  successConditions: true,
  targetDurationSec: true,
  status: true,
  organizationId: true,
  missionStageId: true,
  prospectAvatarKey: true,
  publishedPromptBundleId: true,
  campaign: true,
  offer: true,
  initialSituation: true,
} as const;

const THEME_SAFE_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  iconKey: true,
  sortOrder: true,
  status: true,
} as const;

const STAGE_SAFE_SELECT = {
  id: true,
  themeId: true,
  slug: true,
  name: true,
  description: true,
  levelNumber: true,
  sortOrder: true,
  status: true,
} as const;

function toCatalogExerciseInput(row: {
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
  missionStageId: string | null;
  prospectAvatarKey: string | null;
  publishedPromptBundleId: string | null;
}): MissionExerciseInput | null {
  const hasPublishedPrompt = Boolean(row.publishedPromptBundleId);
  if (
    !isProspectAvatarKey(row.prospectAvatarKey) ||
    !row.personality?.trim() ||
    !hasPublishedPrompt
  ) {
    return null;
  }
  const exercise: MissionExerciseInput = {
    id: row.id,
    name: row.name,
    missionLevel: row.missionLevel,
    sortOrder: row.sortOrder,
    level: row.level,
    objective: row.objective,
    prospectProfile: row.prospectProfile,
    personality: row.personality,
    successConditions: row.successConditions,
    targetDurationSec: row.targetDurationSec,
    status: row.status,
    organizationId: row.organizationId,
    missionStageId: row.missionStageId,
    prospectAvatarKey: row.prospectAvatarKey,
    hasPublishedPrompt: true,
  };
  return isReadyCatalogExercise(exercise) ? exercise : null;
}

async function loadPublishedCatalogMeta(
  organizationId: string,
): Promise<{ themes: MissionThemeInput[]; stages: MissionStageInput[] }> {
  const themes = await prisma.missionTheme.findMany({
    where: { organizationId, status: "PUBLISHED" },
    select: THEME_SAFE_SELECT,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const themeIds = themes.map((t) => t.id);
  const stages =
    themeIds.length === 0
      ? []
      : await prisma.missionStage.findMany({
          where: {
            organizationId,
            status: "PUBLISHED",
            themeId: { in: themeIds },
          },
          select: STAGE_SAFE_SELECT,
          orderBy: [{ levelNumber: "asc" }, { sortOrder: "asc" }],
        });
  return { themes, stages };
}

/**
 * Catalogue manager : exercices PUBLISHED prêts de l'organisation.
 * Aucun teleproId, aucun verrouillage, aucune affectation.
 */
export async function loadManagerExercisesCatalog(
  organizationId: string,
): Promise<ManagerExercisesCatalogView> {
  const [rows, { themes, stages }] = await Promise.all([
    prisma.scenario.findMany({
      where: { organizationId, status: ScenarioStatus.PUBLISHED },
      select: SCENARIO_MANAGER_SELECT,
    }),
    loadPublishedCatalogMeta(organizationId),
  ]);

  const exercises: MissionExerciseInput[] = [];
  for (const row of rows) {
    const mapped = toCatalogExerciseInput(row);
    if (mapped) exercises.push(mapped);
  }

  return buildManagerExercisesCatalogView(exercises, themes, stages);
}

export async function loadManagerExerciseTheme(
  organizationId: string,
  themeSlug: string,
): Promise<ManagerExerciseThemeView | null> {
  const catalog = await loadManagerExercisesCatalog(organizationId);
  return findManagerTheme(catalog, themeSlug);
}

/**
 * Fiche lecture seule d'un exercice PUBLISHED de l'organisation.
 * Retourne null → 404 (autre org / non publié / absent).
 */
export async function loadManagerExerciseDetail(
  organizationId: string,
  scenarioId: string,
): Promise<ManagerExerciseDetailView | null> {
  const row = await prisma.scenario.findFirst({
    where: {
      id: scenarioId,
      organizationId,
      status: ScenarioStatus.PUBLISHED,
    },
    select: {
      id: true,
      name: true,
      status: true,
      level: true,
      campaign: true,
      offer: true,
      objective: true,
      prospectProfile: true,
      personality: true,
      targetDurationSec: true,
      prospectAvatarKey: true,
      initialSituation: true,
      missionStageId: true,
      missionStage: {
        select: {
          name: true,
          levelNumber: true,
          status: true,
          theme: {
            select: {
              name: true,
              slug: true,
              status: true,
            },
          },
        },
      },
    },
  });
  if (!row) return null;

  const stage =
    row.missionStage && row.missionStage.status === "PUBLISHED"
      ? row.missionStage
      : null;
  const theme =
    stage?.theme && stage.theme.status === "PUBLISHED" ? stage.theme : null;

  const detail: ManagerExerciseDetailView = {
    id: row.id,
    name: row.name,
    status: row.status,
    difficulty: row.level,
    difficultyLabel: LEVEL_LABELS[row.level] ?? row.level,
    themeName: theme?.name ?? null,
    themeSlug: theme?.slug ?? null,
    levelName: stage?.name ?? null,
    levelNumber: stage?.levelNumber ?? null,
    prospectAvatarKey: isProspectAvatarKey(row.prospectAvatarKey)
      ? row.prospectAvatarKey
      : null,
    campaign: row.campaign,
    offer: row.offer,
    objective: row.objective,
    prospectProfile: row.prospectProfile,
    personality: row.personality,
    targetDurationSec: row.targetDurationSec,
    teleproBrief: row.initialSituation,
  };

  assertManagerDetailSafe(detail);
  return detail;
}
