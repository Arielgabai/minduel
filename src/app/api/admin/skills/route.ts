import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth";
import { resolvePlatformCatalogOrganizationId } from "@/lib/platformCatalog";
import {
  createSkillArticle,
  createSkillCategory,
  createSkillSection,
  listSkillsTree,
} from "@/lib/skillsAdminService";

const EntitySchema = z.object({
  entity: z.enum(["category", "section", "article"]),
});

/** Arbre Catégories → Sections → Articles (sans corps d'articles). */
export async function GET() {
  return handle(async () => {
    await requirePlatformAdmin();
    const catalogOrganizationId = await resolvePlatformCatalogOrganizationId();
    const tree = await listSkillsTree(catalogOrganizationId);
    return ok({ tree });
  });
}

/** Création : le contrat distingue explicitement category / section / article. */
export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requirePlatformAdmin();
    const catalogOrganizationId = await resolvePlatformCatalogOrganizationId();
    const body = await req.json();
    const { entity } = EntitySchema.parse(body);
    const input = { ...(body as Record<string, unknown>) };
    delete input.entity;

    switch (entity) {
      case "category":
        return ok(
          await createSkillCategory(catalogOrganizationId, admin.id, input),
          201,
        );
      case "section":
        return ok(
          await createSkillSection(catalogOrganizationId, admin.id, input),
          201,
        );
      case "article":
        return ok(
          await createSkillArticle(catalogOrganizationId, admin.id, input),
          201,
        );
    }
  });
}
