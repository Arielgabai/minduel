import { notFound, redirect } from "next/navigation";
import { requireTelepro } from "@/lib/auth";
import { ExerciseMissionStatus } from "@/lib/teleproMissions";
import { loadTeleproMissionStageView } from "@/lib/teleproMissionsService";

/**
 * Route de compatibilité : ne contourne pas les verrous.
 * Débloqué + exercice valide → préparation ; verrouillé → thème ; absent → 404.
 */
export default async function MissionStagePage({
  params,
}: {
  params: Promise<{ themeSlug: string; stageSlug: string }>;
}) {
  const { themeSlug, stageSlug } = await params;
  const user = await requireTelepro();
  const result = await loadTeleproMissionStageView(
    user.id,
    user.organizationId,
    themeSlug,
    stageSlug,
  );
  if (!result) notFound();

  const { theme, stage } = result;
  const exercise = stage.exercises[0] ?? null;
  if (!exercise) notFound();

  const locked =
    stage.state === "LOCKED" ||
    exercise.status === ExerciseMissionStatus.LOCKED;

  if (locked) {
    redirect(`/app/missions/${theme.slug}`);
  }

  redirect(`/app/prepare/${exercise.id}`);
}
