import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db";
import { logAudit } from "./audit";
import { HttpError } from "./httpError";
import { nowIso, parseJson, stringifyJson } from "./utils";
import {
  SKILL_ICON_KEYS,
  SkillArticleContentSchema,
  SkillKeySchema,
  SkillSlugSchema,
  SkillStatus,
  isSafeSkillText,
  slugifySkillName,
} from "./skillsContent";

// ---------------------------------------------------------------------------
// Bibliothèque Skills — service admin (PLATFORM_ADMIN uniquement).
// Isolation organizationId sur chaque lecture/écriture ; aucun réseau ;
// audit de chaque mutation sans corps d'article ni bloc complet.
// ---------------------------------------------------------------------------

export type SkillEntityKind = "category" | "section" | "article";

export type SkillsAdminAction = "publish" | "unpublish" | "archive";

// ---------------- Schémas d'entrée (Zod strict) ----------------

function safeShortText(max: number, min = 1) {
  return z
    .string()
    .min(min)
    .max(max)
    .refine(isSafeSkillText, {
      message: "HTML, scripts et URL exécutables interdits.",
    });
}

const CategoryCreateSchema = z
  .object({
    name: safeShortText(120, 2),
    slug: SkillSlugSchema.optional(),
    description: safeShortText(500, 0).nullish(),
    iconKey: z.enum(SKILL_ICON_KEYS).default("book"),
    sortOrder: z.number().int().min(0).max(999).default(0),
  })
  .strict();

const CategoryUpdateSchema = CategoryCreateSchema.partial().strict();

const SectionCreateSchema = z
  .object({
    categoryId: z.string().min(1).max(64),
    name: safeShortText(120, 2),
    slug: SkillSlugSchema.optional(),
    description: safeShortText(500, 0).nullish(),
    sortOrder: z.number().int().min(0).max(999).default(0),
  })
  .strict();

const SectionUpdateSchema = SectionCreateSchema.omit({ categoryId: true })
  .partial()
  .strict();

const TagsSchema = z.array(safeShortText(40)).max(10);
const SkillKeysSchema = z.array(SkillKeySchema).max(20);

const ArticleCreateSchema = z
  .object({
    sectionId: z.string().min(1).max(64),
    title: safeShortText(160, 2),
    slug: SkillSlugSchema.optional(),
    summary: safeShortText(300, 0).nullish(),
    tags: TagsSchema.default([]),
    readingMinutes: z.number().int().min(1).max(60).default(3),
    sortOrder: z.number().int().min(0).max(999).default(0),
    blocks: SkillArticleContentSchema.default([]),
    skillKeys: SkillKeysSchema.default([]),
  })
  .strict();

const ArticleUpdateSchema = ArticleCreateSchema.omit({ sectionId: true })
  .partial()
  .strict();

// ---------------- Helpers internes ----------------

