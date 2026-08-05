import { z } from "zod";
import { handle, ok, fail } from "@/lib/api";
import { requireTelepro } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import {
  finalizeRealCallUpload,
  getRealCallDetailForTelepro,
  retryRealCallProcessing,
} from "@/lib/realCallService";

export const dynamic = "force-dynamic";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("finalize") }),
  z.object({ action: z.literal("retry") }),
]);

/**
 * GET /api/real-calls/[id] — détail + analyse persistée (propriétaire uniquement).
 * POST /api/real-calls/[id] — finalize (JSON ou multipart) | retry.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const telepro = await requireTelepro();
    const { id } = await params;
    const detail = await getRealCallDetailForTelepro(
      {
        id: telepro.id,
        organizationId: telepro.organizationId!,
        role: telepro.role,
      },
      id,
    );
    return ok(detail);
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const telepro = await requireTelepro();
    const { id } = await params;
    const actor = {
      id: telepro.id,
      organizationId: telepro.organizationId!,
      role: telepro.role,
    };

    const rl = rateLimit(`real-call-action:${telepro.id}`, 30, 60_000);
    if (!rl.allowed) {
      return fail(429, "Trop d'actions. Réessaie dans une minute.");
    }

    const contentType = req.headers.get("content-type") || "";

    // Finalisation directe (dev local) : multipart avec fichier MP3.
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const action = String(form.get("action") ?? "finalize");
      if (action !== "finalize") {
        return fail(400, "Action multipart non supportée.");
      }
      const file = form.get("file");
      if (!(file instanceof File)) {
        return fail(422, "Fichier audio manquant.");
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await finalizeRealCallUpload(actor, id, {
        fileBuffer: buffer,
        fileMimeType: file.type,
        fileName: file.name,
      });
      return ok(result);
    }

    const body = actionSchema.parse(await req.json());
    if (body.action === "finalize") {
      const result = await finalizeRealCallUpload(actor, id, {});
      return ok(result);
    }

    const result = await retryRealCallProcessing(actor, id);
    return ok(result);
  });
}
