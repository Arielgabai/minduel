import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  filterSkillsSearch,
  parseSkillBlocks,
  type SkillsSearchEntry,
} from "@/lib/skillsContent";
import { TELEPRO_NAV_ITEMS, teleproNavHrefs } from "@/lib/teleproNav";

type CategoryRow = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  iconKey: string;
  sortOrder: number;
  status: string;
};

type SectionRow = {
  id: string;
  organizationId: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  status: string;
};

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
};

let categories: CategoryRow[] = [];
let sections: SectionRow[] = [];
let articles: ArticleRow[] = [];

function matches(row: Record<string, unknown>, where: Record<string, unknown>) {
  for (const [key, cond] of Object.entries(where)) {
    if (cond == null) continue;
    if (key === "category") {
      const cat = categories.find(
        (c) => c.id === (row as { categoryId: string }).categoryId,
      );
      if (!cat || !matches(cat, cond as Record<string, unknown>)) return false;
      continue;
    }
    if (key === "section") {
      const sec = sections.find(
        (s) => s.id === (row as { sectionId: string }).sectionId,
      );
      if (!sec || !matches(sec, cond as Record<string, unknown>)) return false;
      continue;
    }
    if (typeof cond === "object" && !Array.isArray(cond)) {
      const c = cond as { in?: unknown[] };
      if ("in" in c && !(c.in ?? []).includes(row[key])) return false;
      continue;
    }
    if (row[key] !== cond) return false;
  }
  return true;
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
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv));
    }
    return 0;
  });
}

function applySelect(
  row: Record<string, unknown>,
  select?: Record<string, unknown>,
): Record<string, unknown> {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(select)) {
    if (!val) continue;
    if (key === "category") {
      const cat = categories.find(
        (c) => c.id === (row as { categoryId: string }).categoryId,
      );
      out.category = applySelect(
        cat as unknown as Record<string, unknown>,
        (val as { select?: Record<string, unknown> }).select,
      );
      continue;
    }
    if (key === "section") {
      const sec = sections.find(
        (s) => s.id === (row as { sectionId: string }).sectionId,
      );
      out.section = applySelect(
        sec as unknown as Record<string, unknown>,
        (val as { select?: Record<string, unknown> }).select,
      );
      continue;
    }
    out[key] = row[key];
  }
  return out;
}

vi.mock("@/lib/db", () => ({
  prisma: {
    skillCategory: {
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
    },
    skillSection: {
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
    },
    skillArticle: {
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
      findFirst: async ({
        where,
        select,
      }: {
        where: Record<string, unknown>;
        select?: Record<string, unknown>;
      }) => {
        const found = articles.find((a) => matches(a, where)) ?? null;
        return found ? applySelect(found, select) : null;
      },
    },
  },
}));

const ORG = "org1";
const OTHER_ORG = "org2";
const TELEPRO = "tel1";

let seq = 0;
function uid(p: string) {
  return `${p}-${++seq}`;
}

function addCategory(over: Partial<CategoryRow> = {}): CategoryRow {
  const row: CategoryRow = {
    id: uid("cat"),
    organizationId: ORG,
    name: "Catégorie",
    slug: `cat-${seq}`,
    description: null,
    iconKey: "book",
    sortOrder: 0,
    status: "PUBLISHED",
    ...over,
  };
  categories.push(row);
  return row;
}

function addSection(
  categoryId: string,
  over: Partial<SectionRow> = {},
): SectionRow {
  const row: SectionRow = {
    id: uid("sec"),
    organizationId: ORG,
    categoryId,
    name: "Section",
    slug: `sec-${seq}`,
    description: null,
    sortOrder: 0,
    status: "PUBLISHED",
    ...over,
  };
  sections.push(row);
  return row;
}

function addArticle(
  categoryId: string,
  sectionId: string,
  over: Partial<ArticleRow> = {},
): ArticleRow {
  const row: ArticleRow = {
    id: uid("art"),
    organizationId: ORG,
    categoryId,
    sectionId,
    title: "Article",
    slug: `art-${seq}`,
    summary: null,
    tags: null,
    readingMinutes: 3,
    sortOrder: 0,
    status: "PUBLISHED",
    content: JSON.stringify([{ type: "paragraph", text: "Contenu." }]),
    ...over,
  };
  articles.push(row);
  return row;
}

