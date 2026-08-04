import { z } from "zod";
import { HttpError } from "@/lib/httpError";
import { handle, ok } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth";
import { resolvePlatformCatalogOrganizationId } from "@/lib/platformCatalog";
import {
  MissionStageAssignExerciseSchema,
  type MissionCatalogAction,
  type MissionEntityKind,
} from "@/lib/missionCatalog";
import {
  archiveMissionStage,
  archiveMissionTheme,
  assignExerciseToStage,
  deleteMissionStage,
  deleteMissionTheme,
  getMissionStage,
  getMissionTheme,
  publishMissionStage,
  publishMissionTheme,
  unassignExerciseFromStage,
  unpublishMissionStage,
  unpublishMissionTheme,
  updateMissionStage,
  updateMissionTheme,
} from "@/lib/missionCatalogAdminService";

const EntityValueSchema = z.enum(["theme", "stage"]);

const BodyEntitySchema = z.object({ entity: EntityValueSchema });

const ActionSchema = z.object({
  entity: EntityValueSchema,
  action: z.enum([
    "publish",
    "unpublish",
    "archive",
    "assignExercise",
    "unassignExercise",
  ]),
});

function entityFromQuery(req: Request): MissionEntityKind {
  const raw = new URL(req.url).searchParams.get("type");
  const parsed = EntityValueSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(422, "Paramètre type requis : theme ou stage.");
  }
  return parsed.data;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requirePlatformAdmin();
    const catalogOrganizationId = await resolvePlatformCatalogOrganizationId();
    const { id } = await params;
    const entity = entityFromQuery(req);
    switch (entity) {
      case "theme":
        return ok(await getMissionTheme(id, catalogOrganizationId));
      case "stage":
        return ok(await getMissionStage(id, catalogOrganizationId));
    }
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
    const { entity } = BodyEntitySchema.parse(body);
    const input = { ...(body as Record<string, unknown>) };
    delete input.entity;
    switch (entity) {
      case "theme":
        return ok(
          await updateMissionTheme(id, catalogOrganizationId, admin.id, input),
        );
      case "stage":
        return ok(
          await updateMissionStage(id, catalogOrganizationId, admin.id, input),
        );
    }
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const admin = await requirePlatformAdmin();
    const catalogOrganizationId = await resolvePlatformCatalogOrganizationId();
    const { id } = await params;
    const entity = entityFromQuery(req);
    switch (entity) {
      case "theme":
        return ok(
          await deleteMissionTheme(id, catalogOrganizationId, admin.id),
        );
      case "stage":
        return ok(
          await deleteMissionStage(id, catalogOrganizationId, admin.id),
        );
    }
  });
}

/**
 * Transitions de cycle de vie : publish / unpublish / archive.
 * Association exercice (stage uniquement) : assignExercise / unassignExercise.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const admin = await requirePlatformAdmin();
    const catalogOrganizationId = await resolvePlatformCatalogOrganizationId();
    const { id } = await params;
    const body = await req.json();
    const { entity, action } = ActionSchema.parse(body);

    if (action === "assignExercise" || action === "unassignExercise") {
      if (entity !== "stage") {
        throw new HttpError(
          422,
          "assignExercise / unassignExercise réservés à entity=stage.",
        );
      }
      if (action === "assignExercise") {
        // Schema .strict() : ne garder que exerciseId (entity/action exclus).
        const assignBody = { ...(body as Record<string, unknown>) };
        delete assignBody.entity;
        delete assignBody.action;
        const { exerciseId } = MissionStageAssignExerciseSchema.parse(assignBody);
        return ok(
          await assignExerciseToStage(
            id,
            catalogOrganizationId,
            admin.id,
            exerciseId,
          ),
        );
      }
      return ok(
        await unassignExerciseFromStage(id, catalogOrganizationId, admin.id),
      );
    }

    type LifecycleAction = Exclude<
      MissionCatalogAction,
      "assignExercise" | "unassignExercise"
    >;
    const a = action as LifecycleAction;

    const handlers: Record<
      MissionEntityKind,
      Record<
        LifecycleAction,
        (id: string, orgId: string, actorId: string) => Promise<unknown>
      >
    > = {
      theme: {
        publish: publishMissionTheme,
        unpublish: unpublishMissionTheme,
        archive: archiveMissionTheme,
      },
      stage: {
        publish: publishMissionStage,
        unpublish: unpublishMissionStage,
        archive: archiveMissionStage,
      },
    };

    return ok(await handlers[entity][a](id, catalogOrganizationId, admin.id));
  });
}
