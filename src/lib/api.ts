import "server-only";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { ZodError } from "zod";
import { HttpError } from "./httpError";
import { log, safeErrorMessage } from "./log";

/** Identifiant de corrélation ajouté aux logs et réponses d'erreur. */
export function correlationId(): string {
  return randomBytes(8).toString("hex");
}

/** Adresse IP cliente (derrière un reverse proxy HTTPS), best-effort. */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

export function fail(status: number, message: string, cid?: string): NextResponse {
  const id = cid ?? correlationId();
  return NextResponse.json(
    { error: { message, correlationId: id } },
    { status },
  );
}

/** Enveloppe un handler d'API : gère HttpError, ZodError et erreurs inattendues. */
export async function handle(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const cid = correlationId();
  try {
    return await fn();
  } catch (err) {
    if (err instanceof HttpError) {
      return fail(err.status, err.message, cid);
    }
    if (err instanceof ZodError) {
      const msg = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return fail(422, msg || "Données invalides.", cid);
    }
    // Journaliser sans exposer le détail interne ni le contenu sensible.
    log.error("api.error", { correlationId: cid, error: safeErrorMessage(err) });
    return fail(500, "Une erreur interne est survenue.", cid);
  }
}
