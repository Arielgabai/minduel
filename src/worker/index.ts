import "dotenv/config";
import { randomBytes } from "crypto";
import { writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getServerEnv } from "../lib/env";
import { log } from "../lib/log";
import { claimJob, runClaimedJob } from "../lib/jobs";
import { prisma } from "../lib/db";

/**
 * Worker de traitement asynchrone (processus séparé : `npm run worker`).
 * Boucle : réclame une tâche (verrou FOR UPDATE SKIP LOCKED), l'exécute, puis
 * recommence. Backoff/retries gérés dans src/lib/jobs.ts. Arrêt gracieux sur
 * SIGINT/SIGTERM.
 *
 * Liveness : observable via les logs "worker.heartbeat" ET via un fichier de
 * heartbeat rafraîchi à chaque battement. Ce fichier vit dans un répertoire
 * temporaire (jamais du stockage persistant) et sert uniquement de sonde de
 * liveness (voir le HEALTHCHECK du service worker dans docker-compose.yml).
 */

const WORKER_ID = `worker-${process.pid}-${randomBytes(3).toString("hex")}`;
const IDLE_POLL_MS = 2_000;
const HEARTBEAT_MS = 30_000;
// Surcouchable pour aligner la sonde d'orchestrateur sur un autre chemin.
const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE ?? join(tmpdir(), "minduel-worker-heartbeat");

let running = true;

function touchHeartbeat(): void {
  try {
    writeFileSync(HEARTBEAT_FILE, new Date().toISOString());
  } catch {
    // La sonde de liveness ne doit jamais faire tomber le worker.
  }
}

async function main(): Promise<void> {
  // Échoue tôt si la configuration est invalide (dont le modèle de transcription
  // diarisant exigé par le pipeline appel -> exercice).
  const env = getServerEnv();
  // Modèles effectifs tracés au démarrage : un 400 « model not supported » se
  // diagnostique alors sans accès à la configuration de l'hébergeur.
  log.info("worker.start", {
    workerId: WORKER_ID,
    aiProvider: env.AI_PROVIDER,
    transcriptionModel: env.OPENAI_TRANSCRIPTION_MODEL,
    analysisModel: env.OPENAI_ANALYSIS_MODEL,
    scenarioModel: env.OPENAI_SCENARIO_MODEL,
    evaluationModel: env.OPENAI_EVALUATION_MODEL,
  });
  touchHeartbeat();

  let lastHeartbeat = 0;

  while (running) {
    if (Date.now() - lastHeartbeat > HEARTBEAT_MS) {
      log.info("worker.heartbeat", { workerId: WORKER_ID });
      touchHeartbeat();
      lastHeartbeat = Date.now();
    }

    let processedSomething = false;
    try {
      const job = await claimJob({ workerId: WORKER_ID });
      if (job) {
        processedSomething = true;
        log.info("job.started", {
          jobId: job.id,
          type: job.type,
          targetId: job.targetId,
          attempts: job.attempts,
          workerId: WORKER_ID,
        });
        await runClaimedJob(job);
      }
    } catch (err) {
      log.error("worker.loop_error", {
        workerId: WORKER_ID,
        error: err instanceof Error ? err.message.slice(0, 300) : String(err),
      });
    }

    if (!processedSomething) {
      await sleep(IDLE_POLL_MS);
    }
  }

  await prisma.$disconnect();
  log.info("worker.stopped", { workerId: WORKER_ID });
  process.exit(0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function shutdown(signal: string): void {
  log.info("worker.shutdown_signal", { workerId: WORKER_ID, signal });
  running = false;
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((err) => {
  log.error("worker.fatal", {
    workerId: WORKER_ID,
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
