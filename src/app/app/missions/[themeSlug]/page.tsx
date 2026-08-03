import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTelepro } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { loadTeleproMissionThemeView } from "@/lib/teleproMissionsService";
import { missionProgressPct } from "@/lib/missionsPath";
import type { MissionStageState } from "@/lib/teleproMissions";

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
          description="Aucune phase publiée n'est encore assignée dans ce thème."
        />
      ) : (
        <ol className="relative space-y-4 border-l border-white/10 pl-6">
          {theme.stages.map((stage) => {
            const locked = stage.state === "LOCKED";
            const href = `/app/missions/${theme.slug}/${stage.slug}`;
            const body = (
              <div
                className={
                  locked
                    ? "rounded-2xl border border-white/10 bg-white/[0.02] p-4 opacity-60"
                    : "rounded-2xl border border-white/10 bg-gradient-to-br from-[#12141c] to-[#1a1030] p-4"
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
                      Niveau {stage.levelNumber}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-white">
                      {stage.name}
                    </h2>
                    {stage.description ? (
                      <p className="mt-1 text-sm text-white/55">
                        {stage.description}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm text-white/50">
                      {stage.completedCount}/{stage.exerciseCount} exercices
                      {" · "}
                      {stageStateLabel(stage.state)}
                    </p>
                  </div>
                  {locked ? (
                    <span
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white/50"
                      aria-label="Niveau verrouillé"
                    >
                      🔒
                    </span>
                  ) : stage.state === "COMPLETED" ? (
                    <span
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                      aria-label="Niveau terminé"
                    >
                      ✓
                    </span>
                  ) : (
                    <span
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-flame-400/40 bg-flame-500/10 text-flame-300"
                      aria-hidden
                    >
                      →
                    </span>
                  )}
                </div>
                <div
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"
                  role="progressbar"
                  aria-valuenow={stage.progressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Progression du niveau ${stage.levelNumber}`}
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-electric-400"
                    style={{ width: `${stage.progressPct}%` }}
                  />
                </div>
              </div>
            );

            return (
              <li key={stage.id} className="relative">
                <span
                  className="absolute -left-[1.9rem] top-6 h-3 w-3 rounded-full border border-white/30 bg-ink-950"
                  aria-hidden
                />
                {locked ? (
                  body
                ) : (
                  <Link
                    href={href}
                    className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-400"
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function stageStateLabel(state: MissionStageState): string {
  if (state === "COMPLETED") return "Terminé";
  if (state === "OPEN") return "Disponible";
  return "Verrouillé";
}
