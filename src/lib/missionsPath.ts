/**
 * Helpers purs de présentation du parcours Missions (lots L / N2).
 * Aucune règle métier dupliquée : les statuts, l'ordre, le déblocage et la
 * recommandation restent calculés par le moteur (`teleproMissions`).
 */

import { ExerciseMissionStatus } from "@/lib/teleproMissions";
import type {
  MissionExerciseView,
  TeleproMissionExerciseNode,
} from "@/lib/teleproMissions";

export type MissionNodeVariant =
  | "completed"
  | "current"
  | "available"
  | "locked";

/**
 * Progression globale en pourcentage (borné 0–100).
 * Aucun total codé en dur : dépend uniquement des exercices / niveaux réellement présents.
 */
export function missionProgressPct(completed: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const ratio = completed / total;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

/** Variante visuelle d'un nœud, dérivée du statut calculé. */
export function missionNodeVariant(
  status: MissionExerciseView["status"] | TeleproMissionExerciseNode["status"],
): MissionNodeVariant {
  switch (status) {
    case ExerciseMissionStatus.COMPLETED:
      return "completed";
    case ExerciseMissionStatus.IN_PROGRESS:
      return "current";
    case ExerciseMissionStatus.AVAILABLE:
      return "available";
    default:
      return "locked";
  }
}

/**
 * Un exercice n'est lançable que s'il possède un lien fourni par le moteur
 * et qu'il n'est pas verrouillé. Garantit qu'un nœud LOCKED n'a jamais de lien.
 */
export function isLaunchable(exercise: MissionExerciseView): boolean {
  return (
    exercise.status !== ExerciseMissionStatus.LOCKED &&
    typeof exercise.ctaHref === "string" &&
    exercise.ctaHref.length > 0
  );
}

/** Variante pour les nœuds du catalogue N2. */
export function isLaunchableNode(exercise: TeleproMissionExerciseNode): boolean {
  return (
    exercise.status !== ExerciseMissionStatus.LOCKED &&
    typeof exercise.ctaHref === "string" &&
    exercise.ctaHref.length > 0
  );
}
