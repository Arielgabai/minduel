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
    <div className="animate-fade-up">
      <Link
        href="/app/skills"
        className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-sm text-white/60 transition hover:text-white focus-visible:ring-2 focus-visible:ring-electric-500/50"
      >
        <span aria-hidden>‹</span> Skills
      </Link>

      <h1 className="mb-1 text-2xl font-bold">{view.name}</h1>
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
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
                {section.name}
              </h2>
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
                        className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-electric-500/50"
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
                          <span className="mt-1 block text-xs text-white/40">
                            {article.readingMinutes} min de lecture
                          </span>
                        </span>
                        <span aria-hidden className="shrink-0 text-white/35">
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
