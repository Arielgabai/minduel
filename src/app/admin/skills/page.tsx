"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { SkillBlocks } from "@/components/SkillBlocks";
import { Badge, Button, Card } from "@/components/ui";
import {
  SKILL_BLOCK_TYPE_LABELS,
  applySlugManualChange,
  applyTitleChange,
  articleFormFromDetail,
  blocksForPreview,
  buildArticleCreatePayload,
  buildArticlePayload,
  buildCategoryPayload,
  buildSectionPayload,
  buildSkillsWizardSteps,
  canPublishArticle,
  createEmptyArticleForm,
  emptyBlock,
  evaluatePublishPrerequisites,
  formatDraftSavedPublishFailed,
  hasSignificantBlocks,
  isSkillArchivedReadOnly,
  isSkillEditable,
  moveItem,
  parentBlocksPublication,
  rememberPersistedArticleId,
  removeItem,
  replaceItem,
  requiresConfirmation,
  resolveArticleSaveMethod,
  resolveArticleSaveUrl,
  resolveSkillsApplySync,
  resetPersistedArticleId,
  shouldConfirmDiscard,
  shouldKeepConfirmPanel,
  skillStatusTone,
  validateArticleDraft,
  type ArticleFormState,
  type CategoryFormState,
  type SectionFormState,
  type SkillArticleDetail,
  type SkillSelection,
  type SkillTreeCategory,
  type SkillTreeSection,
} from "@/lib/adminSkillsUi";
import {
  SKILL_BLOCK_TYPES,
  SKILL_ICON_KEYS,
  SKILL_STATUS_LABELS,
  type SkillBlock,
  type SkillBlockType,
} from "@/lib/skillsContent";

type CategoryDetail = SkillTreeCategory & { sectionCount: number };
type SectionDetail = SkillTreeCategory["sections"][number] & {
  articleCount: number;
};

type NewArticleCtx = {
  sectionId: string;
  categoryId: string;
  sectionName: string;
  categoryName: string;
  categoryStatus: string;
  sectionStatus: string;
};

const INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-[#1e222c] bg-[#12151d] px-3 py-2 text-sm text-white disabled:opacity-50";
const LABEL_CLASS = "block text-xs text-[#9AA1B2]";

function findCategory(
  tree: SkillTreeCategory[],
  id: string,
): SkillTreeCategory | undefined {
  return tree.find((c) => c.id === id);
}

function findSection(
  tree: SkillTreeCategory[],
  sectionId: string,
): { category: SkillTreeCategory; section: SkillTreeSection } | undefined {
  for (const category of tree) {
    const section = category.sections.find((s) => s.id === sectionId);
    if (section) return { category, section };
  }
  return undefined;
}

function findArticleContext(
  tree: SkillTreeCategory[],
  articleId: string,
): {
  category: SkillTreeCategory;
  section: SkillTreeSection;
  article: SkillTreeSection["articles"][number];
} | undefined {
  for (const category of tree) {
    for (const section of category.sections) {
      const article = section.articles.find((a) => a.id === articleId);
      if (article) return { category, section, article };
    }
  }
  return undefined;
}

async function readError(res: Response): Promise<string> {
  const json = await res.json().catch(() => null);
  return (
    json?.error?.message ??
    "Action impossible. Réessaie ou contacte un administrateur."
  );
}

export default function AdminSkillsPage() {
  const [tree, setTree] = useState<SkillTreeCategory[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);

  const [selection, setSelection] = useState<SkillSelection | null>(null);
  const [detailStatus, setDetailStatus] = useState<string>("DRAFT");
  const [detailLoading, setDetailLoading] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorNotice, setEditorNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<"archive" | "delete" | null>(
    null,
  );

  const [catForm, setCatForm] = useState<CategoryFormState | null>(null);
  const [secForm, setSecForm] = useState<SectionFormState | null>(null);
  const [artForm, setArtForm] = useState<ArticleFormState | null>(null);

  const [persistedArticleId, setPersistedArticleId] = useState<string | null>(
    null,
  );
  const [slugManual, setSlugManual] = useState(false);
  const [newArticleCtx, setNewArticleCtx] = useState<NewArticleCtx | null>(null);
  const [catDirty, setCatDirty] = useState(false);
  const [secDirty, setSecDirty] = useState(false);
  const [artDirty, setArtDirty] = useState(false);

  const [firstCatName, setFirstCatName] = useState("");
  const [firstCatBusy, setFirstCatBusy] = useState(false);
  const [firstCatError, setFirstCatError] = useState<string | null>(null);

  const [firstSecName, setFirstSecName] = useState("");
  const [firstSecBusy, setFirstSecBusy] = useState(false);
  const [firstSecError, setFirstSecError] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);

  const [createKind, setCreateKind] = useState<
    | { entity: "category" }
    | { entity: "section"; categoryId: string; categoryName: string }
    | { entity: "article"; sectionId: string; sectionName: string }
    | null
  >(null);
  const [createName, setCreateName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadTree = useCallback(async (): Promise<SkillTreeCategory[]> => {
    setTreeLoading(true);
    setTreeError(null);
    try {
      const res = await fetch("/api/admin/skills", { method: "GET" });
      if (!res.ok) {
        setTreeError(await readError(res));
        setTree([]);
        return [];
      }
      const json = await res.json().catch(() => null);
      const list = (json?.data?.tree ?? []) as SkillTreeCategory[];
      const next = Array.isArray(list) ? list : [];
      setTree(next);
      return next;
    } catch {
      setTreeError("Chargement impossible.");
      setTree([]);
      return [];
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  useEffect(() => {
    if (newArticleCtx && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [newArticleCtx]);

  function isFormDirty(): boolean {
    if (newArticleCtx && artDirty) return true;
    if (selection?.kind === "category" && catDirty) return true;
    if (selection?.kind === "section" && secDirty) return true;
    if (selection?.kind === "article" && artDirty) return true;
    return false;
  }

  function clearEditorForms() {
    setCatForm(null);
    setSecForm(null);
    setArtForm(null);
    setCatDirty(false);
    setSecDirty(false);
    setArtDirty(false);
    setSlugManual(false);
    setPersistedArticleId(resetPersistedArticleId());
    setNewArticleCtx(null);
  }

  const loadDetail = useCallback(async (sel: SkillSelection) => {
    setDetailLoading(true);
    setEditorError(null);
    setEditorNotice(null);
    setConfirming(null);
    try {
      const res = await fetch(
        `/api/admin/skills/${sel.id}?type=${sel.kind}`,
        { method: "GET" },
      );
      if (!res.ok) {
        setEditorError(await readError(res));
        if (shouldKeepConfirmPanel(false)) return;
        return;
      }
      const json = await res.json().catch(() => null);
      const data = json?.data;
      if (!data) {
        setEditorError("Chargement impossible.");
        return;
      }
      setDetailStatus(String(data.status ?? "DRAFT"));
      if (sel.kind === "category") {
        const d = data as CategoryDetail;
        setCatForm({
          name: d.name,
          slug: d.slug ?? "",
          description: d.description ?? "",
          iconKey: d.iconKey,
          sortOrder: d.sortOrder,
        });
        setCatDirty(false);
      } else if (sel.kind === "section") {
        const d = data as SectionDetail;
        setSecForm({
          name: d.name,
          slug: d.slug ?? "",
          description: d.description ?? "",
          sortOrder: d.sortOrder,
        });
        setSecDirty(false);
      } else {
        const d = data as SkillArticleDetail;
        setArtForm(articleFormFromDetail(d));
        setPersistedArticleId(d.id);
        setSlugManual(Boolean(d.slug?.trim()));
        setArtDirty(false);
      }
    } catch {
      setEditorError("Chargement impossible.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  function trySelect(sel: SkillSelection) {
    const switching =
      selection?.kind !== sel.kind ||
      selection?.id !== sel.id ||
      newArticleCtx !== null;
    if (
      shouldConfirmDiscard(isFormDirty(), switching) &&
      !window.confirm("Abandonner les modifications non enregistrées ?")
    ) {
      return;
    }
    setNewArticleCtx(null);
    setSelection(sel);
    clearEditorForms();
    void loadDetail(sel);
  }

  function startNewArticle(ctx: NewArticleCtx) {
    if (
      shouldConfirmDiscard(isFormDirty(), true) &&
      !window.confirm("Abandonner les modifications non enregistrées ?")
    ) {
      return;
    }
    setSelection(null);
    setCatForm(null);
    setSecForm(null);
    setCatDirty(false);
    setSecDirty(false);
    setEditorError(null);
    setEditorNotice(null);
    setConfirming(null);
    setDetailStatus("DRAFT");
    setDetailLoading(false);
    setArtForm(createEmptyArticleForm());
    setPersistedArticleId(resetPersistedArticleId());
    setSlugManual(false);
    setArtDirty(false);
    setNewArticleCtx(ctx);
  }

  async function createFirstCategory() {
    if (firstCatBusy || firstCatName.trim().length < 2) return;
    setFirstCatBusy(true);
    setFirstCatError(null);
    try {
      const res = await fetch("/api/admin/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "category",
          name: firstCatName.trim(),
        }),
      });
      if (!res.ok) {
        setFirstCatError(await readError(res));
        return;
      }
      const json = await res.json().catch(() => null);
      const id = json?.data?.id as string | undefined;
      setFirstCatName("");
      await loadTree();
      if (id) trySelect({ kind: "category", id });
    } catch {
      setFirstCatError("Création impossible.");
    } finally {
      setFirstCatBusy(false);
    }
  }

  async function createFirstSection(categoryId: string) {
    if (firstSecBusy || firstSecName.trim().length < 2) return;
    setFirstSecBusy(true);
    setFirstSecError(null);
    try {
      const res = await fetch("/api/admin/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "section",
          name: firstSecName.trim(),
          categoryId,
        }),
      });
      if (!res.ok) {
        setFirstSecError(await readError(res));
        return;
      }
      const json = await res.json().catch(() => null);
      const id = json?.data?.id as string | undefined;
      setFirstSecName("");
      await loadTree();
      if (id) trySelect({ kind: "section", id });
    } catch {
      setFirstSecError("Création impossible.");
    } finally {
      setFirstSecBusy(false);
    }
  }

  async function createEntity() {
    if (!createKind || createBusy) return;
    const kind = createKind;
    setCreateBusy(true);
    setCreateError(null);
    try {
      const payload: Record<string, unknown> = { entity: kind.entity };
      if (kind.entity === "category") {
        payload.name = createName.trim();
      } else if (kind.entity === "section") {
        payload.name = createName.trim();
        payload.categoryId = kind.categoryId;
      } else {
        payload.title = createName.trim();
        payload.sectionId = kind.sectionId;
      }
      const res = await fetch("/api/admin/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setCreateError(
          json?.error?.message ??
            "Création impossible. Réessaie ou contacte un administrateur.",
        );
        return;
      }
      const id = json?.data?.id as string | undefined;
      setCreateKind(null);
      setCreateName("");
      const nextTree = await loadTree();
      if (id) {
        if (kind.entity === "article") {
          const sectionCtx = findSection(
            nextTree,
            (kind as { entity: "article"; sectionId: string }).sectionId,
          );
          if (sectionCtx) {
            startNewArticle({
              sectionId: sectionCtx.section.id,
              categoryId: sectionCtx.category.id,
              sectionName: sectionCtx.section.name,
              categoryName: sectionCtx.category.name,
              categoryStatus: sectionCtx.category.status,
              sectionStatus: sectionCtx.section.status,
            });
          }
        } else {
          trySelect({ kind: kind.entity, id });
        }
      }
    } catch {
      setCreateError("Création impossible.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function saveArticleDraft(): Promise<string | null> {
    if (!artForm || busy) return null;
    const sectionId =
      newArticleCtx?.sectionId ??
      (selection?.kind === "article"
        ? findArticleContext(tree, selection.id)?.section.id
        : null);
    if (!sectionId) return null;

    const validationError = validateArticleDraft(artForm);
    if (validationError) {
      setEditorError(validationError);
      return null;
    }

    setBusy(true);
    setEditorError(null);
    setEditorNotice(null);
    try {
      const method = resolveArticleSaveMethod(persistedArticleId);
      const url = resolveArticleSaveUrl(persistedArticleId);
      const body = persistedArticleId
        ? { entity: "article", ...buildArticlePayload(artForm) }
        : {
            entity: "article",
            ...buildArticleCreatePayload(artForm, sectionId),
          };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setEditorError(await readError(res));
        return null;
      }

      const json = await res.json().catch(() => null);
      const createdId = json?.data?.id as string | undefined;
      const nextId = rememberPersistedArticleId(persistedArticleId, createdId);
      setPersistedArticleId(nextId);

      const sync = resolveSkillsApplySync("saveArticle");
      if (sync.syncTree) await loadTree();

      if (nextId) {
        if (newArticleCtx) {
          setNewArticleCtx(null);
          setSelection({ kind: "article", id: nextId });
        }
        if (sync.syncArticleForm) {
          await loadDetail({ kind: "article", id: nextId });
        }
      }

      setArtDirty(false);
      setEditorNotice("Brouillon enregistré.");
      return nextId;
    } catch {
      setEditorError("Enregistrement impossible.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveAndPublishArticle() {
    if (!artForm || busy) return;

    const articleCtx = newArticleCtx
      ? {
          categoryStatus: newArticleCtx.categoryStatus,
          sectionStatus: newArticleCtx.sectionStatus,
        }
      : selection?.kind === "article"
        ? (() => {
            const ctx = findArticleContext(tree, selection.id);
            return ctx
              ? {
                  categoryStatus: ctx.category.status,
                  sectionStatus: ctx.section.status,
                }
              : null;
          })()
        : null;

    if (!articleCtx) return;

    const parentBlock = parentBlocksPublication(
      articleCtx.categoryStatus,
      articleCtx.sectionStatus,
    );
    if (parentBlock.blocked) {
      setEditorError(parentBlock.reason ?? "Publication impossible.");
      return;
    }

    const prereqs = evaluatePublishPrerequisites({
      categorySelected: true,
      categoryStatus: articleCtx.categoryStatus,
      sectionSelected: true,
      sectionStatus: articleCtx.sectionStatus,
      title: artForm.title,
      slug: artForm.slug,
      blocks: artForm.blocks,
    });
    if (!canPublishArticle(prereqs)) {
      setEditorError("Complétez les prérequis de publication.");
      return;
    }

    const articleId = await saveArticleDraft();
    if (!articleId) return;

    setBusy(true);
    setEditorError(null);
    try {
      const res = await fetch(`/api/admin/skills/${articleId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "article", action: "publish" }),
      });
      if (!res.ok) {
        setEditorError(formatDraftSavedPublishFailed(await readError(res)));
        return;
      }
      setEditorNotice("Article publié.");
      const sync = resolveSkillsApplySync("lifecycle");
      if (sync.syncTree) await loadTree();
      await loadDetail({ kind: "article", id: articleId });
    } catch {
      setEditorError("Publication impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSelection() {
    if (!selection || busy) return;
    setBusy(true);
    setEditorError(null);
    setEditorNotice(null);
    try {
      let payload: Record<string, unknown>;
      let syncKind: "saveCategory" | "saveSection";
      if (selection.kind === "category" && catForm) {
        payload = buildCategoryPayload(catForm);
        syncKind = "saveCategory";
      } else if (selection.kind === "section" && secForm) {
        payload = buildSectionPayload(secForm);
        syncKind = "saveSection";
      } else {
        return;
      }
      const res = await fetch(`/api/admin/skills/${selection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: selection.kind, ...payload }),
      });
      if (!res.ok) {
        setEditorError(await readError(res));
        return;
      }
      setEditorNotice("Modifications enregistrées.");
      const sync = resolveSkillsApplySync(syncKind);
      if (sync.syncTree) await loadTree();
      if (sync.syncCategoryForm || sync.syncSectionForm) {
        await loadDetail(selection);
      }
      if (selection.kind === "category") setCatDirty(false);
      if (selection.kind === "section") setSecDirty(false);
    } catch {
      setEditorError("Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function lifecycleAction(action: "publish" | "unpublish" | "archive") {
    if (!selection || busy) return;
    if (action === "archive" && confirming !== "archive") {
      setConfirming("archive");
      return;
    }
    setBusy(true);
    setEditorError(null);
    setEditorNotice(null);
    try {
      const res = await fetch(`/api/admin/skills/${selection.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: selection.kind, action }),
      });
      if (!res.ok) {
        setEditorError(await readError(res));
        if (shouldKeepConfirmPanel(false)) return;
        return;
      }
      setConfirming(null);
      setEditorNotice(
        action === "publish"
          ? "Publication effectuée."
          : action === "unpublish"
            ? "Contenu repassé en brouillon."
            : "Contenu archivé.",
      );
      const sync = resolveSkillsApplySync("lifecycle");
      if (sync.syncTree) await loadTree();
      await loadDetail(selection);
    } catch {
      setEditorError("Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelection() {
    if (!selection || busy) return;
    if (requiresConfirmation("delete") && confirming !== "delete") {
      setConfirming("delete");
      return;
    }
    setBusy(true);
    setEditorError(null);
    try {
      const res = await fetch(
        `/api/admin/skills/${selection.id}?type=${selection.kind}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setEditorError(await readError(res));
        if (shouldKeepConfirmPanel(false)) return;
        return;
      }
      setConfirming(null);
      setSelection(null);
      clearEditorForms();
      await loadTree();
    } catch {
      setEditorError("Suppression impossible.");
    } finally {
      setBusy(false);
    }
  }

  const selectedCategory =
    selection?.kind === "category"
      ? findCategory(tree, selection.id)
      : selection?.kind === "section"
        ? findSection(tree, selection.id)?.category
        : selection?.kind === "article"
          ? findArticleContext(tree, selection.id)?.category
          : undefined;

  const selectedSection =
    selection?.kind === "section"
      ? findSection(tree, selection.id)?.section
      : selection?.kind === "article"
        ? findArticleContext(tree, selection.id)?.section
        : undefined;

  const articlePanelCtx = newArticleCtx
    ? {
        categoryName: newArticleCtx.categoryName,
        sectionName: newArticleCtx.sectionName,
        categoryStatus: newArticleCtx.categoryStatus,
        sectionStatus: newArticleCtx.sectionStatus,
      }
    : selection?.kind === "article"
      ? (() => {
          const ctx = findArticleContext(tree, selection.id);
          return ctx
            ? {
                categoryName: ctx.category.name,
                sectionName: ctx.section.name,
                categoryStatus: ctx.category.status,
                sectionStatus: ctx.section.status,
              }
            : null;
        })()
      : null;

  let wizardFocus:
    | "category"
    | "section"
    | "article"
    | "content"
    | "publish"
    | "empty" = "empty";
  if (tree.length === 0) {
    wizardFocus = "empty";
  } else if (newArticleCtx || selection?.kind === "article") {
    if (detailStatus === "PUBLISHED") wizardFocus = "publish";
    else if (artForm && hasSignificantBlocks(artForm.blocks))
      wizardFocus = "publish";
    else if ((artForm?.title ?? "").trim().length >= 2) wizardFocus = "content";
    else wizardFocus = "article";
  } else if (selection?.kind === "section") {
    wizardFocus = "article";
  } else if (selection?.kind === "category") {
    wizardFocus =
      selectedCategory && selectedCategory.sections.length === 0
        ? "section"
        : "category";
  } else {
    wizardFocus = "category";
  }

  const wizardSteps = buildSkillsWizardSteps({
    hasCategory: tree.length > 0,
    hasSection: tree.some((c) => c.sections.length > 0),
    hasArticle: tree.some((c) =>
      c.sections.some((s) => s.articles.length > 0),
    ),
    hasContent: artForm ? hasSignificantBlocks(artForm.blocks) : false,
    isPublished:
      (selection?.kind === "article" && detailStatus === "PUBLISHED") ||
      false,
    focus: wizardFocus,
  });

  const publishPrereqs =
    artForm && articlePanelCtx
      ? evaluatePublishPrerequisites({
          categorySelected: true,
          categoryStatus: articlePanelCtx.categoryStatus,
          sectionSelected: true,
          sectionStatus: articlePanelCtx.sectionStatus,
          title: artForm.title,
          slug: artForm.slug,
          blocks: artForm.blocks,
        })
      : [];

  const parentPublishBlock = articlePanelCtx
    ? parentBlocksPublication(
        articlePanelCtx.categoryStatus,
        articlePanelCtx.sectionStatus,
      )
    : { blocked: false, reason: null };

  const canPublishNow =
    artForm &&
    articlePanelCtx &&
    !parentPublishBlock.blocked &&
    canPublishArticle(publishPrereqs);

  const readOnly = isSkillArchivedReadOnly(detailStatus);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Skills</h1>
          <p className="mt-1 text-sm text-[#9AA1B2]">
            Bibliothèque pédagogique : catégories, sections et articles.
          </p>
        </div>
        <Button
          type="button"
          className="min-h-11"
          onClick={() => {
            setCreateKind({ entity: "category" });
            setCreateName("");
            setCreateError(null);
          }}
        >
          Nouvelle catégorie
        </Button>
      </div>

      <Card className="border border-[#1e222c] bg-[#0d1017] p-4">
        <ol className="flex flex-wrap gap-3">
          {wizardSteps.map((step) => (
            <li
              key={step.step}
              className={`min-h-11 flex items-center gap-2 rounded-lg px-3 text-sm ${
                step.current
                  ? "bg-[#3E6BFF]/15 text-white"
                  : step.done
                    ? "text-emerald-300"
                    : "text-[#9AA1B2]"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  step.done
                    ? "bg-emerald-500/20 text-emerald-300"
                    : step.current
                      ? "bg-[#3E6BFF] text-white"
                      : "bg-[#1e222c] text-[#9AA1B2]"
                }`}
              >
                {step.done ? "✓" : step.step}
              </span>
              {step.label}
            </li>
          ))}
        </ol>
      </Card>

      {treeError && (
        <p className="text-sm text-[#FF5C5C]" role="alert">
          {treeError}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,380px)_1fr]">
        <Card className="border border-[#1e222c] bg-[#0d1017]">
          {treeLoading ? (
            <p className="text-sm text-[#9AA1B2]">Chargement…</p>
          ) : tree.length === 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-[#9AA1B2]">
                Aucune catégorie. Crée la première pour démarrer la bibliothèque.
              </p>
              <label className={LABEL_CLASS}>
                Nom de la catégorie *
                <input
                  value={firstCatName}
                  onChange={(e) => setFirstCatName(e.target.value)}
                  className={INPUT_CLASS}
                  placeholder="Ex. Techniques de vente"
                />
              </label>
              {firstCatError && (
                <p className="text-sm text-[#FF5C5C]" role="alert">
                  {firstCatError}
                </p>
              )}
              <Button
                type="button"
                className="min-h-11"
                disabled={firstCatBusy || firstCatName.trim().length < 2}
                onClick={() => void createFirstCategory()}
              >
                {firstCatBusy
                  ? "Création…"
                  : "Créer ma première catégorie"}
              </Button>
            </div>
          ) : (
            <ul className="space-y-4">
              {tree.map((cat) => (
                <li key={cat.id}>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => trySelect({ kind: "category", id: cat.id })}
                      className={`min-h-11 flex-1 rounded-lg px-2 text-left text-sm font-semibold text-white hover:bg-white/5 ${
                        selection?.kind === "category" &&
                        selection.id === cat.id
                          ? "bg-[#3E6BFF]/10"
                          : ""
                      }`}
                    >
                      {cat.name}
                    </button>
                    <Badge tone={skillStatusTone(cat.status)}>
                      {SKILL_STATUS_LABELS[cat.status] ?? cat.status}
                    </Badge>
                  </div>
                  <ul className="mt-1 space-y-1 border-l border-[#1e222c] pl-3">
                    {cat.sections.map((sec) => (
                      <li key={sec.id}>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              trySelect({ kind: "section", id: sec.id })
                            }
                            className={`min-h-11 flex-1 rounded-lg px-2 text-left text-sm text-white/85 hover:bg-white/5 ${
                              selection?.kind === "section" &&
                              selection.id === sec.id
                                ? "bg-[#3E6BFF]/10"
                                : ""
                            }`}
                          >
                            {sec.name}
                          </button>
                          <Badge tone={skillStatusTone(sec.status)}>
                            {SKILL_STATUS_LABELS[sec.status] ?? sec.status}
                          </Badge>
                        </div>
                        <ul className="mt-1 space-y-1 border-l border-[#1e222c] pl-3">
                          {sec.articles.map((art) => (
                            <li
                              key={art.id}
                              className="flex items-center justify-between gap-2"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  trySelect({ kind: "article", id: art.id })
                                }
                                className={`min-h-11 flex-1 rounded-lg px-2 text-left text-xs text-white/70 hover:bg-white/5 ${
                                  selection?.kind === "article" &&
                                  selection.id === art.id
                                    ? "bg-[#3E6BFF]/10"
                                    : ""
                                }`}
                              >
                                {art.title}
                              </button>
                              <Badge tone={skillStatusTone(art.status)}>
                                {SKILL_STATUS_LABELS[art.status] ?? art.status}
                              </Badge>
                            </li>
                          ))}
                          {sec.status !== "ARCHIVED" && cat.status !== "ARCHIVED" && (
                            <li>
                              <button
                                type="button"
                                onClick={() =>
                                  startNewArticle({
                                    sectionId: sec.id,
                                    categoryId: cat.id,
                                    sectionName: sec.name,
                                    categoryName: cat.name,
                                    categoryStatus: cat.status,
                                    sectionStatus: sec.status,
                                  })
                                }
                                className="min-h-11 rounded-lg px-2 text-left text-xs text-[#3E6BFF] hover:underline"
                              >
                                + Nouvel article
                              </button>
                            </li>
                          )}
                        </ul>
                      </li>
                    ))}
                    {cat.status !== "ARCHIVED" && (
                      <li>
                        <button
                          type="button"
                          onClick={() => {
                            setCreateKind({
                              entity: "section",
                              categoryId: cat.id,
                              categoryName: cat.name,
                            });
                            setCreateName("");
                            setCreateError(null);
                          }}
                          className="min-h-11 rounded-lg px-2 text-left text-xs text-[#3E6BFF] hover:underline"
                        >
                          + Nouvelle section
                        </button>
                      </li>
                    )}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          {newArticleCtx && artForm ? (
            <Card className="space-y-4 border border-[#1e222c] bg-[#0d1017]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white">
                    Nouvel article
                  </h2>
                  <Badge tone={skillStatusTone("DRAFT")}>
                    {SKILL_STATUS_LABELS.DRAFT}
                  </Badge>
                </div>
              </div>

              {editorError && (
                <p className="text-sm text-[#FF5C5C]" role="alert">
                  {editorError}
                </p>
              )}
              {editorNotice && !editorError && (
                <p className="text-sm text-emerald-300">{editorNotice}</p>
              )}

              {newArticleCtx.categoryStatus === "DRAFT" && (
                <p className="text-sm text-[#9AA1B2]">
                  La catégorie est en brouillon : publiez-la explicitement
                  avant de pouvoir publier l&apos;article.
                </p>
              )}
              {newArticleCtx.sectionStatus === "DRAFT" && (
                <p className="text-sm text-[#9AA1B2]">
                  La section est en brouillon : publiez-la explicitement avant
                  de pouvoir publier l&apos;article.
                </p>
              )}

              {parentPublishBlock.reason && (
                <p className="text-sm text-amber-300">{parentPublishBlock.reason}</p>
              )}

              <ArticleEditor
                form={artForm}
                categoryName={newArticleCtx.categoryName}
                sectionName={newArticleCtx.sectionName}
                slugManual={slugManual}
                titleInputRef={titleInputRef}
                onTitleChange={(title) => {
                  setArtForm(applyTitleChange(artForm, title, slugManual));
                  setArtDirty(true);
                }}
                onSlugChange={(slug) => {
                  const next = applySlugManualChange(artForm, slug);
                  setArtForm(next.form);
                  setSlugManual(next.slugManual);
                  setArtDirty(true);
                }}
                onChange={(f) => {
                  setArtForm(f);
                  setArtDirty(true);
                }}
                disabled={busy}
              />

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-white">
                  Prérequis de publication
                </h3>
                <ul className="space-y-1 text-sm">
                  {publishPrereqs.map((p) => (
                    <li
                      key={p.key}
                      className={
                        p.ok ? "text-emerald-300" : "text-[#9AA1B2]"
                      }
                    >
                      {p.ok ? "✓" : "○"} {p.label}
                    </li>
                  ))}
                </ul>
              </div>

              <Card className="space-y-3 border border-[#1e222c] bg-[#12151d] p-4">
                <h3 className="text-sm font-semibold text-white">
                  Aperçu télépro
                </h3>
                <SkillBlocks blocks={blocksForPreview(artForm.blocks)} />
              </Card>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => void saveArticleDraft()}
                >
                  {busy ? "Enregistrement…" : "Enregistrer le brouillon"}
                </Button>
                <Button
                  type="button"
                  className="min-h-11"
                  variant="outline"
                  disabled={busy || !canPublishNow}
                  onClick={() => void saveAndPublishArticle()}
                >
                  Enregistrer et publier
                </Button>
              </div>
            </Card>
          ) : !selection ? (
            <Card className="border border-[#1e222c] bg-[#0d1017]">
              <p className="text-sm text-[#9AA1B2]">
                Sélectionne une catégorie, une section ou un article pour le
                modifier.
              </p>
            </Card>
          ) : detailLoading ? (
            <Card className="border border-[#1e222c] bg-[#0d1017]">
              <p className="text-sm text-[#9AA1B2]">Chargement…</p>
            </Card>
          ) : (
            <Card className="space-y-4 border border-[#1e222c] bg-[#0d1017]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white">
                    {selection.kind === "category"
                      ? "Catégorie"
                      : selection.kind === "section"
                        ? "Section"
                        : "Article"}
                  </h2>
                  <Badge tone={skillStatusTone(detailStatus)}>
                    {SKILL_STATUS_LABELS[detailStatus] ?? detailStatus}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selection.kind !== "article" &&
                    detailStatus === "DRAFT" && (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={busy}
                        onClick={() => void lifecycleAction("publish")}
                      >
                        Publier
                      </Button>
                    )}
                  {selection.kind === "article" &&
                    detailStatus === "PUBLISHED" && (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={busy}
                        onClick={() => void lifecycleAction("unpublish")}
                      >
                        Dépublier
                      </Button>
                    )}
                  {selection.kind !== "article" &&
                    detailStatus === "PUBLISHED" && (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={busy}
                        onClick={() => void lifecycleAction("unpublish")}
                      >
                        Dépublier
                      </Button>
                    )}
                  {detailStatus !== "ARCHIVED" && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11"
                      disabled={busy}
                      onClick={() => void lifecycleAction("archive")}
                    >
                      {confirming === "archive"
                        ? "Confirmer l'archivage ?"
                        : "Archiver"}
                    </Button>
                  )}
                  {detailStatus === "DRAFT" && (
                    <Button
                      type="button"
                      variant="danger"
                      className="min-h-11"
                      disabled={busy}
                      onClick={() => void deleteSelection()}
                    >
                      {confirming === "delete"
                        ? "Confirmer la suppression ?"
                        : "Supprimer"}
                    </Button>
                  )}
                  {confirming && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-11"
                      disabled={busy}
                      onClick={() => setConfirming(null)}
                    >
                      Annuler
                    </Button>
                  )}
                </div>
              </div>

              {editorError && (
                <p className="text-sm text-[#FF5C5C]" role="alert">
                  {editorError}
                </p>
              )}
              {editorNotice && !editorError && (
                <p className="text-sm text-emerald-300">{editorNotice}</p>
              )}
              {readOnly && (
                <p className="text-sm text-[#9AA1B2]">
                  Contenu archivé : lecture seule.
                </p>
              )}
              {detailStatus === "PUBLISHED" && selection.kind !== "article" && (
                <p className="text-sm text-[#9AA1B2]">
                  Contenu publié : dépublie-le (brouillon) pour le modifier.
                </p>
              )}
              {selection.kind === "category" &&
                detailStatus === "DRAFT" &&
                !readOnly && (
                  <p className="text-sm text-[#9AA1B2]">
                    Catégorie en brouillon : publiez-la pour permettre la
                    publication des articles enfants.
                  </p>
                )}

              {selection.kind === "category" &&
                catForm &&
                selectedCategory &&
                selectedCategory.sections.length === 0 &&
                !readOnly && (
                  <div className="space-y-3 rounded-xl border border-[#1e222c] bg-[#12151d] p-4">
                    <p className="text-sm text-[#9AA1B2]">
                      Aucune section dans cette catégorie.
                    </p>
                    <label className={LABEL_CLASS}>
                      Nom de la section *
                      <input
                        value={firstSecName}
                        onChange={(e) => setFirstSecName(e.target.value)}
                        className={INPUT_CLASS}
                        placeholder="Ex. Objections courantes"
                      />
                    </label>
                    {firstSecError && (
                      <p className="text-sm text-[#FF5C5C]" role="alert">
                        {firstSecError}
                      </p>
                    )}
                    <Button
                      type="button"
                      className="min-h-11"
                      disabled={
                        firstSecBusy || firstSecName.trim().length < 2
                      }
                      onClick={() =>
                        void createFirstSection(selection.id)
                      }
                    >
                      {firstSecBusy
                        ? "Création…"
                        : "Créer la première section"}
                    </Button>
                  </div>
                )}

              {selection.kind === "category" && catForm && (
                <CategoryEditor
                  form={catForm}
                  onChange={(f) => {
                    setCatForm(f);
                    setCatDirty(true);
                  }}
                  disabled={
                    readOnly ||
                    !isSkillEditable(detailStatus) ||
                    busy
                  }
                />
              )}
              {selection.kind === "section" && secForm && (
                <SectionEditor
                  form={secForm}
                  onChange={(f) => {
                    setSecForm(f);
                    setSecDirty(true);
                  }}
                  disabled={
                    readOnly ||
                    !isSkillEditable(detailStatus) ||
                    busy
                  }
                />
              )}
              {selection.kind === "section" &&
                selectedSection &&
                selectedSection.articles.length === 0 &&
                selectedSection.status !== "ARCHIVED" &&
                selectedCategory?.status !== "ARCHIVED" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() =>
                      startNewArticle({
                        sectionId: selectedSection.id,
                        categoryId: selectedSection.categoryId,
                        sectionName: selectedSection.name,
                        categoryName: selectedCategory?.name ?? "",
                        categoryStatus: selectedCategory?.status ?? "DRAFT",
                        sectionStatus: selectedSection.status,
                      })
                    }
                  >
                    Créer le premier article
                  </Button>
                )}
              {selection.kind === "article" && artForm && articlePanelCtx && (
                <>
                  {detailStatus === "PUBLISHED" && (
                    <p className="text-sm text-[#9AA1B2]">
                      Contenu publié : dépublie-le (brouillon) pour le modifier.
                    </p>
                  )}
                  {articlePanelCtx.categoryStatus === "DRAFT" && (
                    <p className="text-sm text-[#9AA1B2]">
                      La catégorie est en brouillon : publiez-la explicitement
                      avant de pouvoir publier l&apos;article.
                    </p>
                  )}
                  {articlePanelCtx.sectionStatus === "DRAFT" && (
                    <p className="text-sm text-[#9AA1B2]">
                      La section est en brouillon : publiez-la explicitement
                      avant de pouvoir publier l&apos;article.
                    </p>
                  )}
                  {parentPublishBlock.reason && (
                    <p className="text-sm text-amber-300">
                      {parentPublishBlock.reason}
                    </p>
                  )}
                  <ArticleEditor
                    form={artForm}
                    categoryName={articlePanelCtx.categoryName}
                    sectionName={articlePanelCtx.sectionName}
                    slugManual={slugManual}
                    titleInputRef={titleInputRef}
                    onTitleChange={(title) => {
                      setArtForm(applyTitleChange(artForm, title, slugManual));
                      setArtDirty(true);
                    }}
                    onSlugChange={(slug) => {
                      const next = applySlugManualChange(artForm, slug);
                      setArtForm(next.form);
                      setSlugManual(next.slugManual);
                      setArtDirty(true);
                    }}
                    onChange={(f) => {
                      setArtForm(f);
                      setArtDirty(true);
                    }}
                    disabled={
                      readOnly ||
                      !isSkillEditable(detailStatus) ||
                      busy
                    }
                  />
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-white">
                      Prérequis de publication
                    </h3>
                    <ul className="space-y-1 text-sm">
                      {publishPrereqs.map((p) => (
                        <li
                          key={p.key}
                          className={
                            p.ok ? "text-emerald-300" : "text-[#9AA1B2]"
                          }
                        >
                          {p.ok ? "✓" : "○"} {p.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Card className="space-y-3 border border-[#1e222c] bg-[#12151d] p-4">
                    <h3 className="text-sm font-semibold text-white">
                      Aperçu télépro
                    </h3>
                    <SkillBlocks blocks={blocksForPreview(artForm.blocks)} />
                  </Card>
                </>
              )}

              {selection.kind === "article" &&
                artForm &&
                isSkillEditable(detailStatus) &&
                !readOnly && (
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      className="min-h-11"
                      disabled={busy}
                      onClick={() => void saveArticleDraft()}
                    >
                      {busy
                        ? "Enregistrement…"
                        : "Enregistrer le brouillon"}
                    </Button>
                    <Button
                      type="button"
                      className="min-h-11"
                      variant="outline"
                      disabled={busy || !canPublishNow}
                      onClick={() => void saveAndPublishArticle()}
                    >
                      Enregistrer et publier
                    </Button>
                  </div>
                )}

              {selection.kind !== "article" &&
                isSkillEditable(detailStatus) &&
                !readOnly && (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      className="min-h-11"
                      disabled={busy}
                      onClick={() => void saveSelection()}
                    >
                      {busy ? "Enregistrement…" : "Enregistrer"}
                    </Button>
                  </div>
                )}
            </Card>
          )}
        </div>
      </div>

      {createKind && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <Card className="w-full max-w-md space-y-4 border border-[#1e222c] bg-[#0d1017]">
            <h2 className="text-lg font-semibold text-white">
              {createKind.entity === "category"
                ? "Nouvelle catégorie"
                : createKind.entity === "section"
                  ? `Nouvelle section — ${createKind.categoryName}`
                  : `Nouvel article — ${createKind.sectionName}`}
            </h2>
            <label className={LABEL_CLASS}>
              {createKind.entity === "article" ? "Titre *" : "Nom *"}
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className={INPUT_CLASS}
                placeholder="Ex. Traitement des objections"
              />
            </label>
            {createError && (
              <p className="text-sm text-[#FF5C5C]" role="alert">
                {createError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={createBusy}
                onClick={() => setCreateKind(null)}
              >
                Annuler
              </Button>
              <Button
                type="button"
                disabled={createBusy || createName.trim().length < 2}
                onClick={() => void createEntity()}
              >
                {createBusy ? "Création…" : "Créer le brouillon"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function CategoryEditor({
  form,
  onChange,
  disabled,
}: {
  form: CategoryFormState;
  onChange: (f: CategoryFormState) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={LABEL_CLASS}>
        Nom *
        <input
          value={form.name}
          disabled={disabled}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>
      <label className={LABEL_CLASS}>
        Slug
        <input
          value={form.slug}
          disabled={disabled}
          onChange={(e) => onChange({ ...form, slug: e.target.value })}
          className={INPUT_CLASS}
          placeholder="kebab-case"
        />
      </label>
      <label className={`${LABEL_CLASS} sm:col-span-2`}>
        Description
        <textarea
          value={form.description}
          disabled={disabled}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          className={INPUT_CLASS}
          rows={2}
        />
      </label>
      <label className={LABEL_CLASS}>
        Icône
        <select
          value={form.iconKey}
          disabled={disabled}
          onChange={(e) => onChange({ ...form, iconKey: e.target.value })}
          className={INPUT_CLASS}
        >
          {SKILL_ICON_KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL_CLASS}>
        Ordre
        <input
          type="number"
          min={0}
          max={999}
          value={form.sortOrder}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...form, sortOrder: Number(e.target.value) })
          }
          className={INPUT_CLASS}
        />
      </label>
    </div>
  );
}

function SectionEditor({
  form,
  onChange,
  disabled,
}: {
  form: SectionFormState;
  onChange: (f: SectionFormState) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={LABEL_CLASS}>
        Nom *
        <input
          value={form.name}
          disabled={disabled}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>
      <label className={LABEL_CLASS}>
        Slug
        <input
          value={form.slug}
          disabled={disabled}
          onChange={(e) => onChange({ ...form, slug: e.target.value })}
          className={INPUT_CLASS}
          placeholder="kebab-case"
        />
      </label>
      <label className={`${LABEL_CLASS} sm:col-span-2`}>
        Description
        <textarea
          value={form.description}
          disabled={disabled}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          className={INPUT_CLASS}
          rows={2}
        />
      </label>
      <label className={LABEL_CLASS}>
        Ordre
        <input
          type="number"
          min={0}
          max={999}
          value={form.sortOrder}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...form, sortOrder: Number(e.target.value) })
          }
          className={INPUT_CLASS}
        />
      </label>
    </div>
  );
}

function ArticleEditor({
  form,
  categoryName,
  sectionName,
  titleInputRef,
  onTitleChange,
  onSlugChange,
  onChange,
  disabled,
}: {
  form: ArticleFormState;
  categoryName: string;
  sectionName: string;
  slugManual: boolean;
  titleInputRef?: RefObject<HTMLInputElement | null>;
  onTitleChange: (title: string) => void;
  onSlugChange: (slug: string) => void;
  onChange: (f: ArticleFormState) => void;
  disabled: boolean;
}) {
  const [newBlockType, setNewBlockType] = useState<SkillBlockType>("paragraph");

  function setBlocks(blocks: SkillBlock[]) {
    onChange({ ...form, blocks });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL_CLASS}>
          Catégorie
          <input
            value={categoryName}
            readOnly
            disabled
            className={INPUT_CLASS}
          />
        </label>
        <label className={LABEL_CLASS}>
          Section
          <input
            value={sectionName}
            readOnly
            disabled
            className={INPUT_CLASS}
          />
        </label>
        <label className={LABEL_CLASS}>
          Titre *
          <input
            ref={titleInputRef}
            value={form.title}
            disabled={disabled}
            onChange={(e) => onTitleChange(e.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        <label className={LABEL_CLASS}>
          Slug
          <input
            value={form.slug}
            disabled={disabled}
            onChange={(e) => onSlugChange(e.target.value)}
            className={INPUT_CLASS}
            placeholder="kebab-case"
          />
        </label>
        <label className={`${LABEL_CLASS} sm:col-span-2`}>
          Résumé
          <textarea
            value={form.summary}
            disabled={disabled}
            onChange={(e) => onChange({ ...form, summary: e.target.value })}
            className={INPUT_CLASS}
            rows={2}
          />
        </label>
        <label className={LABEL_CLASS}>
          Tags (un par ligne — vide pour tout effacer)
          <textarea
            value={form.tagsText}
            disabled={disabled}
            onChange={(e) => onChange({ ...form, tagsText: e.target.value })}
            className={INPUT_CLASS}
            rows={3}
          />
        </label>
        <label className={LABEL_CLASS}>
          Clés de compétences (une par ligne — vide pour tout effacer)
          <textarea
            value={form.skillKeysText}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...form, skillKeysText: e.target.value })
            }
            className={INPUT_CLASS}
            rows={3}
            placeholder="ex. decouverte, objections"
          />
        </label>
        <label className={LABEL_CLASS}>
          Durée de lecture (minutes)
          <input
            type="number"
            min={1}
            max={60}
            value={form.readingMinutes}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...form, readingMinutes: Number(e.target.value) })
            }
            className={INPUT_CLASS}
          />
        </label>
        <label className={LABEL_CLASS}>
          Ordre
          <input
            type="number"
            min={0}
            max={999}
            value={form.sortOrder}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...form, sortOrder: Number(e.target.value) })
            }
            className={INPUT_CLASS}
          />
        </label>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-white">
          Blocs de contenu ({form.blocks.length})
        </h3>
        {form.blocks.length === 0 && (
          <p className="text-sm text-[#9AA1B2]">
            Aucun bloc. Un article doit contenir au moins un bloc valide pour
            être publié.
          </p>
        )}
        {form.blocks.map((block, i) => (
          <div
            key={i}
            className="space-y-2 rounded-xl border border-[#1e222c] bg-[#12151d] p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#9AA1B2]">
                {SKILL_BLOCK_TYPE_LABELS[block.type]}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={disabled || i === 0}
                  onClick={() => setBlocks(moveItem(form.blocks, i, -1))}
                  className="min-h-11 min-w-11 rounded-lg border border-[#1e222c] text-xs text-white/70 hover:bg-white/5 disabled:opacity-40"
                  aria-label="Monter le bloc"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={disabled || i === form.blocks.length - 1}
                  onClick={() => setBlocks(moveItem(form.blocks, i, 1))}
                  className="min-h-11 min-w-11 rounded-lg border border-[#1e222c] text-xs text-white/70 hover:bg-white/5 disabled:opacity-40"
                  aria-label="Descendre le bloc"
                >
                  ↓
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setBlocks(removeItem(form.blocks, i))}
                  className="min-h-11 min-w-11 rounded-lg border border-red-500/40 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                  aria-label="Supprimer le bloc"
                >
                  ✕
                </button>
              </div>
            </div>
            <BlockEditor
              block={block}
              disabled={disabled}
              onChange={(b) => setBlocks(replaceItem(form.blocks, i, b))}
            />
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2">
          <label className={LABEL_CLASS}>
            Type de bloc
            <select
              value={newBlockType}
              disabled={disabled}
              onChange={(e) =>
                setNewBlockType(e.target.value as SkillBlockType)
              }
              className={INPUT_CLASS}
            >
              {SKILL_BLOCK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SKILL_BLOCK_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={() => setBlocks([...form.blocks, emptyBlock(newBlockType)])}
          >
            Ajouter un bloc
          </Button>
        </div>
      </div>
    </div>
  );
}

function BlockEditor({
  block,
  disabled,
  onChange,
}: {
  block: SkillBlock;
  disabled: boolean;
  onChange: (b: SkillBlock) => void;
}) {
  if (block.type === "heading") {
    return (
      <div className="grid gap-2 sm:grid-cols-[100px_1fr]">
        <label className={LABEL_CLASS}>
          Niveau
          <select
            value={block.level}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...block, level: Number(e.target.value) as 2 | 3 })
            }
            className={INPUT_CLASS}
          >
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
        </label>
        <label className={LABEL_CLASS}>
          Texte
          <input
            value={block.text}
            disabled={disabled}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            className={INPUT_CLASS}
          />
        </label>
      </div>
    );
  }
  if (block.type === "paragraph") {
    return (
      <label className={LABEL_CLASS}>
        Texte
        <textarea
          value={block.text}
          disabled={disabled}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          className={INPUT_CLASS}
          rows={3}
        />
      </label>
    );
  }
  if (block.type === "list") {
    return (
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs text-[#9AA1B2]">
          <input
            type="checkbox"
            checked={block.ordered}
            disabled={disabled}
            onChange={(e) => onChange({ ...block, ordered: e.target.checked })}
          />
          Liste numérotée
        </label>
        <label className={LABEL_CLASS}>
          Éléments (un par ligne)
          <textarea
            value={block.items.join("\n")}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...block,
                items: e.target.value.split("\n"),
              })
            }
            className={INPUT_CLASS}
            rows={4}
          />
        </label>
      </div>
    );
  }
  if (block.type === "callout") {
    return (
      <div className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={LABEL_CLASS}>
            Ton
            <select
              value={block.tone}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...block,
                  tone: e.target.value as "info" | "warning" | "success",
                })
              }
              className={INPUT_CLASS}
            >
              <option value="info">Info</option>
              <option value="warning">Attention</option>
              <option value="success">Succès</option>
            </select>
          </label>
          <label className={LABEL_CLASS}>
            Titre (optionnel)
            <input
              value={block.title ?? ""}
              disabled={disabled}
              onChange={(e) => {
                const title = e.target.value;
                if (title.trim()) {
                  onChange({ ...block, title });
                } else {
                  const rest = { ...block };
                  delete rest.title;
                  onChange(rest);
                }
              }}
              className={INPUT_CLASS}
            />
          </label>
        </div>
        <label className={LABEL_CLASS}>
          Texte
          <textarea
            value={block.text}
            disabled={disabled}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            className={INPUT_CLASS}
            rows={3}
          />
        </label>
      </div>
    );
  }
  if (block.type === "example") {
    return (
      <div className="space-y-2">
        <label className={LABEL_CLASS}>
          Libellé (optionnel)
          <input
            value={block.label ?? ""}
            disabled={disabled}
            onChange={(e) => {
              const label = e.target.value;
              if (label.trim()) {
                onChange({ ...block, label });
              } else {
                const rest = { ...block };
                delete rest.label;
                onChange(rest);
              }
            }}
            className={INPUT_CLASS}
          />
        </label>
        {block.lines.map((line, li) => (
          <div key={li} className="grid gap-2 sm:grid-cols-[140px_1fr_44px]">
            <select
              value={line.speaker}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...block,
                  lines: replaceItem(block.lines, li, {
                    ...line,
                    speaker: e.target.value as "TELEPRO" | "PROSPECT" | "NONE",
                  }),
                })
              }
              className={INPUT_CLASS}
            >
              <option value="TELEPRO">Télépro</option>
              <option value="PROSPECT">Prospect</option>
              <option value="NONE">Neutre</option>
            </select>
            <input
              value={line.text}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...block,
                  lines: replaceItem(block.lines, li, {
                    ...line,
                    text: e.target.value,
                  }),
                })
              }
              className={INPUT_CLASS}
            />
            <button
              type="button"
              disabled={disabled || block.lines.length <= 1}
              onClick={() =>
                onChange({ ...block, lines: removeItem(block.lines, li) })
              }
              className="mt-1 min-h-11 rounded-lg border border-red-500/40 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-40"
              aria-label="Supprimer la réplique"
            >
              ✕
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          disabled={disabled || block.lines.length >= 10}
          onClick={() =>
            onChange({
              ...block,
              lines: [...block.lines, { speaker: "NONE", text: "" }],
            })
          }
        >
          Ajouter une réplique
        </Button>
      </div>
    );
  }
  return (
    <label className={LABEL_CLASS}>
      Texte
      <textarea
        value={block.text}
        disabled={disabled}
        onChange={(e) => onChange({ ...block, text: e.target.value })}
        className={INPUT_CLASS}
        rows={2}
      />
    </label>
  );
}
