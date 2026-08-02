import "server-only";

import { prisma } from "@/lib/db";
import { ScenarioStatus } from "@/lib/enums";
import {
  buildTeleproMissionsView,
  type MissionAttemptInput,
  type MissionExerciseInput,
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
} as const;

/**
 * Charge le modèle de vue missions pour un téléprospecteur.
 * Filtre : organizationId + teleproId + Scenario.status PUBLISHED.
 * Deux requêtes (assignations, tentatives) — pas de N+1.
 */
export async function loadTeleproMissionsView(
  teleproId: string,
  organizationId: string,
): Promise<TeleproMissionsView> {
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

  return buildTeleproMissionsView(exercises, attempts);
}
