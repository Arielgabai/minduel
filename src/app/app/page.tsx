import Link from "next/link";
import { requireTelepro } from "@/lib/auth";
import { Card, Badge, SectionTitle, LinkButton, EmptyState } from "@/components/ui";
import { loadTeleproMissionsView } from "@/lib/teleproMissionsService";
import { ExerciseMissionStatus } from "@/lib/teleproMissions";

export default async function TeleproHome() {
  const user = await requireTelepro();
  const view = await loadTeleproMissionsView(user.id, user.organizationId);
  const firstName = user.fullName.split(" ")[0] ?? user.fullName;
  const recommended = view.recommended;

  return (
    <div className="animate-fade-up">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-sm text-white/50">Bonjour</p>
          <h1 className="text-2xl font-bold">{firstName}</h1>
        </div>
        <Link
          href="/app/profile"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5"
          aria-label="Profil"
        >
          <span className="text-sm font-semibold text-violet-300">
            {firstName.slice(0, 1).toUpperCase()}
          </span>
        </Link>
      </header>

      <div className="mt-6">
        <SectionTitle className="mb-3">Ta progression</SectionTitle>
        {view.empty ? (
          <EmptyState
            title="Aucune mission assignée"
            description="Ton manager va bientôt t'attribuer des entraînements."
          />
        ) : (
          <Card>
            <p className="text-xs uppercase tracking-wider text-white/40">
              Exercices terminés
            </p>
            <p className="mt-2 text-3xl font-bold text-violet-300">
              {view.completedCount}
              <span className="text-base text-white/40">
                {" "}/ {view.totalCount}
              </span>
            </p>
            {view.allCompleted ? (
              <p className="mt-2 text-sm text-emerald-300">
                Tout est terminé. Bravo !
              </p>
            ) : (
              <p className="mt-2 text-sm text-white/45">
                Continue ton parcours missions.
              </p>
            )}
          </Card>
        )}
      </div>

      {!view.empty ? (
        <div className="mt-8">
          <SectionTitle className="mb-3">Exercice recommandé</SectionTitle>
          {recommended ? (
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  tone={
                    recommended.status === ExerciseMissionStatus.IN_PROGRESS
                      ? "flame"
                      : "violet"
                  }
                >
                  {recommended.statusLabel}
                </Badge>
                <Badge tone="gray">Niveau {recommended.missionLevel}</Badge>
                <Badge
                  tone={
                    recommended.difficulty === "DIFFICILE"
                      ? "flame"
                      : recommended.difficulty === "FACILE"
                        ? "mint"
                        : "violet"
                  }
                >
                  {recommended.difficultyLabel}
                </Badge>
              </div>
              <p className="mt-3 text-lg font-semibold text-white">
                {recommended.name}
              </p>
              {recommended.objective ? (
                <p className="mt-2 text-sm text-white/55">
                  {recommended.objective}
                </p>
              ) : null}
              {recommended.ctaHref && recommended.ctaLabel ? (
                <div className="mt-4">
                  <LinkButton href={recommended.ctaHref} className="w-full">
                    {recommended.ctaLabel}
                  </LinkButton>
                </div>
              ) : null}
            </Card>
          ) : view.allCompleted ? (
            <Card className="text-sm text-white/60">
              Aucune recommandation : tous tes exercices assignés sont terminés.
              Retrouve-les dans Missions pour les refaire.
            </Card>
          ) : (
            <Card className="text-sm text-white/55">
              Aucun exercice disponible pour le moment.
            </Card>
          )}
        </div>
      ) : null}

      {!view.empty ? (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <SectionTitle>Aperçu missions</SectionTitle>
            <Link
              href="/app/missions"
              className="text-xs font-semibold text-violet-300 hover:underline"
            >
              Voir tout
            </Link>
          </div>
          <div className="space-y-3">
            {view.exercises.slice(0, 4).map((exercise) => (
              <Card key={exercise.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">
                    {exercise.name}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        exercise.status === ExerciseMissionStatus.COMPLETED
                          ? "mint"
                          : exercise.status === ExerciseMissionStatus.IN_PROGRESS
                            ? "flame"
                            : exercise.status === ExerciseMissionStatus.AVAILABLE
                              ? "violet"
                              : "gray"
                      }
                    >
                      {exercise.statusLabel}
                    </Badge>
                    <Badge tone="gray">Niv. {exercise.missionLevel}</Badge>
                  </div>
                </div>
                {exercise.ctaHref ? (
                  <Link
                    href={exercise.ctaHref}
                    className="shrink-0 text-sm font-semibold text-violet-300"
                  >
                    {exercise.ctaLabel ?? "Ouvrir"}
                  </Link>
                ) : (
                  <span className="shrink-0 text-xs text-white/35">
                    Verrouillé
                  </span>
                )}
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
