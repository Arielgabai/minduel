import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { logAudit } from "./audit";
import { HttpError } from "./httpError";
import { nowIso } from "./utils";
import {
  MissionStageCreateSchema,
  MissionStageUpdateSchema,
  MissionStatus,
  MissionThemeCreateSchema,
  MissionThemeUpdateSchema,
  slugifyMissionName,
  sortMissionStages,
  sortMissionThemes,
  type MissionStageNode,
  type MissionThemeNode,
} from "./missionCatalog";

// ---------------------------------------------------------------------------
// Catalogue Missions — service admin (PLATFORM_ADMIN uniquement).
// organizationId et actorId sont toujours fournis explicitement par l'appelant.
// Chaque lecture et chaque écriture filtre sur organizationId : une ressource
// d'une autre organisation est traitée comme inexistante (404).
// Aucun prompt, bundle, artifact, hash, secret ou persona n'est exposé ici.
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

type ThemeRecord = Awaited<
  ReturnType<typeof prisma.missionTheme.findFirstOrThrow>
>;
type StageRecord = Awaited<
  ReturnType<typeof prisma.missionStage.findFirstOrThrow>
>;

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
  if (!stage) throw new HttpError(404, "Phase introuvable.");
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
  if (existing) throw new HttpError(409, `Slug de phase déjà utilisé : ${slug}`);
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

async function countStageExercises(
  stageId: string,
  organizationId: string,
): Promise<number> {
  return prisma.scenario.count({
    where: { missionStageId: stageId, organizationId },
  });
}

// ---------------- Lecture ----------------

/** Arbre Thèmes → phases, avec le nombre d'exercices classés par phase. */
export async function listMissionCatalog(
  organizationId: string,
): Promise<MissionThemeNode[]> {
  const [themes, stages, grouped] = await Promise.all([
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
    prisma.scenario.groupBy({
      by: ["missionStageId"],
      where: { organizationId, missionStageId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map<string, number>();
  for (const row of grouped ?? []) {
    if (row.missionStageId) counts.set(row.missionStageId, row._count._all);
  }

  const stageNodes: MissionStageNode[] = stages.map((stage) => ({
    ...stage,
    exerciseCount: counts.get(stage.id) ?? 0,
  }));

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
  const exerciseCount = await countStageExercises(id, organizationId);
  return { ...stagePayload(stage), exerciseCount };
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
  // Thème hors organisation → 404 : aucune phase ne peut viser un parent étranger.
  const theme = await loadThemeOrThrow(body.themeId, organizationId);
  if (theme.status === MissionStatus.ARCHIVED) {
    throw new HttpError(409, "Thème archivé : ajout de phase impossible.");
  }
  const slug = resolveSlug(body.slug, body.name);
  await assertUniqueStageSlug(theme.id, slug);
  await assertUniqueStageLevel(theme.id, body.levelNumber);

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
        levelNumber: body.levelNumber,
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
        `Slug ou niveau déjà utilisé dans ce thème : ${slug} / ${body.levelNumber}`,
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
    metadata: { slug, themeId: theme.id, levelNumber: body.levelNumber },
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
  assertEditableDraft(stage.status, "Phase");
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
  // Les phases gardent leur statut : la visibilité télépro (lot N2) exigera
  // un thème ET une phase publiés.
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
    throw new HttpError(409, "Phase archivée : publication impossible.");
  }
  if (stage.status === MissionStatus.PUBLISHED) {
    throw new HttpError(409, "Phase déjà publiée.");
  }
  const theme = await loadThemeOrThrow(stage.themeId, organizationId);
  if (theme.status !== MissionStatus.PUBLISHED) {
    throw new HttpError(
      409,
      "Publiez d'abord le thème parent avant la phase.",
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
    throw new HttpError(409, "La phase n'est pas publiée.");
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

/** Archive idempotente : une phase déjà archivée est renvoyée telle quelle. */
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
      "Thème non vide (phases existantes) : suppression interdite.",
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
  // Aucune suppression en cascade : les exercices classés bloquent la phase
  // (la contrainte SQL ON DELETE RESTRICT est la seconde ligne de défense).
  const exerciseCount = await countStageExercises(id, organizationId);
  if (exerciseCount > 0) {
    throw new HttpError(
      409,
      "Phase référencée par des exercices : déclassez-les avant suppression.",
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