beforeEach(() => {
  categories = [];
  sections = [];
  articles = [];
  seq = 0;
  vi.clearAllMocks();
});

async function svc() {
  return import("@/lib/skillsTeleproService");
}

describe("visibilité : hiérarchie entièrement publiée uniquement", () => {
  it("un parent DRAFT ou ARCHIVED masque ses descendants", async () => {
    const s = await svc();
    const draftCat = addCategory({ status: "DRAFT", name: "Brouillon" });
    const draftSec = addSection(draftCat.id);
    addArticle(draftCat.id, draftSec.id, { title: "Invisible" });

    const pubCat = addCategory({ name: "Visible", slug: "visible" });
    const archSec = addSection(pubCat.id, { status: "ARCHIVED" });
    addArticle(pubCat.id, archSec.id, { title: "Masqué aussi" });
    const pubSec = addSection(pubCat.id, { slug: "ouverte" });
    addArticle(pubCat.id, pubSec.id, { title: "Lisible", slug: "lisible" });
    addArticle(pubCat.id, pubSec.id, {
      title: "Brouillon article",
      status: "DRAFT",
    });

    const lib = await s.loadSkillsLibrary(TELEPRO, ORG);
    expect(lib.categories).toHaveLength(1);
    expect(lib.categories[0]!.name).toBe("Visible");
    expect(lib.categories[0]!.sectionCount).toBe(1);
    expect(lib.categories[0]!.articleCount).toBe(1);
    expect(lib.searchIndex.map((e) => e.title)).toEqual(["Lisible"]);
  });

  it("état vide : aucune catégorie publiée", async () => {
    const s = await svc();
    addCategory({ status: "DRAFT" });
    const lib = await s.loadSkillsLibrary(TELEPRO, ORG);
    expect(lib.categories).toEqual([]);
    expect(lib.searchIndex).toEqual([]);
  });

  it("isolation organisation sur la bibliothèque", async () => {
    const s = await svc();
    const cat = addCategory({ organizationId: OTHER_ORG });
    const sec = addSection(cat.id, { organizationId: OTHER_ORG });
    addArticle(cat.id, sec.id, { organizationId: OTHER_ORG });
    const lib = await s.loadSkillsLibrary(TELEPRO, ORG);
    expect(lib.categories).toEqual([]);
  });
});

describe("ordre stable et compteurs réels", () => {
  it("trie par sortOrder puis nom/titre", async () => {
    const s = await svc();
    addCategory({ name: "Zêta", sortOrder: 1, slug: "zeta" });
    addCategory({ name: "Alpha", sortOrder: 1, slug: "alpha" });
    addCategory({ name: "Oméga", sortOrder: 0, slug: "omega" });
    const lib = await s.loadSkillsLibrary(TELEPRO, ORG);
    expect(lib.categories.map((c) => c.name)).toEqual([
      "Oméga",
      "Alpha",
      "Zêta",
    ]);
  });

  it("vue catégorie : sections ordonnées, articles ordonnés par section", async () => {
    const s = await svc();
    const cat = addCategory({ slug: "decouverte", name: "Découverte" });
    const secB = addSection(cat.id, { name: "B", sortOrder: 2, slug: "b" });
    const secA = addSection(cat.id, { name: "A", sortOrder: 1, slug: "a" });
    addArticle(cat.id, secB.id, { title: "B2", sortOrder: 2 });
    addArticle(cat.id, secB.id, { title: "B1", sortOrder: 1 });
    addArticle(cat.id, secA.id, { title: "A1" });

    const view = await s.loadSkillsCategoryView(TELEPRO, ORG, "decouverte");
    expect(view).not.toBeNull();
    expect(view!.sections.map((x) => x.name)).toEqual(["A", "B"]);
    expect(view!.sections[1]!.articles.map((a) => a.title)).toEqual([
      "B1",
      "B2",
    ]);
  });

  it("404 (null) pour une catégorie brouillon, archivée ou hors org", async () => {
    const s = await svc();
    addCategory({ slug: "draft-cat", status: "DRAFT" });
    addCategory({ slug: "arch-cat", status: "ARCHIVED" });
    addCategory({ slug: "autre-org", organizationId: OTHER_ORG });
    expect(await s.loadSkillsCategoryView(TELEPRO, ORG, "draft-cat")).toBeNull();
    expect(await s.loadSkillsCategoryView(TELEPRO, ORG, "arch-cat")).toBeNull();
    expect(await s.loadSkillsCategoryView(TELEPRO, ORG, "autre-org")).toBeNull();
    expect(await s.loadSkillsCategoryView(TELEPRO, ORG, "inconnue")).toBeNull();
  });
});

