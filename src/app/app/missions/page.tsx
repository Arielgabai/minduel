import Link from "next/link";
import { requireTelepro } from "@/lib/auth";
import {
  Card,
  Badge,
  EmptyState,
  SectionTitle,
  LinkButton,
} from "@/components/ui";
import { loadTeleproMissionsView } from "@/lib/teleproMissionsService";
import {
  ExerciseMissionStatus,
  type MissionExerciseView,
} from "@/lib/teleproMissions";
import { formatDuration } from "@/lib/utils";

function statusTone(
  status: MissionExerciseView["status"],
): "mint" | "flame" | "violet" | "gray" {
  switch (status) {
    case ExerciseMissionStatus.COMPLETED:
      return "mint";
    case ExerciseMissionStatus.IN_PROGRESS:
      return "flame";
    case ExerciseMissionStatus.AVAILABLE:
      return "violet";
    default:
      return "gray";
  }
}

function ExerciseCard({ exercise }: { exercise: MissionExerciseView }) {
  const locked = exercise.status === ExerciseMissionStatus.LOCKED;

  return (
    <Card hover={false} className={locked ? "opacity-60" : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-white">{exercise.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(exercise.status)}>
              {exercise.statusLabel}
            </Badge>
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
            <Badge tone="gray">Niveau {exercise.missionLevel}</Badge>
          </div>
        </div>
      </div>

      {exercise.objective ? (
        <p className="mt-3 text-sm text-white/55">{exercise.objective}</p>
      ) : null}

      <div className="mt-3 space-y-1 text-xs text-white/45">
        {exercise.prospectProfile ? (
          <p>
            <span className="text-white/35">Persona : </span>
            {exercise.prospectProfile}
          </p>
        ) : null}
        {exercise.personality ? (
          <p>
            <span className="text-white/35">Personnalité : </span>
            {exercise.personality}
          </p>
        ) : null}
        {exercise.successConditions ? (
          <p>
            <span className="text-white/35">Critères de réussite : </span>
            {exercise.successConditions}
          </p>
        ) : null}
        <p>
          <span className="text-white/35">Durée cible : </span>
          {formatDuration(exercise.targetDurationSec)}
        </p>
      </div>

      {exercise.previousResult ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
          {exercise.previousResult.evaluationPending ? (
            <p className="text-white/50">
              Dernier résultat : évaluation en attente ou indisponible.
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
          {exercise.previousResult.summary &&
          !exercise.previousResult.evaluationPending ? (
            <p className="mt-1 text-white/45">
              {exercise.previousResult.summary}
            </p>
          ) : null}
          {exercise.previousResult.analysisHref ? (
            <Link
              href={exercise.previousResult.analysisHref}
              className="mt-2 inline-block text-violet-300 underline-offset-2 hover:underline"
            >
              Voir le débrief
            </Link>
          ) : null}
        </div>
      ) : null}

      {exercise.ctaHref && exercise.ctaLabel ? (
        <div className="mt-4">
          <LinkButton href={exercise.ctaHref} className="w-full py-3">
            {exercise.ctaLabel}
          </LinkButton>
        </div>
      ) : locked ? (
        <p className="mt-3 text-xs text-white/40">
          Termine les niveaux précédents pour débloquer.
        </p>
      ) : null}
    </Card>
  );
}

/**
 * Destination Missions — niveaux, statuts calculés et CTA selon le moteur partagé.
 */
export default async function MissionsPage() {
  const user = await requireTelepro();
  const view = await loadTeleproMissionsView(user.id, user.organizationId);

  return (
    <div className="animate-fade-up">
      <h1 className="mb-1 text-2xl font-bold">Missions</h1>
      <p className="mb-6 text-sm text-white/50">
        Tes exercices publiés et assignés, par niveau.
      </p>

      {view.empty ? (
        <EmptyState
          icon="🎯"
          title="Aucune mission assignée"
          description="Ton manager va bientôt t'attribuer des entraînements."
        />
      ) : (
        <>
          {view.allCompleted ? (
            <Card className="mb-6 text-sm text-white/70">
              Bravo — tu as terminé tous tes exercices assignés (
              {view.completedCount}/{view.totalCount}).
            </Card>
          ) : null}

          {!view.recommended && !view.allCompleted ? (
            <Card className="mb-6 text-sm text-white/55">
              Aucun exercice disponible pour le moment. Continue les niveaux
              déjà ouverts ou attends le déblocage suivant.
            </Card>
          ) : null}

          {view.groups.map((group) => (
            <section key={group.missionLevel} className="mb-8">
              <div className="mb-3 flex items-center justify-between gap-2">
                <SectionTitle>Niveau {group.missionLevel}</SectionTitle>
                {!group.unlocked ? (
                  <Badge tone="gray">Verrouillé</Badge>
                ) : null}
              </div>
              <div className="space-y-3">
                {group.exercises.map((exercise) => (
                  <ExerciseCard key={exercise.id} exercise={exercise} />
                ))}
              </div>
            </section>
          ))}

          {view.recommended?.ctaHref ? (
            <div className="mt-2">
              <LinkButton href={view.recommended.ctaHref} className="w-full">
                {view.recommended.ctaLabel ?? "Continuer"} —{" "}
                {view.recommended.name}
              </LinkButton>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
