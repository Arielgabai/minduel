import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { requireTelepro } from "@/lib/auth";
import { appendRealtimeTurn } from "@/lib/simulationService";

/**
 * Archive un tour d'une session Realtime (voix) - transcript de l'agent (micro)
 * ou du prospect (modele). N'appelle aucun provider et ne genere aucune reponse :
 * en mode temps reel, la conversation passe par WebRTC, pas par cette route.
 */
const schema = z.object({
  role: z.enum(["AGENT", "PROSPECT"]),
  content: z.string().min(1).max(4000),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireTelepro();
    const { id } = await params;
    const { role, content } = schema.parse(await req.json());

    await appendRealtimeTurn({
      simulationId: id,
      organizationId: user.organizationId,
      role,
      content,
    });

    return ok({ ok: true });
  });
}