function isP2002(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

/** "" ou null → null ; texte non vide conservé (comportement explicite). */
function normalizeOptional(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function resolveSlug(explicit: string | undefined, name: string): string {
  const slug = explicit ?? slugifySkillName(name);
  if (!slug) throw new HttpError(422, "Slug invalide.");
  return slug;
}

const CATEGORY_LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  iconKey: true,
  sortOrder: true,
  status: true,
  updatedAt: true,
  createdAt: true,
} as const;

const SECTION_LIST_SELECT = {
  id: true,
  categoryId: true,
  name: true,
  slug: true,
  description: true,
  sortOrder: true,
  status: true,
  updatedAt: true,
  createdAt: true,
} as const;

/** Liste/arbre : jamais le corps (content) des articles. */
const ARTICLE_LIST_SELECT = {
  id: true,
  categoryId: true,
  sectionId: true,
  title: true,
  slug: true,
  summary: true,
  readingMinutes: true,
  sortOrder: true,
  status: true,
  updatedAt: true,
  createdAt: true,
} as const;

async function loadCategoryOrThrow(id: string, organizationId: string) {
  const category = await prisma.skillCategory.findFirst({
    where: { id, organizationId },
  });
  if (!category) throw new HttpError(404, "Catégorie introuvable.");
  return category;
}

async function loadSectionOrThrow(id: string, organizationId: string) {
  const section = await prisma.skillSection.findFirst({
    where: { id, organizationId },
  });
  if (!section) throw new HttpError(404, "Section introuvable.");
  return section;
}

async function loadArticleOrThrow(id: string, organizationId: string) {
  const article = await prisma.skillArticle.findFirst({
    where: { id, organizationId },
    include: { skillMappings: { select: { skillKey: true } } },
  });
  if (!article) throw new HttpError(404, "Article introuvable.");
  return article;
}

function assertEditableDraft(status: string, label: string): void {
  if (status === SkillStatus.ARCHIVED) {
    throw new HttpError(409, `${label} archivé(e) : lecture seule.`);
  }
  if (status === SkillStatus.PUBLISHED) {
    throw new HttpError(
      409,
      `${label} publié(e) : repassez en brouillon (unpublish) avant de modifier.`,
    );
  }
}

async function assertUniqueCategorySlug(
  organizationId: string,
  slug: string,
  excludeId?: string,
): Promise<void> {
  const existing = await prisma.skillCategory.findFirst({
    where: {
      organizationId,
      slug,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw new HttpError(409, `Slug de catégorie déjà utilisé : ${slug}`);
}

async function assertUniqueSectionSlug(
  categoryId: string,
  slug: string,
  excludeId?: string,
): Promise<void> {
  const existing = await prisma.skillSection.findFirst({
    where: {
      categoryId,
      slug,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw new HttpError(409, `Slug de section déjà utilisé : ${slug}`);
}

async function assertUniqueArticleSlug(
  organizationId: string,
  slug: string,
  excludeId?: string,
): Promise<void> {
  const existing = await prisma.skillArticle.findFirst({
    where: {
      organizationId,
      slug,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw new HttpError(409, `Slug d'article déjà utilisé : ${slug}`);
}

// ---------------- Lecture ----------------

/** Arbre Catégories → Sections → Articles, sans corps d'articles. */
export async function listSkillsTree(organizationId: string) {
  const [categories, sections, articles] = await Promise.all([
    prisma.skillCategory.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: CATEGORY_LIST_SELECT,
    }),
    prisma.skillSection.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: SECTION_LIST_SELECT,
    }),
    prisma.skillArticle.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      select: ARTICLE_LIST_SELECT,
    }),
  ]);

  return categories.map((cat) => ({
    ...cat,
    sections: sections
      .filter((s) => s.categoryId === cat.id)
      .map((s) => ({
        ...s,
        articles: articles.filter((a) => a.sectionId === s.id),
      })),
  }));
}

export async function getSkillCategory(id: string, organizationId: string) {
  const category = await loadCategoryOrThrow(id, organizationId);
  const sectionCount = await prisma.skillSection.count({
    where: { categoryId: id, organizationId },
  });
  return { ...category, sectionCount };
}

export async function getSkillSection(id: string, organizationId: string) {
  const section = await loadSectionOrThrow(id, organizationId);
  const articleCount = await prisma.skillArticle.count({
    where: { sectionId: id, organizationId },
  });
  return { ...section, articleCount };
}

/** Détail d'article avec blocs — réservé au PLATFORM_ADMIN autorisé. */
export async function getSkillArticle(id: string, organizationId: string) {
  const article = await loadArticleOrThrow(id, organizationId);
  const { skillMappings, ...rest } = article;
  return {
    ...rest,
    tags: parseJson<string[]>(article.tags, []),
    blocks: parseJson<unknown[]>(article.content, []),
    skillKeys: skillMappings.map((m) => m.skillKey).sort(),
    content: undefined,
  };
}

// ---------------- Création ----------------

export async function createSkillCategory(
  organizationId: string,
  actorId: string,
  raw: unknown,
) {
  const body = CategoryCreateSchema.parse(raw);
  const slug = resolveSlug(body.slug, body.name);
  await assertUniqueCategorySlug(organizationId, slug);

  const now = nowIso();
  let created;
  try {
    created = await prisma.skillCategory.create({
      data: {
        organizationId,
        name: body.name,
        slug,
        description: normalizeOptional(body.description),
        iconKey: body.iconKey,
        sortOrder: body.sortOrder,
        status: SkillStatus.DRAFT,
        createdById: actorId,
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (err) {
    if (isP2002(err)) {
      throw new HttpError(409, `Slug de catégorie déjà utilisé : ${slug}`);
    }
    throw err;
  }

  await logAudit({
    organizationId,
    actorId,
    action: "SKILL_CATEGORY_CREATE",
    targetType: "SkillCategory",
    targetId: created.id,
    metadata: { slug },
  });

  return getSkillCategory(created.id, organizationId);
}

export async function createSkillSection(
  organizationId: string,
  actorId: string,
  raw: unknown,
) {
  const body = SectionCreateSchema.parse(raw);
  const category = await loadCategoryOrThrow(body.categoryId, organizationId);
  if (category.status === SkillStatus.ARCHIVED) {
    throw new HttpError(409, "Catégorie archivée : ajout impossible.");
  }
  const slug = resolveSlug(body.slug, body.name);
  await assertUniqueSectionSlug(category.id, slug);

  const now = nowIso();
  let created;
  try {
    created = await prisma.skillSection.create({
      data: {
        organizationId,
        categoryId: category.id,
        name: body.name,
        slug,
        description: normalizeOptional(body.description),
        sortOrder: body.sortOrder,
        status: SkillStatus.DRAFT,
        createdById: actorId,
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (err) {
    if (isP2002(err)) {
      throw new HttpError(409, `Slug de section déjà utilisé : ${slug}`);
    }
    throw err;
  }

  await logAudit({
    organizationId,
    actorId,
    action: "SKILL_SECTION_CREATE",
    targetType: "SkillSection",
    targetId: created.id,
    metadata: { slug, categoryId: category.id },
  });

  return getSkillSection(created.id, organizationId);
}

export async function createSkillArticle(
  organizationId: string,
  actorId: string,
  raw: unknown,
) {
  const body = ArticleCreateSchema.parse(raw);
  const section = await loadSectionOrThrow(body.sectionId, organizationId);
  if (section.status === SkillStatus.ARCHIVED) {
    throw new HttpError(409, "Section archivée : ajout impossible.");
  }
  // Cohérence catégorie/section garantie côté serveur (jamais choisie séparément).
  const category = await loadCategoryOrThrow(section.categoryId, organizationId);
  if (category.status === SkillStatus.ARCHIVED) {
    throw new HttpError(409, "Catégorie archivée : ajout impossible.");
  }
  const slug = resolveSlug(body.slug, body.title);
  await assertUniqueArticleSlug(organizationId, slug);

  const now = nowIso();
  const skillKeys = [...new Set(body.skillKeys)];
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const article = await tx.skillArticle.create({
        data: {
          organizationId,
          categoryId: category.id,
          sectionId: section.id,
          title: body.title,
          slug,
          summary: normalizeOptional(body.summary),
          tags: stringifyJson(body.tags),
          readingMinutes: body.readingMinutes,
          sortOrder: body.sortOrder,
          status: SkillStatus.DRAFT,
          content: stringifyJson(body.blocks),
          createdById: actorId,
          createdAt: now,
          updatedAt: now,
        },
      });
      if (skillKeys.length > 0) {
        await tx.skillArticleMapping.createMany({
          data: skillKeys.map((skillKey) => ({
            organizationId,
            articleId: article.id,
            skillKey,
            createdAt: now,
          })),
        });
      }
      return article;
    });
  } catch (err) {
    if (isP2002(err)) {
      throw new HttpError(409, `Slug d'article déjà utilisé : ${slug}`);
    }
    throw err;
  }

  await logAudit({
    organizationId,
    actorId,
    action: "SKILL_ARTICLE_CREATE",
    targetType: "SkillArticle",
    targetId: created.id,
    metadata: {
      slug,
      sectionId: section.id,
      categoryId: category.id,
      blocksCount: body.blocks.length,
      skillKeysCount: skillKeys.length,
    },
  });

  return getSkillArticle(created.id, organizationId);
}

// ---------------- Modification (DRAFT uniquement) ----------------

export async function updateSkillCategory(
  id: string,
  organizationId: string,
  actorId: string,
  raw: unknown,
) {
  const body = CategoryUpdateSchema.parse(raw);
  const existing = await loadCategoryOrThrow(id, organizationId);
  assertEditableDraft(existing.status, "Catégorie");

  let slug = existing.slug;
  if (body.slug !== undefined) {
    await assertUniqueCategorySlug(organizationId, body.slug, id);
    slug = body.slug;
  }

  try {
    await prisma.skillCategory.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        slug,
        description:
          body.description !== undefined
            ? normalizeOptional(body.description)
            : existing.description,
        iconKey: body.iconKey ?? existing.iconKey,
        sortOrder: body.sortOrder ?? existing.sortOrder,
        updatedAt: nowIso(),
      },
    });
  } catch (err) {
    if (isP2002(err)) {
      throw new HttpError(409, `Slug de catégorie déjà utilisé : ${slug}`);
    }
    throw err;
  }

  await logAudit({
    organizationId,
    actorId,
    action: "SKILL_CATEGORY_UPDATE",
    targetType: "SkillCategory",
    targetId: id,
  });

  return getSkillCategory(id, organizationId);
}

export async function updateSkillSection(
  id: string,
  organizationId: string,
  actorId: string,
  raw: unknown,
) {
  const body = SectionUpdateSchema.parse(raw);
  const existing = await loadSectionOrThrow(id, organizationId);
  assertEditableDraft(existing.status, "Section");

  let slug = existing.slug;
  if (body.slug !== undefined) {
    await assertUniqueSectionSlug(existing.categoryId, body.slug, id);
    slug = body.slug;
  }

  try {
    await prisma.skillSection.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        slug,
        description:
          body.description !== undefined
            ? normalizeOptional(body.description)
            : existing.description,
        sortOrder: body.sortOrder ?? existing.sortOrder,
        updatedAt: nowIso(),
      },
    });
  } catch (err) {
    if (isP2002(err)) {
      throw new HttpError(409, `Slug de section déjà utilisé : ${slug}`);
    }
    throw err;
  }

  await logAudit({
    organizationId,
    actorId,
    action: "SKILL_SECTION_UPDATE",
    targetType: "SkillSection",
    targetId: id,
  });

  return getSkillSection(id, organizationId);
}

export async function updateSkillArticle(
  id: string,
  organizationId: string,
  actorId: string,
  raw: unknown,
) {
  const body = ArticleUpdateSchema.parse(raw);
  const existing = await loadArticleOrThrow(id, organizationId);
  assertEditableDraft(existing.status, "Article");

  let slug = existing.slug;
  if (body.slug !== undefined) {
    await assertUniqueArticleSlug(organizationId, body.slug, id);
    slug = body.slug;
  }

  const now = nowIso();
  const skillKeys =
    body.skillKeys !== undefined ? [...new Set(body.skillKeys)] : undefined;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.skillArticle.update({
        where: { id },
        data: {
          title: body.title ?? existing.title,
          slug,
          summary:
            body.summary !== undefined
              ? normalizeOptional(body.summary)
              : existing.summary,
          tags: body.tags !== undefined ? stringifyJson(body.tags) : existing.tags,
          readingMinutes: body.readingMinutes ?? existing.readingMinutes,
          sortOrder: body.sortOrder ?? existing.sortOrder,
          content:
            body.blocks !== undefined
              ? stringifyJson(body.blocks)
              : existing.content,
          updatedAt: now,
        },
      });
      if (skillKeys !== undefined) {
        // Remplacement complet : un tableau vide efface réellement les mappings.
        await tx.skillArticleMapping.deleteMany({
          where: { articleId: id, organizationId },
        });
        if (skillKeys.length > 0) {
          await tx.skillArticleMapping.createMany({
            data: skillKeys.map((skillKey) => ({
              organizationId,
              articleId: id,
              skillKey,
              createdAt: now,
            })),
          });
        }
      }
    });
  } catch (err) {
    if (isP2002(err)) {
      throw new HttpError(409, "Conflit d'unicité : réessayez.");
    }
    throw err;
  }

  await logAudit({
    organizationId,
    actorId,
    action: "SKILL_ARTICLE_UPDATE",
    targetType: "SkillArticle",
    targetId: id,
    metadata: {
      blocksCount: body.blocks?.length,
      skillKeysCount: skillKeys?.length,
    },
  });

  return getSkillArticle(id, organizationId);
}

