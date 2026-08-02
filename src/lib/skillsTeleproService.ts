import "server-only";

import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import {
  SkillStatus,
  parseSkillBlocks,
  type SkillBlock,
  type SkillsSearchEntry,
} from "@/lib/skillsContent";

export type { SkillsSearchEntry } from "@/lib/skillsContent";

// ---------------------------------------------------------------------------
// Bibliothèque Skills — service téléprospecteur (lecture seule).
// Règle d'ascendance : un contenu n'est visible que si la catégorie, la
// section et l'article sont tous PUBLISHED. Isolation organizationId sur
// chaque requête ; selects minimaux ; aucun prompt, artifact, hash ni secret.
// ---------------------------------------------------------------------------

export type SkillsLibraryCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconKey: string;
  sectionCount: number;
  articleCount: number;
};

export type SkillsLibraryView = {
  categories: SkillsLibraryCategory[];
  searchIndex: SkillsSearchEntry[];
};

export type SkillsCategoryView = {
  name: string;
  slug: string;
  description: string | null;
  iconKey: string;
  sections: Array<{
    name: string;
    slug: string;
    description: string | null;
    articles: Array<{
      title: string;
      slug: string;
      summary: string | null;
      readingMinutes: number;
      tags: string[];
    }>;
  }>;
};

export type SkillsArticleView = {
  title: string;
  slug: string;
  summary: string | null;
  tags: string[];
  readingMinutes: number;
  blocks: SkillBlock[];
  categoryName: string;
  categorySlug: string;
  sectionName: string;
};

const PUBLISHED = SkillStatus.PUBLISHED;

/**
 * Charge la hiérarchie entièrement publiée (trois niveaux PUBLISHED).
 * `teleproId` est reçu explicitement (traçabilité du contexte d'appel).
 */
async function loadPublishedHierarchy(teleproId: string, organizationId: string) {
  void teleproId;
  const categories = await prisma.skillCategory.findMany({
    where: { organizationId, status: PUBLISHED },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      iconKey: true,
    },
  });
  if (categories.length === 0) {
    return { categories, sections: [], articles: [] };
  }
  const categoryIds = categories.map((c) => c.id);
  const sections = await prisma.skillSection.findMany({
    where: {
      organizationId,
      status: PUBLISHED,
      categoryId: { in: categoryIds },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      categoryId: true,
      name: true,
      slug: true,
      description: true,
    },
  });
  const sectionIds = sections.map((s) => s.id);
  const articles =
    sectionIds.length === 0
      ? []
      : await prisma.skillArticle.findMany({
          where: {
            organizationId,
            status: PUBLISHED,
            sectionId: { in: sectionIds },
            categoryId: { in: categoryIds },
          },
          orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
          select: {
            id: true,
            categoryId: true,
            sectionId: true,
            title: true,
            slug: true,
            summary: true,
            tags: true,
            readingMinutes: true,
          },
        });
  return { categories, sections, articles };
}

/** Vue racine `/app/skills` : catégories publiées, compteurs réels, index de recherche. */
export async function loadSkillsLibrary(
  teleproId: string,
  organizationId: string,
): Promise<SkillsLibraryView> {
  const { categories, sections, articles } = await loadPublishedHierarchy(
    teleproId,
    organizationId,
  );

  const libraryCategories: SkillsLibraryCategory[] = categories.map((cat) => {
    const catSections = sections.filter((s) => s.categoryId === cat.id);
    const catArticles = articles.filter((a) => a.categoryId === cat.id);
    return {
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      iconKey: cat.iconKey,
      sectionCount: catSections.length,
      articleCount: catArticles.length,
    };
  });

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const searchIndex: SkillsSearchEntry[] = articles.flatMap((a) => {
    const cat = categoryById.get(a.categoryId);
    if (!cat) return [];
    return [
      {
        title: a.title,
        summary: a.summary,
        tags: parseJson<string[]>(a.tags, []),
        categoryName: cat.name,
        categorySlug: cat.slug,
        articleSlug: a.slug,
        readingMinutes: a.readingMinutes,
      },
    ];
  });

  return { categories: libraryCategories, searchIndex };
}

/** Vue catégorie `/app/skills/[categorySlug]` — null si masquée/inexistante. */
export async function loadSkillsCategoryView(
  teleproId: string,
  organizationId: string,
  categorySlug: string,
): Promise<SkillsCategoryView | null> {
  void teleproId;
  const category = await prisma.skillCategory.findFirst({
    where: { organizationId, slug: categorySlug, status: PUBLISHED },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      iconKey: true,
    },
  });
  if (!category) return null;

  const sections = await prisma.skillSection.findMany({
    where: { organizationId, categoryId: category.id, status: PUBLISHED },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, description: true },
  });
  const sectionIds = sections.map((s) => s.id);
  const articles =
    sectionIds.length === 0
      ? []
      : await prisma.skillArticle.findMany({
          where: {
            organizationId,
            categoryId: category.id,
            sectionId: { in: sectionIds },
            status: PUBLISHED,
          },
          orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
          select: {
            sectionId: true,
            title: true,
            slug: true,
            summary: true,
            tags: true,
            readingMinutes: true,
          },
        });

  return {
    name: category.name,
    slug: category.slug,
    description: category.description,
    iconKey: category.iconKey,
    sections: sections.map((s) => ({
      name: s.name,
      slug: s.slug,
      description: s.description,
      articles: articles
        .filter((a) => a.sectionId === s.id)
        .map((a) => ({
          title: a.title,
          slug: a.slug,
          summary: a.summary,
          readingMinutes: a.readingMinutes,
          tags: parseJson<string[]>(a.tags, []),
        })),
    })),
  };
}

/**
 * Vue article `/app/skills/[categorySlug]/[articleSlug]`.
 * Retourne null (→ 404) si l'article, sa section ou sa catégorie n'est pas
 * PUBLISHED, si le slug de catégorie ne correspond pas, ou hors organisation.
 */
export async function loadSkillsArticleView(
  teleproId: string,
  organizationId: string,
  categorySlug: string,
  articleSlug: string,
): Promise<SkillsArticleView | null> {
  void teleproId;
  const article = await prisma.skillArticle.findFirst({
    where: {
      organizationId,
      slug: articleSlug,
      status: PUBLISHED,
      category: { organizationId, slug: categorySlug, status: PUBLISHED },
      section: { organizationId, status: PUBLISHED },
    },
    select: {
      title: true,
      slug: true,
      summary: true,
      tags: true,
      readingMinutes: true,
      content: true,
      category: { select: { name: true, slug: true } },
      section: { select: { name: true } },
    },
  });
  if (!article) return null;

  return {
    title: article.title,
    slug: article.slug,
    summary: article.summary,
    tags: parseJson<string[]>(article.tags, []),
    readingMinutes: article.readingMinutes,
    // Blocs revalidés au rendu : jamais de contenu brut non validé.
    blocks: parseSkillBlocks(article.content),
    categoryName: article.category.name,
    categorySlug: article.category.slug,
    sectionName: article.section.name,
  };
}
