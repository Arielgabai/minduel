/**
 * Contrat partagé du catalogue Missions (client + serveur), lots N1/N4.
 *
 * Hiérarchie : Thème → niveaux (un exercice = un niveau).
 * MissionStage reste le modèle technique du niveau.
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

/** Aucun plafond métier de niveaux : seule une borne de validation raisonnable. */
export const MissionStageCreateSchema = z
  .object({
    themeId: z.string().min(1).max(64),
    name: safeMissionText(120, 2),
    slug: MissionSlugSchema.optional(),
    description: safeMissionText(500, 0).nullish(),
    // Optionnel : le service propose le prochain numéro (aucun plafond métier).
    levelNumber: z.number().int().min(1).max(9999).optional(),
    sortOrder: z.number().int().min(0).max(9999).default(0),
  })
  .strict();

/** Le thème parent n'est jamais déplaçable après création (isolation simple). */
export const MissionStageUpdateSchema = z
  .object({
    name: safeMissionText(120, 2).optional(),
    slug: MissionSlugSchema.optional(),
    description: safeMissionText(500, 0).nullish(),
    levelNumber: z.number().int().min(1).max(9999).optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .strict();

export const MissionStageAssignExerciseSchema = z
  .object({
    exerciseId: z.string().min(1).max(64),
  })
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

export type MissionCatalogAction =
  | "publish"
  | "unpublish"
  | "archive"
  | "assignExercise"
  | "unassignExercise";

// ---------------- Vues (arbre admin) ----------------

/** Résumé sûr d'un exercice classé dans un niveau (jamais de prompt/hash). */
export type MissionStageExerciseSummary = {
  id: string;
  name: string;
  status: string;
  prospectAvatarKey: string | null;
  hasPersonality: boolean;
  hasPublishedPrompt: boolean;
};

/** Checklist de préparation d'un niveau (affichage admin uniquement). */
export type MissionLevelReadiness = {
  hasExercise: boolean;
  exercisePublished: boolean;
  hasAvatar: boolean;
  hasPersonality: boolean;
  hasPublishedPrompt: boolean;
  themePublished: boolean;
  readyToPublish: boolean;
  missing: string[];
};

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
  /** 0 ou 1 : un niveau = au plus un exercice. */
  exerciseCount: number;
  exercise: MissionStageExerciseSummary | null;
  readiness: MissionLevelReadiness;
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

/** Valeur de filtre « Non classé » (exercices sans niveau). */
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

/** Tri stable des niveaux : levelNumber, puis ordre, puis nom. */
export function sortMissionStages<
  T extends { sortOrder: number; levelNumber: number; name: string },
>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      a.levelNumber - b.levelNumber ||
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name, "fr"),
  );
}

/**
 * Prochain numéro de niveau libre dans un thème (trous ignorés pour la suggestion).
 * Aucun plafond métier : l'administrateur peut dépasser 7, 10, etc.
 */
export function suggestNextLevelNumber(
  stages: readonly { levelNumber: number }[],
): number {
  if (stages.length === 0) return 1;
  let max = 0;
  for (const stage of stages) {
    if (stage.levelNumber > max) max = stage.levelNumber;
  }
  return max + 1;
}

/** Construit la checklist de préparation d'un niveau (sans secrets). */
export function buildMissionLevelReadiness(input: {
  themeStatus: string;
  exercise: MissionStageExerciseSummary | null;
}): MissionLevelReadiness {
  const exercise = input.exercise;
  const hasExercise = Boolean(exercise);
  const exercisePublished = exercise?.status === "PUBLISHED";
  const hasAvatar = Boolean(
    exercise?.prospectAvatarKey && isProspectAvatarKey(exercise.prospectAvatarKey),
  );
  const hasPersonality = Boolean(exercise?.hasPersonality);
  const hasPublishedPrompt = Boolean(exercise?.hasPublishedPrompt);
  const themePublished = input.themeStatus === MissionStatus.PUBLISHED;

  const missing: string[] = [];
  if (!themePublished) missing.push("Thème non publié");
  if (!hasExercise) missing.push("Aucun exercice associé");
  else {
    if (!exercisePublished) missing.push("Exercice non publié");
    if (!hasAvatar) missing.push("Avatar manquant ou invalide");
    if (!hasPersonality) missing.push("Personnalité / consigne d'incarnation vide");
    if (!hasPublishedPrompt) missing.push("PromptBundle publié courant manquant");
  }

  return {
    hasExercise,
    exercisePublished,
    hasAvatar,
    hasPersonality,
    hasPublishedPrompt,
    themePublished,
    readyToPublish: missing.length === 0,
    missing,
  };
}
