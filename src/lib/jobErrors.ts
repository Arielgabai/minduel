/**
 * Classification des erreurs de la file ProcessingJob.
 *
 * Module autonome (aucune dépendance interne) pour rester importable aussi bien
 * par les providers que par le dispatcher, sans créer de cycle d'import
 * (jobs -> referenceCallService -> providers -> jobs).
 *
 * Deux familles d'erreurs :
 * - RETRIABLE : incident transitoire (429, 5xx, réseau) -> retry avec backoff.
 * - PERMANENTE : configuration ou validation invalide (400, 401, 403, 404, 422)
 *   -> échec immédiat, sans consommer les tentatives restantes. Réessayer six
 *   fois un modèle mal configuré ne fait que retarder le diagnostic.
 */

/** Erreur non rejouable : la relancer à l'identique produira le même échec. */
export class PermanentJobError extends Error {
  readonly permanent = true;

  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

/** Vrai si l'erreur ne doit pas être réessayée automatiquement. */
export function isPermanentError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { permanent?: unknown }).permanent === true
  );
}

/**
 * Statuts HTTP considérés comme définitifs côté appelant : la requête est
 * invalide (paramètre non supporté, modèle inconnu, clé refusée…). Les rejouer
 * à l'identique redonnera la même réponse.
 */
const PERMANENT_HTTP_STATUSES = new Set([400, 401, 403, 404, 405, 409, 415, 422]);

/** Vrai si ce statut HTTP justifie un retry (429 et 5xx). */
export function isRetriableHttpStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Construit l'erreur adaptée à un échec HTTP : `PermanentJobError` pour une
 * requête invalide, `Error` classique (donc rejouable) sinon.
 */
export function httpFailureToError(status: number, message: string): Error {
  if (PERMANENT_HTTP_STATUSES.has(status)) {
    return new PermanentJobError(message);
  }
  return new Error(message);
}
