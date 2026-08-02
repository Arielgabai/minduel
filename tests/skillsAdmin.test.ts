import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { Role } from "@/lib/enums";
import {
  SkillArticleContentSchema,
  SkillBlockSchema,
  SkillKeySchema,
  slugifySkillName,
} from "@/lib/skillsContent";

type CategoryRow = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  iconKey: string;
  sortOrder: number;
  status: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
};

type SectionRow = CategoryRow & { categoryId: string };

type ArticleRow = {
  id: string;
  organizationId: string;
  categoryId: string;
  sectionId: string;
  title: string;
  slug: string;
  summary: string | null;
  tags: string | null;
  readingMinutes: number;
  sortOrder: number;
  status: string;
  content: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
};

type MappingRow = {
  id: string;
  organizationId: string;
  articleId: string;
  skillKey: string;
  createdAt: string;
};

let categories: CategoryRow[] = [];
let sections: SectionRow[] = [];
let articles: ArticleRow[] = [];
let mappings: MappingRow[] = [];
let seq = 0;
let failNextMappingCreate = false;
const audits: Array<{ action: string; metadata?: Record<string, unknown> }> =
  [];

function uid(prefix: string) {
  return `${prefix}-${++seq}`;
}

function matches(row: Record<string, unknown>, where: Record<string, unknown>) {
  for (const [key, cond] of Object.entries(where)) {
    if (cond == null) continue;
    if (typeof cond === "object" && !Array.isArray(cond)) {
      const c = cond as { not?: unknown; in?: unknown[] };
      if ("not" in c && row[key] === c.not) return false;
      if ("in" in c && !(c.in ?? []).includes(row[key])) return false;
      continue;
    }
    if (row[key] !== cond) return false;
  }
  return true;
}

function applySelect<T extends Record<string, unknown>>(
  row: T,
  select?: Record<string, unknown>,
): Record<string, unknown> {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(select)) {
    if (val) out[key] = row[key];
  }
  return out;
}

function sortRows<T extends Record<string, unknown>>(
  rows: T[],
  orderBy?: Array<Record<string, string>>,
): T[] {
  if (!orderBy) return rows;
  return [...rows].sort((a, b) => {
    for (const clause of orderBy) {
      const [field] = Object.keys(clause);
      const av = a[field!];
      const bv = b[field!];
      if (av === bv) continue;
      if (typeof av === "number" && typeof bv === "number") {
        return av - bv;
      }
      return String(av).localeCompare(String(bv));
    }
    return 0;
  });
}