// ---------------- Cycle de vie ----------------

export async function publishSkillCategory(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const category = await loadCategoryOrThrow(id, organizationId);
  if (category.status === SkillStatus.ARCHIVED) {
    throw new HttpError(409, "Catégorie archivée : publication impossible.");
  }
  if (category.status === SkillStatus.PUBLISHED) {
    throw new HttpError(409, "Catégorie déjà publiée.");
  }
  await prisma.skillCategory.update({
    where: { id },
    data: {
      status: SkillStatus.PUBLISHED,
      publishedAt: nowIso(),
      updatedAt: nowIso(),
    },
  });
  await logAudit({
    organizationId,
    actorId,
    action: "SKILL_CATEGORY_PUBLISH",
    targetType: "SkillCategory",
    targetId: id,
  });
  return getSkillCategory(id, organizationId);
}

export async function unpublishSkillCategory(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const category = await loadCategoryOrThrow(id, organizationId);
  if (category.status !== SkillStatus.PUBLISHED) {
    throw new HttpError(409, "La catégorie n'est pas publiée.");
  }
  // Les descendants gardent leur statut : ils sont masqués par la règle
  // d'ascendance (visibilité télépro = trois niveaux PUBLISHED).
  await prisma.skillCategory.update({
    where: { id },
    data: { status: SkillStatus.DRAFT, updatedAt: nowIso() },
  });
  await logAudit({
    organizationId,
    actorId,
    action: "SKILL_CATEGORY_UNPUBLISH",
    targetType: "SkillCategory",
    targetId: id,
  });
  return getSkillCategory(id, organizationId);
}

