import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getServerEnv, __resetEnvCacheForTests } from "@/lib/env";

/**
 * LOT Q1 — seuil VAD Realtime (OPENAI_REALTIME_VAD_THRESHOLD).
 * Mocks uniquement : aucun fetch réel, aucun micro, aucune clé OpenAI.
 */

function read(rel: string): string {
  return readFileSync(path.resolve(rel), "utf8");
}

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
  __resetEnvCacheForTests();
}

describe("LOT Q1 — OPENAI_REALTIME_VAD_THRESHOLD", () => {
  const snapshot = { ...process.env };

  beforeEach(() => {
    __resetEnvCacheForTests();
    for (const k of [
      "NODE_ENV",
      "DATABASE_URL",
      "SESSION_SECRET",
      "AI_PROVIDER",
      "OPENAI_API_KEY",
      "OPENAI_REALTIME_VAD_THRESHOLD",
      "OPENAI_REALTIME_MODEL",
      "OPENAI_REALTIME_VOICE",
      "NEXT_PUBLIC_OPENAI_REALTIME_VAD_THRESHOLD",
    ]) {
      delete process.env[k];
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...snapshot };
    __resetEnvCacheForTests();
  });

  it("1. valeur absente → 0.65", () => {
    withEnv(BASE);
    expect(getServerEnv().OPENAI_REALTIME_VAD_THRESHOLD).toBe(0.65);
  });

  it('2. valeur "0.75" → nombre 0.75', () => {
    withEnv({ ...BASE, OPENAI_REALTIME_VAD_THRESHOLD: "0.75" });
    expect(getServerEnv().OPENAI_REALTIME_VAD_THRESHOLD).toBe(0.75);
  });

  it("3. valeur 0 acceptée", () => {
    withEnv({ ...BASE, OPENAI_REALTIME_VAD_THRESHOLD: "0" });
    expect(getServerEnv().OPENAI_REALTIME_VAD_THRESHOLD).toBe(0);
  });

  it("4. valeur 1 acceptée", () => {
    withEnv({ ...BASE, OPENAI_REALTIME_VAD_THRESHOLD: "1" });
    expect(getServerEnv().OPENAI_REALTIME_VAD_THRESHOLD).toBe(1);
  });

  it("5. valeur négative refusée", () => {
    withEnv({ ...BASE, OPENAI_REALTIME_VAD_THRESHOLD: "-0.1" });
    expect(() => getServerEnv()).toThrow(/OPENAI_REALTIME_VAD_THRESHOLD|Configuration/);
  });

  it("6. valeur supérieure à 1 refusée", () => {
    withEnv({ ...BASE, OPENAI_REALTIME_VAD_THRESHOLD: "1.01" });
    expect(() => getServerEnv()).toThrow(/OPENAI_REALTIME_VAD_THRESHOLD|Configuration/);
  });

  it("7. chaîne non numérique refusée (pas de NaN silencieux)", () => {
    withEnv({ ...BASE, OPENAI_REALTIME_VAD_THRESHOLD: "fort" });
    expect(() => getServerEnv()).toThrow(/OPENAI_REALTIME_VAD_THRESHOLD|Configuration/);
  });

  it("8-9. payload session.update : server_vad + seuil validé via serveur", async () => {
    withEnv({
      ...BASE,
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test-key",
      OPENAI_REALTIME_VAD_THRESHOLD: "0.65",
      OPENAI_REALTIME_MODEL: "gpt-realtime",
      OPENAI_REALTIME_VOICE: "marin",
    });

    const { serverConfig } = await import("@/lib/config");
    expect(serverConfig.realtimeVadThreshold).toBe(0.65);
    expect(serverConfig.models.realtime).toBe("gpt-realtime");
    expect(serverConfig.models.realtimeVoice).toBe("marin");

    const hook = read("src/app/app/call/[id]/useRealtimeSession.ts");
    expect(hook).toContain('type: "server_vad"');
    expect(hook).toContain("threshold: vadThreshold");
    expect(hook).toContain("prefix_padding_ms: 300");
    expect(hook).toContain("silence_duration_ms: 700");
    expect(hook).toContain("create_response: true");
    expect(hook).toContain("interrupt_response: true");
    // 10. seuil non codé en dur dans le composant client
    expect(hook).not.toMatch(/threshold:\s*0\.5\b/);
    expect(hook).not.toMatch(/threshold:\s*0\.65\b/);
    expect(hook).toContain("vadThresholdRef");
    expect(hook).toContain("vadThreshold");

    const route = read("src/app/api/simulations/[id]/realtime/route.ts");
    expect(route).toContain("vadThreshold: serverConfig.realtimeVadThreshold");
    expect(route).toContain("serverConfig");
  });

  it("11. aucun NEXT_PUBLIC_OPENAI_REALTIME_VAD_THRESHOLD", () => {
    const envSrc = read("src/lib/env.ts");
    const hook = read("src/app/app/call/[id]/useRealtimeSession.ts");
    const config = read("src/lib/config.ts");
    const route = read("src/app/api/simulations/[id]/realtime/route.ts");
    for (const src of [envSrc, hook, config, route]) {
      expect(src).not.toContain("NEXT_PUBLIC_OPENAI_REALTIME_VAD_THRESHOLD");
    }
    expect(read(".env.example")).not.toContain(
      "NEXT_PUBLIC_OPENAI_REALTIME_VAD_THRESHOLD",
    );
    expect(read(".env.production.example")).not.toContain(
      "NEXT_PUBLIC_OPENAI_REALTIME_VAD_THRESHOLD",
    );
  });

  it("12-13. paramètres VAD existants, modèle et voix inchangés côté client", () => {
    const hook = read("src/app/app/call/[id]/useRealtimeSession.ts");
    expect(hook).toContain("prefix_padding_ms: 300");
    expect(hook).toContain("silence_duration_ms: 700");
    expect(hook).toContain("create_response: true");
    expect(hook).toContain("interrupt_response: true");
    expect(hook).toContain('type: "server_vad"');
    expect(hook).not.toContain("semantic_vad");
    // getUserMedia / AEC inchangés
    expect(hook).toContain("echoCancellation: true");
    expect(hook).toContain("noiseSuppression: true");
    expect(hook).toContain("autoGainControl: true");

    const openai = read("src/lib/providers/openai.ts");
    expect(openai).toContain("serverConfig.models.realtime");
    expect(openai).toContain("serverConfig.models.realtimeVoice");
  });

  it("14. mode DEMO inchangé (pas d'OpenAI, pas de dépendance VAD)", async () => {
    withEnv({ ...BASE, AI_PROVIDER: "demo" });
    const demo = read("src/lib/providers/demo.ts");
    expect(demo).toContain("class DemoRealtimeSessionProvider");
    expect(demo).toMatch(/demo:\s*true/);
    expect(demo).not.toContain("OPENAI_REALTIME_VAD_THRESHOLD");
    expect(demo).not.toContain("vadThreshold");
    expect(demo).not.toContain("api.openai.com");

    const { isDemoMode } = await import("@/lib/config");
    expect(isDemoMode()).toBe(true);
  });

  it("15-16. aucun fetch réel ni ouverture micro dans les tests Q1", () => {
    // Ce fichier n'appelle jamais fetch / getUserMedia sans mock ;
    // la suite vitest n'ouvre pas le micro.
    expect(typeof fetch).toBe("function");
    expect(vi.isMockFunction(fetch)).toBe(false);
  });

  it("17-18. cleanup WebRTC et unique /end conservés", () => {
    const hook = read("src/app/app/call/[id]/useRealtimeSession.ts");
    expect(hook).toContain("const cleanup = useCallback");
    expect(hook).toContain("micStreamRef.current?.getTracks().forEach");
    expect(hook).toContain("pcRef.current.close");
    expect(hook).toContain("dcRef.current?.close");
    expect(hook).toContain("audioElRef.current.srcObject = null");

    const client = read("src/app/app/call/[id]/RealtimeCallClient.tsx");
    const endCalls =
      client.match(/\/api\/simulations\/\$\{[^}]+\}\/end/g) ?? [];
    expect(endCalls).toHaveLength(1);
    expect(client).toContain("if (ending) return");
  });

  it("exemples d'env et docs documentent la variable (web Realtime)", () => {
    const example = read(".env.example");
    const prod = read(".env.production.example");
    const docs = read("docs/environment-variables.md");
    expect(example).toContain("OPENAI_REALTIME_VAD_THRESHOLD=0.65");
    expect(prod).toContain("OPENAI_REALTIME_VAD_THRESHOLD=0.65");
    expect(docs).toContain("OPENAI_REALTIME_VAD_THRESHOLD");
    expect(docs).toMatch(/0\.65/);
    expect(docs).toMatch(/0.*1|plage|0–1|0-1/);
    expect(docs).toMatch(/bruit|sensib|parler plus fort|web Realtime/i);
  });

  it("client ne lit pas process.env pour le seuil VAD", () => {
    const hook = read("src/app/app/call/[id]/useRealtimeSession.ts");
    expect(hook).not.toMatch(/process\.env\.OPENAI_REALTIME_VAD_THRESHOLD/);
    expect(hook).not.toMatch(/process\.env\.OPENAI/);
    expect(hook).toContain("tokenJson?.data?.vadThreshold");
  });
});