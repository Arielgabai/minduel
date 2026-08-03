import { handle, ok } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  createExerciseDraft,
  listExercises,
} from "@/lib/exerciseAdminService";

export async function GET(req: Request) {
  return handle(async () => {
    const admin = await requirePlatformAdmin();
    const url = new URL(req.url);
    const filters = {
      status: url.searchParams.get("status") ?? undefined,
      missionLevel: url.searchParams.get("missionLevel") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      missionThemeId: url.searchParams.get("missionThemeId") ?? undefined,
      missionStageId: url.searchParams.get("missionStageId") ?? undefined,
    };
    const items = await listExercises(admin.organizationId, filters);
    return ok({ items });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const admin = await requirePlatformAdmin();
    const body = await req.json();
    const exercise = await createExerciseDraft(
      admin.organizationId,
      admin.id,
      body,
    );
    return ok(exercise, 201);
  });
}
