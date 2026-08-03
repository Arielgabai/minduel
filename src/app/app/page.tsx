import Link from "next/link";
import { requireTelepro } from "@/lib/auth";
import { Card, Badge, SectionTitle, LinkButton, EmptyState } from "@/components/ui";
import {
  loadTeleproMissionsCatalogView,
  loadTeleproMissionsView,
} from "@/lib/teleproMissionsService";

void loadTeleproMissionsView;
import { ExerciseMissionStatus } from "@/lib/teleproMissions";
import { missionProgressPct } from "@/lib/missionsPath";
import { ProspectAvatar } from "@/components/ProspectAvatar";

export default async function TeleproHome() {
  const user = await requireTelepro();
  const catalog = await loadTeleproMissionsCatalogView(
    user.id,
    user.organizationId,
  );
  const firstName = user.fullName.split(" ")[0] ?? user.fullName;
  const recommended = catalog.recommended;

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
        {catalog.empty ? (
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
              {catalog.completedCount}
              <span className="text-base text-white/40">
                {" "}/ {catalog.totalCount}
              </span>
            </p>
            {catalog.allCompleted ? (
              <p className="mt-2 text-sm text-emerald-300">
                Parcours terminé. Bravo !
              </p>
            ) : (
              <p className="mt-2 text-sm text-white/45">
                Continue ton parcours missions.
              </p>
            )}
          </Card>
        )}
      </div>

      {!catalog.empty ? (
        <div className="mt-8">
          <SectionTitle className="mb-3">Exercice recommandé</SectionTitle>
          {recommended ? (
            <Card>
              <div className="flex items-start gap-3">
                <ProspectAvatar
                  avatarKey={recommended.prospectAvatarKey}
                  fallbackText={recommended.name}
                  size={56}
                  ring="recommended"
                  decorative={false}
                />
                <div className="min-w-0 flex-1">
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
                    <Badge tone="gray">GO</Badge>
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
                  <p className="mt-2 text-lg font-semibold text-white">
                    {recommended.name}
                  </p>
                </div>
              </div>
              {recommended.ctaHref && recommended.ctaLabel ? (
                <div className="mt-4">
                  <LinkButton href={recommended.ctaHref} className="w-full">
                    {recommended.ctaLabel}
                  </LinkButton>
                </div>
              ) : null}
            </Card>
          ) : catalog.allCompleted ? (
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

      {!catalog.empty ? (
        <div className="mt-8">
          <SectionTitle className="mb-3">Tes thèmes</SectionTitle>
          <ul className="space-y-3">
            {catalog.themes.map((theme) => {
              const pct = missionProgressPct(
                theme.completedCount,
                theme.exerciseCount,
              );
              return (
                <li key={theme.id}>
                  <Link
                    href={`/app/missions/${theme.slug}`}
                    className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-400"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-white">{theme.name}</p>
                      <span className="text-xs tabular-nums text-white/45">
                        {theme.completedCount}/{theme.exerciseCount}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-white/45">
                      {theme.stageCount} niveau
                      {theme.stageCount > 1 ? "x" : ""}
                    </p>
                    <div
                      className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Progression ${theme.name}`}
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-electric-500 to-violet-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-4">
            <LinkButton href="/app/missions" variant="outline" className="w-full">
              Ouvrir Missions
            </LinkButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
