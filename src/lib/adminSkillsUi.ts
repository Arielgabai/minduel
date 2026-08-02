/**
 * Helpers purs pour l'UI admin Skills (/admin/skills).
 * Aucun React / Next / Prisma / DB / auth / réseau.
 */

import type { SkillBlock, SkillBlockType } from "./skillsContent";

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

/** Bloc vide valide pour chaque type (état initial de l'éditeur). */
export function emptyBlock(type: SkillBlockType): SkillBlock {
  switch (type) {
    case "heading":
      return { type: "heading", level: 2, text: "Nouveau titre" };
    case "paragraph":
      return { type: "paragraph", text: "Nouveau paragraphe." };
    case "list":
      return { type: "list", ordered: false, items: ["Premier point"] };
    case "callout":
      return { type: "callout", tone: "info", text: "Contenu de l'encadré." };
    case "example":
      return {
        type: "example",
        lines: [{ speaker: "TELEPRO", text: "Exemple de formulation." }],
      };
    case "keyIdea":
      return { type: "keyIdea", text: "Conseil clé à retenir." };
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
 * Nettoyage avant envoi : les lignes vides saisies en cours d'édition
 * (liste, exemple) sont retirées pour respecter le contrat serveur.
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
      return block;
    })
    .filter((block) => {
      if (block.type === "list") return block.items.length > 0;
      if (block.type === "example") return block.lines.length > 0;
      return true;
    });
}

/**
 * tags / skillKeys : toujours des tableaux (y compris []) pour permettre
 * un effacement réel côté serveur.
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

// ---------------- Comportement après réponse API ----------------

/** L'éditeur ne se ferme jamais sur une erreur (pas de faux succès). */
export function shouldCloseEditorAfterResponse(resOk: boolean): boolean {
  return resOk;
}

/** Actions destructives nécessitant une confirmation explicite. */
export const SKILL_CONFIRM_ACTIONS = ["archive", "delete"] as const;

export function requiresConfirmation(action: string): boolean {
  return (SKILL_CONFIRM_ACTIONS as readonly string[]).includes(action);
}
