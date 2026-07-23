/**
 * Hook de démarrage Next.js (exécuté au lancement du serveur, pas au build).
 * Valide l'environnement tôt et journalise le démarrage. Une configuration
 * invalide fait échouer le démarrage avec un message clair.
 */
export async function register(): Promise<void> {
  // Uniquement dans le runtime Node.js (pas edge, pas pendant le build statique).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getServerEnv } = await import("./lib/env");
  const { log } = await import("./lib/log");

  const env = getServerEnv();
  log.info("server.start", {
    nodeEnv: env.NODE_ENV,
    aiProvider: env.AI_PROVIDER,
    storageDriver: env.STORAGE_DRIVER,
    appUrl: env.APP_URL,
  });
}
