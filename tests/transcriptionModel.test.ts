import { describe, it, expect, afterEach, vi } from "vitest";
import { __resetEnvCacheForTests, DIARIZATION_TRANSCRIPTION_MODEL } from "@/lib/env";
import { isPermanentError } from "@/lib/jobErrors";

/**
 * Régression du 400 de production :
 * « chunking_strategy is not supported with this model ».
 * Le pipeline appel -> exercice exige la diarisation ; tout autre modèle doit
 * faire échouer la configuration, jamais retomber en silence sur un modèle
 * non diarisant ni sur le mode démo.
 */

const BASE_ENV: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db?schema=public",
  SESSION_SECRET: "0123456789012345678901234567890123456789",
  STORAGE_DRIVER: "local",
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
});

describe("cohérence du modèle de transcription", () => {
  it("accepte gpt-4o-transcribe-diarize en mode openai", async () => {
    setEnv({
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
      OPENAI_TRANSCRIPTION_MODEL: DIARIZATION_TRANSCRIPTION_MODEL,
    });
    const { getServerEnv } = await import("@/lib/env");
    expect(getServerEnv().OPENAI_TRANSCRIPTION_MODEL).toBe(DIARIZATION_TRANSCRIPTION_MODEL);
  });

  it("utilise le modèle diarisant par défaut", async () => {
    setEnv({
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
      OPENAI_TRANSCRIPTION_MODEL: undefined,
    });
    const { getServerEnv } = await import("@/lib/env");
    expect(getServerEnv().OPENAI_TRANSCRIPTION_MODEL).toBe(DIARIZATION_TRANSCRIPTION_MODEL);
  });

  it.each(["gpt-4o-transcribe", "gpt-4o-mini-transcribe", "whisper-1"])(
    "refuse de démarrer avec %s (aucun repli silencieux)",
    async (model) => {
      setEnv({
        AI_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-test",
        OPENAI_TRANSCRIPTION_MODEL: model,
      });
      const { getServerEnv } = await import("@/lib/env");
      expect(() => getServerEnv()).toThrowError(/OPENAI_TRANSCRIPTION_MODEL/);
      expect(() => getServerEnv()).toThrowError(/gpt-4o-transcribe-diarize/);
    },
  );
});

describe("appel OpenAI de transcription", () => {
  async function providerWith(model: string) {
    setEnv({
      // Mode démo : la validation d'environnement n'impose pas le modèle, ce qui
      // permet d'exercer le garde-fou d'exécution du provider lui-même.
      AI_PROVIDER: "demo",
      OPENAI_TRANSCRIPTION_MODEL: model,
    });
    vi.doMock("@/lib/providers/storage", () => ({
      getAudioStorage: () => ({ get: async () => Buffer.from("fake-audio-bytes") }),
    }));
    const { OpenAITranscriptionProvider } = await import("@/lib/providers/openai");
    return new OpenAITranscriptionProvider();
  }

  afterEach(() => {
    vi.doUnmock("@/lib/providers/storage");
    vi.resetModules();
  });

  it("envoie model, response_format, chunking_strategy et language", async () => {
    const provider = await providerWith(DIARIZATION_TRANSCRIPTION_MODEL);
    let sent: FormData | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: FormData }) => {
        sent = init.body;
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            language: "fr",
            segments: [{ speaker: "speaker_0", start: 0, end: 1, text: "Bonjour" }],
          }),
        };
      }),
    );

    await provider.transcribeDiarized({
      storageKey: "org/rec.mp3",
      language: "fr",
      mimeType: "audio/mpeg",
      seed: "rec-1",
    });

    const form = sent as unknown as FormData;
    expect(form.get("model")).toBe(DIARIZATION_TRANSCRIPTION_MODEL);
    expect(form.get("response_format")).toBe("diarized_json");
    expect(form.get("chunking_strategy")).toBe("auto");
    expect(form.get("language")).toBe("fr");
  });

  it("rejette un modèle non diarisant avec une erreur permanente", async () => {
    const provider = await providerWith("gpt-4o-transcribe");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      provider.transcribeDiarized({
        storageKey: "org/rec.mp3",
        language: "fr",
        mimeType: "audio/mpeg",
        seed: "rec-1",
      }),
    ).rejects.toThrowError(/diarisation/);
    // Aucun appel réseau : la configuration est rejetée avant.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("classe un 400 OpenAI comme permanent (pas de six retries)", async () => {
    const provider = await providerWith(DIARIZATION_TRANSCRIPTION_MODEL);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        headers: { get: () => null },
        text: async () => "chunking_strategy is not supported with this model",
      })),
    );

    const err = await provider
      .transcribeDiarized({
        storageKey: "org/rec.mp3",
        language: "fr",
        mimeType: "audio/mpeg",
        seed: "rec-1",
      })
      .catch((e: unknown) => e);

    expect(isPermanentError(err)).toBe(true);
  });

  it("laisse un 429 rejouable", async () => {
    const provider = await providerWith(DIARIZATION_TRANSCRIPTION_MODEL);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 429,
        headers: { get: () => null },
        text: async () => "rate limited",
      })),
    );

    const err = await provider
      .transcribeDiarized({
        storageKey: "org/rec.mp3",
        language: "fr",
        mimeType: "audio/mpeg",
        seed: "rec-1",
      })
      .catch((e: unknown) => e);

    expect(isPermanentError(err)).toBe(false);
  });
});
