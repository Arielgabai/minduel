import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth";
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
    const admin = await requirePlatformAdmin();
    const tree = await listSkillsTree(admin.organizationId);
    return ok({ tree });
  });
}

/** Création : le contrat distingue explicitement category / section / article. */
export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requirePlatformAdmin();
    const body = await req.json();
    const { entity } = EntitySchema.parse(body);
    const input = { ...(body as Record<string, unknown>) };
    delete input.entity;

    switch (entity) {
      case "category":
        return ok(
          await createSkillCategory(admin.organizationId, admin.id, input),
          201,
        );
      case "section":
        return ok(
          await createSkillSection(admin.organizationId, admin.id, input),
          201,
        );
      case "article":
        return ok(
          await createSkillArticle(admin.organizationId, admin.id, input),
          201,
        );
    }
  });
}
