import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTelepro } from "@/lib/auth";
import { loadSkillsArticleView } from "@/lib/skillsTeleproService";
import { SkillBlocks } from "@/components/SkillBlocks";

/**
 * Article Skills : rendu React des blocs structurés validés.
 * 404 si l'article, sa section ou sa catégorie n'est pas PUBLISHED,
 * ou si le contenu appartient à une autre organisation.
 */
export default async function SkillsArticlePage({
  params,
}: {
  params: Promise<{ categorySlug: string; articleSlug: string }>;
}) {
  const user = await requireTelepro();
  const { categorySlug, articleSlug } = await params;
  const article = await loadSkillsArticleView(
    user.id,
    user.organizationId,
    categorySlug,
    articleSlug,
  );
  if (!article) notFound();

  return (
    <div className="animate-fade-up">
      <Link
        href={`/app/skills/${article.categorySlug}`}
        className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-sm text-white/60 transition hover:text-white focus-visible:ring-2 focus-visible:ring-electric-500/50"
      >
        <span aria-hidden>‹</span> {article.categoryName}
      </Link>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-electric-500/30 bg-electric-500/15 px-2.5 py-0.5 text-xs font-medium text-electric-400">
          {article.sectionName}
        </span>
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/60">
          {article.readingMinutes} min
        </span>
        {article.tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center rounded-full border border-violet-500/30 bg-violet-500/15 px-2.5 py-0.5 text-xs text-violet-300"
          >
            {tag}
          </span>
        ))}
      </div>

      <h1 className="mb-2 text-2xl font-bold leading-tight">
        {article.title}
      </h1>
      {article.summary && (
        <p className="mb-6 text-sm text-white/55">{article.summary}</p>
      )}

      <SkillBlocks blocks={article.blocks} />

      <div className="mt-8">
        <Link
          href={`/app/skills/${article.categorySlug}`}
          className="btn-gradient inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-electric-500/50"
        >
          Retour à {article.categoryName}
        </Link>
      </div>
    </div>
  );
}
