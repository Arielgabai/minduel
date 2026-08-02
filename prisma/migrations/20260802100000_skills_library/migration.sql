-- Migration : bibliotheque Skills (SkillCategory / SkillSection / SkillArticle / SkillArticleMapping)
-- Additive uniquement : nouvelles tables, index et contraintes. Aucune donnee, aucun seed.
-- Integrite multi-tenant : FK composites (id, organizationId) / (id, organizationId, categoryId)
-- empechent toute relation croisee entre organisations.
--
-- ROLLBACK (executer manuellement si besoin de revenir en arriere) :
--   1. Deployer une version applicative sans les routes /admin/skills et /app/skills dynamiques.
--   2. Puis executer le SQL ci-dessous dans cet ordre (enfants avant parents) :
--      DROP TABLE IF EXISTS "SkillArticleMapping";
--      DROP TABLE IF EXISTS "SkillArticle";
--      DROP TABLE IF EXISTS "SkillSection";
--      DROP TABLE IF EXISTS "SkillCategory";
--
--   Note : le contenu Skills supprime n'est pas recuperable ; aucune autre table
--   n'est modifiee par cette migration (zero ALTER sur les tables existantes).

-- CreateTable SkillCategory
CREATE TABLE "SkillCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "iconKey" TEXT NOT NULL DEFAULT 'book',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "publishedAt" TEXT,
    "archivedAt" TEXT,

    CONSTRAINT "SkillCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable SkillSection
CREATE TABLE "SkillSection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "publishedAt" TEXT,
    "archivedAt" TEXT,

    CONSTRAINT "SkillSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable SkillArticle
CREATE TABLE "SkillArticle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "tags" TEXT,
    "readingMinutes" INTEGER NOT NULL DEFAULT 3,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "content" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "publishedAt" TEXT,
    "archivedAt" TEXT,

    CONSTRAINT "SkillArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable SkillArticleMapping
CREATE TABLE "SkillArticleMapping" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "skillKey" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "SkillArticleMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unicites metier + ancres FK composites multi-tenant)
CREATE UNIQUE INDEX "SkillCategory_organizationId_slug_key" ON "SkillCategory"("organizationId", "slug");

CREATE UNIQUE INDEX "SkillCategory_id_organizationId_key" ON "SkillCategory"("id", "organizationId");

CREATE INDEX "SkillCategory_organizationId_status_sortOrder_idx" ON "SkillCategory"("organizationId", "status", "sortOrder");

CREATE UNIQUE INDEX "SkillSection_categoryId_slug_key" ON "SkillSection"("categoryId", "slug");

CREATE UNIQUE INDEX "SkillSection_id_organizationId_key" ON "SkillSection"("id", "organizationId");

CREATE UNIQUE INDEX "SkillSection_id_organizationId_categoryId_key" ON "SkillSection"("id", "organizationId", "categoryId");

CREATE INDEX "SkillSection_organizationId_idx" ON "SkillSection"("organizationId");

CREATE INDEX "SkillSection_categoryId_status_sortOrder_idx" ON "SkillSection"("categoryId", "status", "sortOrder");

CREATE UNIQUE INDEX "SkillArticle_organizationId_slug_key" ON "SkillArticle"("organizationId", "slug");

CREATE UNIQUE INDEX "SkillArticle_id_organizationId_key" ON "SkillArticle"("id", "organizationId");

CREATE INDEX "SkillArticle_organizationId_status_idx" ON "SkillArticle"("organizationId", "status");

CREATE INDEX "SkillArticle_sectionId_status_sortOrder_idx" ON "SkillArticle"("sectionId", "status", "sortOrder");

CREATE INDEX "SkillArticle_categoryId_idx" ON "SkillArticle"("categoryId");

CREATE UNIQUE INDEX "SkillArticleMapping_articleId_skillKey_key" ON "SkillArticleMapping"("articleId", "skillKey");

CREATE INDEX "SkillArticleMapping_organizationId_skillKey_idx" ON "SkillArticleMapping"("organizationId", "skillKey");

-- AddForeignKey (espace obligatoire entre la parenthese fermante et REFERENCES)
ALTER TABLE "SkillCategory" ADD CONSTRAINT "SkillCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SkillSection" ADD CONSTRAINT "SkillSection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SkillSection" ADD CONSTRAINT "SkillSection_categoryId_organizationId_fkey" FOREIGN KEY ("categoryId", "organizationId") REFERENCES "SkillCategory"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SkillArticle" ADD CONSTRAINT "SkillArticle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SkillArticle" ADD CONSTRAINT "SkillArticle_categoryId_organizationId_fkey" FOREIGN KEY ("categoryId", "organizationId") REFERENCES "SkillCategory"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SkillArticle" ADD CONSTRAINT "SkillArticle_sectionId_organizationId_categoryId_fkey" FOREIGN KEY ("sectionId", "organizationId", "categoryId") REFERENCES "SkillSection"("id", "organizationId", "categoryId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SkillArticleMapping" ADD CONSTRAINT "SkillArticleMapping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SkillArticleMapping" ADD CONSTRAINT "SkillArticleMapping_articleId_organizationId_fkey" FOREIGN KEY ("articleId", "organizationId") REFERENCES "SkillArticle"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