export async function archiveSkillCategory(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const category = await loadCategoryOrThrow(id, organizationId);
  if (category.status === SkillStatus.ARCHIVED) {
    throw new HttpError(409, "Catégorie déjà archivée.");
  }
  await prisma.skillCategory.update({
    where: { id },
    data: {
      status: SkillStatus.ARCHIVED,
      archivedAt: nowIso(),
      updatedAt: nowIso(),
    },
  });
  await logAudit({
    organizationId,
    actorId,
    action: "SKILL_CATEGORY_ARCHIVE",
    targetType: "SkillCategory",
    targetId: id,
  });
  return getSkillCategory(id, organizationId);
}

export async function publishSkillSection(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const section = await loadSectionOrThrow(id, organizationId);
  if (section.status === SkillStatus.ARCHIVED) {
    throw new HttpError(409, "Section archivée : publication impossible.");
  }
  if (section.status === SkillStatus.PUBLISHED) {
    throw new HttpError(409, "Section déjà publiée.");
  }
  const category = await loadCategoryOrThrow(section.categoryId, organizationId);
  if (category.status !== SkillStatus.PUBLISHED) {
    throw new HttpError(
      409,
      "Publiez d'abord la catégorie parente avant la section.",
    );
  }
  await prisma.skillSection.update({
    where: { id },
    data: {
      status: SkillStatus.PUBLISHED,
      publishedAt: nowIso(),
      updatedAt: nowIso(),
    },
  });
  await logAudit({
    organizationId,
    actorId,
    action: "SKILL_SECTION_PUBLISH",
    targetType: "SkillSection",
    targetId: id,
  });
  return getSkillSection(id, organizationId);
}

