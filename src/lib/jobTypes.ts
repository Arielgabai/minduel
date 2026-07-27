/**
 * Job types for the persistent queue (ProcessingJob).
 *
 * Kept in its own module to avoid an import cycle between jobs.ts
 * (worker/dispatch) and the services that enqueue jobs (e.g. simulationService).
 */
export const JobType = {
  RECORDING_PIPELINE: "RECORDING_PIPELINE",
  EVALUATE_SIMULATION: "EVALUATE_SIMULATION",
  // Pipeline appel -> exercice (chaîné : chaque étape enfile la suivante).
  PREPROCESS_RECORDING: "PREPROCESS_RECORDING",
  TRANSCRIBE_RECORDING: "TRANSCRIBE_RECORDING",
  ANALYZE_REFERENCE_CALL: "ANALYZE_REFERENCE_CALL",
  GENERATE_SCENARIO_FROM_CALL: "GENERATE_SCENARIO_FROM_CALL",
} as const;

export type JobTypeValue = (typeof JobType)[keyof typeof JobType];

/** Types de tâches du pipeline appel -> exercice (échec => enregistrement FAILED). */
export const REFERENCE_CALL_JOB_TYPES: readonly string[] = [
  JobType.PREPROCESS_RECORDING,
  JobType.TRANSCRIBE_RECORDING,
  JobType.ANALYZE_REFERENCE_CALL,
  JobType.GENERATE_SCENARIO_FROM_CALL,
];
