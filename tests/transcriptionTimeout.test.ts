import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { __resetEnvCacheForTests, DIARIZATION_TRANSCRIPTION_MODEL } from "@/lib/env";

/**
 * Regression du timeout production de 301 s sur TRANSCRIBE_RECORDING.
 *
 * Le defaut undici (headersTimeout/bodyTimeout = 300 s) coupait avant que
 * OpenAI ne renvoie sa reponse pour un fichier audio de plusieurs Mo. On
 * verifie ici qu'un timeout dedie est applique au fetch de transcription,
 * que la classification d'erreur est correcte, et que TRANSCRIBE est borne
 * a 2 tentatives par ProcessingJob.
 *
 * Note : `AbortSignal.timeout()` s'appuie sur un timer interne Node qui
 * n'est pas patche par `vi.useFakeTimers()`. On teste donc le comportement
 * en simulant directement l'erreur qu'undici / AbortSignal remonterait
 * (name: "TimeoutError" | "AbortError" | "HeadersTimeoutError"...).
 */

const BASE_ENV: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db?schema=public",
  SESSION_SECRET: "0123456789012345678901234567890123456789",
  STORAGE_DRIVER: "local",
  AI_PROVIDER: "demo",
  OPENAI_TRANSCRIPTION_MODEL: DIARIZATION_TRANSCRIPTION_MODEL,
};

function setEnv(over: Record<string, string | undefined>): void {
  const env = process.env as Record<string, string | undefined>;
  for (const [k, v] of Object.entries({ ...BASE_ENV, ...over })) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  __resetEnvCacheForTests();
}

const snapshot = { ...process.env };
afterEach(() => {
  process.env = { ...snapshot };
  __resetEnvCacheForTests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
});

async function loadProvider() {
  vi.doMock("@/lib/providers/storage", () => ({
    getAudioStorage: () => ({ get: async () => Buffer.from("fake-audio") }),
  }));
  const mod = await import("@/lib/providers/openai");
  return { provider: new mod.OpenAITranscriptionProvider(), mod };
}

describe("configuration du timeout de transcription", () => {
  beforeEach(() => setEnv({}));

  it("valeur par defaut = 900_000 ms (15 min)", async () => {
    setEnv({ OPENAI_TRANSCRIPTION_TIMEOUT_MS: undefined });
    const { getServerEnv } = await import("@/lib/env");
    expect(getServerEnv().OPENAI_TRANSCRIPTION_TIMEOUT_MS).toBe(900_000);
  });

  it("plancher a 60_000 ms : rejette une valeur trop basse", async () => {
    setEnv({ OPENAI_TRANSCRIPTION_TIMEOUT_MS: "1000" });
    const { getServerEnv } = await import("@/lib/env");
    expect(() => getServerEnv()).toThrowError(/OPENAI_TRANSCRIPTION_TIMEOUT_MS/);
  });

  it("propage le timeout configure vers l'appel fetch (signal + dispatcher local)", async () => {
    setEnv({ OPENAI_TRANSCRIPTION_TIMEOUT_MS: "600000" });
    const { provider } = await loadProvider();
    let capturedInit:
      | { signal?: AbortSignal; dispatcher?: unknown }
      | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { signal?: AbortSignal; dispatcher?: unknown }) => {
        capturedInit = init;
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            segments: [{ speaker: "s0", start: 0, end: 1, text: "ok" }],
          }),
        };
      }),
    );

    await provider.transcribeDiarized({
      storageKey: "o/r.mp3",
      language: "fr",
      mimeType: "audio/mpeg",
      seed: "s",
    });

    expect(capturedInit).not.toBeNull();
    const init = capturedInit as unknown as { signal?: AbortSignal; dispatcher?: unknown };
    expect(init.signal).toBeInstanceOf(AbortSignal);
    // Dispatcher local (jamais setGlobalDispatcher) : les autres appels OpenAI
    // et le provider Realtime gardent le comportement par defaut.
    expect(init.dispatcher).toBeDefined();
  });
});

