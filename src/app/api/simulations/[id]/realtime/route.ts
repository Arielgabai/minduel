import { handle, ok } from "@/lib/api";
import { requireTelepro } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getRealtimeSessionProvider } from "@/lib/providers";
import { getPersonaForScenario } from "@/lib/simulationService";

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

    const sim = await prisma.simulation.findFirstOrThrow({
      where: { id, organizationId: user.organizationId, teleproId: user.id },
    });

    const persona = await getPersonaForScenario(
      sim.scenarioId,
      user.organizationId,
      sim.prospectName ?? "le prospect",
    );

    const session = await getRealtimeSessionProvider().createEphemeralSession({
      instructions: persona,
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
