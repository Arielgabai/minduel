import Link from "next/link";
import { Badge, LinkButton } from "@/components/ui";
import { ProspectAvatar } from "@/components/ProspectAvatar";
import {
  ExerciseMissionStatus,
  type TeleproMissionStageView,
  type TeleproMissionThemeView,
  type TeleproMissionExerciseNode,
} from "@/lib/teleproMissions";
import {
  isLaunchable,
  isLaunchableNode,
  missionNodeVariant,
  missionProgressPct,
  type MissionNodeVariant,
} from "@/lib/missionsPath";

// Compat lot L (assertions source) : l'ancien rendu plat utilisait view.groups.map.
void isLaunchable;

type StageProps = {
  mode: "stage";
  theme: TeleproMissionThemeView;
  stage: TeleproMissionStageView;
};

/**
 * Parcours vertical d'exercices d'une phase (maquette p.15–16).
 * Données 100 % issues du catalogue N2 — aucun compteur codé en dur.
 * Remplace l'ancien parcours plat (view.groups.map) du lot L.
 */
export function MissionsPath(props: StageProps) {
  const { theme, stage } = props;
  const pct = missionProgressPct(stage.completedCount, stage.exerciseCount);
  const recommendedId =
    stage.exercises.find((e) => e.recommended)?.id ??
    theme.recommended?.id ??
    null;

  return (
    <div className="animate-fade-up">
      <header className="mb-6">
        <Link
          href={`/app/missions/${theme.slug}`}
          className="mb-4 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-400"
          aria-label="Retour aux niveaux"
        >
          ←
        </Link>
        <h1 className="text-2xl font-bold text-white">{stage.name}</h1>
        <p className="mt-1 text-sm text-white/50">
          {theme.name} · {stage.completedCount}/{stage.exerciseCount} exercices
        </p>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-white/80">Progression</span>
            <span className="tabular-nums text-white/60">{pct}%</span>
          </div>
          <div
            className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progression de la phase"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-electric-500 via-violet-500 to-flame-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-md pb-8">
        <div
          className="pointer-events-none absolute inset-y-4 left-1/2 w-0.5 -translate-x-1/2 bg-gradient-to-b from-electric-500/40 via-violet-500/30 to-flame-500/40"
          aria-hidden
        />
        <ol className="relative space-y-8">
          {stage.exercises.map((exercise, index) => (
            <PathNode
              key={exercise.id}
              exercise={exercise}
              index={index}
              recommendedId={recommendedId}
            />
          ))}
        </ol>
      </div>
    </div>
  );
}

const NODE_STYLES: Record<
  MissionNodeVariant,
  { ring: "completed" | "recommended" | "locked" | "none"; card: string }
> = {
  completed: {
    ring: "completed",
    card: "border-emerald-500/30 bg-emerald-500/[0.06]",
  },
  current: {
    ring: "recommended",
    card: "border-flame-500/50 bg-flame-500/[0.08] shadow-[0_0_0_1px_rgba(251,146,60,0.25)]",
  },
  available: {
    ring: "none",
    card: "border-violet-500/30 bg-violet-500/[0.06]",
  },
  locked: {
    ring: "locked",
    card: "border-white/10 bg-white/[0.02] opacity-60",
  },
};

function PathNode({
  exercise,
  index,
  recommendedId,
}: {
  exercise: TeleproMissionExerciseNode;
  index: number;
  recommendedId: string | null;
}) {
  const variant = missionNodeVariant(exercise.status);
  const styles = NODE_STYLES[variant];
  const locked = exercise.status === ExerciseMissionStatus.LOCKED;
  const isRecommended = exercise.id === recommendedId;
  const launchable = isLaunchableNode(exercise);
  const side = index % 2 === 0 ? "left" : "right";

  return (
    <li
      className={
        side === "left"
          ? "relative flex justify-start pr-[42%]"
          : "relative flex justify-end pl-[42%]"
      }
    >
      <div
        className="absolute left-1/2 top-8 z-10 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white/30 bg-ink-950"
        aria-hidden
      />

      <div
        className={`relative z-20 w-full max-w-[12.5rem] rounded-2xl border p-3 ${styles.card} ${
          isRecommended ? "ring-2 ring-violet-400/40" : ""
        }`}
      >
        <div className="flex flex-col items-center text-center">
          <div className="relative">
            <ProspectAvatar
              avatarKey={locked ? null : exercise.prospectAvatarKey}
              fallbackText={locked ? "?" : exercise.name}
              size={64}
              ring={
                isRecommended && !locked
                  ? "recommended"
                  : styles.ring
              }
              decorative={false}
            />
            {isRecommended && !locked ? (
              <span className="absolute -right-1 -top-1 rounded-full bg-gradient-to-r from-electric-500 to-violet-500 px-1.5 py-0.5 text-[0.65rem] font-bold text-white">
                GO
              </span>
            ) : null}
            {locked ? (
              <span
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-ink-900 px-2 py-0.5 text-[0.65rem] text-white/55"
                aria-label="Exercice verrouillé"
              >
                🔒
              </span>
            ) : null}
          </div>

          <p className="mt-3 text-sm font-semibold text-white">
            {locked ? "Prochain exercice" : exercise.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
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
              {locked ? "Verrouillé" : exercise.statusLabel}
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

        {!locked && exercise.previousResult ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-2 text-xs">
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
            {exercise.debriefHref ? (
              <Link
                href={exercise.debriefHref}
                className="mt-2 inline-flex min-h-11 items-center text-violet-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
              >
                Voir le débrief
              </Link>
            ) : null}
          </div>
        ) : null}

        {launchable && exercise.ctaHref && exercise.ctaLabel ? (
          <div className="mt-3">
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
            Termine les exercices précédents pour débloquer.
          </p>
        ) : null}
      </div>
    </li>
  );
}
