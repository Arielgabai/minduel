/**
 * Machine à états de la file ProcessingJob — logique pure, sans dépendance.
 *
 * Isolée de `jobs.ts` (qui touche Prisma et les services métier) pour deux
 * raisons : éviter un cycle d'import avec les services qui enfilent des tâches,
 * et rendre les transitions testables sans base de données.
 *
 * Invariants :
 * - COMPLETED et FAILED_PERMANENT sont TERMINAUX : jamais de relance
 *   automatique, seul un retry manuel explicite réinitialise la tâche.
 * - `attempts` ne dépasse jamais `maxAttempts` (garde côté SQL de claimJob).
 * - Une erreur permanente échoue immédiatement, sans consommer les tentatives.
 */

export const JobStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  /** Échec définitif : tentatives épuisées OU erreur non rejouable. */
  FAILED_PERMANENT: "FAILED_PERMANENT",
} as const;

export type JobStatusValue = (typeof JobStatus)[keyof typeof JobStatus];

/**
 * Statuts interdisant toute remise en file automatique. C'est ce qui empêche
 * une étape amont rejouée de ressusciter une étape aval en échec définitif.
 * `FAILED` est l'ancien libellé, conservé pour les lignes déjà en base.
 */
export const TERMINAL_JOB_STATUSES: readonly string[] = [
  JobStatus.COMPLETED,
  JobStatus.FAILED_PERMANENT,
  "FAILED",
];

/** Vrai si le statut interdit toute relance automatique. */
export function isTerminalJobStatus(status: string): boolean {
  return TERMINAL_JOB_STATUSES.includes(status);
}

/** Vrai si le statut correspond à un échec définitif (rejouable manuellement). */
export function isFailedJobStatus(status: string): boolean {
  return status === JobStatus.FAILED_PERMANENT || status === "FAILED";
}

/** Backoff exponentiel plafonné : 5s, 10s, 20s, 40s… max 5 min. */
export function retryDelayMs(attempts: number): number {
  return Math.min(5_000 * 2 ** Math.max(0, attempts - 1), 300_000);
}

export type JobFailureDecision =
  | { terminal: true; reason: "permanent_error" | "attempts_exhausted" }
  | { terminal: false; delayMs: number };

/**
 * Décide du sort d'une tâche en échec :
 * - erreur permanente (400 de configuration, validation) -> échec immédiat ;
 * - tentatives épuisées -> échec définitif ;
 * - sinon -> retry planifié avec backoff borné.
 */
export function decideJobFailure(input: {
  attempts: number;
  maxAttempts: number;
  permanent: boolean;
}): JobFailureDecision {
  if (input.permanent) return { terminal: true, reason: "permanent_error" };
  if (input.attempts >= input.maxAttempts) {
    return { terminal: true, reason: "attempts_exhausted" };
  }
  return { terminal: false, delayMs: retryDelayMs(input.attempts) };
}
