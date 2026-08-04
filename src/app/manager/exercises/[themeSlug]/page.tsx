import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { ProspectAvatar } from "@/components/ProspectAvatar";
import { loadManagerExerciseTheme } from "@/lib/managerExercisesService";
import type { ManagerExerciseStageView } from "@/lib/managerExercisesView";

export default async function ManagerExerciseThemePage({
  params,
}: {
  params: Promise<{ themeSlug: string }>;
}) {
  const { themeSlug } = await params;
  const manager = await requireManager();
  const theme = await loadManagerExerciseTheme(
    manager.organizationId,
    themeSlug,
  );
  if (!theme) notFound();

  return (
    <div className="animate-fade-up">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/manager/exercises"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-400"
          aria-label="Retour aux exercices"
        >
          ←
        </Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{theme.name}</h1>
          <p className="text-sm text-white/50">
            {theme.stageCount} niveau{theme.stageCount > 1 ? "x" : ""} publiés —
            tous accessibles
          </p>
        </div>
      </div>

      {theme.description ? (
        <p className="mb-6 text-sm text-white/55">{theme.description}</p>
      ) : null}

      <ol className="relative mx-auto max-w-md space-y-10 pb-10">
        <div
          className="pointer-events-none absolute inset-y-6 left-1/2 w-0.5 -translate-x-1/2 bg-gradient-to-b from-electric-500/45 via-violet-500/30 to-flame-500/30"
          aria-hidden
        />
        {theme.stages.map((stage, index) => (
          <LevelNode key={stage.id} stage={stage} index={index} />
        ))}
      </ol>
    </div>
  );
}

function LevelNode({
  stage,
  index,
}: {
  stage: ManagerExerciseStageView;
  index: number;
}) {
  const exercise = stage.exercise;
  const side = index % 2 === 0 ? "left" : "right";
  const shortName =
    exercise.name.length > 28
      ? exercise.name.slice(0, 26).trimEnd() + "…"
      : exercise.name;

  return (
    <li
      className={
        side === "left"
          ? "relative flex justify-start pr-[45%]"
          : "relative flex justify-end pl-[45%]"
      }
    >
      <div
        className="absolute left-1/2 top-9 z-10 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white/30 bg-ink-950"
        aria-hidden
      />
      <div className="relative z-20 flex max-w-[11rem] flex-col items-center text-center">
        <Link
          href={exercise.detailHref}
          className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-400"
          aria-label={`Niveau ${stage.levelNumber} — ${shortName}`}
        >
          <span className="relative inline-flex min-h-11 min-w-11 items-center justify-center">
            <ProspectAvatar
              avatarKey={exercise.prospectAvatarKey}
              fallbackText={exercise.name}
              size={72}
              decorative={false}
            />
          </span>
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
          Niveau {stage.levelNumber}
        </p>
        <p className="mt-1 text-sm font-medium text-white">{shortName}</p>
        <p className="mt-1 text-xs text-white/40">
          {exercise.difficultyLabel} · {exercise.statusLabel}
        </p>
      </div>
    </li>
  );
}
