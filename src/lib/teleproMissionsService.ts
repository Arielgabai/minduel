import "server-only";

import { prisma } from "@/lib/db";
import { ScenarioStatus } from "@/lib/enums";
import {
  buildTeleproMissionsCatalogView,
  buildTeleproMissionsView,
  findStageInCatalog,
  findThemeInCatalog,
  type MissionAttemptInput,
  type MissionExerciseInput,
  type MissionStageInput,
  type MissionThemeInput,
  type TeleproMissionStageView,
  type TeleproMissionThemeView,
  type TeleproMissionsCatalogView,
  type TeleproMissionsView,
} from "@/lib/teleproMissions";

/** Projection scénario sûre : aucun prompt, artifact, hash ni secret. */
const SCENARIO_SAFE_SELECT = {
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

async function loadAssignedExercisesAndAttempts(
  teleproId: string,
  organizationId: string,
): Promise<{
  exercises: MissionExerciseInput[];
  attempts: MissionAttemptInput[];
}> {
  const assignments = await prisma.scenarioAssignment.findMany({
    where: {
      teleproId,
      organizationId,
      scenario: {
        status: ScenarioStatus.PUBLISHED,
        organizationId,
      },
    },
    select: {
      scenario: { select: SCENARIO_SAFE_SELECT },
    },
  });

  const exercises: MissionExerciseInput[] = assignments.map((a) => a.scenario);
  const scenarioIds = exercises.map((e) => e.id);

  let attempts: MissionAttemptInput[] = [];
  if (scenarioIds.length > 0) {
    attempts = await prisma.simulation.findMany({
      where: {
        teleproId,
        organizationId,
        scenarioId: { in: scenarioIds },
      },
      select: {
        id: true,
        scenarioId: true,
        status: true,
        outcome: true,
        createdAt: true,
        updatedAt: true,
        evaluation: {
          select: {
            overallScore: true,
            summary: true,
            outcome: true,
          },
        },
      },
    });
  }

  return { exercises, attempts };
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
 * Charge le modèle de vue missions plat (compat lot I).
 * Filtre : organizationId + teleproId + Scenario.status PUBLISHED.
 */
export async function loadTeleproMissionsView(
  teleproId: string,
  organizationId: string,
): Promise<TeleproMissionsView> {
  const { exercises, attempts } = await loadAssignedExercisesAndAttempts(
    teleproId,
    organizationId,
  );
  return buildTeleproMissionsView(exercises, attempts);
}

/**
 * Catalogue Thème → Phase → Exercice pour le téléprospecteur.
 * Isolation stricte org + télépro + PUBLISHED ; thèmes/phases DRAFT/ARCHIVED exclus.
 */
export async function loadTeleproMissionsCatalogView(
  teleproId: string,
  organizationId: string,
): Promise<TeleproMissionsCatalogView> {
  const [{ exercises, attempts }, { themes, stages }] = await Promise.all([
    loadAssignedExercisesAndAttempts(teleproId, organizationId),
    loadPublishedCatalogMeta(organizationId),
  ]);
  return buildTeleproMissionsCatalogView(
    exercises,
    attempts,
    themes,
    stages,
  );
}

/** Thème visible pour le télépro, ou null → 404. */
export async function loadTeleproMissionThemeView(
  teleproId: string,
  organizationId: string,
  themeSlug: string,
): Promise<TeleproMissionThemeView | null> {
  const catalog = await loadTeleproMissionsCatalogView(
    teleproId,
    organizationId,
  );
  return findThemeInCatalog(catalog, themeSlug);
}

/** Phase visible pour le télépro, ou null → 404. */
export async function loadTeleproMissionStageView(
  teleproId: string,
  organizationId: string,
  themeSlug: string,
  stageSlug: string,
): Promise<{
  theme: TeleproMissionThemeView;
  stage: TeleproMissionStageView;
} | null> {
  const catalog = await loadTeleproMissionsCatalogView(
    teleproId,
    organizationId,
  );
  return findStageInCatalog(catalog, themeSlug, stageSlug);
}
