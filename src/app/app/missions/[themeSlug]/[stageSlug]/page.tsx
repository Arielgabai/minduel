import { notFound } from "next/navigation";
import { requireTelepro } from "@/lib/auth";
import { loadTeleproMissionStageView } from "@/lib/teleproMissionsService";
import { MissionsPath } from "../../MissionsPath";

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

  return (
    <MissionsPath
      mode="stage"
      theme={result.theme}
      stage={result.stage}
    />
  );
}
