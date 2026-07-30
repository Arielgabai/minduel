import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { requireTelepro } from "@/lib/auth";
import { processTurn } from "@/lib/simulationService";

const schema = z.object({ message: z.string().min(1).max(2000) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireTelepro();
    const { id } = await params;
    const { message } = schema.parse(await req.json());

    const result = await processTurn({
      simulationId: id,
      organizationId: user.organizationId,
      teleproId: user.id,
      agentMessage: message,
    });

    return ok(result);
  });
}
