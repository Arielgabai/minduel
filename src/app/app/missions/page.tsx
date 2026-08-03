import Link from "next/link";
import { requireTelepro } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import {
  loadTeleproMissionsCatalogView,
  loadTeleproMissionsView,
} from "@/lib/teleproMissionsService";

// Le loader plat reste exporté/référencé pour compatibilité des tests et outils.
void loadTeleproMissionsView;
import { missionProgressPct } from "@/lib/missionsPath";
import type { TeleproMissionThemeView } from "@/lib/teleproMissions";

const ICON_GLYPH: Record<string, string> = {
  target: "◎",
  phone: "☎",
  handshake: "🤝",
  shield: "⬡",
  spark: "✦",
  flag: "⚑",
  chat: "💬",
  trophy: "♛",
};

export default async function MissionsPage() {
  const user = await requireTelepro();
  const catalog = await loadTeleproMissionsCatalogView(
    user.id,
    user.organizationId,
  );

  if (catalog.empty) {
    return (
      <div className="animate-fade-up">
        <h1 className="mb-1 text-2xl font-bold">Missions</h1>
        <p className="mb-6 text-sm text-white/50">
          Choisis un thème pour progresser niveau par niveau.
        </p>
        <EmptyState
          icon="🎯"
          title="Aucune mission assignée"
          description="Ton manager va bientôt t'attribuer des entraînements."
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Missions</h1>
        <p className="mt-1 text-sm text-white/50">
          Thèmes → niveaux → exercices. Progression réelle sur tes assignations.
        </p>
        {catalog.allCompleted ? (
          <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            Bravo — tous tes exercices assignés sont terminés.
          </p>
        ) : null}
      </header>

      <ul className="space-y-4">
        {catalog.themes.map((theme) => (
          <li key={theme.id}>
            <ThemeCard theme={theme} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ThemeCard({ theme }: { theme: TeleproMissionThemeView }) {
  const pct = missionProgressPct(theme.completedCount, theme.exerciseCount);
  const glyph = ICON_GLYPH[theme.iconKey] ?? ICON_GLYPH.target;

  return (
    <article className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#10131c] via-[#14101f] to-[#1a1428] p-4 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.8)]">
      <div className="flex items-start gap-3">
        <span
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lg text-electric-300"
          aria-hidden
        >
          {glyph}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-white">{theme.name}</h2>
          {theme.description ? (
            <p className="mt-1 text-sm text-white/55">{theme.description}</p>
          ) : null}
          <p className="mt-2 text-xs text-white/45">
            {theme.stageCount} niveau{theme.stageCount > 1 ? "x" : ""} ·{" "}
            {theme.exerciseCount} exercice{theme.exerciseCount > 1 ? "s" : ""} ·{" "}
            {theme.completedCount} terminé{theme.completedCount > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div
        className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progression du thème ${theme.name}`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-electric-500 via-violet-500 to-flame-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <Link
        href={`/app/missions/${theme.slug}`}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-electric-500 to-violet-500 px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-400"
      >
        Voir les niveaux
      </Link>
    </article>
  );
}
