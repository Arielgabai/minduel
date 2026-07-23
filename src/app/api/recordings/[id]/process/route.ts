import { handle, ok } from "@/lib/api";
import { requireManager } from "@/lib/auth";
import { advanceRecording } from "@/lib/recordingService";

/** Fait avancer le pipeline d'une étape (le client peut poller jusqu'à READY/FAILED). */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const manager = await requireManager();
    const { id } = await params;
    const result = await advanceRecording(id, manager.organizationId);
    return ok(result);
  });
}
