/**
 * Standard business error for API handlers.
 *
 * Isolated in its own module (no dependency on next/headers) so it can be thrown
 * from shared services (e.g. simulationService) without pulling the Next runtime
 * into the worker module graph.
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}