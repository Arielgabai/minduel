import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jobQueueStats } from "@/lib/jobs";

// Toujours dynamique (jamais mis en cache).
export const dynamic = "force-dynamic";

/**
 * Healthcheck public (aucune authentification, aucun secret).
 * - Confirme que le processus web répond.
 * - Teste la connexion DB avec une requête légère (SELECT 1).
 * - Renvoie 503 si la base indispensable est indisponible.
 * - Ne dépend PAS d'OpenAI ni de S3 pour considérer le serveur web vivant.
 */
export async function GET() {
  const startedAt = Date.now();
  let dbUp = false;
  let jobs: Awaited<ReturnType<typeof jobQueueStats>> | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbUp = true;
    // Statistiques best-effort (n'affectent pas la liveness web).
    try {
      jobs = await jobQueueStats();
    } catch {
      jobs = null;
    }
  } catch {
    dbUp = false;
  }

  const body = {
    status: dbUp ? "ok" : "degraded",
    db: dbUp ? "up" : "down",
    jobs,
    uptimeSec: Math.round(process.uptime()),
    latencyMs: Date.now() - startedAt,
    time: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: dbUp ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
