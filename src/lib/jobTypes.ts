/**
 * Job types for the persistent queue (ProcessingJob).
 *
 * Kept in their own module to avoid an import cycle between jobs.ts
 * (worker/dispatch) and the services that enqueue jobs (e.g. simulationService).
 */
export const JobType = {
  RECORDING_PIPELINE: "RECORDING_PIPELINE",
  EVALUATE_SIMULATION: "EVALUATE_SIMULATION",
} as const;

export type JobTypeValue = (typeof JobType)[keyof typeof JobType];