function makeApis() {
  const categoryApi = {
    findFirst: async ({
      where,
      select,
    }: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }) => {
      const found = categories.find((c) => matches(c, where)) ?? null;
      return found ? applySelect(found, select) : null;
    },
    findMany: async ({
      where,
      orderBy,
      select,
    }: {
      where: Record<string, unknown>;
      orderBy?: Array<Record<string, string>>;
      select?: Record<string, unknown>;
    }) =>
      sortRows(
        categories.filter((c) => matches(c, where)),
        orderBy,
      ).map((c) => applySelect(c, select)),
    create: async ({ data }: { data: Partial<CategoryRow> }) => {
      if (
        categories.some(
          (c) =>
            c.organizationId === data.organizationId && c.slug === data.slug,
        )
      ) {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint", {
          code: "P2002",
          clientVersion: "6.x",
        });
      }
      const row: CategoryRow = {
        id: uid("cat"),
        organizationId: data.organizationId!,
        name: data.name!,
        slug: data.slug!,
        description: data.description ?? null,
        iconKey: data.iconKey ?? "book",
        sortOrder: data.sortOrder ?? 0,
        status: data.status ?? "DRAFT",
        createdById: data.createdById ?? null,
        createdAt: data.createdAt!,
        updatedAt: data.updatedAt!,
        publishedAt: null,
        archivedAt: null,
      };
      categories.push(row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<CategoryRow>;
    }) => {
      const idx = categories.findIndex((c) => c.id === where.id);
      categories[idx] = { ...categories[idx]!, ...data };
      return categories[idx];
    },
    delete: async ({ where }: { where: { id: string } }) => {
      categories = categories.filter((c) => c.id !== where.id);
      return { id: where.id };
    },
  };

  const sectionApi = {
    findFirst: async ({
      where,
      select,
    }: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }) => {
      const found = sections.find((s) => matches(s, where)) ?? null;
      return found ? applySelect(found, select) : null;
    },
    findMany: async ({
      where,
      orderBy,
      select,
    }: {
      where: Record<string, unknown>;
      orderBy?: Array<Record<string, string>>;
      select?: Record<string, unknown>;
    }) =>
      sortRows(
        sections.filter((s) => matches(s, where)),
        orderBy,
      ).map((s) => applySelect(s, select)),
    count: async ({ where }: { where: Record<string, unknown> }) =>
      sections.filter((s) => matches(s, where)).length,
    create: async ({ data }: { data: Partial<SectionRow> }) => {
      if (
        sections.some(
          (s) => s.categoryId === data.categoryId && s.slug === data.slug,
        )
      ) {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint", {
          code: "P2002",
          clientVersion: "6.x",
        });
      }
      const row: SectionRow = {
        id: uid("sec"),
        organizationId: data.organizationId!,
        categoryId: data.categoryId!,
        name: data.name!,
        slug: data.slug!,
        description: data.description ?? null,
        iconKey: "book",
        sortOrder: data.sortOrder ?? 0,
        status: data.status ?? "DRAFT",
        createdById: data.createdById ?? null,
        createdAt: data.createdAt!,
        updatedAt: data.updatedAt!,
        publishedAt: null,
        archivedAt: null,
      };
      sections.push(row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<SectionRow>;
    }) => {
      const idx = sections.findIndex((s) => s.id === where.id);
      sections[idx] = { ...sections[idx]!, ...data };
      return sections[idx];
    },
    delete: async ({ where }: { where: { id: string } }) => {
      sections = sections.filter((s) => s.id !== where.id);
      return { id: where.id };
    },
  };

  const articleApi = {
    findFirst: async ({
      where,
      select,
      include,
    }: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
      include?: Record<string, unknown>;
    }) => {
      const found = articles.find((a) => matches(a, where)) ?? null;
      if (!found) return null;
      if (include && "skillMappings" in include) {
        return {
          ...found,
          skillMappings: mappings
            .filter((m) => m.articleId === found.id)
            .map((m) => ({ skillKey: m.skillKey })),
        };
      }
      return applySelect(found, select);
    },
    findMany: async ({
      where,
      orderBy,
      select,
    }: {
      where: Record<string, unknown>;
      orderBy?: Array<Record<string, string>>;
      select?: Record<string, unknown>;
    }) =>
      sortRows(
        articles.filter((a) => matches(a, where)),
        orderBy,
      ).map((a) => applySelect(a, select)),
    count: async ({ where }: { where: Record<string, unknown> }) =>
      articles.filter((a) => matches(a, where)).length,
    create: async ({ data }: { data: Partial<ArticleRow> }) => {
      if (
        articles.some(
          (a) =>
            a.organizationId === data.organizationId && a.slug === data.slug,
        )
      ) {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint", {
          code: "P2002",
          clientVersion: "6.x",
        });
      }
      const row: ArticleRow = {
        id: uid("art"),
        organizationId: data.organizationId!,
        categoryId: data.categoryId!,
        sectionId: data.sectionId!,
        title: data.title!,
        slug: data.slug!,
        summary: data.summary ?? null,
        tags: data.tags ?? null,
        readingMinutes: data.readingMinutes ?? 3,
        sortOrder: data.sortOrder ?? 0,
        status: data.status ?? "DRAFT",
        content: data.content ?? "[]",
        createdById: data.createdById ?? null,
        createdAt: data.createdAt!,
        updatedAt: data.updatedAt!,
        publishedAt: null,
        archivedAt: null,
      };
      articles.push(row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<ArticleRow>;
    }) => {
      const idx = articles.findIndex((a) => a.id === where.id);
      articles[idx] = { ...articles[idx]!, ...data };
      return articles[idx];
    },
    delete: async ({ where }: { where: { id: string } }) => {
      articles = articles.filter((a) => a.id !== where.id);
      return { id: where.id };
    },
  };

  const mappingApi = {
    createMany: async ({ data }: { data: MappingRow[] }) => {
      if (failNextMappingCreate) {
        failNextMappingCreate = false;
        throw new Error("Panne simulée pendant la transaction.");
      }
      for (const d of data) {
        mappings.push({ ...d, id: uid("map") });
      }
      return { count: data.length };
    },
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
      const before = mappings.length;
      mappings = mappings.filter((m) => !matches(m, where));
      return { count: before - mappings.length };
    },
  };

  return { categoryApi, sectionApi, articleApi, mappingApi };
}

