import { handle, ok, fail } from "@/lib/api";
import { requireTelepro } from "@/lib/auth";
import { getRealtimeSessionProvider } from "@/lib/providers";
import { getPersonaForSimulation } from "@/lib/simulationService";
import { rateLimit } from "@/lib/ratelimit";
import { log } from "@/lib/log";

/**
 * Négocie une session Realtime. En mode réel, retourne un secret client
 * ÉPHÉMÈRE créé côté serveur ; la clé API longue durée n'est jamais exposée.
 * En mode démo, indique clairement que la voix est simulée.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireTelepro();
    const { id } = await params;

    // Limitation de débit : empêche la création répétée de sessions coûteuses.
    const rl = rateLimit(`realtime:${user.id}`, 10, 60_000);
    if (!rl.allowed) {
      return fail(429, "Trop de sessions demandées. Réessaie dans une minute.");
    }

    const persona = await getPersonaForSimulation({
      simulationId: id,
      organizationId: user.organizationId,
      teleproId: user.id,
    });

    const session = await getRealtimeSessionProvider().createEphemeralSession({
      instructions: persona,
    });
    log.info("realtime.session_created", {
      organizationId: user.organizationId,
      userId: user.id,
      simulationId: id,
      demo: session.demo,
    });

    // Ne jamais renvoyer la persona brute contenant les infos secrètes au client
    // en mode démo textuel : on ne l'expose que pour la négociation Realtime réelle.
    return ok({
      demo: session.demo,
      model: session.model,
      voice: session.voice,
      clientSecret: session.clientSecret ?? null,
      expiresAt: session.expiresAt ?? null,
    });
  });
}