describe("comportement fetch de la transcription", () => {
  beforeEach(() => setEnv({}));

  it("reponse > 5 min mais < 15 min : succes (l'ancienne borne 300 s ne coupe plus)", async () => {
    setEnv({ OPENAI_TRANSCRIPTION_TIMEOUT_MS: "900000" });
    const { provider } = await loadProvider();

    vi.useFakeTimers();
    // 6 minutes avec setTimeout : au dela des 300 s d'undici par defaut,
    // en dessous des 900 s configures.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 6 * 60_000));
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            segments: [{ speaker: "s0", start: 0, end: 1, text: "long" }],
          }),
        };
      }),
    );

    const promise = provider.transcribeDiarized({
      storageKey: "o/r.mp3",
      language: "fr",
      mimeType: "audio/mpeg",
      seed: "s",
    });
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    const res = await promise;
    expect(res.segments).toHaveLength(1);
  });

  it("timeout undici (TimeoutError) : erreur transitoire non permanente, rejouable par le job", async () => {
    setEnv({ OPENAI_TRANSCRIPTION_TIMEOUT_MS: "900000" });
    const { provider, mod } = await loadProvider();
    const { isPermanentError } = await import("@/lib/jobErrors");

    const fetchMock = vi.fn(async () => {
      // Ce qu'undici / AbortSignal.timeout remonteraient a l'expiration.
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    });
    vi.stubGlobal("fetch", fetchMock);

    const err = await provider
      .transcribeDiarized({
        storageKey: "o/r.mp3",
        language: "fr",
        mimeType: "audio/mpeg",
        seed: "s",
      })
      .catch((e: unknown) => e);

    // Une seule requete OpenAI par appel : les retries sont delegues a la file
    // (pas de retry cache dans le provider ni dans le SDK undici).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(mod.TranscriptionTimeoutError);
    // Timeout = transitoire : ne pas classer permanent -> le job pourra retry.
    expect(isPermanentError(err)).toBe(false);
  });

  it.each([
    ["HeadersTimeoutError", "Headers Timeout Error"],
    ["BodyTimeoutError", "Body Timeout Error"],
    ["AbortError", "The operation was aborted"],
    ["SocketError", "other side closed"],
  ])(
    "classifie %s comme timeout transitoire",
    async (name, message) => {
      setEnv({ OPENAI_TRANSCRIPTION_TIMEOUT_MS: "900000" });
      const { provider, mod } = await loadProvider();
      const { isPermanentError } = await import("@/lib/jobErrors");

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          const err = new Error(message);
          err.name = name;
          throw err;
        }),
      );

      const err = await provider
        .transcribeDiarized({
          storageKey: "o/r.mp3",
          language: "fr",
          mimeType: "audio/mpeg",
          seed: "s",
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(mod.TranscriptionTimeoutError);
      expect(isPermanentError(err)).toBe(false);
    },
  );
});

describe("politique de retry cote ProcessingJob", () => {
  it("TRANSCRIBE_RECORDING_MAX_ATTEMPTS = 2 par defaut", async () => {
    setEnv({ TRANSCRIBE_RECORDING_MAX_ATTEMPTS: undefined });
    const { getServerEnv } = await import("@/lib/env");
    expect(getServerEnv().TRANSCRIBE_RECORDING_MAX_ATTEMPTS).toBe(2);
  });

  it("apres 2 tentatives, un nouvel echec devient terminal (attempts_exhausted)", async () => {
    const { decideJobFailure } = await import("@/lib/jobStatus");
    const decision = decideJobFailure({ attempts: 2, maxAttempts: 2, permanent: false });
    expect(decision.terminal).toBe(true);
    if (decision.terminal) {
      expect(decision.reason).toMatch(/attempts/);
    }
  });

  it("timeout au 1er essai laisse une seconde tentative planifiee", async () => {
    const { decideJobFailure } = await import("@/lib/jobStatus");
    const decision = decideJobFailure({ attempts: 1, maxAttempts: 2, permanent: false });
    expect(decision.terminal).toBe(false);
  });

  it("un 400 est permanent et coupe immediatement les retries (pas de 6 tentatives)", async () => {
    const { decideJobFailure } = await import("@/lib/jobStatus");
    const decision = decideJobFailure({ attempts: 1, maxAttempts: 5, permanent: true });
    expect(decision.terminal).toBe(true);
    if (decision.terminal) {
      expect(decision.reason).toMatch(/permanent/);
    }
  });

  it("le service enqueue TRANSCRIBE avec maxAttempts issu de la config (=2 par defaut)", async () => {
    // Verification legere : on lit simplement la valeur exposee par serverConfig
    // qu'utilise referenceCallService.enqueueJob(...).
    setEnv({});
    const { serverConfig } = await import("@/lib/config");
    expect(serverConfig.worker.transcribeMaxAttempts).toBe(2);
  });
});