export async function unpublishSkillSection(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const section = await loadSectionOrThrow(id, organizationId);
  if (section.status !== SkillStatus.PUBLISHED) {
    throw new HttpError(409, "La section n'est pas publiée.");
  }
  await prisma.skillSection.update({
    where: { id },
    data: { status: SkillStatus.DRAFT, updatedAt: nowIso() },
  });
  await logAudit({
    organizationId,
    actorId,
    action: "SKILL_SECTION_UNPUBLISH",
    targetType: "SkillSection",
    targetId: id,
  });
  return getSkillSection(id, organizationId);
}

export async function archiveSkillSection(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const section = await loadSectionOrThrow(id, organizationId);
  if (section.status === SkillStatus.ARCHIVED) {
    throw new HttpError(409, "Section déjà archivée.");
  }
  await prisma.skillSection.update({
    where: { id },
    data: {
      status: SkillStatus.ARCHIVED,
      archivedAt: nowIso(),
      updatedAt: nowIso(),
    },
  });
  await logAudit({
    organizationId,
    actorId,
    action: "SKILL_SECTION_ARCHIVE",
    targetType: "SkillSection",
    targetId: id,
  });
  return getSkillSection(id, organizationId);
}

export async function publishSkillArticle(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const article = await loadArticleOrThrow(id, organizationId);
  if (article.status === SkillStatus.ARCHIVED) {
    throw new HttpError(409, "Article archivé : publication impossible.");
  }
  if (article.status === SkillStatus.PUBLISHED) {
    throw new HttpError(409, "Article déjà publié.");
  }
  const [section, category] = await Promise.all([
    loadSectionOrThrow(article.sectionId, organizationId),
    loadCategoryOrThrow(article.categoryId, organizationId),
  ]);
  if (
    section.status !== SkillStatus.PUBLISHED ||
    category.status !== SkillStatus.PUBLISHED
  ) {
    throw new HttpError(
      409,
      "Publiez d'abord la catégorie et la section parentes.",
    );
  }
  const blocks = SkillArticleContentSchema.safeParse(
    parseJson<unknown[]>(article.content, []),
  );
  if (!blocks.success || blocks.data.length === 0) {
    throw new HttpError(
      409,
      "Un article publié doit contenir au moins un bloc de contenu valide.",
    );
  }
  await prisma.skillArticle.update({
    where: { id },
    data: {
      status: SkillStatus.PUBLISHED,
      publishedAt: nowIso(),
      updatedAt: nowIso(),
    },
  });
  await logAudit({
    organizationId,
    actorId,
    action: "SKILL_ARTICLE_PUBLISH",
    targetType: "SkillArticle",
    targetId: id,
    metadata: { blocksCount: blocks.data.length },
  });
  return getSkillArticle(id, organizationId);
}

