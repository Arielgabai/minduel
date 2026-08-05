import { z } from "zod";
import { handle, ok, fail } from "@/lib/api";
import { requireTelepro } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import {
  listRealCallsForTelepro,
  prepareRealCallUpload,
  REAL_CALL_RIGHTS_CONFIRMATION,
} from "@/lib/realCallService";

export const dynamic = "force-dynamic";

const prepareSchema = z.object({
  rightsConfirmed: z.literal(true),
  confirmationText: z.string().optional(),
  fileName: z.string().min(1).max(260),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  title: z.string().max(120).optional(),
  // Horodatages client refusés silencieusement (strip) — jamais persistés.
  consentConfirmedAt: z.unknown().optional(),
  consentAt: z.unknown().optional(),
}).transform((body) => ({
  rightsConfirmed: body.rightsConfirmed,
  confirmationText: body.confirmationText,
  fileName: body.fileName,
  mimeType: body.mimeType,
  sizeBytes: body.sizeBytes,
  title: body.title,
}));

/**
 * GET /api/real-calls — liste sûre des appels réels du télépro courant.
 * POST /api/real-calls — initialisation contrôlée (PENDING_UPLOAD + consent).
 */
export async function GET() {
  return handle(async () => {
    const telepro = await requireTelepro();
    const items = await listRealCallsForTelepro({
      id: telepro.id,
      organizationId: telepro.organizationId!,
      role: telepro.role,
    });
    return ok({ items, rightsConfirmationText: REAL_CALL_RIGHTS_CONFIRMATION });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const telepro = await requireTelepro();
    const rl = rateLimit(`real-call-prepare:${telepro.id}`, 20, 60_000);
    if (!rl.allowed) {
      return fail(429, "Trop d'initialisations. Réessaie dans une minute.");
    }

    const body = prepareSchema.parse(await req.json());
    const result = await prepareRealCallUpload(
      {
        id: telepro.id,
        organizationId: telepro.organizationId!,
        role: telepro.role,
      },
      body,
    );
    return ok(result, 201);
  });
}
