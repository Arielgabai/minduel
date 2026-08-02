import Link from "next/link";
import { Badge, LinkButton } from "@/components/ui";
import { formatDuration } from "@/lib/utils";
import {
  ExerciseMissionStatus,
  type MissionExerciseView,
  type TeleproMissionsView,
} from "@/lib/teleproMissions";
import {
  isLaunchable,
  missionNodeVariant,
  missionProgressPct,
  type MissionNodeVariant,
} from "@/lib/missionsPath";

/**
 * Rendu visuel du parcours Missions (maquette p.14–15).
 * 100 % piloté par le modèle de vue du lot I : aucun niveau, exercice ou
 * compteur codé en dur. Chemin vertical à nœuds, exercice courant mis en avant,
 * terminé en vert, disponible en bleu/violet, verrouillé atténué avec cadenas.
 */
export function MissionsPath({ view }: { view: TeleproMissionsView }) {
  const pct = missionProgressPct(view.completedCount, view.totalCount);

  return (
    <div className="animate-fade-up">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Missions</h1>
        <p className="mt-1 text-sm text-white/50">
          Ton parcours d&apos;entraînement, niveau par niveau.
        </p>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-white/80">Progression globale</span>
            <span className="tabular-nums text-white/60">
              {view.completedCount}/{view.totalCount} exercices
            </span>
          </div>
          <div
            className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progression globale du parcours"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-electric-500 to-flame-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </header>

      {view.allCompleted ? (
        <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          Bravo — tu as terminé tous tes exercices assignés.
        </div>
      ) : !view.recommended ? (
        <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
          Aucun exercice disponible pour le moment. Termine les niveaux ouverts
          ou attends le prochain déblocage.
        </div>
      ) : null}

      <div className="space-y-8">
        {view.groups.map((group) => (
          <section key={group.missionLevel} aria-label={`Niveau ${group.missionLevel}`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-white/45">
                Niveau {group.missionLevel}
              </h2>
              {group.unlocked ? null : (
                <Badge tone="gray">Verrouillé</Badge>
              )}
            </div>

            <ol className="relative ml-3 space-y-4 border-l border-white/10 pl-6">
              {group.exercises.map((exercise, index) => (
                <MissionNode
                  key={exercise.id}
                  exercise={exercise}
                  index={index + 1}
                  recommendedId={view.recommended?.id ?? null}
                />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

const NODE_STYLES: Record<
  MissionNodeVariant,
  { dot: string; card: string }
> = {
  completed: {
    dot: "border-emerald-500/60 bg-emerald-500/20 text-emerald-200",
    card: "border-emerald-500/30 bg-emerald-500/[0.06]",
  },
  current: {
    dot: "border-flame-500/70 bg-flame-500/20 text-flame-200",
    card: "border-flame-500/50 bg-flame-500/[0.08] shadow-[0_0_0_1px_rgba(255,122,61,0.25)]",
  },
  available: {
    dot: "border-violet-500/60 bg-violet-500/20 text-violet-200",
    card: "border-violet-500/30 bg-violet-500/[0.06]",
  },
  locked: {
    dot: "border-white/10 bg-white/5 text-white/40",
    card: "border-white/10 bg-white/[0.02] opacity-60",
  },
};

function MissionNode({
  exercise,
  index,
  recommendedId,
}: {
  exercise: MissionExerciseView;
  index: number;
  recommendedId: string | null;
}) {
  const variant = missionNodeVariant(exercise.status);
  const styles = NODE_STYLES[variant];
  const locked = exercise.status === ExerciseMissionStatus.LOCKED;
  const isRecommended = exercise.id === recommendedId;
  const launchable = isLaunchable(exercise);

  return (
    <li className="relative">
      <span
        aria-hidden="true"
        className={`absolute -left-[2.1rem] top-1 flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold ${styles.dot}`}
      >
        {variant === "completed" ? "✓" : locked ? "🔒" : index}
      </span>

      <div
        className={`rounded-2xl border p-4 ${styles.card} ${
          isRecommended ? "ring-2 ring-flame-500/40" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-white">
              {locked ? "Exercice verrouillé" : exercise.name}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  variant === "completed"
                    ? "mint"
                    : variant === "current"
                      ? "flame"
                      : variant === "available"
                        ? "violet"
                        : "gray"
                }
              >
                {isRecommended && !locked ? "GO · " : ""}
                {exercise.statusLabel}
              </Badge>
              {!locked ? (
                <Badge
                  tone={
                    exercise.difficulty === "DIFFICILE"
                      ? "flame"
                      : exercise.difficulty === "FACILE"
                        ? "mint"
                        : "violet"
                  }
                >
                  {exercise.difficultyLabel}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        {!locked && exercise.objective ? (
          <p className="mt-3 text-sm text-white/55">{exercise.objective}</p>
        ) : null}

        {!locked ? (
          <p className="mt-2 text-xs text-white/40">
            Durée cible : {formatDuration(exercise.targetDurationSec)}
          </p>
        ) : null}

        {exercise.previousResult && !locked ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
            {exercise.previousResult.evaluationPending ? (
              <p className="text-white/50">
                Dernier résultat : analyse en attente ou indisponible.
              </p>
            ) : (
              <p className="text-white/70">
                Dernier score :{" "}
                <span className="font-semibold text-white">
                  {exercise.previousResult.overallScore ?? "—"}
                </span>
                {exercise.previousResult.outcomeLabel
                  ? ` · ${exercise.previousResult.outcomeLabel}`
                  : ""}
              </p>
            )}
            {exercise.previousResult.analysisHref ? (
              <Link
                href={exercise.previousResult.analysisHref}
                className="mt-2 inline-flex min-h-11 items-center text-violet-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
              >
                Voir le débrief
              </Link>
            ) : null}
          </div>
        ) : null}

        {launchable && exercise.ctaHref && exercise.ctaLabel ? (
          <div className="mt-4">
            <LinkButton
              href={exercise.ctaHref}
              variant={variant === "current" ? "flame" : "primary"}
              className="min-h-11 w-full"
            >
              {exercise.ctaLabel}
            </LinkButton>
          </div>
        ) : locked ? (
          <p className="mt-3 text-xs text-white/40">
            Termine les niveaux précédents pour débloquer.
          </p>
        ) : null}
      </div>
    </li>
  );
}
