import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getServerEnv, __resetEnvCacheForTests } from "@/lib/env";

const BASE = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db?schema=public",
  SESSION_SECRET: "0123456789012345678901234567890123456789",
};

function withEnv(vars: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("validation des variables d'environnement", () => {
  const snapshot = { ...process.env };

  beforeEach(() => {
    __resetEnvCacheForTests();
    // Nettoie les variables pertinentes.
    for (const k of [
      "NODE_ENV",
      "DATABASE_URL",
      "SESSION_SECRET",
      "AI_PROVIDER",
      "OPENAI_API_KEY",
      "STORAGE_DRIVER",
      "S3_BUCKET",
      "S3_REGION",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
    ]) {
      delete process.env[k];
    }
  });

  afterEach(() => {
    process.env = { ...snapshot };
    __resetEnvCacheForTests();
  });

  it("accepte une configuration démo minimale", () => {
    withEnv(BASE);
    const env = getServerEnv();
    expect(env.AI_PROVIDER).toBe("demo");
    expect(env.STORAGE_DRIVER).toBe("local");
    expect(env.SIGNED_URL_TTL_SECONDS).toBe(300);
  });

  it("rejette un SESSION_SECRET trop court", () => {
    withEnv({ ...BASE, SESSION_SECRET: "trop-court" });
    expect(() => getServerEnv()).toThrow(/SESSION_SECRET/);
  });

  it("rejette DATABASE_URL manquant", () => {
    withEnv({ ...BASE, DATABASE_URL: undefined });
    expect(() => getServerEnv()).toThrow(/DATABASE_URL/);
  });

  it("exige OPENAI_API_KEY quand AI_PROVIDER=openai (pas de bascule silencieuse)", () => {
    withEnv({ ...BASE, AI_PROVIDER: "openai" });
    expect(() => getServerEnv()).toThrow(/OPENAI_API_KEY/);
  });

  it("accepte AI_PROVIDER=openai avec une clé", () => {
    withEnv({ ...BASE, AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-test" });
    expect(getServerEnv().AI_PROVIDER).toBe("openai");
  });

  it("exige les variables S3 quand STORAGE_DRIVER=s3", () => {
    withEnv({ ...BASE, STORAGE_DRIVER: "s3" });
    expect(() => getServerEnv()).toThrow(/S3_BUCKET/);
  });

  it("accepte STORAGE_DRIVER=s3 correctement configuré", () => {
    withEnv({
      ...BASE,
      STORAGE_DRIVER: "s3",
      S3_BUCKET: "b",
      S3_REGION: "eu-west-3",
      S3_ACCESS_KEY_ID: "id",
      S3_SECRET_ACCESS_KEY: "secret",
    });
    expect(getServerEnv().STORAGE_DRIVER).toBe("s3");
  });

  it("interdit le SESSION_SECRET par défaut en production", () => {
    withEnv({
      ...BASE,
      NODE_ENV: "production",
      SESSION_SECRET:
        "dev-secret-change-me-in-production-please-32chars-min",
    });
    expect(() => getServerEnv()).toThrow(/SESSION_SECRET/);
  });
});
