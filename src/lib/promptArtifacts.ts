import { createHash } from "crypto";
import { z } from "zod";
import { PromptKind } from "./enums";

export type PromptArtifact = { body: string; contentType: string };
export type PromptArtifacts = Record<string, PromptArtifact>;

const PromptArtifactSchema = z.object({
  body: z.string().min(20).max(20_000),
  contentType: z.string().min(1).max(80).default("text/plain"),
});

/** Schéma minimal pour le snapshot simulation (PROSPECT_PERSONA requis). */
export const SimulationPromptArtifactsSchema = z
  .object({
    [PromptKind.PROSPECT_PERSONA]: PromptArtifactSchema,
    [PromptKind.EVALUATION_SYSTEM]: PromptArtifactSchema.optional(),
    [PromptKind.EVALUATION_USER]: PromptArtifactSchema.optional(),
  })
  .strict();

export type SimulationPromptArtifacts = z.infer<
  typeof SimulationPromptArtifactsSchema
>;

/** Parse et valide le JSON artifacts d'un PromptBundle. */
export function parsePromptArtifacts(raw: string): SimulationPromptArtifacts {
  const parsed = JSON.parse(raw) as unknown;
  return SimulationPromptArtifactsSchema.parse(parsed);
}

/** Interpolation locale `{{cle}}` — aucun appel réseau. */
export function renderPromptTemplate(
  body: string,
  vars: Record<string, string>,
): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : full,
  );
}

/** Vérifie que le hash canonique des artifacts correspond au hash stocké. */
export function verifyPromptArtifactsHash(
  artifacts: PromptArtifacts,
  expectedHash: string,
): boolean {
  return hashPromptArtifacts(artifacts) === expectedHash;
}

/** Tri récursif des clés pour une sérialisation JSON déterministe. */
export function canonicalizePromptArtifacts(
  artifacts: PromptArtifacts,
): string {
  const sorted = sortKeysDeep(artifacts);
  return JSON.stringify(sorted);
}

function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortKeysDeep(obj[key]);
  }
  return out;
}

export function hashPromptArtifacts(artifacts: PromptArtifacts): string {
  const canonical = canonicalizePromptArtifacts(artifacts);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