describe("vue article", () => {
  it("retourne les blocs validés pour une chaîne publiée", async () => {
    const s = await svc();
    const cat = addCategory({ slug: "objections", name: "Objections" });
    const sec = addSection(cat.id, { name: "Prix" });
    addArticle(cat.id, sec.id, {
      slug: "reciprocite",
      title: "Réciprocité",
      tags: JSON.stringify(["closing", "influence"]),
      content: JSON.stringify([
        { type: "heading", level: 2, text: "Principe" },
        { type: "paragraph", text: "Donner avant de demander." },
        { type: "list", ordered: false, items: ["Un", "Deux"] },
        { type: "callout", tone: "info", text: "Encadré." },
        {
          type: "example",
          lines: [{ speaker: "TELEPRO", text: "Bonjour." }],
        },
        { type: "keyIdea", text: "À retenir." },
      ]),
    });

    const view = await s.loadSkillsArticleView(
      TELEPRO,
      ORG,
      "objections",
      "reciprocite",
    );
    expect(view).not.toBeNull();
    expect(view!.blocks).toHaveLength(6);
    expect(view!.tags).toEqual(["closing", "influence"]);
    expect(view!.categoryName).toBe("Objections");
    expect(view!.sectionName).toBe("Prix");
  });

  it("null si article masqué, mauvaise catégorie ou hors org", async () => {
    const s = await svc();
    const cat = addCategory({ slug: "cat-pub" });
    const sec = addSection(cat.id);
    addArticle(cat.id, sec.id, { slug: "draft-art", status: "DRAFT" });
    addArticle(cat.id, sec.id, { slug: "arch-art", status: "ARCHIVED" });
    const secDraft = addSection(cat.id, { status: "DRAFT" });
    addArticle(cat.id, secDraft.id, { slug: "sous-section-draft" });
    addArticle(cat.id, sec.id, { slug: "ok-art" });

    expect(
      await s.loadSkillsArticleView(TELEPRO, ORG, "cat-pub", "draft-art"),
    ).toBeNull();
    expect(
      await s.loadSkillsArticleView(TELEPRO, ORG, "cat-pub", "arch-art"),
    ).toBeNull();
    expect(
      await s.loadSkillsArticleView(
        TELEPRO,
        ORG,
        "cat-pub",
        "sous-section-draft",
      ),
    ).toBeNull();
    expect(
      await s.loadSkillsArticleView(TELEPRO, ORG, "autre-slug", "ok-art"),
    ).toBeNull();
    expect(
      await s.loadSkillsArticleView(TELEPRO, OTHER_ORG, "cat-pub", "ok-art"),
    ).toBeNull();
    expect(
      await s.loadSkillsArticleView(TELEPRO, ORG, "cat-pub", "ok-art"),
    ).not.toBeNull();
  });

  it("contenu stocké invalide (HTML / type inconnu) → aucun bloc rendu", async () => {
    const s = await svc();
    const cat = addCategory({ slug: "cat-x" });
    const sec = addSection(cat.id);
    addArticle(cat.id, sec.id, {
      slug: "corrompu",
      content: JSON.stringify([
        { type: "paragraph", text: "<script>alert(1)</script>" },
      ]),
    });
    const view = await s.loadSkillsArticleView(TELEPRO, ORG, "cat-x", "corrompu");
    expect(view).not.toBeNull();
    expect(view!.blocks).toEqual([]);

    expect(parseSkillBlocks("pas du json")).toEqual([]);
    expect(
      parseSkillBlocks(JSON.stringify([{ type: "iframe", src: "x" }])),
    ).toEqual([]);
    expect(
      parseSkillBlocks(JSON.stringify([{ type: "keyIdea", text: "ok" }])),
    ).toEqual([{ type: "keyIdea", text: "ok" }]);
  });
});

