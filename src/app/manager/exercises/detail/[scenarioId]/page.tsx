import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { Badge, Card } from "@/components/ui";
import { ProspectAvatar } from "@/components/ProspectAvatar";
import { formatDuration } from "@/lib/utils";
import { loadManagerExerciseDetail } from "@/lib/managerExercisesService";

export default async function ManagerExerciseDetailPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = await params;
  const manager = await requireManager();
  const detail = await loadManagerExerciseDetail(
    manager.organizationId,
    scenarioId,
  );
  if (!detail) notFound();

  const backHref = detail.themeSlug
    ? `/manager/exercises/${detail.themeSlug}`
    : "/manager/exercises";

  return (
    <div className="animate-fade-up">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href={backHref}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-400"
          aria-label="Retour"
        >
          ←
        </Link>
        <h1 className="text-xl font-bold">Fiche exercice</h1>
      </div>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <ProspectAvatar
              avatarKey={detail.prospectAvatarKey}
              fallbackText={detail.name}
              size={56}
              decorative={false}
            />
            <div className="min-w-0">
              <p className="text-lg font-semibold">{detail.name}</p>
              <p className="text-sm text-white/50">
                {[detail.themeName, detail.levelName]
                  .filter(Boolean)
                  .join(" · ") || "Parcours existant"}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge
              tone={
                detail.difficulty === "DIFFICILE"
                  ? "flame"
                  : detail.difficulty === "FACILE"
                    ? "mint"
                    : "violet"
              }
            >
              {detail.difficultyLabel}
            </Badge>
            <Badge tone="mint">Publié</Badge>
          </div>
        </div>

        <div className="mt-4 space-y-3 text-sm">
          {detail.levelNumber != null ? (
            <Field label="Niveau" value={"N° " + String(detail.levelNumber)} />
          ) : null}
          {detail.campaign ? (
            <Field label="Campagne" value={detail.campaign} />
          ) : null}
          {detail.offer ? <Field label="Offre" value={detail.offer} /> : null}
          {detail.objective ? (
            <Field label="Objectif" value={detail.objective} />
          ) : null}
          {detail.prospectProfile ? (
            <Field label="Profil prospect" value={detail.prospectProfile} />
          ) : null}
          {detail.personality ? (
            <Field label="Personnalité" value={detail.personality} />
          ) : null}
          <Field
            label="Durée cible"
            value={formatDuration(detail.targetDurationSec)}
          />
          {detail.teleproBrief ? (
            <Field label="Brief télépro" value={detail.teleproBrief} />
          ) : null}
        </div>
      </Card>

      <p className="mt-4 text-xs text-white/40">
        Lecture seule — l&apos;administration du catalogue se fait dans /admin.
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-0.5 text-white/80">{value}</p>
    </div>
  );
}
