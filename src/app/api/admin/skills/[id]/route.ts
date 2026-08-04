import { z } from "zod";
import { HttpError } from "@/lib/httpError";
import { handle, ok } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth";
import { resolvePlatformCatalogOrganizationId } from "@/lib/platformCatalog";
import {
  archiveSkillArticle,
  archiveSkillCategory,
  archiveSkillSection,
  deleteSkillArticle,
  deleteSkillCategory,
  deleteSkillSection,
  getSkillArticle,
  getSkillCategory,
  getSkillSection,
  publishSkillArticle,
  publishSkillCategory,
  publishSkillSection,
  unpublishSkillArticle,
  unpublishSkillCategory,
  unpublishSkillSection,
  type SkillEntityKind,
  type SkillsAdminAction,
  updateSkillArticle,
  updateSkillCategory,
  updateSkillSection,
} from "@/lib/skillsAdminService";

const EntityValueSchema = z.enum(["category", "section", "article"]);

const BodyEntitySchema = z.object({ entity: EntityValueSchema });

const ActionSchema = z.object({
  entity: EntityValueSchema,
  action: z.enum(["publish", "unpublish", "archive"]),
});

function entityFromQuery(req: Request): SkillEntityKind {
  const raw = new URL(req.url).searchParams.get("type");
  const parsed = EntityValueSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(
      422,
      "Paramètre type requis : category, section ou article.",
    );
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
      case "category":
        return ok(await getSkillCategory(id, catalogOrganizationId));
      case "section":
        return ok(await getSkillSection(id, catalogOrganizationId));
      case "article":
        // Détail avec blocs : réservé au PLATFORM_ADMIN.
        return ok(await getSkillArticle(id, catalogOrganizationId));
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
      case "category":
        return ok(
          await updateSkillCategory(
            id,
            catalogOrganizationId,
            admin.id,
            input,
          ),
        );
      case "section":
        return ok(
          await updateSkillSection(
            id,
            catalogOrganizationId,
            admin.id,
            input,
          ),
        );
      case "article":
        return ok(
          await updateSkillArticle(
            id,
            catalogOrganizationId,
            admin.id,
            input,
          ),
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
      case "category":
        return ok(
          await deleteSkillCategory(id, catalogOrganizationId, admin.id),
        );
      case "section":
        return ok(
          await deleteSkillSection(id, catalogOrganizationId, admin.id),
        );
      case "article":
        return ok(
          await deleteSkillArticle(id, catalogOrganizationId, admin.id),
        );
    }
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
    const { entity, action } = ActionSchema.parse(body);
    const a = action as SkillsAdminAction;

    const handlers: Record<
      SkillEntityKind,
      Record<
        SkillsAdminAction,
        (id: string, orgId: string, actorId: string) => Promise<unknown>
      >
    > = {
      category: {
        publish: publishSkillCategory,
        unpublish: unpublishSkillCategory,
        archive: archiveSkillCategory,
      },
      section: {
        publish: publishSkillSection,
        unpublish: unpublishSkillSection,
        archive: archiveSkillSection,
      },
      article: {
        publish: publishSkillArticle,
        unpublish: unpublishSkillArticle,
        archive: archiveSkillArticle,
      },
    };

    return ok(await handlers[entity][a](id, catalogOrganizationId, admin.id));
  });
}