describe("recherche", () => {
  const index: SkillsSearchEntry[] = [
    {
      title: "Poser les bonnes questions",
      summary: "Découverte efficace",
      tags: ["ecoute"],
      categoryName: "Découverte",
      categorySlug: "decouverte",
      articleSlug: "questions",
      readingMinutes: 4,
    },
    {
      title: "La ligne droite",
      summary: null,
      tags: ["closing"],
      categoryName: "Closing",
      categorySlug: "closing",
      articleSlug: "ligne-droite",
      readingMinutes: 6,
    },
  ];

  it("filtre sur titre, résumé et tags, insensible à la casse", () => {
    expect(filterSkillsSearch(index, "QUESTIONS")).toHaveLength(1);
    expect(filterSkillsSearch(index, "efficace")).toHaveLength(1);
    expect(filterSkillsSearch(index, "closing")).toHaveLength(1);
    expect(filterSkillsSearch(index, "introuvable")).toHaveLength(0);
    expect(filterSkillsSearch(index, "  ")).toHaveLength(0);
  });
});

describe("sécurité du rendu et du shell", () => {
  const LOT_FILES = [
    "src/lib/skillsTeleproService.ts",
    "src/lib/skillsContent.ts",
    "src/components/SkillBlocks.tsx",
    "src/app/app/skills/page.tsx",
    "src/app/app/skills/SkillsLibraryClient.tsx",
    "src/app/app/skills/[categorySlug]/page.tsx",
    "src/app/app/skills/[categorySlug]/[articleSlug]/page.tsx",
  ];

  it("aucun dangerouslySetInnerHTML, prompt, artifact, hash ni secret", () => {
    for (const rel of LOT_FILES) {
      const src = readFileSync(path.resolve(rel), "utf8");
      expect(src).not.toContain("dangerouslySetInnerHTML");
      for (const needle of [
        "artifacts",
        "contentHash",
        "PROSPECT_PERSONA",
        "EVALUATION_SYSTEM",
        "promptBundle",
        "secretInfos",
        "openai",
        "ringover",
      ]) {
        expect(src.toLowerCase()).not.toContain(needle.toLowerCase());
      }
    }
  });

  it("pages Skills : requireTelepro + export default uniquement", () => {
    for (const rel of [
      "src/app/app/skills/page.tsx",
      "src/app/app/skills/[categorySlug]/page.tsx",
      "src/app/app/skills/[categorySlug]/[articleSlug]/page.tsx",
    ]) {
      const src = readFileSync(path.resolve(rel), "utf8");
      expect(src).toContain("requireTelepro");
      const exports = src.match(/^export\s+(?!default)/gm) ?? [];
      expect(exports).toEqual([]);
      expect(src).toMatch(/export\s+default\s+async\s+function/);
    }
  });

  it("shell H inchangé : cinq destinations et hrefs stables", () => {
    expect(TELEPRO_NAV_ITEMS).toHaveLength(5);
    expect(teleproNavHrefs()).toEqual([
      "/app",
      "/app/missions",
      "/app/skills",
      "/app/progression",
      "/app/profile",
    ]);
  });

  it("service télépro : selects minimaux, aucun fetch", () => {
    const src = readFileSync(
      path.resolve("src/lib/skillsTeleproService.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/fetch\s*\(/);
    expect(src).toContain("organizationId");
    expect(src).toContain('status: PUBLISHED');
  });
});
