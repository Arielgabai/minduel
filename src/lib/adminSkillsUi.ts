/**
 * Helpers purs pour l'UI admin Skills (/admin/skills).
 * Aucun React / Next / Prisma / DB / auth / réseau.
 */

import {
  SkillSlugSchema,
  slugifySkillName,
  type SkillBlock,
  type SkillBlockType,
} from "./skillsContent";

// ---------------- Types de vue ----------------

export type SkillTreeArticle = {
  id: string;
  categoryId: string;
  sectionId: string;
  title: string;
  slug: string;
  summary: string | null;
  readingMinutes: number;
  sortOrder: number;
  status: string;
  updatedAt: string;
  createdAt: string;
};

export type SkillTreeSection = {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  status: string;
  updatedAt: string;
  createdAt: string;
  articles: SkillTreeArticle[];
};

export type SkillTreeCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconKey: string;
  sortOrder: number;
  status: string;
  updatedAt: string;
  createdAt: string;
  sections: SkillTreeSection[];
};

export type SkillArticleDetail = SkillTreeArticle & {
  tags: string[];
  blocks: SkillBlock[];
  skillKeys: string[];
};

export type SkillSelection =
  | { kind: "category"; id: string }
  | { kind: "section"; id: string }
  | { kind: "article"; id: string };

// ---------------- Statuts ----------------

export function skillStatusTone(status: string): "gray" | "mint" | "red" {
  if (status === "PUBLISHED") return "mint";
  if (status === "ARCHIVED") return "red";
  return "gray";
}

export function isSkillArchivedReadOnly(status: string): boolean {
  return status === "ARCHIVED";
}

/** Modification autorisée uniquement en brouillon. */
export function isSkillEditable(status: string): boolean {
  return status === "DRAFT";
}

// ---------------- Champs texte / listes ----------------

/** "" (après trim) → null : comportement explicite des optionnels vides. */
export function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Découpe une saisie (retours ligne ou virgules) en liste propre et dédupliquée.
 * Une saisie vide retourne [] : le tableau vide efface réellement côté API.
 */
export function parseListInput(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[\n,]/)) {
    const v = part.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export function joinListInput(items: string[]): string {
  return items.join("\n");
}

// ---------------- Éditeur de blocs ----------------

/**
 * Bloc vide pour l'éditeur UI — aucun texte de démonstration.
 * Les chaînes vides sont filtrées avant persistance (DRAFT autorise []).
 */
export function emptyBlock(type: SkillBlockType): SkillBlock {
  switch (type) {
    case "heading":
      return { type: "heading", level: 2, text: "" } as SkillBlock;
    case "paragraph":
      return { type: "paragraph", text: "" } as SkillBlock;
    case "list":
      return { type: "list", ordered: false, items: [""] } as SkillBlock;
    case "callout":
      return { type: "callout", tone: "info", text: "" } as SkillBlock;
    case "example":
      return {
        type: "example",
        lines: [{ speaker: "NONE", text: "" }],
      } as SkillBlock;
    case "keyIdea":
      return { type: "keyIdea", text: "" } as SkillBlock;
  }
}

export const SKILL_BLOCK_TYPE_LABELS: Record<SkillBlockType, string> = {
  heading: "Titre / intertitre",
  paragraph: "Paragraphe",
  list: "Liste",
  callout: "Encadré",
  example: "Exemple",
  keyIdea: "À retenir",
};

/** Déplace un élément (retourne un nouveau tableau ; hors bornes = inchangé). */
export function moveItem<T>(arr: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= arr.length || target < 0 || target >= arr.length) {
    return arr;
  }
  const next = [...arr];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next;
}

export function removeItem<T>(arr: T[], index: number): T[] {
  return arr.filter((_, i) => i !== index);
}

export function replaceItem<T>(arr: T[], index: number, value: T): T[] {
  return arr.map((item, i) => (i === index ? value : item));
}

/** Bloc significatif (contenu non vide après trim). */
export function isBlockSignificant(block: SkillBlock): boolean {
  switch (block.type) {
    case "heading":
    case "paragraph":
    case "keyIdea":
      return block.text.trim().length > 0;
    case "callout":
      return block.text.trim().length > 0 || Boolean(block.title?.trim());
    case "list":
      return block.items.some((i) => i.trim().length > 0);
    case "example":
      return block.lines.some((l) => l.text.trim().length > 0);
    default:
      return false;
  }
}

export function hasSignificantBlocks(blocks: SkillBlock[]): boolean {
  return blocks.some(isBlockSignificant);
}

