import "server-only";

/**
 * Journalisation structurée minimale (JSON lines sur stdout), sans dépendance.
 * - Niveau configurable via LOG_LEVEL.
 * - Champs : timestamp, level, env, msg + contexte (route/job, correlationId,
 *   organizationId, userId, durationMs, status…).
 * - Ne JAMAIS journaliser : cookies, mots de passe, clés API, contenu audio,
 *   transcript complet, URL pré-signée complète. Les helpers ci-dessous
 *   n'acceptent que des métadonnées sûres ; ne leur passez pas de secrets.
 */

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL as Level) || "info";
  return ORDER[lvl] ?? ORDER.info;
}

export type LogContext = Record<
  string,
  string | number | boolean | null | undefined
>;

function emit(level: Level, msg: string, ctx?: LogContext): void {
  if (ORDER[level] < threshold()) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    env: process.env.NODE_ENV ?? "development",
    msg,
    ...(ctx ?? {}),
  };
  const out = JSON.stringify(line);
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

export const log = {
  debug: (msg: string, ctx?: LogContext) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => emit("error", msg, ctx),
};

/** Tronque et nettoie un message d'erreur pour la journalisation (jamais de contenu sensible). */
export function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 300);
  return String(err).slice(0, 300);
}
