import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  applySlugManualChange,
  applyTitleChange,
  blocksForPreview,
  buildArticleCreatePayload,
  buildArticlePayload,
  buildSkillsWizardSteps,
  canPublishArticle,
  createEmptyArticleForm,
  emptyBlock,
  evaluatePublishPrerequisites,
  formatDraftSavedPublishFailed,
  hasSignificantBlocks,
  parentBlocksPublication,
  payloadContainsDemoText,
  rememberPersistedArticleId,
  resolveArticleSaveMethod,
  resolveArticleSaveUrl,
  resolveSkillsApplySync,
  shouldConfirmDiscard,
  shouldKeepConfirmPanel,
  validateArticleDraft,
} from "@/lib/adminSkillsUi";

function read(rel: string) {
  return readFileSync(path.resolve(rel), "utf8");
}

describe("LOT N3 — parcours guidé et identité article", () => {
  const page = read("src/app/admin/skills/page.tsx");

  it("état vide → CTA première catégorie", () => {
    expect(page).toContain("Créer ma première catégorie");
  });

  it("page uniquement export default", () => {
    expect(page).toMatch(/export\s+default\s+function/);
    expect([...page.matchAll(/^export (?!default)/gm)]).toHaveLength(0);
  });

  it("persistedArticleId hors formulaire + POST puis PATCH", () => {
    expect(page).toContain("persistedArticleId");
    expect(page).toContain("resolveArticleSaveMethod");
    expect(page).toContain("resolveArticleSaveUrl");
    expect(page).toContain("rememberPersistedArticleId");
  });

  it("premier save → POST ; second → PATCH", () => {
    expect(resolveArticleSaveMethod(null)).toBe("POST");
    expect(resolveArticleSaveUrl(null)).toBe("/api/admin/skills");
    expect(resolveArticleSaveMethod("art-1")).toBe("PATCH");
    expect(resolveArticleSaveUrl("art-1")).toBe("/api/admin/skills/art-1");
  });

  it("ID mémorisé ; échec publication ne perd pas l'identité", () => {
    expect(rememberPersistedArticleId(null, "new-id")).toBe("new-id");
    expect(rememberPersistedArticleId("kept", "other")).toBe("kept");
    expect(rememberPersistedArticleId("kept", undefined)).toBe("kept");
  });

  it("message brouillon enregistré / publication échouée", () => {
    expect(formatDraftSavedPublishFailed("409 conflit")).toContain(
      "Le brouillon a été enregistré, mais la publication a échoué",
    );
    expect(page).toContain("formatDraftSavedPublishFailed");
  });

  it("Enregistrer le brouillon + Enregistrer et publier", () => {
    expect(page).toContain("Enregistrer le brouillon");
    expect(page).toContain("Enregistrer et publier");
  });

  it("premier bloc paragraphe vide ; aucun texte de démo", () => {
    const form = createEmptyArticleForm();
    expect(form.blocks).toHaveLength(1);
    expect(form.blocks[0]!.type).toBe("paragraph");
    expect((form.blocks[0] as { text: string }).text).toBe("");
    const payload = buildArticlePayload(form);
    expect(payload.blocks).toEqual([]);
    expect(payloadContainsDemoText(payload)).toBe(false);
    expect(page).toContain("createEmptyArticleForm");
  });

  it("slug automatique puis manuel jamais écrasé", () => {
    let form = createEmptyArticleForm();
    form = applyTitleChange(form, "Poser les bonnes questions", false);
    expect(form.slug).toBe("poser-les-bonnes-questions");
    const manual = applySlugManualChange(form, "mon-slug");
    expect(manual.slugManual).toBe(true);
    form = applyTitleChange(manual.form, "Autre titre", manual.slugManual);
    expect(form.slug).toBe("mon-slug");
  });

  it("create payload inclut sectionId sans id article", () => {
    const form = createEmptyArticleForm();
    form.title = "Titre OK";
    form.slug = "titre-ok";
    const payload = buildArticleCreatePayload(form, "sec-1");
    expect(payload.sectionId).toBe("sec-1");
    expect(payload).not.toHaveProperty("id");
  });
});