/**
 * Nettoyage avant envoi : lignes vides retirées ; blocs vides exclus.
 * Un tableau vide est valide pour un DRAFT (schéma sans min).
 */
export function sanitizeBlocksForSave(blocks: SkillBlock[]): SkillBlock[] {
  return blocks
    .map((block) => {
      if (block.type === "list") {
        return {
          ...block,
          items: block.items.map((i) => i.trim()).filter(Boolean),
        };
      }
      if (block.type === "example") {
        return {
          ...block,
          lines: block.lines.filter((l) => l.text.trim().length > 0),
        };
      }
      if (
        block.type === "heading" ||
        block.type === "paragraph" ||
        block.type === "keyIdea"
      ) {
        return { ...block, text: block.text.trim() };
      }
      if (block.type === "callout") {
        const title = block.title?.trim();
        return {
          ...block,
          text: block.text.trim(),
          ...(title ? { title } : { title: undefined }),
        };
      }
      return block;
    })
    .filter(isBlockSignificant) as SkillBlock[];
}

/** Blocs prévisualisables localement (sans réseau, sans persistance). */
export function blocksForPreview(blocks: SkillBlock[]): SkillBlock[] {
  return sanitizeBlocksForSave(blocks);
}

// ---------------- Payloads API ----------------

export type CategoryFormState = {
  name: string;
  slug: string;
  description: string;
  iconKey: string;
  sortOrder: number;
};

export type SectionFormState = {
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
};

export type ArticleFormState = {
  title: string;
  slug: string;
  summary: string;
  tagsText: string;
  skillKeysText: string;
  readingMinutes: number;
  sortOrder: number;
  blocks: SkillBlock[];
};

/** Slug vide omis (le backend slugifie le nom) ; description "" → null. */
export function buildCategoryPayload(form: CategoryFormState) {
  const payload: Record<string, unknown> = {
    name: form.name.trim(),
    description: normalizeOptionalText(form.description),
    iconKey: form.iconKey,
    sortOrder: Number(form.sortOrder),
  };
  if (form.slug.trim()) payload.slug = form.slug.trim();
  return payload;
}

export function buildSectionPayload(form: SectionFormState) {
  const payload: Record<string, unknown> = {
    name: form.name.trim(),
    description: normalizeOptionalText(form.description),
    sortOrder: Number(form.sortOrder),
  };
  if (form.slug.trim()) payload.slug = form.slug.trim();
  return payload;
}

/**
 * tags / skillKeys : toujours des tableaux (y compris []) pour permettre
 * un effacement réel côté serveur. Jamais d'id article dans le payload.
 */
export function buildArticlePayload(form: ArticleFormState) {
  const payload: Record<string, unknown> = {
    title: form.title.trim(),
    summary: normalizeOptionalText(form.summary),
    tags: parseListInput(form.tagsText),
    skillKeys: parseListInput(form.skillKeysText),
    readingMinutes: Number(form.readingMinutes),
    sortOrder: Number(form.sortOrder),
    blocks: sanitizeBlocksForSave(form.blocks),
  };
  if (form.slug.trim()) payload.slug = form.slug.trim();
  return payload;
}

export function buildArticleCreatePayload(
  form: ArticleFormState,
  sectionId: string,
) {
  return {
    ...buildArticlePayload(form),
    sectionId,
  };
}

// ---------------- Slug article ----------------

export function isValidSkillSlug(slug: string): boolean {
  return SkillSlugSchema.safeParse(slug.trim()).success;
}

/** Slug dérivé du titre (vide si titre insuffisant). */
export function nextSlugFromTitle(title: string): string {
  return slugifySkillName(title);
}

/**
 * Met à jour le titre ; le slug suit tant qu'il n'a pas été modifié manuellement.
 */
export function applyTitleChange(
  form: ArticleFormState,
  title: string,
  slugManual: boolean,
): ArticleFormState {
  const next: ArticleFormState = { ...form, title };
  if (!slugManual) {
    next.slug = nextSlugFromTitle(title);
  }
  return next;
}

export function applySlugManualChange(
  form: ArticleFormState,
  slug: string,
): { form: ArticleFormState; slugManual: boolean } {
  return {
    form: { ...form, slug },
    slugManual: true,
  };
}

// ---------------- Identité article persistée ----------------

/** Premier save sans ID → POST ; sinon PATCH du même ID. */
export function resolveArticleSaveMethod(
  persistedArticleId: string | null,
): "POST" | "PATCH" {
  return persistedArticleId ? "PATCH" : "POST";
}

