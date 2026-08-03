import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { logAudit } from "./audit";
import { PromptBundleStatus } from "./enums";
import { HttpError } from "./httpError";
import { nowIso } from "./utils";
import {
  MissionStageCreateSchema,
  MissionStageUpdateSchema,
  MissionStatus,
  MissionThemeCreateSchema,
  MissionThemeUpdateSchema,
  buildMissionLevelReadiness,
  slugifyMissionName,
  sortMissionStages,
  sortMissionThemes,
  suggestNextLevelNumber,
  type MissionLevelReadiness,
  type MissionStageExerciseSummary,
  type MissionStageNode,
  type MissionThemeNode,
} from "./missionCatalog";

// ---------------------------------------------------------------------------
// Catalogue Missions — service admin (PLATFORM_ADMIN uniquement).
// organizationId et actorId sont toujours fournis explicitement par l'appelant.
// Chaque lecture et chaque écriture filtre sur organizationId : une ressource
// d'une autre organisation est traitée comme inexistante (404).
// Aucun prompt, artifact, hash, secret ni publishedPromptBundleId n'est exposé.
// ---------------------------------------------------------------------------

// ---------------- Helpers internes ----------------

function isP2002(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

/** "" ou null → null ; texte non vide conservé (comportement explicite). */
function normalizeOptional(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function resolveSlug(explicit: string | undefined, name: string): string {
  const slug = explicit ?? slugifyMissionName(name);
  if (!slug) throw new HttpError(422, "Slug invalide : nom trop court.");
  return slug;
}

const THEME_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  iconKey: true,
  sortOrder: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

const STAGE_SELECT = {
  id: true,
  themeId: true,
  name: true,
  slug: true,
  description: true,
  levelNumber: true,
  sortOrder: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Champs sûrs pour readiness : jamais d'artifacts / hash / contenu de prompt. */
const STAGE_EXERCISE_SELECT = {
  id: true,
  name: true,
  status: true,
  prospectAvatarKey: true,
  personality: true,
  publishedPromptBundleId: true,
  missionStageId: true,
  publishedPromptBundle: {
    select: { id: true, status: true },
  },
} as const;

type ThemeRecord = Awaited<
  ReturnType<typeof prisma.missionTheme.findFirstOrThrow>
>;
type StageRecord = Awaited<
  ReturnType<typeof prisma.missionStage.findFirstOrThrow>
>;
type StageExerciseRow = {
  id: string;
  name: string;
  status: string;
  prospectAvatarKey: string | null;
  personality: string | null;
  publishedPromptBundleId: string | null;
  missionStageId: string | null;
  publishedPromptBundle: { id: string; status: string } | null;
};

async function loadThemeOrThrow(id: string, organizationId: string) {
  const theme = await prisma.missionTheme.findFirst({
    where: { id, organizationId },
  });
  if (!theme) throw new HttpError(404, "Thème introuvable.");
  return theme;
}

async function loadStageOrThrow(id: string, organizationId: string) {
  const stage = await prisma.missionStage.findFirst({
    where: { id, organizationId },
  });
  if (!stage) throw new HttpError(404, "Niveau introuvable.");
  return stage;
}

function assertEditableDraft(status: string, label: string): void {
  if (status === MissionStatus.ARCHIVED) {
    throw new HttpError(409, `${label} archivé(e) : lecture seule.`);
  }
  if (status === MissionStatus.PUBLISHED) {
    throw new HttpError(
      409,
      `${label} publié(e) : repassez en brouillon (unpublish) avant de modifier.`,
    );
  }
}

async function assertUniqueThemeSlug(
  organizationId: string,
  slug: string,
  excludeId?: string,
): Promise<void> {
  const existing = await prisma.missionTheme.findFirst({
    where: {
      organizationId,
      slug,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw new HttpError(409, `Slug de thème déjà utilisé : ${slug}`);
}

async function assertUniqueStageSlug(
  themeId: string,
  slug: string,
  excludeId?: string,
): Promise<void> {
  const existing = await prisma.missionStage.findFirst({
    where: {
      themeId,
      slug,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw new HttpError(409, `Slug de niveau déjà utilisé : ${slug}`);
}

async function assertUniqueStageLevel(
  themeId: string,
  levelNumber: number,
  excludeId?: string,
): Promise<void> {
  const existing = await prisma.missionStage.findFirst({
    where: {
      themeId,
      levelNumber,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new HttpError(409, `Niveau déjà utilisé dans ce thème : ${levelNumber}`);
  }
}

function hasNonEmptyPersonality(personality: string | null | undefined): boolean {
  return Boolean(personality && personality.trim());
}

function hasPublishedPromptBundle(row: StageExerciseRow): boolean {
  return (
    row.publishedPromptBundleId != null &&
    row.publishedPromptBundle?.status === PromptBundleStatus.PUBLISHED
  );
}

/** Projection sûre : jamais de prompt, artifact, hash ni publishedPromptBundleId. */
function toExerciseSummary(
  row: StageExerciseRow,
): MissionStageExerciseSummary {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    prospectAvatarKey: row.prospectAvatarKey,
    hasPersonality: hasNonEmptyPersonality(row.personality),
    hasPublishedPrompt: hasPublishedPromptBundle(row),
  };
}

function buildStageNode(
  stage: {
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
  },
  themeStatus: string,
  exerciseRow: StageExerciseRow | null,
): MissionStageNode {
  const exercise = exerciseRow ? toExerciseSummary(exerciseRow) : null;
  const readiness: MissionLevelReadiness = buildMissionLevelReadiness({
    themeStatus,
    exercise,
  });
  return {
    id: stage.id,
    themeId: stage.themeId,
    name: stage.name,
    slug: stage.slug,
    description: stage.description,
    levelNumber: stage.levelNumber,
    sortOrder: stage.sortOrder,
    status: stage.status,
    createdAt: stage.createdAt,
    updatedAt: stage.updatedAt,
    exerciseCount: exercise ? 1 : 0,
    exercise,
    readiness,
  };
}

async function loadStageExercise(
  stageId: string,
  organizationId: string,
): Promise<StageExerciseRow | null> {
  return prisma.scenario.findFirst({
    where: { missionStageId: stageId, organizationId },
    select: STAGE_EXERCISE_SELECT,
  });
}

// ---------------- Lecture ----------------

/** Arbre Thèmes → niveaux, avec exercice associé et readiness (sans secrets). */
export async function listMissionCatalog(
  organizationId: string,
): Promise<MissionThemeNode[]> {
  const [themes, stages, exercises] = await Promise.all([
    prisma.missionTheme.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: THEME_SELECT,
    }),
    prisma.missionStage.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: "asc" }, { levelNumber: "asc" }, { name: "asc" }],
      select: STAGE_SELECT,
    }),
    prisma.scenario.findMany({
      where: { organizationId, missionStageId: { not: null } },
      select: STAGE_EXERCISE_SELECT,
    }),
  ]);

  const exerciseByStage = new Map<string, StageExerciseRow>();
  for (const row of exercises) {
    if (row.missionStageId && !exerciseByStage.has(row.missionStageId)) {
      exerciseByStage.set(row.missionStageId, row);
    }
  }

  const themeStatusById = new Map(themes.map((t) => [t.id, t.status]));

  const stageNodes: MissionStageNode[] = stages.map((stage) =>
    buildStageNode(
      stage,
      themeStatusById.get(stage.themeId) ?? MissionStatus.DRAFT,
      exerciseByStage.get(stage.id) ?? null,
    ),
  );

  return sortMissionThemes(themes).map((theme) => ({
    ...theme,
    stages: sortMissionStages(stageNodes.filter((s) => s.themeId === theme.id)),
  }));
}

/** Projection admin : ni organisation, ni acteur, ni contenu d'exercice. */
function themePayload(theme: ThemeRecord) {
  return {
    id: theme.id,
    name: theme.name,
    slug: theme.slug,
    description: theme.description,
    iconKey: theme.iconKey,
    sortOrder: theme.sortOrder,
    status: theme.status,
    createdAt: theme.createdAt,
    updatedAt: theme.updatedAt,
    publishedAt: theme.publishedAt,
    archivedAt: theme.archivedAt,
  };
}

function stagePayload(stage: StageRecord) {
  return {
    id: stage.id,
    themeId: stage.themeId,
    name: stage.name,
    slug: stage.slug,
    description: stage.description,
    levelNumber: stage.levelNumber,
    sortOrder: stage.sortOrder,
    status: stage.status,
    createdAt: stage.createdAt,
    updatedAt: stage.updatedAt,
    publishedAt: stage.publishedAt,
    archivedAt: stage.archivedAt,
  };
}

export async function getMissionTheme(id: string, organizationId: string) {
  const theme = await loadThemeOrThrow(id, organizationId);
  const stageCount = await prisma.missionStage.count({
    where: { themeId: id, organizationId },
  });
  return { ...themePayload(theme), stageCount };
}

export async function getMissionStage(id: string, organizationId: string) {
  const stage = await loadStageOrThrow(id, organizationId);
  const theme = await loadThemeOrThrow(stage.themeId, organizationId);
  const exerciseRow = await loadStageExercise(id, organizationId);
  const node = buildStageNode(stage, theme.status, exerciseRow);
  return {
    ...stagePayload(stage),
    exerciseCount: node.exerciseCount,
    exercise: node.exercise,
    readiness: node.readiness,
  };
}

// ---------------- Création ----------------

export async function createMissionTheme(
  organizationId: string,
  actorId: string,
  raw: unknown,
) {
  const body = MissionThemeCreateSchema.parse(raw);
  const slug = resolveSlug(body.slug, body.name);
  await assertUniqueThemeSlug(organizationId, slug);

  const now = nowIso();
  let created;
  try {
    created = await prisma.missionTheme.create({
      data: {
        organizationId,
        name: body.name,
        slug,
        description: normalizeOptional(body.description),
        iconKey: body.iconKey,
        sortOrder: body.sortOrder,
        status: MissionStatus.DRAFT,
        createdById: actorId,
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (err) {
    if (isP2002(err)) {
      throw new HttpError(409, `Slug de thème déjà utilisé : ${slug}`);
    }
    throw err;
  }

  await logAudit({
    organizationId,
    actorId,
    action: "MISSION_THEME_CREATE",
    targetType: "MissionTheme",
    targetId: created.id,
    metadata: { slug },
  });

  return getMissionTheme(created.id, organizationId);
}

export async function createMissionStage(
  organizationId: string,
  actorId: string,
  raw: unknown,
) {
  const body = MissionStageCreateSchema.parse(raw);
  // Thème hors organisation → 404 : aucun niveau ne peut viser un parent étranger.
  const theme = await loadThemeOrThrow(body.themeId, organizationId);
  if (theme.status === MissionStatus.ARCHIVED) {
    throw new HttpError(409, "Thème archivé : ajout de niveau impossible.");
  }

  const rawRecord =
    raw !== null && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : {};
  const levelProvided =
    Object.prototype.hasOwnProperty.call(rawRecord, "levelNumber") &&
    rawRecord.levelNumber !== undefined &&
    rawRecord.levelNumber !== null;

  let levelNumber = body.levelNumber;
  if (!levelProvided || levelNumber === undefined) {
    const siblings = await prisma.missionStage.findMany({
      where: { themeId: theme.id, organizationId },
      select: { levelNumber: true },
    });
    levelNumber = suggestNextLevelNumber(siblings);
  }

  const slug = resolveSlug(body.slug, body.name);
  await assertUniqueStageSlug(theme.id, slug);
  await assertUniqueStageLevel(theme.id, levelNumber);

  const now = nowIso();
  let created;
  try {
    created = await prisma.missionStage.create({
      data: {
        organizationId,
        themeId: theme.id,
        name: body.name,
        slug,
        description: normalizeOptional(body.description),
        levelNumber,
        sortOrder: body.sortOrder,
        status: MissionStatus.DRAFT,
        createdById: actorId,
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (err) {
    if (isP2002(err)) {
      throw new HttpError(
        409,
        `Slug ou niveau déjà utilisé dans ce thème : ${slug} / ${levelNumber}`,
      );
    }
    throw err;
  }

  await logAudit({
    organizationId,
    actorId,
    action: "MISSION_STAGE_CREATE",
    targetType: "MissionStage",
    targetId: created.id,
    metadata: { slug, themeId: theme.id, levelNumber },
  });

  return getMissionStage(created.id, organizationId);
}

// ---------------- Mise à jour ----------------

export async function updateMissionTheme(
  id: string,
  organizationId: string,
  actorId: string,
  raw: unknown,
) {
  const theme = await loadThemeOrThrow(id, organizationId);
  assertEditableDraft(theme.status, "Thème");
  const body = MissionThemeUpdateSchema.parse(raw);

  const nextSlug =
    body.slug ?? (body.name ? slugifyMissionName(body.name) : undefined);
  if (nextSlug && nextSlug !== theme.slug) {
    await assertUniqueThemeSlug(organizationId, nextSlug, id);
  }

  try {
    await prisma.missionTheme.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(nextSlug ? { slug: nextSlug } : {}),
        ...(body.description !== undefined
          ? { description: normalizeOptional(body.description) }
          : {}),
        ...(body.iconKey !== undefined ? { iconKey: body.iconKey } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        updatedAt: nowIso(),
      },
    });
  } catch (err) {
    if (isP2002(err)) {
      throw new HttpError(409, "Slug de thème déjà utilisé.");
    }
    throw err;
  }

  await logAudit({
    organizationId,
    actorId,
    action: "MISSION_THEME_UPDATE",
    targetType: "MissionTheme",
    targetId: id,
  });

  return getMissionTheme(id, organizationId);
}

export async function updateMissionStage(
  id: string,
  organizationId: string,
  actorId: string,
  raw: unknown,
) {
  const stage = await loadStageOrThrow(id, organizationId);
  assertEditableDraft(stage.status, "Niveau");
  const body = MissionStageUpdateSchema.parse(raw);

  const nextSlug =
    body.slug ?? (body.name ? slugifyMissionName(body.name) : undefined);
  if (nextSlug && nextSlug !== stage.slug) {
    await assertUniqueStageSlug(stage.themeId, nextSlug, id);
  }
  if (body.levelNumber !== undefined && body.levelNumber !== stage.levelNumber) {
    await assertUniqueStageLevel(stage.themeId, body.levelNumber, id);
  }

  try {
    await prisma.missionStage.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(nextSlug ? { slug: nextSlug } : {}),
        ...(body.description !== undefined
          ? { description: normalizeOptional(body.description) }
          : {}),
        ...(body.levelNumber !== undefined
          ? { levelNumber: body.levelNumber }
          : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        updatedAt: nowIso(),
      },
    });
  } catch (err) {
    if (isP2002(err)) {
      throw new HttpError(409, "Slug ou niveau déjà utilisé dans ce thème.");
    }
    throw err;
  }

  await logAudit({
    organizationId,
    actorId,
    action: "MISSION_STAGE_UPDATE",
    targetType: "MissionStage",
    targetId: id,
  });

  return getMissionStage(id, organizationId);
}

// ---------------- Cycle de vie ----------------

export async function publishMissionTheme(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const theme = await loadThemeOrThrow(id, organizationId);
  if (theme.status === MissionStatus.ARCHIVED) {
    throw new HttpError(409, "Thème archivé : publication impossible.");
  }
  if (theme.status === MissionStatus.PUBLISHED) {
    throw new HttpError(409, "Thème déjà publié.");
  }
  const now = nowIso();
  await prisma.missionTheme.update({
    where: { id },
    data: {
      status: MissionStatus.PUBLISHED,
      publishedAt: now,
      updatedAt: now,
    },
  });
  await logAudit({
    organizationId,
    actorId,
    action: "MISSION_THEME_PUBLISH",
    targetType: "MissionTheme",
    targetId: id,
  });
  return getMissionTheme(id, organizationId);
}

export async function unpublishMissionTheme(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const theme = await loadThemeOrThrow(id, organizationId);
  if (theme.status !== MissionStatus.PUBLISHED) {
    throw new HttpError(409, "Le thème n'est pas publié.");
  }
  // Les niveaux gardent leur statut : la visibilité télépro exige
  // un thème ET un niveau publiés.
  await prisma.missionTheme.update({
    where: { id },
    data: { status: MissionStatus.DRAFT, updatedAt: nowIso() },
  });
  await logAudit({
    organizationId,
    actorId,
    action: "MISSION_THEME_UNPUBLISH",
    targetType: "MissionTheme",
    targetId: id,
  });
  return getMissionTheme(id, organizationId);
}

/** Archive idempotente : un thème déjà archivé est renvoyé tel quel. */
export async function archiveMissionTheme(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const theme = await loadThemeOrThrow(id, organizationId);
  if (theme.status === MissionStatus.ARCHIVED) {
    return getMissionTheme(id, organizationId);
  }
  const now = nowIso();
  await prisma.missionTheme.update({
    where: { id },
    data: {
      status: MissionStatus.ARCHIVED,
      archivedAt: now,
      updatedAt: now,
    },
  });
  await logAudit({
    organizationId,
    actorId,
    action: "MISSION_THEME_ARCHIVE",
    targetType: "MissionTheme",
    targetId: id,
  });
  return getMissionTheme(id, organizationId);
}

export async function publishMissionStage(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const stage = await loadStageOrThrow(id, organizationId);
  if (stage.status === MissionStatus.ARCHIVED) {
    throw new HttpError(409, "Niveau archivé : publication impossible.");
  }
  if (stage.status === MissionStatus.PUBLISHED) {
    throw new HttpError(409, "Niveau déjà publié.");
  }
  const theme = await loadThemeOrThrow(stage.themeId, organizationId);
  const exerciseRow = await loadStageExercise(id, organizationId);
  const exercise = exerciseRow ? toExerciseSummary(exerciseRow) : null;
  const readiness = buildMissionLevelReadiness({
    themeStatus: theme.status,
    exercise,
  });
  // Ne jamais auto-publier thème / exercice / prompt : refuser avec le détail.
  if (!readiness.readyToPublish) {
    throw new HttpError(
      409,
      `Niveau non prêt à la publication : ${readiness.missing.join(" ; ")}.`,
    );
  }
  const now = nowIso();
  await prisma.missionStage.update({
    where: { id },
    data: {
      status: MissionStatus.PUBLISHED,
      publishedAt: now,
      updatedAt: now,
    },
  });
  await logAudit({
    organizationId,
    actorId,
    action: "MISSION_STAGE_PUBLISH",
    targetType: "MissionStage",
    targetId: id,
  });
  return getMissionStage(id, organizationId);
}

export async function unpublishMissionStage(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const stage = await loadStageOrThrow(id, organizationId);
  if (stage.status !== MissionStatus.PUBLISHED) {
    throw new HttpError(409, "Le niveau n'est pas publié.");
  }
  await prisma.missionStage.update({
    where: { id },
    data: { status: MissionStatus.DRAFT, updatedAt: nowIso() },
  });
  await logAudit({
    organizationId,
    actorId,
    action: "MISSION_STAGE_UNPUBLISH",
    targetType: "MissionStage",
    targetId: id,
  });
  return getMissionStage(id, organizationId);
}

/** Archive idempotente : un niveau déjà archivé est renvoyé tel quel. */
export async function archiveMissionStage(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const stage = await loadStageOrThrow(id, organizationId);
  if (stage.status === MissionStatus.ARCHIVED) {
    return getMissionStage(id, organizationId);
  }
  const now = nowIso();
  await prisma.missionStage.update({
    where: { id },
    data: {
      status: MissionStatus.ARCHIVED,
      archivedAt: now,
      updatedAt: now,
    },
  });
  await logAudit({
    organizationId,
    actorId,
    action: "MISSION_STAGE_ARCHIVE",
    targetType: "MissionStage",
    targetId: id,
  });
  return getMissionStage(id, organizationId);
}

// ---------------- Suppression définitive (brouillons non référencés) ----------------

export async function deleteMissionTheme(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const theme = await loadThemeOrThrow(id, organizationId);
  if (theme.status !== MissionStatus.DRAFT) {
    throw new HttpError(
      409,
      "Suppression réservée aux brouillons ; archivez sinon.",
    );
  }
  const stageCount = await prisma.missionStage.count({
    where: { themeId: id, organizationId },
  });
  if (stageCount > 0) {
    throw new HttpError(
      409,
      "Thème non vide (niveaux existants) : suppression interdite.",
    );
  }
  await prisma.missionTheme.delete({ where: { id } });
  await logAudit({
    organizationId,
    actorId,
    action: "MISSION_THEME_DELETE",
    targetType: "MissionTheme",
    targetId: id,
  });
  return { deleted: true as const };
}

export async function deleteMissionStage(
  id: string,
  organizationId: string,
  actorId: string,
) {
  const stage = await loadStageOrThrow(id, organizationId);
  if (stage.status !== MissionStatus.DRAFT) {
    throw new HttpError(
      409,
      "Suppression réservée aux brouillons ; archivez sinon.",
    );
  }
  // Aucune suppression en cascade : les exercices classés bloquent le niveau
  // (la contrainte SQL ON DELETE RESTRICT est la seconde ligne de défense).
  const exercise = await loadStageExercise(id, organizationId);
  if (exercise) {
    throw new HttpError(
      409,
      "Niveau référencé par des exercices : déclassez-les avant suppression.",
    );
  }
  await prisma.missionStage.delete({ where: { id } });
  await logAudit({
    organizationId,
    actorId,
    action: "MISSION_STAGE_DELETE",
    targetType: "MissionStage",
    targetId: id,
  });
  return { deleted: true as const };
}

// ---------------- Association exercice ↔ niveau ----------------

/**
 * Associe un exercice à un niveau (un niveau = au plus un exercice).
 * Déplacer un exercice depuis un autre niveau est autorisé.
 */
export async function assignExerciseToStage(
  stageId: string,
  organizationId: string,
  actorId: string,
  exerciseId: string,
) {
  const stage = await loadStageOrThrow(stageId, organizationId);
  if (stage.status === MissionStatus.ARCHIVED) {
    throw new HttpError(409, "Niveau archivé : association impossible.");
  }

  const exercise = await prisma.scenario.findFirst({
    where: { id: exerciseId, organizationId },
    select: { id: true, missionStageId: true },
  });
  if (!exercise) throw new HttpError(404, "Exercice introuvable.");

  if (exercise.missionStageId === stageId) {
    return getMissionStage(stageId, organizationId);
  }

  const occupant = await prisma.scenario.findFirst({
    where: {
      missionStageId: stageId,
      organizationId,
      id: { not: exerciseId },
    },
    select: { id: true },
  });
  if (occupant) {
    throw new HttpError(409, "Ce niveau contient déjà un exercice.");
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.scenario.update({
        where: { id: exercise.id },
        data: { missionStageId: stageId, updatedAt: nowIso() },
      });
    });
  } catch (err) {
    if (isP2002(err)) {
      throw new HttpError(409, "Ce niveau contient déjà un exercice.");
    }
    throw err;
  }

  await logAudit({
    organizationId,
    actorId,
    action: "MISSION_STAGE_ASSIGN_EXERCISE",
    targetType: "MissionStage",
    targetId: stageId,
    metadata: { exerciseId },
  });

  return getMissionStage(stageId, organizationId);
}

/**
 * Retire l'exercice d'un niveau brouillon.
 * Interdit si le niveau est publié ou archivé.
 */
export async function unassignExerciseFromStage(
  stageId: string,
  organizationId: string,
  actorId: string,
) {
  const stage = await loadStageOrThrow(stageId, organizationId);
  if (stage.status !== MissionStatus.DRAFT) {
    throw new HttpError(
      409,
      "Déclassement réservé aux niveaux brouillon (publié ou archivé interdit).",
    );
  }

  const exercise = await loadStageExercise(stageId, organizationId);
  if (!exercise) {
    return getMissionStage(stageId, organizationId);
  }

  await prisma.scenario.update({
    where: { id: exercise.id },
    data: { missionStageId: null, updatedAt: nowIso() },
  });

  await logAudit({
    organizationId,
    actorId,
    action: "MISSION_STAGE_UNASSIGN_EXERCISE",
    targetType: "MissionStage",
    targetId: stageId,
    metadata: { exerciseId: exercise.id },
  });

  return getMissionStage(stageId, organizationId);
}
