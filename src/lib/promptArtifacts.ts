import { createHash } from "crypto";

export type PromptArtifact = { body: string; contentType: string };
export type PromptArtifacts = Record<string, PromptArtifact>;

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
