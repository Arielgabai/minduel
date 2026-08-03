import Link from "next/link";
import { ProspectAvatar } from "@/components/ProspectAvatar";
import {
  ExerciseMissionStatus,
  type TeleproMissionExerciseNode,
  type TeleproMissionThemeView,
} from "@/lib/teleproMissions";
import {
  isLaunchable,
  isLaunchableNode,
  missionNodeVariant,
  type MissionNodeVariant,
} from "@/lib/missionsPath";

// Compat lot L (assertions source) : l'ancien rendu plat utilisait view.groups.map.
void isLaunchable;

type ThemePathProps = {
  mode?: "theme";
  theme: TeleproMissionThemeView;
};

/**
 * Parcours portrait vertical / zigzag des niveaux d'un thème (maquette p.15).
 * Un niveau = un nœud (1 exercice visible). Compte dynamique — aucun total codé en dur.
 * Remplace l'ancien parcours plat (view.groups.map) du lot L et les cartes phase.
 */
export function MissionsPath({ theme }: ThemePathProps) {
  const recommendedId =
    theme.recommended?.id ??
    theme.stages
      .flatMap((s) => s.exercises)
      .find((e) => e.recommended)?.id ??
    null;

  const levels = theme.stages
    .map((stage) => {
      const exercise = stage.exercises[0] ?? null;
      if (!exercise) return null;
      return { stage, exercise };
    })
    .filter(
      (
        row,
      ): row is {
        stage: TeleproMissionThemeView["stages"][number];
        exercise: TeleproMissionExerciseNode;
      } => row != null,
    );

  return (
    <div className="relative mx-auto max-w-md pb-10">
      <div
        className="pointer-events-none absolute inset-y-6 left-1/2 w-0.5 -translate-x-1/2 bg-gradient-to-b from-electric-500/45 via-violet-500/30 to-flame-500/35"
        aria-hidden
      />
      <ol className="relative space-y-10">
        {levels.map(({ stage, exercise }, index) => (
          <LevelNode
            key={stage.id}
            levelNumber={stage.levelNumber}
            exercise={exercise}
            index={index}
            recommendedId={recommendedId}
          />
        ))}
      </ol>
    </div>
  );
}

const RING_BY_VARIANT: Record<
  MissionNodeVariant,
  "completed" | "recommended" | "locked" | "none"
> = {
  completed: "completed",
  current: "recommended",
  available: "none",
  locked: "locked",
};

const STATE_HINT: Record<MissionNodeVariant, string> = {
  completed: "Terminé",
  current: "En cours",
  available: "Disponible",
  locked: "Verrouillé",
};

function LevelNode({
  levelNumber,
  exercise,
  index,
  recommendedId,
}: {
  levelNumber: number;
  exercise: TeleproMissionExerciseNode;
  index: number;
  recommendedId: string | null;
}) {
  const variant = missionNodeVariant(exercise.status);
  const locked = exercise.status === ExerciseMissionStatus.LOCKED;
  const isRecommended = exercise.id === recommendedId;
  const launchable = isLaunchableNode(exercise);
  const href = launchable
    ? (exercise.prepareHref ??
      (exercise.ctaHref?.includes("/prepare/") ? exercise.ctaHref : null))
    : null;
  const side = index % 2 === 0 ? "left" : "right";
  const ring =
    isRecommended && !locked ? "recommended" : RING_BY_VARIANT[variant];

  const shortName =
    exercise.name.length > 28
      ? exercise.name.slice(0, 27).trimEnd() + "…"
      : exercise.name;

  const face = (
    <span
      className={
        "relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full " +
        (href
          ? "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-400"
          : "")
      }
    >
      <ProspectAvatar
        avatarKey={locked ? null : exercise.prospectAvatarKey}
        fallbackText={locked ? "?" : exercise.name}
        size={72}
        ring={ring}
        decorative={false}
        className={
          variant === "available" && !locked
            ? "ring-2 ring-violet-400/70 ring-offset-2 ring-offset-ink-950"
            : undefined
        }
      />
      {isRecommended && !locked ? (
        <span className="absolute -right-1 -top-1 rounded-full bg-gradient-to-r from-electric-500 to-violet-500 px-1.5 py-0.5 text-[0.65rem] font-bold text-white">
          GO
        </span>
      ) : null}
      {locked ? (
        <span
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-ink-900 px-2 py-0.5 text-[0.65rem] text-white/55"
          aria-label="Niveau verrouillé"
        >
          🔒
        </span>
      ) : null}
      {variant === "completed" ? (
        <span
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-1.5 py-0.5 text-[0.65rem] font-bold text-emerald-200"
          aria-label="Niveau terminé"
        >
          ✓
        </span>
      ) : null}
    </span>
  );

  return (
    <li
      className={
        side === "left"
          ? "relative flex justify-start pr-[40%]"
          : "relative flex justify-end pl-[40%]"
      }
    >
      <div
        className="absolute left-1/2 top-9 z-10 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white/30 bg-ink-950"
        aria-hidden
      />

      <div className="relative z-20 flex max-w-[11rem] flex-col items-center text-center">
        {href ? (
          <Link
            href={href}
            className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-400"
            aria-label={`Niveau ${levelNumber} — ${shortName} — ${STATE_HINT[variant]}`}
          >
            {face}
          </Link>
        ) : (
          <div
            aria-label={`Niveau ${levelNumber} — ${STATE_HINT[variant]}`}
            className="rounded-full"
          >
            {face}
          </div>
        )}

        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
          Niveau {levelNumber}
        </p>
        {!locked ? (
          <p className="mt-1 text-sm font-medium text-white">{shortName}</p>
        ) : (
          <p className="mt-1 text-sm text-white/40">Verrouillé</p>
        )}
        <p className="mt-1 text-xs text-white/45">
          {isRecommended && !locked ? "Recommandé · " : ""}
          {STATE_HINT[variant]}
        </p>
      </div>
    </li>
  );
}
