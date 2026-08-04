import { z } from "zod";
import { handle, ok, fail } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth";
import { resolvePlatformCatalogOrganizationId } from "@/lib/platformCatalog";
import {
  archiveExercise,
  createPromptVersion,
  deleteDraftExercise,
  duplicateExercise,
  getExercise,
  previewPromptLocally,
  publishExercise,
  publishPromptBundle,
  restorePromptVersion,
  unpublishExercise,
  updateDraftPromptBundle,
  updateExerciseMetadata,
  type AdminExerciseAction,
} from "@/lib/exerciseAdminService";

const ActionSchema = z.object({
  action: z.enum([
    "publish",
    "unpublish",
    "archive",
    "duplicate",
    "createVersion",
    "updateDraftPrompts",
    "publishBundle",
    "restoreVersion",
    "preview",
  ]),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requirePlatformAdmin();
    const catalogOrganizationId = await resolvePlatformCatalogOrganizationId();
    const { id } = await params;
    const exercise = await getExercise(id, catalogOrganizationId);
    return ok(exercise);
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const admin = await requirePlatformAdmin();
    const catalogOrganizationId = await resolvePlatformCatalogOrganizationId();
    const { id } = await params;
    const body = await req.json();
    const exercise = await updateExerciseMetadata(
      id,
      catalogOrganizationId,
      admin.id,
      body,
    );
    return ok(exercise);
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const admin = await requirePlatformAdmin();
    const catalogOrganizationId = await resolvePlatformCatalogOrganizationId();
    const { id } = await params;
    const result = await deleteDraftExercise(
      id,
      catalogOrganizationId,
      admin.id,
    );
    return ok(result);
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const admin = await requirePlatformAdmin();
    const catalogOrganizationId = await resolvePlatformCatalogOrganizationId();
    const { id } = await params;
    const body = await req.json();
    const { action } = ActionSchema.parse(body);
    const a = action as AdminExerciseAction;

    switch (a) {
      case "publish":
        return ok(await publishExercise(id, catalogOrganizationId, admin.id));
      case "unpublish":
        return ok(await unpublishExercise(id, catalogOrganizationId, admin.id));
      case "archive":
        return ok(await archiveExercise(id, catalogOrganizationId, admin.id));
      case "duplicate":
        return ok(
          await duplicateExercise(id, catalogOrganizationId, admin.id),
          201,
        );
      case "createVersion":
        return ok(
          await createPromptVersion(id, catalogOrganizationId, admin.id, body),
          201,
        );
      case "updateDraftPrompts":
        return ok(
          await updateDraftPromptBundle(
            id,
            catalogOrganizationId,
            admin.id,
            body,
          ),
        );
      case "publishBundle":
        return ok(
          await publishPromptBundle(id, catalogOrganizationId, admin.id),
        );
      case "restoreVersion":
        return ok(
          await restorePromptVersion(id, catalogOrganizationId, admin.id, body),
          201,
        );
      case "preview":
        return ok(
          await previewPromptLocally(id, catalogOrganizationId, body),
        );
      default: {
        const _exhaustive: never = a;
        return fail(422, `Action inconnue: ${String(_exhaustive)}`);
      }
    }
  });
}