export async function unpublishSkillArticle(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const article = await loadArticleOrThrow(id, organizationId);
  if (article.status !== SkillStatus.PUBLISHED) {
    throw new HttpError(409, "L'article n'est pas publié.");
  }
  await prisma.skillArticle.update({
    where: { id },
    data: { status: SkillStatus.DRAFT, updatedAt: nowIso() },
  });
  await logAudit({
    organizationId,
    actorId,
    action: "SKILL_ARTICLE_UNPUBLISH",
    targetType: "SkillArticle",
    targetId: id,
  });
  return getSkillArticle(id, organizationId);
}

export async function archiveSkillArticle(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const article = await loadArticleOrThrow(id, organizationId);
  if (article.status === SkillStatus.ARCHIVED) {
    throw new HttpError(409, "Article déjà archivé.");
  }
  await prisma.skillArticle.update({
    where: { id },
    data: {
      status: SkillStatus.ARCHIVED,
      archivedAt: nowIso(),
      updatedAt: nowIso(),
    },
  });
  await logAudit({
    organizationId,
    actorId,
    action: "SKILL_ARTICLE_ARCHIVE",
    targetType: "SkillArticle",
    targetId: id,
  });
  return getSkillArticle(id, organizationId);
}

// ---------------- Suppression (DRAFT non référencé uniquement) ----------------

export async function deleteSkillCategory(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const category = await loadCategoryOrThrow(id, organizationId);
  if (category.status !== SkillStatus.DRAFT) {
    throw new HttpError(
      409,
      "Suppression réservée aux brouillons ; archivez sinon.",
    );
  }
  const sectionCount = await prisma.skillSection.count({
    where: { categoryId: id, organizationId },
  });
  if (sectionCount > 0) {
    throw new HttpError(
      409,
      "Catégorie non vide (sections existantes) : suppression interdite.",
    );
  }
  await prisma.skillCategory.delete({ where: { id } });
  await logAudit({
    organizationId,
    actorId,
    action: "SKILL_CATEGORY_DELETE",
    targetType: "SkillCategory",
    targetId: id,
  });
  return { deleted: true as const };
}

export async function deleteSkillSection(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const section = await loadSectionOrThrow(id, organizationId);
  if (section.status !== SkillStatus.DRAFT) {
    throw new HttpError(
      409,
      "Suppression réservée aux brouillons ; archivez sinon.",
    );
  }
  const articleCount = await prisma.skillArticle.count({
    where: { sectionId: id, organizationId },
  });
  if (articleCount > 0) {
    throw new HttpError(
      409,
      "Section non vide (articles existants) : suppression interdite.",
    );
  }
  await prisma.skillSection.delete({ where: { id } });
  await logAudit({
    organizationId,
    actorId,
    action: "SKILL_SECTION_DELETE",
    targetType: "SkillSection",
    targetId: id,
  });
  return { deleted: true as const };
}

export async function deleteSkillArticle(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const article = await loadArticleOrThrow(id, organizationId);
  if (article.status !== SkillStatus.DRAFT) {
    throw new HttpError(
      409,
      "Suppression réservée aux brouillons ; archivez sinon.",
    );
  }
  // Suppression maîtrisée des mappings puis de l'article (transaction).
  await prisma.$transaction(async (tx) => {
    await tx.skillArticleMapping.deleteMany({
      where: { articleId: id, organizationId },
    });
    await tx.skillArticle.delete({ where: { id } });
  });
  await logAudit({
    organizationId,
    actorId,
    action: "SKILL_ARTICLE_DELETE",
    targetType: "SkillArticle",
    targetId: id,
    metadata: { mappingsDeleted: article.skillMappings.length },
  });
  return { deleted: true as const };
}
