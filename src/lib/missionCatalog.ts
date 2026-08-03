/**
 * Contrat partagé du catalogue Missions (client + serveur), lot N1.
 *
 * Hiérarchie : Thème → phase/niveau → ordre → exercices.
 * Ce module est un domaine pur : aucune dépendance Prisma, aucun accès réseau,
 * aucun composant React. Il est importable depuis les pages admin comme depuis
 * les services serveur.
 */

import { z } from "zod";
import { isProspectAvatarKey } from "./prospectAvatars";

// ---------------- Statuts ----------------

export const MissionStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
} as const;
export type MissionStatus = (typeof MissionStatus)[keyof typeof MissionStatus];

export const MISSION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  PUBLISHED: "Publié",
  ARCHIVED: "Archivé",
};

export function missionStatusTone(status: string): "gray" | "mint" | "red" {
  if (status === MissionStatus.PUBLISHED) return "mint";
  if (status === MissionStatus.ARCHIVED) return "red";
  return "gray";
}

/** Une ressource archivée est en lecture seule (aucune écriture applicative). */
export function isMissionArchivedReadOnly(status: string): boolean {
  return status === MissionStatus.ARCHIVED;
}

/** Seul un brouillon est modifiable : publié → dépublier d'abord. */
export function isMissionEditable(status: string): boolean {
  return status === MissionStatus.DRAFT;
}

// ---------------- Icônes sûres (liste fermée) ----------------

export const MISSION_ICON_KEYS = [
  "target",
  "phone",
  "handshake",
  "shield",
  "spark",
  "flag",
  "chat",
  "trophy",
] as const;
export type MissionIconKey = (typeof MISSION_ICON_KEYS)[number];

// ---------------- Texte sûr ----------------

/** Rejette chevrons (HTML/script) et schémas d'URL exécutables. */
const FORBIDDEN_TEXT = /[<>]|javascript:|vbscript:|data:text\/html/i;

export function isSafeMissionText(value: string): boolean {
  return !FORBIDDEN_TEXT.test(value);
}

function safeMissionText(max: number, min = 1) {
  return z
    .string()
    .min(min)
    .max(max)
    .refine(isSafeMissionText, {
      message: "HTML, scripts et URL exécutables interdits.",
    });
}

// ---------------- Slug ----------------

export const MissionSlugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug kebab-case requis");

export function slugifyMissionName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ---------------- Schémas d'entrée (Zod strict) ----------------

export const MissionThemeCreateSchema = z
  .object({
    name: safeMissionText(120, 2),
    slug: MissionSlugSchema.optional(),
    description: safeMissionText(500, 0).nullish(),
    iconKey: z.enum(MISSION_ICON_KEYS).default("target"),
    sortOrder: z.number().int().min(0).max(999).default(0),
  })
  .strict();

export const MissionThemeUpdateSchema = MissionThemeCreateSchema.partial().strict();

export const MissionStageCreateSchema = z
  .object({
    themeId: z.string().min(1).max(64),
    name: safeMissionText(120, 2),
    slug: MissionSlugSchema.optional(),
    description: safeMissionText(500, 0).nullish(),
    levelNumber: z.number().int().min(1).max(99).default(1),
    sortOrder: z.number().int().min(0).max(999).default(0),
  })
  .strict();

/** Le thème parent n'est jamais déplaçable après création (isolation simple). */
export const MissionStageUpdateSchema = MissionStageCreateSchema.omit({
  themeId: true,
})
  .partial()
  .strict();

/**
 * Avatar de prospect : seule une clé du catalogue local est acceptée.
 * Toute autre chaîne produit une 422 explicite (jamais de stockage arbitraire).
 */
export const ProspectAvatarKeySchema = z.string().refine(isProspectAvatarKey, {
  message: "Avatar de prospect inconnu.",
});

// ---------------- Contrats d'API ----------------

export type MissionEntityKind = "theme" | "stage";

export type MissionCatalogAction = "publish" | "unpublish" | "archive";

// ---------------- Vues (arbre admin) ----------------

export type MissionStageNode = {
  id: string;
  themeId: string;
  name: string;
  slug: string;
  description: string | null;
  levelNumber: number;
  sortOrder: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  /** Nombre d'exercices classés dans cette phase (jamais de contenu d'exercice). */
  exerciseCount: number;
};

export type MissionThemeNode = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconKey: string;
  sortOrder: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  stages: MissionStageNode[];
};

// ---------------- Classement des exercices ----------------

/** Valeur de filtre « Non classé » (exercices sans phase). */
export const MISSION_UNCLASSIFIED = "none";

export const UNCLASSIFIED_LABEL = "Non classé";

/** Libellé lisible d'un classement d'exercice, sans jamais masquer l'exercice. */
export function formatMissionClassification(
  themeName: string | null | undefined,
  stageName: string | null | undefined,
): string {
  if (!themeName && !stageName) return UNCLASSIFIED_LABEL;
  if (themeName && stageName) return `${themeName} → ${stageName}`;
  return themeName ?? stageName ?? UNCLASSIFIED_LABEL;
}

/** Tri stable d'un arbre : ordre explicite puis nom. */
export function sortMissionThemes<T extends { sortOrder: number; name: string }>(
  items: T[],
): T[] {
  return [...items].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "fr"),
  );
}

/** Tri stable des phases : ordre explicite, puis niveau, puis nom. */
export function sortMissionStages<
  T extends { sortOrder: number; levelNumber: number; name: string },
>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.levelNumber - b.levelNumber ||
      a.name.localeCompare(b.name, "fr"),
  );
}
