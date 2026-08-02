import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildArticlePayload,
  buildCategoryPayload,
  buildSectionPayload,
  emptyBlock,
  isSkillArchivedReadOnly,
  isSkillEditable,
  joinListInput,
  moveItem,
  normalizeOptionalText,
  parseListInput,
  removeItem,
  replaceItem,
  requiresConfirmation,
  sanitizeBlocksForSave,
  shouldCloseEditorAfterResponse,
  skillStatusTone,
} from "@/lib/adminSkillsUi";
import {
  SKILL_BLOCK_TYPES,
  SkillBlockSchema,
  type SkillBlock,
} from "@/lib/skillsContent";

function read(rel: string) {
  return readFileSync(path.resolve(rel), "utf8");
}

describe("helpers purs — listes et textes", () => {
  it("parseListInput découpe, nettoie, déduplique ; vide → []", () => {
    expect(parseListInput("a, b\nc")).toEqual(["a", "b", "c"]);
    expect(parseListInput("  x  \n\n x , y ")).toEqual(["x", "y"]);
    expect(parseListInput("")).toEqual([]);
    expect(parseListInput("  \n , ")).toEqual([]);
    expect(joinListInput(["a", "b"])).toBe("a\nb");
  });

  it("normalizeOptionalText : '' → null, texte conservé", () => {
    expect(normalizeOptionalText("")).toBeNull();
    expect(normalizeOptionalText("   ")).toBeNull();
    expect(normalizeOptionalText(" gardé ")).toBe("gardé");
  });

  it("moveItem / removeItem / replaceItem sans effet de bord", () => {
    const arr = ["a", "b", "c"];
    expect(moveItem(arr, 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(arr, 2, 1)).toEqual(["a", "b", "c"]);
    expect(moveItem(arr, 0, -1)).toEqual(["a", "b", "c"]);
    expect(removeItem(arr, 1)).toEqual(["a", "c"]);
    expect(replaceItem(arr, 1, "x")).toEqual(["a", "x", "c"]);
    expect(arr).toEqual(["a", "b", "c"]);
  });
});

describe("helpers purs — blocs", () => {
  it("emptyBlock produit un bloc valide pour chaque type", () => {
    for (const type of SKILL_BLOCK_TYPES) {
      const block = emptyBlock(type);
      const parsed = SkillBlockSchema.safeParse(block);
      expect(parsed.success, `bloc ${type} invalide`).toBe(true);
    }
  });

  it("sanitizeBlocksForSave retire les lignes vides et les blocs vidés", () => {
    const blocks: SkillBlock[] = [
      { type: "list", ordered: false, items: [" a ", "", "  "] },
      { type: "list", ordered: false, items: ["", " "] },
      {
        type: "example",
        lines: [
          { speaker: "TELEPRO", text: "ok" },
          { speaker: "NONE", text: "  " },
        ],
      },
      { type: "paragraph", text: "reste" },
    ];
    const out = sanitizeBlocksForSave(blocks);
    expect(out).toEqual([
      { type: "list", ordered: false, items: ["a"] },
      { type: "example", lines: [{ speaker: "TELEPRO", text: "ok" }] },
      { type: "paragraph", text: "reste" },
    ]);
  });
});

describe("payloads API", () => {
  it("article : tableaux vides envoyés (effacement réel), '' → null, slug vide omis", () => {
    const payload = buildArticlePayload({
      title: " Titre ",
      slug: "",
      summary: "",
      tagsText: "",
      skillKeysText: "",
      readingMinutes: 4,
      sortOrder: 2,
      blocks: [{ type: "paragraph", text: "ok" }],
    });
    expect(payload.title).toBe("Titre");
    expect(payload.summary).toBeNull();
    expect(payload.tags).toEqual([]);
    expect(payload.skillKeys).toEqual([]);
    expect(payload).not.toHaveProperty("slug");
    expect(payload.blocks).toEqual([{ type: "paragraph", text: "ok" }]);
  });

  it("catégorie / section : slug renseigné transmis, description vide → null", () => {
    const cat = buildCategoryPayload({
      name: "Cat",
      slug: " ma-cat ",
      description: "",
      iconKey: "mic",
      sortOrder: 1,
    });
    expect(cat.slug).toBe("ma-cat");
    expect(cat.description).toBeNull();
    const sec = buildSectionPayload({
      name: "Sec",
      slug: "",
      description: "desc",
      sortOrder: 0,
    });
    expect(sec).not.toHaveProperty("slug");
    expect(sec.description).toBe("desc");
  });
});

describe("comportements UI", () => {
  it("une erreur API ne ferme jamais l'éditeur", () => {
    expect(shouldCloseEditorAfterResponse(false)).toBe(false);
    expect(shouldCloseEditorAfterResponse(true)).toBe(true);
  });

  it("archive et suppression exigent confirmation", () => {
    expect(requiresConfirmation("archive")).toBe(true);
    expect(requiresConfirmation("delete")).toBe(true);
    expect(requiresConfirmation("publish")).toBe(false);
  });

  it("statuts : tones et lecture seule", () => {
    expect(skillStatusTone("PUBLISHED")).toBe("mint");
    expect(skillStatusTone("ARCHIVED")).toBe("red");
    expect(skillStatusTone("DRAFT")).toBe("gray");
    expect(isSkillArchivedReadOnly("ARCHIVED")).toBe(true);
    expect(isSkillArchivedReadOnly("DRAFT")).toBe(false);
    expect(isSkillEditable("DRAFT")).toBe(true);
    expect(isSkillEditable("PUBLISHED")).toBe(false);
  });
});

describe("page /admin/skills — assertions source", () => {
  const src = read("src/app/admin/skills/page.tsx");

  it("aucun export nommé (export default uniquement)", () => {
    const named = src.match(/^export\s+(?!default)/gm) ?? [];
    expect(named).toEqual([]);
    expect(src).toMatch(/export\s+default\s+function/);
  });

  it("traite toutes les réponses !res.ok avant refresh/redirect", () => {
    const occurrences = src.match(/!res\.ok/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(5);
    // le rafraîchissement de l'arbre n'est jamais déclenché sans test du statut
    expect(src).toContain("setEditorError(await readError(res))");
  });

  it("confirmation requise pour archive et suppression", () => {
    expect(src).toContain("Confirmer l'archivage ?");
    expect(src).toContain("Confirmer la suppression ?");
  });

  it("jamais de contenu dans URL/localStorage, pas de HTML, pas d'org client", () => {
    expect(src).not.toContain("localStorage");
    expect(src).not.toContain("sessionStorage");
    expect(src).not.toContain("dangerouslySetInnerHTML");
    expect(src).not.toContain("organizationId");
    expect(src).not.toMatch(/router\.push\([^)]*blocks/);
    expect(src).not.toMatch(/console\.log/);
  });

  it("ARCHIVED entièrement en lecture seule", () => {
    expect(src).toContain("isSkillArchivedReadOnly");
    expect(src).toContain("Contenu archivé : lecture seule.");
  });

  it("le layout admin expose la destination Skills", () => {
    const layout = read("src/app/admin/layout.tsx");
    expect(layout).toContain('href="/admin/skills"');
  });

  it("les listes ne chargent pas les blocs : GET arbre sans content", () => {
    const service = read("src/lib/skillsAdminService.ts");
    expect(service).toContain("ARTICLE_LIST_SELECT");
    const selectBlock = service.slice(
      service.indexOf("const ARTICLE_LIST_SELECT"),
      service.indexOf("} as const", service.indexOf("const ARTICLE_LIST_SELECT")),
    );
    expect(selectBlock).not.toContain("content");
  });
});
