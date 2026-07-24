import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { __resetEnvCacheForTests } from "@/lib/env";

// Unit tests for the real OpenAI Realtime provider: it must mint an EPHEMERAL
// secret via /v1/realtime/client_secrets and never leak the long-lived key.

function setOpenAIEnv(): void {
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = "test";
  env.DATABASE_URL = "postgresql://u:p@localhost:5432/db?schema=public";
  env.SESSION_SECRET = "0123456789012345678901234567890123456789";
  env.STORAGE_DRIVER = "local";
  env.AI_PROVIDER = "openai";
  env.OPENAI_API_KEY = "sk-test-key";
  env.OPENAI_REALTIME_MODEL = "gpt-realtime";
  env.OPENAI_REALTIME_VOICE = "marin";
  __resetEnvCacheForTests();
}

describe("OpenAIRealtimeSessionProvider (secret ephemere)", () => {
  const snapshot = { ...process.env };
  beforeEach(() => setOpenAIEnv());
  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...snapshot };
    __resetEnvCacheForTests();
  });

  it("POST /v1/realtime/client_secrets et extrait le champ value", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(
          JSON.stringify({ value: "ek_test_123", expires_at: 1893456000 }),
          { status: 200 },
        );
      }),
    );

    const { OpenAIRealtimeSessionProvider } = await import(
      "@/lib/providers/openai"
    );
    const provider = new OpenAIRealtimeSessionProvider();
    const res = await provider.createEphemeralSession({
      instructions: "Tu es un prospect.",
    });

    expect(res.demo).toBe(false);
    expect(res.clientSecret).toBe("ek_test_123");
    expect(res.model).toBe("gpt-realtime");
    expect(res.voice).toBe("marin");

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "https://api.openai.com/v1/realtime/client_secrets",
    );
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.session.type).toBe("realtime");
    expect(body.session.model).toBe("gpt-realtime");
    expect(body.session.instructions).toBe("Tu es un prospect.");
    expect(body.session.audio.output.voice).toBe("marin");

    // The long-lived key must never appear in what we return to the browser.
    expect(JSON.stringify(res)).not.toContain("sk-test-key");
  });

  it("leve une erreur claire si OpenAI renvoie un statut non-ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unauthorized", { status: 401 })),
    );
    const { OpenAIRealtimeSessionProvider } = await import(
      "@/lib/providers/openai"
    );
    const provider = new OpenAIRealtimeSessionProvider();
    await expect(
      provider.createEphemeralSession({ instructions: "x" }),
    ).rejects.toThrow(/client_secrets error 401/);
  });

  it("leve une erreur si la reponse ne contient aucun secret", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );
    const { OpenAIRealtimeSessionProvider } = await import(
      "@/lib/providers/openai"
    );
    const provider = new OpenAIRealtimeSessionProvider();
    await expect(
      provider.createEphemeralSession({ instructions: "x" }),
    ).rejects.toThrow();
  });
});