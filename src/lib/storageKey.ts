import { randomUUID } from "crypto";

/**
 * Génère une clé d'objet de stockage SÛRE : préfixée par l'organizationId (isolation
 * multi-tenant) + un UUID non prédictible + une extension validée. Le nom de fichier
 * fourni par l'utilisateur n'est JAMAIS repris dans le chemin.
 */
export function buildAudioStorageKey(
  organizationId: string,
  ext: string,
): string {
  const safeExt = normalizeAudioExt(ext);
  return `${organizationId}/${randomUUID()}${safeExt}`;
}

/** Normalise l'extension audio (minuscule, sûre) ou retourne ".audio" par défaut. */
export function normalizeAudioExt(ext: string): string {
  const cleaned = (ext || "").toLowerCase().trim();
  if (/^\.[a-z0-9]{1,5}$/.test(cleaned)) return cleaned;
  return ".audio";
}