export function resolveArticleSaveUrl(
  persistedArticleId: string | null,
): string {
  return persistedArticleId
    ? `/api/admin/skills/${persistedArticleId}`
    : "/api/admin/skills";
}

/** Mémorise l'ID retourné après création ; ne jamais le perdre sur échec publication. */
export function rememberPersistedArticleId(
  current: string | null,
  createdId: string | null | undefined,
): string | null {
  if (current) return current;
  if (createdId && typeof createdId === "string" && createdId.length > 0) {
    return createdId;
  }
  return null;
}

export function resetPersistedArticleId(): null {
  return null;
}

// ---------------- Prérequis de publication ----------------

export type PublishPrerequisite = {
  key: string;
  label: string;
  ok: boolean;
  blocking: boolean;
};

export type PublishPrereqInput = {
  categorySelected: boolean;
  categoryStatus: string | null;
  sectionSelected: boolean;
  sectionStatus: string | null;
  title: string;
  slug: string;
  blocks: SkillBlock[];
};

export function evaluatePublishPrerequisites(
  input: PublishPrereqInput,
): PublishPrerequisite[] {
  const sanitized = sanitizeBlocksForSave(input.blocks);
  return [
    {
      key: "categorySelected",
      label: "Catégorie sélectionnée",
      ok: input.categorySelected,
      blocking: true,
    },
    {
      key: "categoryPublished",
      label: "Catégorie PUBLISHED",
      ok: input.categoryStatus === "PUBLISHED",
      blocking: true,
    },
    {
      key: "sectionSelected",
      label: "Section sélectionnée",
      ok: input.sectionSelected,
      blocking: true,
    },
    {
      key: "sectionPublished",
      label: "Section PUBLISHED",
      ok: input.sectionStatus === "PUBLISHED",
      blocking: true,
    },
    {
      key: "title",
      label: "Titre valide",
      ok: input.title.trim().length >= 2,
      blocking: true,
    },
    {
      key: "slug",
      label: "Slug valide",
      ok: isValidSkillSlug(input.slug),
      blocking: true,
    },
    {
      key: "blocks",
      label: "Au moins un bloc significatif",
      ok: sanitized.length > 0,
      blocking: true,
    },
    {
      key: "contentSchema",
      label: "Contenu conforme au schéma",
      ok: sanitized.length > 0 && !input.categoryStatus?.includes("ARCHIVED"),
      blocking: true,
    },
  ];
}

export function canPublishArticle(prereqs: PublishPrerequisite[]): boolean {
  return prereqs.every((p) => p.ok);
}

export function parentBlocksPublication(
  categoryStatus: string | null,
  sectionStatus: string | null,
): { blocked: boolean; reason: string | null } {
  if (categoryStatus === "ARCHIVED" || sectionStatus === "ARCHIVED") {
    return {
      blocked: true,
      reason:
        "Publication impossible : un parent est ARCHIVED. Aucune requête de publication ne sera envoyée.",
    };
  }
  if (categoryStatus === "DRAFT") {
    return {
      blocked: true,
      reason:
        "Prérequis manquant : publiez d'abord la catégorie (décision explicite, non automatique).",
    };
  }
  if (sectionStatus === "DRAFT") {
    return {
      blocked: true,
      reason:
        "Prérequis manquant : publiez d'abord la section (décision explicite, non automatique).",
    };
  }
  return { blocked: false, reason: null };
}

export function formatDraftSavedPublishFailed(apiMessage: string): string {
  return `Le brouillon a été enregistré, mais la publication a échoué : ${apiMessage}`;
}

// ---------------- Validation brouillon ----------------

export function validateArticleDraft(form: ArticleFormState): string | null {
  if (form.title.trim().length < 2) {
    return "Le titre doit contenir au moins 2 caractères.";
  }
  if (form.slug.trim() && !isValidSkillSlug(form.slug)) {
    return "Slug invalide (kebab-case requis).";
  }
  return null;
}

export function createEmptyArticleForm(): ArticleFormState {
  return {
    title: "",
    slug: "",
    summary: "",
    tagsText: "",
    skillKeysText: "",
    readingMinutes: 3,
    sortOrder: 0,
    blocks: [emptyBlock("paragraph")],
  };
}

