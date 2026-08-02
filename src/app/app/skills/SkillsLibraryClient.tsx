"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  filterSkillsSearch,
  type SkillsSearchEntry,
} from "@/lib/skillsContent";

type LibraryCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconKey: string;
  sectionCount: number;
  articleCount: number;
};

const ICON_EMOJI: Record<string, string> = {
  book: "📘",
  mic: "🎙️",
  search: "🔍",
  shield: "🛡️",
  target: "🎯",
  chat: "💬",
  spark: "✨",
  flag: "🚩",
};

const CARD_ACCENTS = [
  "from-electric-500/25 to-violet-500/10",
  "from-violet-500/25 to-electric-500/10",
  "from-flame-500/25 to-violet-500/10",
  "from-emerald-500/25 to-electric-500/10",
];

/**
 * Bibliothèque Skills côté client : recherche locale sur titres, résumés et
 * tags publiés uniquement (aucun contenu privé dans l'index).
 */
export function SkillsLibraryClient({
  categories,
  searchIndex,
}: {
  categories: LibraryCategory[];
  searchIndex: SkillsSearchEntry[];
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => filterSkillsSearch(searchIndex, query),
    [searchIndex, query],
  );
  const searching = query.trim().length > 0;

  return (
    <div className="space-y-5">
      <label className="block">
        <span className="sr-only">Rechercher un article</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une fiche, un tag…"
          className="min-h-11 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:border-electric-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/50"
        />
      </label>

      {searching ? (
        results.length === 0 ? (
          <p className="text-sm text-white/50">
            Aucune fiche ne correspond à ta recherche.
          </p>
        ) : (
          <ul className="space-y-2">
            {results.map((r) => (
              <li key={`${r.categorySlug}/${r.articleSlug}`}>
                <Link
                  href={`/app/skills/${r.categorySlug}/${r.articleSlug}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-electric-500/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">
                      {r.title}
                    </span>
                    <span className="block truncate text-xs text-white/45">
                      {r.categoryName} · {r.readingMinutes} min
                    </span>
                  </span>
                  <span aria-hidden className="text-white/35">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : (
        <ul className="grid gap-3">
          {categories.map((cat, i) => (
            <li key={cat.id}>
              <Link
                href={`/app/skills/${cat.slug}`}
                className={`block min-h-11 rounded-2xl border border-white/10 bg-gradient-to-br p-4 transition hover:border-white/20 focus-visible:ring-2 focus-visible:ring-electric-500/50 ${
                  CARD_ACCENTS[i % CARD_ACCENTS.length]
                }`}
              >
                <div className="flex items-start gap-3">
                  <span aria-hidden className="text-2xl">
                    {ICON_EMOJI[cat.iconKey] ?? ICON_EMOJI.book}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold text-white">{cat.name}</p>
                    {cat.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-white/55">
                        {cat.description}
                      </p>
                    )}
                    <p className="mt-2 text-xs font-medium text-white/60">
                      {cat.articleCount} fiche{cat.articleCount > 1 ? "s" : ""}
                      {" • "}
                      {cat.sectionCount} sous-thème
                      {cat.sectionCount > 1 ? "s" : ""}
                    </p>
                  </div>
                  <span aria-hidden className="text-white/35">
                    ›
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
