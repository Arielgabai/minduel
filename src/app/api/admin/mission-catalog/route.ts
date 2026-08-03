import { z } from "zod";
import { handle, ok } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  createMissionStage,
  createMissionTheme,
  listMissionCatalog,
} from "@/lib/missionCatalogAdminService";

const EntitySchema = z.object({
  entity: z.enum(["theme", "stage"]),
});

/** Arbre Thèmes → niveaux (aucun contenu d'exercice, aucun prompt). */
export async function GET() {
  return handle(async () => {
    const admin = await requirePlatformAdmin();
    const themes = await listMissionCatalog(admin.organizationId);
    return ok({ themes });
  });
}

/** Création : le contrat distingue explicitement theme / stage. */
export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requirePlatformAdmin();
    const body = await req.json();
    const { entity } = EntitySchema.parse(body);
    const input = { ...(body as Record<string, unknown>) };
    delete input.entity;

    switch (entity) {
      case "theme":
        return ok(
          await createMissionTheme(admin.organizationId, admin.id, input),
          201,
        );
      case "stage":
        return ok(
          await createMissionStage(admin.organizationId, admin.id, input),
          201,
        );
    }
  });
}
