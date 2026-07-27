import "server-only";
import { z } from "zod";

/**
 * Validation centralisée et typée des variables d'environnement (serveur uniquement).
 *
 * Principes :
 * - La validation est PARESSEUSE (mémoïsée) : elle ne s'exécute pas à l'import,
 *   afin que le build Next.js ne casse pas parce qu'une variable runtime (DB, S3…)
 *   n'est pas présente pendant la compilation.
 * - Elle échoue TÔT et avec un message clair au premier usage réel (au démarrage
 *   via `src/instrumentation.ts`, ou à la première requête utilisant le service).
 * - Les variables sont séparées : toujours obligatoires, conditionnellement
 *   obligatoires (selon AI_PROVIDER / STORAGE_DRIVER), et publiques.
 * - Aucun secret ne commence par NEXT_PUBLIC_.
 */

const boolish = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return def;
      return v === "true" || v === "1" || v.toLowerCase() === "yes";
    });

const intFromString = (def: number, min = 1, max = Number.MAX_SAFE_INTEGER) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number(v)))
    .pipe(z.number().int().min(min).max(max));

const rawSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // URL publique de l'application (utilisée côté serveur pour construire des liens).
    APP_URL: z.string().url().default("http://localhost:3000"),

    // Base de données (PostgreSQL en environnements partagés et en production).
    DATABASE_URL: z.string().min(1, "DATABASE_URL est requis."),
    // Optionnel : connexion directe (utile avec un pooler type PgBouncer/Neon).
    DIRECT_URL: z.string().optional(),

    // Secret de signature des sessions et des URLs de stockage (>= 32 caractères).
    SESSION_SECRET: z
      .string()
      .min(32, "SESSION_SECRET doit contenir au moins 32 caractères."),

    // Fournisseur d'IA : "demo" (déterministe, aucun appel payant) ou "openai".
    AI_PROVIDER: z.enum(["demo", "openai"]).default("demo"),
    OPENAI_API_KEY: z.string().optional(),
    // Modèle Realtime GA (speech-to-speech WebRTC). "gpt-realtime" est le modèle
    // GA compatible avec l'endpoint /v1/realtime/client_secrets ({type:"realtime"}).
    OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime"),
    // Transcription diarisée par défaut pour le pipeline appel -> exercice.
    OPENAI_TRANSCRIPTION_MODEL: z.string().default("gpt-4o-transcribe-diarize"),
    OPENAI_EVALUATION_MODEL: z.string().default("gpt-4o-mini"),
    // Modèles (Responses API) pour l'analyse structurée et la génération de scénario.
    OPENAI_ANALYSIS_MODEL: z.string().default("gpt-5.6-terra"),
    OPENAI_SCENARIO_MODEL: z.string().default("gpt-5.6-terra"),
    // Effort de raisonnement pour l'analyse (Responses API) : minimal|low|medium|high.
    OPENAI_ANALYSIS_REASONING_EFFORT: z
      .enum(["minimal", "low", "medium", "high"])
      .default("medium"),
    // Voix de sortie GA (ex. marin, cedar, alloy…). Modifiable via l'environnement.
    OPENAI_REALTIME_VOICE: z.string().default("marin"),

    // Pilote de stockage des fichiers audio : "local" (dev) ou "s3" (prod).
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    // Local uniquement :
    AUDIO_STORAGE_DIR: z.string().default("./storage"),
    // S3 / compatible S3 :
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_ENDPOINT: z.string().optional(), // vide pour AWS S3
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: boolish(false),

    // Durée de validité des URLs pré-signées (téléchargement/upload).
    SIGNED_URL_TTL_SECONDS: intFromString(300, 30, 3600),
    // Taille maximale d'un fichier audio (Mo). MAX_AUDIO_UPLOAD_MB est la variable
    // canonique du pipeline appel -> exercice ; MAX_AUDIO_SIZE_MB reste un alias
    // rétro-compatible (utilisé comme valeur de repli si le nouveau n'est pas défini).
    MAX_AUDIO_UPLOAD_MB: intFromString(100, 1, 2000),
    MAX_AUDIO_SIZE_MB: intFromString(25, 1, 500),
    // Durée de conservation par défaut des enregistrements (jours).
    // AUDIO_RETENTION_DAYS est canonique ; RECORDING_RETENTION_DAYS reste un alias.
    AUDIO_RETENTION_DAYS: intFromString(90, 1, 3650),
    RECORDING_RETENTION_DAYS: intFromString(90, 1, 3650),
    // Seuil de confiance en dessous duquel on demande au manager d'identifier le
    // commercial (attribution des locuteurs).
    SPEAKER_ASSIGNMENT_CONFIDENCE_THRESHOLD: z
      .string()
      .optional()
      .transform((v) => (v === undefined || v === "" ? 0.75 : Number(v)))
      .pipe(z.number().min(0).max(1)),

    // Journalisation.
    LOG_LEVEL: z
      .enum(["debug", "info", "warn", "error"])
      .default("info"),

    // Autorise explicitement l'exécution du seed de démonstration en production.
    // Sans cette valeur à "true", le seed refuse de s'exécuter si NODE_ENV=production.
    ALLOW_DEMO_SEED: boolish(false),
  })
  .superRefine((val, ctx) => {
    if (val.AI_PROVIDER === "openai" && !val.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_API_KEY"],
        message:
          "OPENAI_API_KEY est requis lorsque AI_PROVIDER=openai (aucune bascule silencieuse vers le mode démo).",
      });
    }
    if (val.STORAGE_DRIVER === "s3") {
      for (const key of [
        "S3_BUCKET",
        "S3_REGION",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
      ] as const) {
        if (!val[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} est requis lorsque STORAGE_DRIVER=s3.`,
          });
        }
      }
    }
    if (
      val.NODE_ENV === "production" &&
      val.SESSION_SECRET ===
        "dev-secret-change-me-in-production-please-32chars-min"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message:
          "SESSION_SECRET par défaut interdit en production : générez un secret aléatoire.",
      });
    }
  });

export type ServerEnv = z.infer<typeof rawSchema>;

let cached: ServerEnv | null = null;

/** Valide et retourne l'environnement serveur (mémoïsé). Lève une erreur claire si invalide. */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = rawSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(racine)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Configuration d'environnement invalide :\n${details}\n` +
        `Vérifiez votre fichier .env (voir .env.example / docs/environment-variables.md).`,
    );
  }
  cached = parsed.data;
  return cached;
}

/** Réinitialise le cache (tests uniquement). */
export function __resetEnvCacheForTests(): void {
  cached = null;
}
