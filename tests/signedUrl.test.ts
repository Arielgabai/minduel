import { describe, it, expect, beforeAll } from "vitest";
import { createHmac } from "crypto";

const SECRET = "0123456789012345678901234567890123456789";

// Configure l'environnement AVANT d'importer les modules qui lisent la config.
const env = process.env as Record<string, string | undefined>;
env.NODE_ENV = "test";
env.DATABASE_URL = "postgresql://u:p@localhost:5432/db?schema=public";
env.SESSION_SECRET = SECRET;
env.AI_PROVIDER = "demo";
env.STORAGE_DRIVER = "local";

let verifyStorageSignature: (k: string, e: string, s: string) => boolean;
let isPersistentStorageConfigured: () => boolean;

beforeAll(async () => {
  const mod = await import("@/lib/providers/storage");
  verifyStorageSignature = mod.verifyStorageSignature;
  isPersistentStorageConfigured = mod.isPersistentStorageConfigured;
});

function sign(key: string, expires: number): string {
  return createHmac("sha256", SECRET).update(`${key}:${expires}`).digest("hex");
}

describe("URLs de stockage signées", () => {
  it("valide une signature correcte non expirée", () => {
    const key = "org-1/abc.mp3";
    const expires = Date.now() + 60_000;
    expect(verifyStorageSignature(key, String(expires), sign(key, expires))).toBe(
      true,
    );
  });

  it("rejette une signature falsifiée", () => {
    const key = "org-1/abc.mp3";
    const expires = Date.now() + 60_000;
    expect(verifyStorageSignature(key, String(expires), "deadbeef")).toBe(false);
  });

  it("rejette une signature pour une autre clé (isolation)", () => {
    const expires = Date.now() + 60_000;
    const sig = sign("org-1/abc.mp3", expires);
    expect(verifyStorageSignature("org-2/abc.mp3", String(expires), sig)).toBe(
      false,
    );
  });

  it("rejette une URL expirée", () => {
    const key = "org-1/abc.mp3";
    const expires = Date.now() - 1_000;
    expect(verifyStorageSignature(key, String(expires), sign(key, expires))).toBe(
      false,
    );
  });

  it("indique que le stockage local n'est pas persistant", () => {
    expect(isPersistentStorageConfigured()).toBe(false);
  });
});
