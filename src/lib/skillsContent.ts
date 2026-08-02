/**
 * Contrat partagé de la bibliothèque Skills (client + serveur).
 * Blocs de contenu strictement typés et bornés : aucun HTML, aucun script,
 * aucune URL exécutable, aucune propriété inconnue.
 * Le rendu télépro produit du React à partir de ces blocs (jamais
 * d'injection HTML brute).
 */

import { z } from "zod";

// ---------------- Statuts ----------------

export const SkillStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
} as const;
export type SkillStatus = (typeof SkillStatus)[keyof typeof SkillStatus];

export const SKILL_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  PUBLISHED: "Publié",
  ARCHIVED: "Archivé",
};

// ---------------- Icônes sûres (liste fermée) ----------------

export const SKILL_ICON_KEYS = [
  "book",
  "mic",
  "search",
  "shield",
  "target",
  "chat",
  "spark",
  "flag",
] as const;
export type SkillIconKey = (typeof SKILL_ICON_KEYS)[number];

// ---------------- Texte sûr ----------------

/** Rejette chevrons (HTML/script) et schémas d'URL exécutables. */
const FORBIDDEN_TEXT = /[<>]|javascript:|vbscript:|data:text\/html/i;

export function isSafeSkillText(value: string): boolean {
  return !FORBIDDEN_TEXT.test(value);
}

function safeText(max: number, min = 1) {
  return z
    .string()
    .min(min)
    .max(max)
    .refine(isSafeSkillText, {
      message: "HTML, scripts et URL exécutables interdits.",
    });
}

// ---------------- Blocs de contenu ----------------

export const SKILL_BLOCK_TYPES = [
  "heading",
  "paragraph",
  "list",
  "callout",
  "example",
  "keyIdea",
] as const;
export type SkillBlockType = (typeof SKILL_BLOCK_TYPES)[number];

export const SKILL_BLOCK_LIMITS = {
  maxBlocks: 40,
  headingMax: 160,
  paragraphMax: 1200,
  listItems: 12,
  listItemMax: 300,
  calloutTitleMax: 120,
  calloutTextMax: 800,
  exampleLabelMax: 120,
  exampleLines: 10,
  exampleLineMax: 400,
  keyIdeaMax: 500,
} as const;

const HeadingBlockSchema = z
  .object({
    type: z.literal("heading"),
    level: z.union([z.literal(2), z.literal(3)]).default(2),
    text: safeText(SKILL_BLOCK_LIMITS.headingMax),
  })
  .strict();

const ParagraphBlockSchema = z
  .object({
    type: z.literal("paragraph"),
    text: safeText(SKILL_BLOCK_LIMITS.paragraphMax),
  })
  .strict();

const ListBlockSchema = z
  .object({
    type: z.literal("list"),
    ordered: z.boolean().default(false),
    items: z
      .array(safeText(SKILL_BLOCK_LIMITS.listItemMax))
      .min(1)
      .max(SKILL_BLOCK_LIMITS.listItems),
  })
  .strict();

const CalloutBlockSchema = z
  .object({
    type: z.literal("callout"),
    tone: z.enum(["info", "warning", "success"]).default("info"),
    title: safeText(SKILL_BLOCK_LIMITS.calloutTitleMax).optional(),
    text: safeText(SKILL_BLOCK_LIMITS.calloutTextMax),
  })
  .strict();

const ExampleLineSchema = z
  .object({
    speaker: z.enum(["TELEPRO", "PROSPECT", "NONE"]).default("NONE"),
    text: safeText(SKILL_BLOCK_LIMITS.exampleLineMax),
  })
  .strict();

const ExampleBlockSchema = z
  .object({
    type: z.literal("example"),
    label: safeText(SKILL_BLOCK_LIMITS.exampleLabelMax).optional(),
    lines: z
      .array(ExampleLineSchema)
      .min(1)
      .max(SKILL_BLOCK_LIMITS.exampleLines),
  })
  .strict();

const KeyIdeaBlockSchema = z
  .object({
    type: z.literal("keyIdea"),
    text: safeText(SKILL_BLOCK_LIMITS.keyIdeaMax),
  })
  .strict();

export const SkillBlockSchema = z.discriminatedUnion("type", [
  HeadingBlockSchema,
  ParagraphBlockSchema,
  ListBlockSchema,
  CalloutBlockSchema,
  ExampleBlockSchema,
  KeyIdeaBlockSchema,
]);
export type SkillBlock = z.infer<typeof SkillBlockSchema>;

export const SkillArticleContentSchema = z
  .array(SkillBlockSchema)
  .max(SKILL_BLOCK_LIMITS.maxBlocks);

/**
 * Parse défensif d'un contenu stocké : retourne uniquement des blocs
 * strictement valides (jamais de contenu brut non validé côté rendu).
 */
export function parseSkillBlocks(raw: string | null | undefined): SkillBlock[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const result = SkillArticleContentSchema.safeParse(parsed);
  return result.success ? result.data : [];
}

// ---------------- Clés de compétences (mappings) ----------------

/** Clé de compétence (SkillScore.key / rubriques) : identifiant local sûr. */
export const SkillKeySchema = z
  .string()
  .min(1)
  .max(80)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9_.:\u00C0-\u017F-]*$/,
    "Clé de compétence invalide.",
  );

// ---------------- Slug ----------------

export const SkillSlugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug kebab-case requis");

// ---------------- Recherche locale (client ou serveur) ----------------

/** Entrée d'index de recherche : uniquement des champs publics publiés. */
export type SkillsSearchEntry = {
  title: string;
  summary: string | null;
  tags: string[];
  categoryName: string;
  categorySlug: string;
  articleSlug: string;
  readingMinutes: number;
};

/** Filtre de recherche (titres, résumés, tags) — insensible à la casse. */
export function filterSkillsSearch(
  index: SkillsSearchEntry[],
  query: string,
): SkillsSearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return index.filter(
    (e) =>
      e.title.toLowerCase().includes(q) ||
      (e.summary ?? "").toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

export function slugifySkillName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
