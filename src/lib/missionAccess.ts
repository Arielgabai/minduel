import "server-only";

import { ScenarioStatus } from "@/lib/enums";
import { resolvePlatformCatalogOrganizationId } from "@/lib/platformCatalog";
import {
  ExerciseMissionStatus,
  canStartNewSimulation,
  type TeleproMissionExerciseNode,
} from "@/lib/teleproMissions";
import { loadTeleproMissionsCatalogView } from "@/lib/teleproMissionsService";

export const LOCKED_LEVEL_MESSAGE =
  "Niveau verrouillé : atteins le score requis au niveau précédent.";

export type MissionAccessDecision =
  | {
      allowed: true;
      node: TeleproMissionExerciseNode;
    }
  | {
      allowed: false;
      code: "NOT_FOUND" | "LOCKED" | "NOT_STARTABLE";
      message: string;
      node: TeleproMissionExerciseNode | null;
    };

function findExerciseNode(
  teleproId: string,
  userOrganizationId: string,
  scenarioId: string,
): Promise<{
  node: TeleproMissionExerciseNode | null;
}> {
  return loadTeleproMissionsCatalogView(teleproId, userOrganizationId).then(
    (catalog) => {
      for (const theme of catalog.themes) {
        for (const stage of theme.stages) {
          for (const exercise of stage.exercises) {
            if (exercise.id === scenarioId) {
              return { node: exercise };
            }
          }
        }
      }
      return { node: null };
    },
  );
}

/**
 * Décide si un télépro peut démarrer une nouvelle simulation sur un scénario
 * catalogue. Respecte P2 : scénario = org catalogue, tentatives = org user.
 */
export async function resolveTeleproScenarioStartAccess(
  teleproId: string,
  userOrganizationId: string,
  scenarioId: string,
): Promise<MissionAccessDecision> {
  void ScenarioStatus;
  void resolvePlatformCatalogOrganizationId;
  const { node } = await findExerciseNode(
    teleproId,
    userOrganizationId,
    scenarioId,
  );
  if (!node) {
    return {
      allowed: false,
      code: "NOT_FOUND",
      message: "Scénario introuvable ou non publié.",
      node: null,
    };
  }
  if (node.status === ExerciseMissionStatus.LOCKED) {
    return {
      allowed: false,
      code: "LOCKED",
      message: node.lockMessage ?? LOCKED_LEVEL_MESSAGE,
      node,
    };
  }
  if (!canStartNewSimulation(node.status)) {
    return {
      allowed: false,
      code: "NOT_STARTABLE",
      message:
        node.status === ExerciseMissionStatus.ANALYSIS_PENDING
          ? "Analyse en cours : consulte le débrief depuis Missions une fois prêt."
          : node.status === ExerciseMissionStatus.IN_PROGRESS
            ? "Une simulation est déjà en cours pour cet exercice."
            : LOCKED_LEVEL_MESSAGE,
      node,
    };
  }
  return { allowed: true, node };
}
