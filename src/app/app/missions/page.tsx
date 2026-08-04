import Link from "next/link";
import { requireTelepro } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import {
  loadTeleproMissionsCatalogView,
  loadTeleproMissionsView,
} from "@/lib/teleproMissionsService";
import type {
  MissionThemeState,
  TeleproMissionThemeView,
} from "@/lib/teleproMissions";

// Le loader plat reste exporté/référencé pour compatibilité des tests et outils.
void loadTeleproMissionsView;

export default async function MissionsPage() {
  const user = await requireTelepro();
  const catalog = await loadTeleproMissionsCatalogView(
    user.id,
    user.organizationId,
  );

  if (catalog.empty) {
    return (
      <div className="animate-fade-up pb-10">
        <MissionsHeader
          themeCount={0}
          completedCount={0}
          totalCount={0}
        />
        <EmptyState
          icon="🎯"
          title="Aucune mission disponible"
          description="Les exercices publiés de ton organisation apparaîtront ici."
        />
      </div>
    );
  }

  const themeCount = catalog.themes.length;

  return (
    <div className="animate-fade-up pb-10">
      <MissionsHeader
        themeCount={themeCount}
        completedCount={catalog.completedCount}
        totalCount={catalog.totalCount}
      />

      {catalog.allCompleted ? (
        <p className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Bravo — tous tes exercices disponibles sont terminés.
        </p>
      ) : null}

      <ol className="relative m-0 list-none p-0">
        {catalog.themes.map((theme, index) => (
          <ThemePathItem
            key={theme.id}
            theme={theme}
            index={index}
            isLast={index === catalog.themes.length - 1}
          />
        ))}
      </ol>
    </div>
  );
}

function MissionsHeader({
  themeCount,
  completedCount,
  totalCount,
}: {
  themeCount: number;
  completedCount: number;
  totalCount: number;
}) {
  const summary =
    themeCount === 0
      ? "Aucun thème disponible pour le moment."
      : `${themeCount} thème${themeCount > 1 ? "s" : ""} · ${completedCount}/${totalCount} exercices terminés`;

  return (
    <header className="mb-6">
      <div className="flex items-center gap-2.5">
        <MissionsTitleIcon />
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Missions
        </h1>
      </div>
      <p className="mt-1.5 text-sm leading-snug text-white/45">{summary}</p>
    </header>
  );
}

function MissionsTitleIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      className="shrink-0 text-electric-400"
      aria-hidden
    >
      <path
        d="M4 6h16M4 12h10M4 18h14"
        strokeLinecap="round"
      />
      <circle cx="18" cy="12" r="2" />
    </svg>
  );
}

type ThemeVisualKind =
  | "completed"
  | "in_progress"
  | "recommended"
  | "idle"
  | "empty";

function themeVisualKind(theme: TeleproMissionThemeView): ThemeVisualKind {
  if (theme.state === "EMPTY" || theme.exerciseCount === 0) return "empty";
  if (theme.state === "COMPLETED") return "completed";
  if (theme.state === "IN_PROGRESS") return "in_progress";
  if (theme.recommended) return "recommended";
  return "idle";
}

function themeStateLabel(
  kind: ThemeVisualKind,
  state: MissionThemeState,
): string {
  switch (kind) {
    case "completed":
      return "Terminé";
    case "in_progress":
      return "En cours";
    case "recommended":
      return "Recommandé";
    case "empty":
      return "Aucun exercice disponible";
    default:
      return state === "AVAILABLE" ? "Non commencé" : "Disponible";
  }
}

function ThemePathItem({
  theme,
  index,
  isLast,
}: {
  theme: TeleproMissionThemeView;
  index: number;
  isLast: boolean;
}) {
  const number = index + 1;
  const kind = themeVisualKind(theme);
  const stateLabel = themeStateLabel(kind, theme.state);
  const href = `/app/missions/${theme.slug}`;

  const progressText =
    kind === "empty"
      ? "Aucun exercice disponible"
      : `${theme.completedCount}/${theme.exerciseCount} exercices terminés`;

  const description =
    theme.description && theme.description.trim().length > 0
      ? theme.description.trim()
      : null;

  const ariaLabel = [
    `Thème ${number} : ${theme.name}`,
    stateLabel,
    progressText,
    "Voir les niveaux",
  ].join(" — ");

  const nodeClass =
    kind === "completed"
      ? "bg-gradient-to-br from-electric-400 via-violet-500 to-flame-500 text-white shadow-[0_0_24px_-6px_rgba(99,102,241,0.55)]"
      : kind === "in_progress"
        ? "border-[3px] border-flame-500 bg-ink-950 text-flame-400 shadow-[0_0_18px_-4px_rgba(249,115,22,0.55)]"
        : kind === "recommended"
          ? "border-2 border-electric-400 bg-ink-950 text-electric-300 shadow-[0_0_18px_-6px_rgba(56,189,248,0.45)]"
          : "border border-white/15 bg-[#12151d] text-white/55";

  const titleClass =
    kind === "completed" || kind === "in_progress" || kind === "recommended"
      ? "text-white"
      : "text-white/80";

  return (
    <li className="relative flex gap-4 pb-7 last:pb-0">
      {!isLast ? (
        <span
          className="pointer-events-none absolute left-[30px] top-[64px] bottom-0 w-px bg-white/15"
          aria-hidden
        />
      ) : null}

      <Link
        href={href}
        aria-label={ariaLabel}
        className="group relative z-[1] flex min-h-11 min-w-0 flex-1 items-start gap-4 rounded-xl outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-400"
      >
        <span
          className={`inline-flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full text-xl font-bold tabular-nums ${nodeClass}`}
          aria-hidden
        >
          {number}
        </span>

        <span className="min-w-0 flex-1 pt-2">
          <span className={`block text-[1.05rem] font-semibold leading-tight ${titleClass}`}>
            {theme.name}
          </span>
          <span className="mt-1 block text-sm text-white/45">
            <span className="sr-only">État : {stateLabel}. Progression : </span>
            {progressText}
          </span>
          {description ? (
            <span className="mt-1 line-clamp-2 block text-sm leading-snug text-white/40">
              {description}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
