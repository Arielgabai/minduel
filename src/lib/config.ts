// Configuration centralisée côté serveur (modèles, limites, mode démo).
// Adossée à la validation d'environnement typée (src/lib/env.ts).
// Aucune clé n'est jamais exposée au client : ne lire ce module que côté serveur.
import "server-only";
import { getServerEnv } from "./env";

/**
 * `serverConfig` expose une vue pratique de la configuration. Les accès sont
 * paresseux (via getters) : la validation d'environnement n'a lieu qu'au premier
 * accès réel, jamais à l'import (le build Next.js reste possible sans les
 * variables runtime).
 */
export const serverConfig = {
  get appUrl(): string {
    return getServerEnv().APP_URL;
  },
  get nodeEnv(): string {
    return getServerEnv().NODE_ENV;
  },
  get sessionSecret(): string {
    return getServerEnv().SESSION_SECRET;
  },
  get aiProvider(): "demo" | "openai" {
    return getServerEnv().AI_PROVIDER;
  },
  get openaiApiKey(): string {
    return getServerEnv().OPENAI_API_KEY ?? "";
  },
  get models() {
    const env = getServerEnv();
    return {
      realtime: env.OPENAI_REALTIME_MODEL,
      transcribe: env.OPENAI_TRANSCRIPTION_MODEL,
      evaluation: env.OPENAI_EVALUATION_MODEL,
      realtimeVoice: env.OPENAI_REALTIME_VOICE,
    };
  },
  get storage() {
    const env = getServerEnv();
    return {
      driver: env.STORAGE_DRIVER,
      dir: env.AUDIO_STORAGE_DIR,
      maxUploadMb: env.MAX_AUDIO_SIZE_MB,
      signedUrlTtlSec: env.SIGNED_URL_TTL_SECONDS,
      s3: {
        bucket: env.S3_BUCKET ?? "",
        region: env.S3_REGION ?? "",
        endpoint: env.S3_ENDPOINT ?? "",
        accessKeyId: env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "",
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
      },
    };
  },
  get retentionDays(): number {
    return getServerEnv().RECORDING_RETENTION_DAYS;
  },
  get logLevel(): string {
    return getServerEnv().LOG_LEVEL;
  },
};

/**
 * Le mode démo est déterminé UNIQUEMENT par AI_PROVIDER (séparation explicite,
 * aucune bascule silencieuse). AI_PROVIDER=demo → providers déterministes.
 */
export function isDemoMode(): boolean {
  return getServerEnv().AI_PROVIDER === "demo";
}

// Types MIME audio acceptés (vérifiés côté serveur).
export const ACCEPTED_AUDIO_MIME = [
  "audio/mpeg", // mp3
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4", // m4a
  "audio/x-m4a",
  "audio/aac",
];

export const ACCEPTED_AUDIO_EXT = [".mp3", ".wav", ".m4a"];
