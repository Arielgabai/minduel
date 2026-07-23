import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { requireTelepro } from "@/lib/auth";
import { finalizeSimulation } from "@/lib/simulationService";

const schema = z.object({
  durationSec: z.number().int().min(0).max(7200).default(0),
  abandoned: z.boolean().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireTelepro();
    const { id } = await params;
    const body = schema.parse(await req.json().catch(() => ({})));

    const result = await finalizeSimulation({
      simulationId: id,
      organizationId: user.organizationId,
      durationSec: body.durationSec,
      abandoned: body.abandoned,
    });

    return ok({
      evaluationId: result.evaluationId,
      redirect: result.evaluationId
        ? `/app/analysis/${id}`
        : "/app",
    });
  });
}
