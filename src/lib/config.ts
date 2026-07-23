// Configuration centralisée côté serveur (modèles, limites, mode démo).
// Aucune clé n'est jamais exposée au client : ne lire ce module que côté serveur.

export const serverConfig = {
  sessionSecret:
    process.env.SESSION_SECRET ?? "dev-secret-change-me-in-production-please",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  models: {
    realtime: process.env.OPENAI_REALTIME_MODEL ?? "gpt-4o-realtime-preview",
    transcribe: process.env.OPENAI_TRANSCRIBE_MODEL ?? "whisper-1",
    evaluation: process.env.OPENAI_EVALUATION_MODEL ?? "gpt-4o-mini",
    realtimeVoice: process.env.OPENAI_REALTIME_VOICE ?? "verse",
  },
  storage: {
    driver: process.env.AUDIO_STORAGE_DRIVER ?? "local",
    dir: process.env.AUDIO_STORAGE_DIR ?? "./storage",
    maxUploadMb: Number(process.env.AUDIO_MAX_UPLOAD_MB ?? "50"),
  },
  retentionDays: Number(process.env.RECORDING_RETENTION_DAYS ?? "90"),
};

/**
 * Le mode démo est actif si forcé explicitement OU si aucune clé OpenAI n'est
 * configurée. Dans ce mode, tous les providers utilisent des implémentations
 * déterministes (voir src/lib/providers).
 */
export function isDemoMode(): boolean {
  if (process.env.MINDUEL_DEMO_MODE === "true") return true;
  if (process.env.MINDUEL_DEMO_MODE === "false" && serverConfig.openaiApiKey) {
    return false;
  }
  return !serverConfig.openaiApiKey;
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
