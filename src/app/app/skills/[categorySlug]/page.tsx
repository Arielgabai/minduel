import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTelepro } from "@/lib/auth";
import { loadSkillsCategoryView } from "@/lib/skillsTeleproService";

/**
 * Catégorie Skills : sous-thèmes (sections publiées) et fiches publiées.
 * 404 pour les slugs inexistants, brouillons, archivés ou hors organisation.
 */
export default async function SkillsCategoryPage({
  params,
}: {
  params: Promise<{ categorySlug: string }>;
}) {
  const user = await requireTelepro();
  const { categorySlug } = await params;
  const view = await loadSkillsCategoryView(
    user.id,
    user.organizationId,
    categorySlug,
  );
  if (!view) notFound();

  const articleTotal = view.sections.reduce(
    (n, s) => n + s.articles.length,
    0,
  );

  return (
    <div className="animate-fade-up pb-24">
      <Link
        href="/app/skills"
        className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-sm text-white/60 transition hover:text-white focus-visible:ring-2 focus-visible:ring-electric-500/50"
      >
        <span aria-hidden>‹</span> Skills
      </Link>

      <h1 className="mb-1 text-2xl font-bold tracking-tight">{view.name}</h1>
      {view.description && (
        <p className="mb-2 text-sm text-white/50">{view.description}</p>
      )}
      <p className="mb-6 text-xs font-medium text-white/45">
        {articleTotal} fiche{articleTotal > 1 ? "s" : ""}
        {" • "}
        {view.sections.length} sous-thème
        {view.sections.length > 1 ? "s" : ""}
      </p>

      {view.sections.length === 0 ? (
        <p className="text-sm text-white/50">
          Aucun sous-thème publié dans cette catégorie pour le moment.
        </p>
      ) : (
        <div className="space-y-6">
          {view.sections.map((section) => (
            <section key={section.slug}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-electric-400/80">
                {section.name}
              </h2>
              {section.description && (
                <p className="mb-2 text-xs text-white/45">
                  {section.description}
                </p>
              )}
              {section.articles.length === 0 ? (
                <p className="text-xs text-white/40">
                  Aucune fiche publiée dans ce sous-thème.
                </p>
              ) : (
                <ul className="space-y-2">
                  {section.articles.map((article) => (
                    <li key={article.slug}>
                      <Link
                        href={`/app/skills/${view.slug}/${article.slug}`}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-violet-500/5 px-4 py-3 transition hover:border-electric-500/30 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-electric-500/50"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-white">
                            {article.title}
                          </span>
                          {article.summary && (
                            <span className="mt-0.5 block truncate text-xs text-white/50">
                              {article.summary}
                            </span>
                          )}
                          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-white/40">
                              {article.readingMinutes} min
                            </span>
                            {article.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300"
                              >
                                {tag}
                              </span>
                            ))}
                          </span>
                        </span>
                        <span
                          aria-hidden
                          className="shrink-0 text-lg text-electric-400/70"
                        >
                          ›
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