vi.mock("@/lib/db", () => {
  const apis = makeApis();
  const client = {
    skillCategory: apis.categoryApi,
    skillSection: apis.sectionApi,
    skillArticle: apis.articleApi,
    skillArticleMapping: apis.mappingApi,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      // Rollback simulé : snapshot avant, restauration si erreur.
      const snapshot = {
        categories: JSON.parse(JSON.stringify(categories)) as CategoryRow[],
        sections: JSON.parse(JSON.stringify(sections)) as SectionRow[],
        articles: JSON.parse(JSON.stringify(articles)) as ArticleRow[],
        mappings: JSON.parse(JSON.stringify(mappings)) as MappingRow[],
      };
      try {
        return await fn(client);
      } catch (err) {
        categories = snapshot.categories;
        sections = snapshot.sections;
        articles = snapshot.articles;
        mappings = snapshot.mappings;
        throw err;
      }
    },
  };
  return { prisma: client };
});

vi.mock("@/lib/audit", () => ({
  logAudit: async (input: {
    action: string;
    metadata?: Record<string, unknown>;
  }) => {
    audits.push({ action: input.action, metadata: input.metadata });
  },
}));

beforeEach(() => {
  categories = [];
  sections = [];
  articles = [];
  mappings = [];
  audits.length = 0;
  seq = 0;
  failNextMappingCreate = false;
  vi.clearAllMocks();
});

const ORG = "org1";
const OTHER_ORG = "org2";
const ADMIN = "admin1";

async function svc() {
  return import("@/lib/skillsAdminService");
}

async function seedPublishedChain() {
  const s = await svc();
  const cat = await s.createSkillCategory(ORG, ADMIN, { name: "Découverte" });
  const sec = await s.createSkillSection(ORG, ADMIN, {
    categoryId: cat.id,
    name: "Questions ouvertes",
  });
  const art = await s.createSkillArticle(ORG, ADMIN, {
    sectionId: sec.id,
    title: "Poser les bonnes questions",
    blocks: [{ type: "paragraph", text: "Un contenu utile." }],
  });
  await s.publishSkillCategory(cat.id, ORG, ADMIN);
  await s.publishSkillSection(sec.id, ORG, ADMIN);
  await s.publishSkillArticle(art.id, ORG, ADMIN);
  return { cat, sec, art };
}

describe("auth PLATFORM_ADMIN", () => {
  it("anonyme 401, TELEPRO 403, MANAGER 403, admin OK", async () => {
    const { assertPlatformAdmin } = await import("@/lib/auth");
    let status = 0;
    try {
      assertPlatformAdmin(null);
    } catch (e) {
      status = (e as { status: number }).status;
    }
    expect(status).toBe(401);

    for (const role of [Role.TELEPRO, Role.MANAGER]) {
      status = 0;
      try {
        assertPlatformAdmin({
          id: "u",
          email: "u@x.com",
          fullName: "U",
          role,
          organizationId: ORG,
          organizationName: "Org",
        });
      } catch (e) {
        status = (e as { status: number }).status;
      }
      expect(status).toBe(403);
    }

    const admin = assertPlatformAdmin({
      id: "a",
      email: "a@x.com",
      fullName: "A",
      role: Role.PLATFORM_ADMIN,
      organizationId: ORG,
      organizationName: "Org",
    });
    expect(admin.organizationId).toBe(ORG);
  });

  it("les routes API Skills exigent requirePlatformAdmin et handle", () => {
    for (const rel of [
      "src/app/api/admin/skills/route.ts",
      "src/app/api/admin/skills/[id]/route.ts",
    ]) {
      const src = readFileSync(path.resolve(rel), "utf8");
      expect(src).toContain("requirePlatformAdmin");
      expect(src).toContain("handle(");
      expect(src).not.toMatch(/organizationId\s*:\s*body/);
    }
  });
});

