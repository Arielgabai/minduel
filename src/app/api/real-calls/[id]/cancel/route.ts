import { handle, ok, fail } from "@/lib/api";
import { requireTelepro } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { cancelRealCallProcessing } from "@/lib/realCallService";

export const dynamic = "force-dynamic";

/**
 * POST /api/real-calls/[id]/cancel — arrêt propriétaire et idempotent.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const telepro = await requireTelepro();
    const { id } = await params;
    const rl = rateLimit(`real-call-cancel:${telepro.id}`, 30, 60_000);
    if (!rl.allowed) {
      return fail(429, "Trop d'actions. Réessaie dans une minute.");
    }
    const result = await cancelRealCallProcessing(
      {
        id: telepro.id,
        organizationId: telepro.organizationId!,
        role: telepro.role,
      },
      id,
    );
    return ok(result);
  });
}
