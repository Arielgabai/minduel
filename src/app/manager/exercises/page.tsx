import Link from "next/link";
import { requireManager } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { loadManagerExercisesCatalog } from "@/lib/managerExercisesService";
import type { ManagerExerciseThemeView } from "@/lib/managerExercisesView";

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

export default async function ManagerExercisesPage() {
  const manager = await requireManager();
  const catalog = await loadManagerExercisesCatalog(manager.organizationId);

  if (catalog.empty) {
    return (
      <div className="animate-fade-up">
        <h1 className="mb-1 text-2xl font-bold">Exercices</h1>
        <p className="mb-6 text-sm text-white/50">
          Vue d&apos;ensemble du catalogue publié de l&apos;organisation.
        </p>
        <EmptyState
          icon="🎭"
          title="Aucun exercice publié"
          description="Les exercices publiés par l'administration apparaîtront ici."
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Exercices</h1>
        <p className="mt-1 text-sm text-white/50">
          Tous les thèmes et niveaux publiés — lecture seule, sans verrouillage.
        </p>
        <p className="mt-2 text-xs text-white/40">
          {catalog.totalCount} exercice{catalog.totalCount > 1 ? "s" : ""} publié
          {catalog.totalCount > 1 ? "s" : ""}
        </p>
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

function ThemeCard({ theme }: { theme: ManagerExerciseThemeView }) {
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
            {theme.exerciseCount} exercice
            {theme.exerciseCount > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <Link
        href={`/manager/exercises/${theme.slug}`}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-electric-500 to-violet-500 px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-400"
      >
        Voir les niveaux
      </Link>
    </article>
  );
}