export function articleFormFromDetail(detail: SkillArticleDetail): ArticleFormState {
  return {
    title: detail.title,
    slug: detail.slug ?? "",
    summary: detail.summary ?? "",
    tagsText: joinListInput(detail.tags ?? []),
    skillKeysText: joinListInput(detail.skillKeys ?? []),
    readingMinutes: detail.readingMinutes,
    sortOrder: detail.sortOrder,
    blocks:
      detail.blocks && detail.blocks.length > 0
        ? detail.blocks
        : [emptyBlock("paragraph")],
  };
}

// ---------------- Isolation apply / dirty ----------------

export type SkillsApplyKind =
  | "loadArticle"
  | "saveArticle"
  | "saveCategory"
  | "saveSection"
  | "lifecycle"
  | "refreshTree";

export type SkillsApplySync = {
  syncArticleForm: boolean;
  syncCategoryForm: boolean;
  syncSectionForm: boolean;
  syncTree: boolean;
};

/** Décide quels formulaires synchroniser après une réponse API. */
export function resolveSkillsApplySync(kind: SkillsApplyKind): SkillsApplySync {
  switch (kind) {
    case "loadArticle":
      return {
        syncArticleForm: true,
        syncCategoryForm: false,
        syncSectionForm: false,
        syncTree: false,
      };
    case "saveArticle":
      return {
        syncArticleForm: true,
        syncCategoryForm: false,
        syncSectionForm: false,
        syncTree: true,
      };
    case "saveCategory":
      return {
        syncArticleForm: false,
        syncCategoryForm: true,
        syncSectionForm: false,
        syncTree: true,
      };
    case "saveSection":
      return {
        syncArticleForm: false,
        syncCategoryForm: false,
        syncSectionForm: true,
        syncTree: true,
      };
    case "lifecycle":
      return {
        syncArticleForm: false,
        syncCategoryForm: false,
        syncSectionForm: false,
        syncTree: true,
      };
    case "refreshTree":
      return {
        syncArticleForm: false,
        syncCategoryForm: false,
        syncSectionForm: false,
        syncTree: true,
      };
  }
}

/** Confirmation avant abandon des changements locaux non enregistrés. */
export function shouldConfirmDiscard(
  dirty: boolean,
  switchingAway: boolean,
): boolean {
  return dirty && switchingAway;
}

// ---------------- Comportement après réponse API ----------------

/** L'éditeur ne se ferme jamais sur une erreur (pas de faux succès). */
export function shouldCloseEditorAfterResponse(resOk: boolean): boolean {
  return resOk;
}

/** Panneau de confirmation : rester ouvert si l'action échoue. */
export function shouldKeepConfirmPanel(resOk: boolean): boolean {
  return !resOk;
}

/** Actions destructives nécessitant une confirmation explicite. */
export const SKILL_CONFIRM_ACTIONS = ["archive", "delete"] as const;

export function requiresConfirmation(action: string): boolean {
  return (SKILL_CONFIRM_ACTIONS as readonly string[]).includes(action);
}

// ---------------- Wizard / étapes ----------------

export type SkillsWizardStep = {
  step: number;
  label: string;
  done: boolean;
  current: boolean;
};

export function buildSkillsWizardSteps(input: {
  hasCategory: boolean;
  hasSection: boolean;
  hasArticle: boolean;
  hasContent: boolean;
  isPublished: boolean;
  focus: "category" | "section" | "article" | "content" | "publish" | "empty";
}): SkillsWizardStep[] {
  const steps: Array<{ label: string; done: boolean; key: typeof input.focus }> =
    [
      { label: "Catégorie", done: input.hasCategory, key: "category" },
      { label: "Section", done: input.hasSection, key: "section" },
      { label: "Article", done: input.hasArticle, key: "article" },
      { label: "Contenu", done: input.hasContent, key: "content" },
      { label: "Publication", done: input.isPublished, key: "publish" },
    ];
  return steps.map((s, i) => ({
    step: i + 1,
    label: s.label,
    done: s.done,
    current: input.focus === s.key || (input.focus === "empty" && i === 0),
  }));
}

export const DEMO_BLOCK_TEXTS = [
  "Nouveau titre",
  "Nouveau paragraphe.",
  "Premier point",
  "Contenu de l'encadré.",
  "Exemple de formulation.",
  "Conseil clé à retenir.",
] as const;

/** Garantit qu'aucun texte de démo n'est présent dans un payload. */
export function payloadContainsDemoText(payload: Record<string, unknown>): boolean {
  const raw = JSON.stringify(payload);
  return DEMO_BLOCK_TEXTS.some((t) => raw.includes(t));
}
