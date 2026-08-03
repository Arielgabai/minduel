import { z } from "zod";
import { HttpError } from "@/lib/httpError";
import { handle, ok } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth";
import type {
  MissionCatalogAction,
  MissionEntityKind,
} from "@/lib/missionCatalog";
import {
  archiveMissionStage,
  archiveMissionTheme,
  deleteMissionStage,
  deleteMissionTheme,
  getMissionStage,
  getMissionTheme,
  publishMissionStage,
  publishMissionTheme,
  unpublishMissionStage,
  unpublishMissionTheme,
  updateMissionStage,
  updateMissionTheme,
} from "@/lib/missionCatalogAdminService";

const EntityValueSchema = z.enum(["theme", "stage"]);

const BodyEntitySchema = z.object({ entity: EntityValueSchema });

const ActionSchema = z.object({
  entity: EntityValueSchema,
  action: z.enum(["publish", "unpublish", "archive"]),
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
    const admin = await requirePlatformAdmin();
    const { id } = await params;
    const entity = entityFromQuery(req);
    switch (entity) {
      case "theme":
        return ok(await getMissionTheme(id, admin.organizationId));
      case "stage":
        return ok(await getMissionStage(id, admin.organizationId));
    }
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const admin = await requirePlatformAdmin();
    const { id } = await params;
    const body = await req.json();
    const { entity } = BodyEntitySchema.parse(body);
    const input = { ...(body as Record<string, unknown>) };
    delete input.entity;
    switch (entity) {
      case "theme":
        return ok(
          await updateMissionTheme(id, admin.organizationId, admin.id, input),
        );
      case "stage":
        return ok(
          await updateMissionStage(id, admin.organizationId, admin.id, input),
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
    const { id } = await params;
    const entity = entityFromQuery(req);
    switch (entity) {
      case "theme":
        return ok(
          await deleteMissionTheme(id, admin.organizationId, admin.id),
        );
      case "stage":
        return ok(
          await deleteMissionStage(id, admin.organizationId, admin.id),
        );
    }
  });
}

/** Transitions de cycle de vie : publish / unpublish / archive. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const admin = await requirePlatformAdmin();
    const { id } = await params;
    const body = await req.json();
    const { entity, action } = ActionSchema.parse(body);
    const a = action as MissionCatalogAction;

    const handlers: Record<
      MissionEntityKind,
      Record<
        MissionCatalogAction,
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

    return ok(await handlers[entity][a](id, admin.organizationId, admin.id));
  });
}
