import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTelepro } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { loadTeleproMissionThemeView } from "@/lib/teleproMissionsService";
import { missionProgressPct } from "@/lib/missionsPath";
import { MissionsPath } from "../MissionsPath";

export default async function MissionThemePage({
  params,
}: {
  params: Promise<{ themeSlug: string }>;
}) {
  const { themeSlug } = await params;
  const user = await requireTelepro();
  const theme = await loadTeleproMissionThemeView(
    user.id,
    user.organizationId,
    themeSlug,
  );
  if (!theme) notFound();

  const pct = missionProgressPct(theme.completedCount, theme.exerciseCount);

  return (
    <div className="animate-fade-up">
      <header className="mb-6">
        <Link
          href="/app/missions"
          className="mb-4 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-400"
          aria-label="Retour au catalogue Missions"
        >
          ←
        </Link>
        <h1 className="text-2xl font-bold text-white">{theme.name}</h1>
        {theme.description ? (
          <p className="mt-1 text-sm text-white/55">{theme.description}</p>
        ) : (
          <p className="mt-1 text-sm text-white/45">
            {theme.stageCount} niveau{theme.stageCount > 1 ? "x" : ""} ·{" "}
            {theme.exerciseCount} exercice{theme.exerciseCount > 1 ? "s" : ""}
          </p>
        )}

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-white/80">Progression du thème</span>
            <span className="tabular-nums text-white/60">
              {theme.completedCount}/{theme.exerciseCount}
            </span>
          </div>
          <div
            className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progression globale du thème"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-electric-500 to-flame-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </header>

      {theme.stages.length === 0 ? (
        <EmptyState
          title="Aucun niveau disponible"
          description="Aucun niveau publié n'est encore disponible dans ce thème."
        />
      ) : (
        <MissionsPath theme={theme} />
      )}
    </div>
  );
}