describe("CRUD et isolation organisation", () => {
  it("crée catégorie/section/article avec slugs auto", async () => {
    const s = await svc();
    const cat = await s.createSkillCategory(ORG, ADMIN, {
      name: "Traitement des objections",
    });
    expect(cat.slug).toBe("traitement-des-objections");
    expect(cat.status).toBe("DRAFT");

    const sec = await s.createSkillSection(ORG, ADMIN, {
      categoryId: cat.id,
      name: "Objections prix",
    });
    expect(sec.slug).toBe("objections-prix");

    const art = await s.createSkillArticle(ORG, ADMIN, {
      sectionId: sec.id,
      title: "Le principe de réciprocité",
      tags: ["closing"],
      skillKeys: ["objections"],
      blocks: [{ type: "paragraph", text: "Donner avant de demander." }],
    });
    expect(art.slug).toBe("le-principe-de-reciprocite");
    expect(art.categoryId).toBe(cat.id);
    expect(art.skillKeys).toEqual(["objections"]);
    expect(slugifySkillName("Élocution")).toBe("elocution");
  });

  it("lecture/écriture refusées hors organisation (404)", async () => {
    const s = await svc();
    const cat = await s.createSkillCategory(ORG, ADMIN, { name: "Closing" });
    await expect(s.getSkillCategory(cat.id, OTHER_ORG)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      s.updateSkillCategory(cat.id, OTHER_ORG, ADMIN, { name: "Xy" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      s.deleteSkillCategory(cat.id, OTHER_ORG, ADMIN),
    ).rejects.toMatchObject({ status: 404 });
    const tree = await s.listSkillsTree(OTHER_ORG);
    expect(tree).toHaveLength(0);
  });

  it("unicité des slugs → 409", async () => {
    const s = await svc();
    await s.createSkillCategory(ORG, ADMIN, { name: "Élocution" });
    await expect(
      s.createSkillCategory(ORG, ADMIN, { name: "Elocution" }),
    ).rejects.toMatchObject({ status: 409 });
    // même slug autorisé dans une autre organisation
    const other = await s.createSkillCategory(OTHER_ORG, ADMIN, {
      name: "Élocution",
    });
    expect(other.slug).toBe("elocution");
  });
});

describe("validation des blocs", () => {
  it("rejette HTML, scripts et propriétés inconnues", async () => {
    const s = await svc();
    const cat = await s.createSkillCategory(ORG, ADMIN, { name: "Cat" });
    const sec = await s.createSkillSection(ORG, ADMIN, {
      categoryId: cat.id,
      name: "Sec",
    });
    await expect(
      s.createSkillArticle(ORG, ADMIN, {
        sectionId: sec.id,
        title: "Bloqué",
        blocks: [{ type: "paragraph", text: "<script>alert(1)</script>" }],
      }),
    ).rejects.toThrow();
    await expect(
      s.createSkillArticle(ORG, ADMIN, {
        sectionId: sec.id,
        title: "Bloqué 2",
        blocks: [{ type: "paragraph", text: "ok", extra: "inconnu" }],
      }),
    ).rejects.toThrow();
    await expect(
      s.createSkillArticle(ORG, ADMIN, {
        sectionId: sec.id,
        title: "Bloqué 3",
        blocks: [{ type: "iframe", src: "https://x" }],
      }),
    ).rejects.toThrow();
    await expect(
      s.createSkillArticle(ORG, ADMIN, {
        sectionId: sec.id,
        title: "Bloqué 4",
        blocks: [{ type: "paragraph", text: "javascript:alert(1)" }],
      }),
    ).rejects.toThrow();
  });

  it("contrat Zod : chaque type de bloc valide passe, tailles bornées", () => {
    const blocks = [
      { type: "heading", level: 2, text: "Titre" },
      { type: "paragraph", text: "Texte." },
      { type: "list", ordered: true, items: ["a", "b"] },
      { type: "callout", tone: "warning", title: "Attention", text: "Encadré" },
      {
        type: "example",
        label: "Dialogue",
        lines: [{ speaker: "TELEPRO", text: "Bonjour !" }],
      },
      { type: "keyIdea", text: "À retenir." },
    ];
    expect(SkillArticleContentSchema.safeParse(blocks).success).toBe(true);
    expect(
      SkillBlockSchema.safeParse({
        type: "list",
        items: Array.from({ length: 13 }, (_, i) => `item ${i}`),
      }).success,
    ).toBe(false);
    expect(
      SkillArticleContentSchema.safeParse(
        Array.from({ length: 41 }, () => ({ type: "keyIdea", text: "x" })),
      ).success,
    ).toBe(false);
    expect(SkillKeySchema.safeParse("decouverte").success).toBe(true);
    expect(SkillKeySchema.safeParse("<script>").success).toBe(false);
  });
});

describe("cycle de vie", () => {
  it("modification DRAFT ok ; PUBLISHED et ARCHIVED refusés (409)", async () => {
    const s = await svc();
    const { cat, sec, art } = await seedPublishedChain();
    await expect(
      s.updateSkillArticle(art.id, ORG, ADMIN, { title: "Nouveau titre" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      s.updateSkillCategory(cat.id, ORG, ADMIN, { name: "Xy" }),
    ).rejects.toMatchObject({ status: 409 });

    // Retour explicite en DRAFT → modifiable.
    await s.unpublishSkillArticle(art.id, ORG, ADMIN);
    const updated = await s.updateSkillArticle(art.id, ORG, ADMIN, {
      title: "Nouveau titre",
    });
    expect(updated.title).toBe("Nouveau titre");

    await s.archiveSkillSection(sec.id, ORG, ADMIN);
    await expect(
      s.updateSkillSection(sec.id, ORG, ADMIN, { name: "Xy" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("publier exige les parents publiés et au moins un bloc valide", async () => {
    const s = await svc();
    const cat = await s.createSkillCategory(ORG, ADMIN, { name: "Cat" });
    const sec = await s.createSkillSection(ORG, ADMIN, {
      categoryId: cat.id,
      name: "Sec",
    });
    const vide = await s.createSkillArticle(ORG, ADMIN, {
      sectionId: sec.id,
      title: "Sans bloc",
    });

    // section avant catégorie → 409
    await expect(
      s.publishSkillSection(sec.id, ORG, ADMIN),
    ).rejects.toMatchObject({ status: 409 });
    // article avant parents → 409
    await expect(
      s.publishSkillArticle(vide.id, ORG, ADMIN),
    ).rejects.toMatchObject({ status: 409 });

    await s.publishSkillCategory(cat.id, ORG, ADMIN);
    await s.publishSkillSection(sec.id, ORG, ADMIN);
    // article sans bloc → 409
    await expect(
      s.publishSkillArticle(vide.id, ORG, ADMIN),
    ).rejects.toMatchObject({ status: 409 });

    await s.updateSkillArticle(vide.id, ORG, ADMIN, {
      blocks: [{ type: "keyIdea", text: "Un bloc valide." }],
    });
    const published = await s.publishSkillArticle(vide.id, ORG, ADMIN);
    expect(published.status).toBe("PUBLISHED");
  });

  it("dépublier un parent ne réécrit pas le statut des enfants", async () => {
    const s = await svc();
    const { cat, sec, art } = await seedPublishedChain();
    await s.unpublishSkillCategory(cat.id, ORG, ADMIN);
    const secAfter = await s.getSkillSection(sec.id, ORG);
    const artAfter = await s.getSkillArticle(art.id, ORG);
    expect(secAfter.status).toBe("PUBLISHED");
    expect(artAfter.status).toBe("PUBLISHED");
  });

  it("archive non destructive : les enfants restent en base", async () => {
    const s = await svc();
    const { cat, sec, art } = await seedPublishedChain();
    await s.archiveSkillCategory(cat.id, ORG, ADMIN);
    const catAfter = await s.getSkillCategory(cat.id, ORG);
    expect(catAfter.status).toBe("ARCHIVED");
    expect((await s.getSkillSection(sec.id, ORG)).status).toBe("PUBLISHED");
    expect((await s.getSkillArticle(art.id, ORG)).status).toBe("PUBLISHED");
    // double archive → 409 (pas de faux succès)
    await expect(
      s.archiveSkillCategory(cat.id, ORG, ADMIN),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("suppression DRAFT", () => {
  it("supprime un article DRAFT et ses mappings ; refuse un publié", async () => {
    const s = await svc();
    const cat = await s.createSkillCategory(ORG, ADMIN, { name: "Cat" });
    const sec = await s.createSkillSection(ORG, ADMIN, {
      categoryId: cat.id,
      name: "Sec",
    });
    const art = await s.createSkillArticle(ORG, ADMIN, {
      sectionId: sec.id,
      title: "Brouillon",
      skillKeys: ["cle-a", "cle-b"],
    });
    expect(mappings).toHaveLength(2);
    await s.deleteSkillArticle(art.id, ORG, ADMIN);
    expect(mappings).toHaveLength(0);
    expect(articles).toHaveLength(0);

    const { art: published } = await seedPublishedChain();
    await expect(
      s.deleteSkillArticle(published.id, ORG, ADMIN),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuse catégorie avec section et section avec article", async () => {
    const s = await svc();
    const cat = await s.createSkillCategory(ORG, ADMIN, { name: "Cat" });
    const sec = await s.createSkillSection(ORG, ADMIN, {
      categoryId: cat.id,
      name: "Sec",
    });
    await s.createSkillArticle(ORG, ADMIN, {
      sectionId: sec.id,
      title: "Fiche",
    });
    await expect(
      s.deleteSkillCategory(cat.id, ORG, ADMIN),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      s.deleteSkillSection(sec.id, ORG, ADMIN),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("mappings de compétences", () => {
  it("ajoute, remplace puis vide les mappings", async () => {
    const s = await svc();
    const cat = await s.createSkillCategory(ORG, ADMIN, { name: "Cat" });
    const sec = await s.createSkillSection(ORG, ADMIN, {
      categoryId: cat.id,
      name: "Sec",
    });
    const art = await s.createSkillArticle(ORG, ADMIN, {
      sectionId: sec.id,
      title: "Fiche",
      skillKeys: ["ecoute", "decouverte"],
    });
    expect(art.skillKeys).toEqual(["decouverte", "ecoute"]);

    const replaced = await s.updateSkillArticle(art.id, ORG, ADMIN, {
      skillKeys: ["closing"],
    });
    expect(replaced.skillKeys).toEqual(["closing"]);

    // tableau vide = effacement réel
    const cleared = await s.updateSkillArticle(art.id, ORG, ADMIN, {
      skillKeys: [],
    });
    expect(cleared.skillKeys).toEqual([]);
    expect(mappings).toHaveLength(0);
  });

  it("rollback transactionnel : échec mapping → article inchangé", async () => {
    const s = await svc();
    const cat = await s.createSkillCategory(ORG, ADMIN, { name: "Cat" });
    const sec = await s.createSkillSection(ORG, ADMIN, {
      categoryId: cat.id,
      name: "Sec",
    });
    const art = await s.createSkillArticle(ORG, ADMIN, {
      sectionId: sec.id,
      title: "Avant",
      skillKeys: ["initial"],
    });
    failNextMappingCreate = true;
    await expect(
      s.updateSkillArticle(art.id, ORG, ADMIN, {
        title: "Après",
        skillKeys: ["nouvelle"],
      }),
    ).rejects.toThrow(/Panne simulée/);
    const after = await s.getSkillArticle(art.id, ORG);
    expect(after.title).toBe("Avant");
    expect(after.skillKeys).toEqual(["initial"]);
  });
});

describe("contrats de sortie", () => {
  it("l'arbre ne contient jamais les blocs (content)", async () => {
    const s = await svc();
    await seedPublishedChain();
    const tree = await s.listSkillsTree(ORG);
    expect(tree).toHaveLength(1);
    const flat = JSON.stringify(tree);
    expect(flat).not.toContain("Un contenu utile");
    const article = tree[0]!.sections[0]!.articles[0]!;
    expect(article).not.toHaveProperty("content");
    expect(article).not.toHaveProperty("blocks");
  });

  it("le détail admin expose les blocs validés", async () => {
    const s = await svc();
    const { art } = await seedPublishedChain();
    const detail = await s.getSkillArticle(art.id, ORG);
    expect(detail.blocks).toEqual([
      { type: "paragraph", text: "Un contenu utile." },
    ]);
  });

  it("audits sans corps d'article ni bloc complet", async () => {
    const s = await svc();
    await seedPublishedChain();
    expect(audits.length).toBeGreaterThan(0);
    const flat = JSON.stringify(audits);
    expect(flat).not.toContain("Un contenu utile");
    expect(
      audits.some((a) => a.action === "SKILL_ARTICLE_PUBLISH"),
    ).toBe(true);
  });

  it("aucun fetch réseau ni OpenAI dans le service", () => {
    const src = readFileSync(
      path.resolve("src/lib/skillsAdminService.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/fetch\s*\(/);
    expect(src).not.toMatch(/openai/i);
    expect(src).not.toMatch(/ringover/i);
  });
});

describe("migration SQL — syntaxe et intégrité multi-tenant", () => {
  const migrationPath = path.resolve(
    process.cwd(),
    "prisma/migrations/20260802100000_skills_library/migration.sql",
  );
  const schemaPath = path.resolve(process.cwd(), "prisma/schema.prisma");
  const migrationSql = readFileSync(migrationPath, "utf8");

  it("lit le fichier de migration réel et refuse les tokens SQL collés", () => {
    // Preuve que le test lit bien le SQL du dépôt (pas un stub).
    expect(migrationSql).toContain('CREATE TABLE "SkillCategory"');
    expect(migrationSql).toContain('CREATE TABLE "SkillArticleMapping"');
    // Anti-faux-vert : séparations de tokens obligatoires (casse sensible).
    expect(migrationSql).not.toMatch(/\)REFERENCES\b/);
    expect(migrationSql).not.toMatch(/\bON"/);

    const executable = migrationSql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    const alterLines = executable
      .split("\n")
      .filter((line) => line.includes("REFERENCES"));
    expect(alterLines.length).toBeGreaterThanOrEqual(8);
    for (const line of alterLines) {
      expect(line).toMatch(/\)\s+REFERENCES\s+/);
    }
  });

  it("contraintes composites multi-tenant présentes dans la migration", () => {
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "SkillCategory_id_organizationId_key" ON "SkillCategory"("id", "organizationId")',
    );
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "SkillSection_id_organizationId_key"',
    );
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "SkillSection_id_organizationId_categoryId_key"',
    );
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX "SkillArticle_id_organizationId_key"',
    );
    expect(migrationSql).toContain(
      'FOREIGN KEY ("categoryId", "organizationId") REFERENCES "SkillCategory"("id", "organizationId")',
    );
    expect(migrationSql).toContain(
      'FOREIGN KEY ("sectionId", "organizationId", "categoryId") REFERENCES "SkillSection"("id", "organizationId", "categoryId")',
    );
    expect(migrationSql).toContain(
      'FOREIGN KEY ("articleId", "organizationId") REFERENCES "SkillArticle"("id", "organizationId")',
    );
    expect(migrationSql).toContain(
      'FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE',
    );
    // Plus de FK parent simples susceptibles de croiser les orgs
    expect(migrationSql).not.toContain(
      'FOREIGN KEY ("categoryId") REFERENCES "SkillCategory"("id")',
    );
    expect(migrationSql).not.toContain(
      'FOREIGN KEY ("sectionId") REFERENCES "SkillSection"("id")',
    );
    expect(migrationSql).not.toContain(
      'FOREIGN KEY ("articleId") REFERENCES "SkillArticle"("id")',
    );
  });

  it("cohérence schéma Prisma ↔ migration (relations composites)", () => {
    const schema = readFileSync(schemaPath, "utf8");

    expect(schema).toContain("@@unique([id, organizationId])");
    expect(schema).toContain("@@unique([id, organizationId, categoryId])");
    expect(schema).toContain(
      "fields: [categoryId, organizationId], references: [id, organizationId]",
    );
    expect(schema).toContain(
      "fields: [sectionId, organizationId, categoryId], references: [id, organizationId, categoryId]",
    );
    expect(schema).toContain(
      "fields: [articleId, organizationId], references: [id, organizationId]",
    );

    expect(migrationSql).toContain('"categoryId", "organizationId"');
    expect(migrationSql).toContain(
      '"sectionId", "organizationId", "categoryId"',
    );
    expect(migrationSql).toContain('"articleId", "organizationId"');
    expect(migrationSql).toContain(
      'REFERENCES "SkillCategory"("id", "organizationId")',
    );
    expect(migrationSql).toContain(
      'REFERENCES "SkillSection"("id", "organizationId", "categoryId")',
    );
    expect(migrationSql).toContain(
      'REFERENCES "SkillArticle"("id", "organizationId")',
    );
  });
});