describe("LOT N3 — prérequis publication et isolation", () => {
  it("parent DRAFT bloque seulement la publication", () => {
    const prereqs = evaluatePublishPrerequisites({
      categorySelected: true,
      categoryStatus: "DRAFT",
      sectionSelected: true,
      sectionStatus: "PUBLISHED",
      title: "Titre valide",
      slug: "titre-valide",
      blocks: [{ type: "paragraph", text: "Contenu réel." }],
    });
    expect(canPublishArticle(prereqs)).toBe(false);
    expect(parentBlocksPublication("DRAFT", "PUBLISHED").blocked).toBe(true);
    expect(validateArticleDraft(createEmptyArticleForm())).toContain("titre");
    const draftOk = createEmptyArticleForm();
    draftOk.title = "OK";
    draftOk.slug = "ok-slug";
    expect(validateArticleDraft(draftOk)).toBeNull();
  });

  it("parent ARCHIVED bloque publication", () => {
    expect(parentBlocksPublication("ARCHIVED", "PUBLISHED").blocked).toBe(true);
    expect(parentBlocksPublication("PUBLISHED", "ARCHIVED").blocked).toBe(true);
  });

  it("parents jamais publiés automatiquement (source)", () => {
    const page = read("src/app/admin/skills/page.tsx");
    expect(page).not.toMatch(
      /action:\s*"publish"[\s\S]{0,80}entity:\s*"category"/,
    );
    expect(page).toContain("parentBlocksPublication");
  });

  it("isolation apply catégorie/section/article", () => {
    expect(resolveSkillsApplySync("saveCategory").syncArticleForm).toBe(false);
    expect(resolveSkillsApplySync("saveSection").syncArticleForm).toBe(false);
    expect(resolveSkillsApplySync("saveArticle").syncCategoryForm).toBe(false);
    expect(resolveSkillsApplySync("refreshTree").syncArticleForm).toBe(false);
  });

  it("confirmation avant abandon + panneau confirm conservé", () => {
    expect(shouldConfirmDiscard(true, true)).toBe(true);
    expect(shouldConfirmDiscard(false, true)).toBe(false);
    expect(shouldKeepConfirmPanel(false)).toBe(true);
    expect(shouldKeepConfirmPanel(true)).toBe(false);
    const page = read("src/app/admin/skills/page.tsx");
    expect(page).toContain("shouldConfirmDiscard");
    expect(page).toContain("shouldKeepConfirmPanel");
  });

  it("wizard étapes", () => {
    const steps = buildSkillsWizardSteps({
      hasCategory: false,
      hasSection: false,
      hasArticle: false,
      hasContent: false,
      isPublished: false,
      focus: "empty",
    });
    expect(steps).toHaveLength(5);
    expect(steps[0]!.label).toBe("Catégorie");
    expect(steps[0]!.current).toBe(true);
  });
});

describe("LOT N3 — aperçu et SkillBlocks", () => {
  it("aperçu local sans fetch ; utilise SkillBlocks", () => {
    const page = read("src/app/admin/skills/page.tsx");
    expect(page).toContain("Aperçu télépro");
    expect(page).toContain("SkillBlocks");
    expect(page).toContain("blocksForPreview");
    expect(page).not.toMatch(/Aperçu télépro[\s\S]{0,200}fetch\(/);
  });

  it("blocksForPreview ignore les vides", () => {
    expect(
      blocksForPreview([
        emptyBlock("paragraph"),
        { type: "paragraph", text: "Visible" },
      ]),
    ).toEqual([{ type: "paragraph", text: "Visible" }]);
    expect(hasSignificantBlocks([emptyBlock("paragraph")])).toBe(false);
  });

  it("aucun dangerouslySetInnerHTML ; blocs défensifs", () => {
    const blocks = read("src/components/SkillBlocks.tsx");
    expect(blocks).not.toContain("dangerouslySetInnerHTML");
    expect(blocks).toContain("whitespace-pre-line");
    expect(blocks).toContain("isKnownType");
    const page = read("src/app/admin/skills/page.tsx");
    expect(page).not.toContain("dangerouslySetInnerHTML");
  });
});

describe("LOT N3 — télépro et sécurité source", () => {
  it("admin PLATFORM_ADMIN ; télépro PUBLISHED", () => {
    const adminRoute = read("src/app/api/admin/skills/route.ts");
    expect(adminRoute).toContain("requirePlatformAdmin");
    const telepro = read("src/lib/skillsTeleproService.ts");
    expect(telepro).toContain("PUBLISHED");
    expect(telepro).toContain("organizationId");
  });

  it("empty states télépro + padding nav", () => {
    const lib = read("src/app/app/skills/page.tsx");
    expect(lib).toContain("Aucun contenu Skills publié");
    expect(lib).toContain("pb-24");
    const article = read(
      "src/app/app/skills/[categorySlug]/[articleSlug]/page.tsx",
    );
    expect(article).toContain("pb-28");
    expect(article).toContain("SkillBlocks");
  });

  it("navigation basse N2 non modifiée", () => {
    const nav = read("src/components/TeleproNav.tsx");
    const items = read("src/lib/teleproNav.ts");
    expect(nav).toContain("TELEPRO_NAV_ITEMS");
    expect(items).toContain("Skills");
    expect(items).toContain("/app/skills");
  });

  it("!res.ok traité dans la page admin", () => {
    const page = read("src/app/admin/skills/page.tsx");
    const occurrences = page.match(/!res\.ok/g) ?? [];
    expect(occurrences.length).toBeGreaterThan(4);
  });
});
