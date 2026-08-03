import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./db";
import { logAudit } from "./audit";
import { HttpError } from "./httpError";
import {
  PromptBundleStatus,
  PromptKind,
  ScenarioStatus,
} from "./enums";
import { buildProspectPersona, type ScenarioForSim } from "./simulation";
import {
  hashPromptArtifacts,
  type PromptArtifact,
} from "./promptArtifacts";
import {
  MISSION_UNCLASSIFIED,
  MissionStatus,
  ProspectAvatarKeySchema,
} from "./missionCatalog";
import { nowIso, parseJson, stringifyJson } from "./utils";

export { hashPromptArtifacts } from "./promptArtifacts";
export type { PromptArtifact, PromptArtifacts } from "./promptArtifacts";

/** Clés interdites dans toute réponse destinée au téléprospecteur. */
export const TELEPRO_FORBIDDEN_PROMPT_KEYS = [
  "artifacts",
  "contentHash",
  "promptBundle",
  "promptBundles",
  "PROSPECT_PERSONA",
  "EVALUATION_SYSTEM",
  "EVALUATION_USER",
  "changeNote",
  "internalNotes",
] as const;

type AdminPromptArtifacts = Partial<Record<PromptKind, PromptArtifact>> & {
  PROSPECT_PERSONA: PromptArtifact;
};

const PromptArtifactSchema = z.object({
  body: z.string().min(20).max(20_000),
  contentType: z.string().min(1).max(80).default("text/plain"),
});

export const PromptArtifactsSchema = z
  .object({
    [PromptKind.PROSPECT_PERSONA]: PromptArtifactSchema,
    [PromptKind.EVALUATION_SYSTEM]: PromptArtifactSchema.optional(),
    [PromptKind.EVALUATION_USER]: PromptArtifactSchema.optional(),
  })
  .strict();

export const ExerciseMetadataSchema = z.object({
  name: z.string().min(2).max(160),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug kebab-case requis")
    .optional(),
  level: z.enum(["FACILE", "MOYEN", "DIFFICILE"]).default("MOYEN"),
  missionLevel: z.number().int().min(1).max(20).default(1),
  sortOrder: z.number().int().min(0).max(999).default(0),
  callType: z
    .enum(["VENTE", "PITCH_INVESTISSEUR", "ENTRETIEN_EMBAUCHE"])
    .default("VENTE"),
  campaign: z.string().max(160).optional(),
  offer: z.string().max(1000).optional(),
  prospectProfile: z.string().max(1000).optional(),
  initialSituation: z.string().max(1000).optional(),
  objective: z.string().max(1000).optional(),
  personality: z.string().max(1000).optional(),
  allowedObjections: z.array(z.string()).default([]),
  secretInfos: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .default([]),
  successConditions: z.string().max(1000).optional(),
  failureConditions: z.string().max(1000).optional(),
  targetDurationSec: z.number().int().min(60).max(1800).default(300),
  traineeBrief: z.string().max(4000).optional(),
  // Catalogue Missions (lot N1) : null retire explicitement le classement /
  // l'avatar ; undefined laisse la valeur existante inchangée.
  missionStageId: z.string().min(1).max(64).nullish(),
  prospectAvatarKey: ProspectAvatarKeySchema.nullish(),
});

export type ExerciseMetadataInput = z.infer<typeof ExerciseMetadataSchema>;

const ListFiltersSchema = z.object({
  status: z
    .enum(["DRAFT", "REVIEW_REQUIRED", "PUBLISHED", "ARCHIVED"])
    .optional(),
  missionLevel: z.coerce.number().int().min(1).max(20).optional(),
  q: z.string().max(120).optional(),
  // Catalogue Missions : identifiant, ou MISSION_UNCLASSIFIED pour « Non classé ».
  missionThemeId: z.string().min(1).max(64).optional(),
  missionStageId: z.string().min(1).max(64).optional(),
});

/** Fixtures locales pour prévisualiser l'interpolation (aucun réseau). */
export const PREVIEW_FIXTURES: Record<string, Record<string, string>> = {
  default: {
    prospectName: "Marie Dupont",
    offer: "offre demo",
    callType: "VENTE",
    level: "MOYEN",
    objective: "obtenir un rendez-vous",
  },
  difficult: {
    prospectName: "Jean Martin",
    offer: "abonnement premium",
    callType: "VENTE",
    level: "DIFFICILE",
    objective: "qualifier le besoin",
  },
};

export function slugifyName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function parseArtifacts(raw: string): AdminPromptArtifacts {
  const parsed = parseJson<AdminPromptArtifacts>(raw, {
    PROSPECT_PERSONA: {
      body: "Tu incarnes un prospect.",
      contentType: "text/plain",
    },
  });
  return PromptArtifactsSchema.parse(parsed) as AdminPromptArtifacts;
}

/** Interpolation locale `{{cle}}` — aucun appel modèle. */
export function interpolatePrompt(
  body: string,
  vars: Record<string, string>,
): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : full,
  );
}

export function assertNoRawPromptsInTeleproPayload(
  payload: unknown,
  path = "",
): void {
  if (payload == null || typeof payload !== "object") return;
  if (Array.isArray(payload)) {
    payload.forEach((item, i) =>
      assertNoRawPromptsInTeleproPayload(item, `${path}[${i}]`),
    );
    return;
  }
  for (const [key, value] of Object.entries(
    payload as Record<string, unknown>,
  )) {
    const next = path ? `${path}.${key}` : key;
    if ((TELEPRO_FORBIDDEN_PROMPT_KEYS as readonly string[]).includes(key)) {
      throw new HttpError(500, `Fuite prompt interdite côté télépro: ${next}`);
    }
    assertNoRawPromptsInTeleproPayload(value, next);
  }
}

/** Contrat create-simulation télépro (pas de prompts bruts). */
export const TELEPRO_SIMULATION_CREATE_CONTRACT = {
  id: "uuid",
  prospectName: "string",
  mode: "DEMO|REALTIME",
  demo: true,
  opener: "string",
  level: "FACILE|MOYEN|DIFFICILE",
  scenarioName: "string",
} as const;

function scenarioToSimShape(s: {
  id: string;
  name: string;
  callType: string;
  offer: string | null;
  prospectProfile: string | null;
  initialSituation: string | null;
  objective: string | null;
  level: string;
  personality: string | null;
  allowedObjections: string | null;
  secretInfos: string | null;
  successConditions: string | null;
  failureConditions: string | null;
  targetDurationSec: number;
  relationshipHistory?: string | null;
  aiProspect?: string | null;
  expectedNextSteps?: string | null;
  traineeBrief?: string | null;
}): ScenarioForSim {
  return {
    id: s.id,
    name: s.name,
    callType: s.callType,
    offer: s.offer,
    prospectProfile: s.prospectProfile,
    initialSituation: s.initialSituation,
    objective: s.objective,
    level: s.level,
    personality: s.personality,
    allowedObjections: s.allowedObjections,
    secretInfos: s.secretInfos,
    successConditions: s.successConditions,
    failureConditions: s.failureConditions,
    targetDurationSec: s.targetDurationSec,
    relationshipHistory: s.relationshipHistory ?? null,
    aiProspect: s.aiProspect ?? null,
    expectedNextSteps: s.expectedNextSteps ?? null,
    traineeBrief: s.traineeBrief ?? null,
  };
}

async function assertUniqueSlug(
  organizationId: string,
  slug: string,
  excludeId?: string,
): Promise<void> {
  const existing = await prisma.scenario.findFirst({
    where: {
      organizationId,
      slug,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new HttpError(409, `Slug déjà utilisé : ${slug}`);
  }
}

async function loadExerciseOrThrow(id: string, organizationId: string) {
  const scenario = await prisma.scenario.findFirst({
    where: { id, organizationId },
    include: {
      promptBundles: { orderBy: { version: "desc" } },
      publishedPromptBundle: true,
      rubric: true,
      missionStage: {
        select: {
          id: true,
          themeId: true,
          name: true,
          status: true,
          theme: { select: { id: true, name: true, status: true } },
        },
      },
      _count: { select: { simulations: true, assignments: true } },
    },
  });
  if (!scenario) throw new HttpError(404, "Exercice introuvable.");
  return scenario;
}

/**
 * Vérifie qu'un niveau est affectable à un exercice de cette organisation.
 * Hors organisation → 404 (aucune fuite d'existence) ; niveau ou thème archivé
 * → 409 ; niveau déjà occupé par un autre exercice → 409. La contrainte SQL
 * composite (missionStageId, organizationId) est la seconde ligne de défense.
 */
async function resolveAssignableStageId(
  stageId: string,
  organizationId: string,
  excludeExerciseId?: string,
): Promise<string> {
  const stage = await prisma.missionStage.findFirst({
    where: { id: stageId, organizationId },
    select: {
      id: true,
      status: true,
      theme: { select: { status: true } },
    },
  });
  if (!stage) throw new HttpError(404, "Niveau de mission introuvable.");
  if (stage.status === MissionStatus.ARCHIVED) {
    throw new HttpError(409, "Niveau archivé : classement impossible.");
  }
  if (stage.theme?.status === MissionStatus.ARCHIVED) {
    throw new HttpError(409, "Thème archivé : classement impossible.");
  }
  const occupants = await prisma.scenario.count({
    where: {
      organizationId,
      missionStageId: stage.id,
      ...(excludeExerciseId ? { id: { not: excludeExerciseId } } : {}),
    },
  });
  if (occupants > 0) {
    throw new HttpError(409, "Ce niveau contient déjà un exercice.");
  }
  return stage.id;
}

function bundleSummary(b: {
  id: string;
  version: number;
  status: string;
  label: string | null;
  createdById: string | null;
  createdAt: string;
  publishedAt: string | null;
  contentHash: string;
  artifacts: string;
}) {
  return {
    id: b.id,
    version: b.version,
    status: b.status,
    changeNote: b.label,
    createdById: b.createdById,
    createdAt: b.createdAt,
    publishedAt: b.publishedAt,
    contentHash: b.contentHash,
    artifacts: parseArtifacts(b.artifacts),
  };
}

/** Niveau joint : uniquement des libellés de classement, jamais de contenu. */
type ListItemStage = {
  id: string;
  themeId: string;
  name: string;
  status: string;
  theme?: { id: string; name: string; status: string } | null;
} | null;

function listItem(s: {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  level: string;
  missionLevel: number;
  sortOrder: number;
  publishedPromptBundleId: string | null;
  updatedAt: string;
  createdAt: string;
  missionStageId?: string | null;
  prospectAvatarKey?: string | null;
  missionStage?: ListItemStage;
}) {
  const stage = s.missionStage ?? null;
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    status: s.status,
    level: s.level,
    missionLevel: s.missionLevel,
    sortOrder: s.sortOrder,
    publishedPromptBundleId: s.publishedPromptBundleId,
    updatedAt: s.updatedAt,
    createdAt: s.createdAt,
    // Classement Missions : null = « Non classé » (exercice legacy conservé).
    missionStageId: s.missionStageId ?? null,
    missionStageName: stage?.name ?? null,
    missionThemeId: stage?.themeId ?? null,
    missionThemeName: stage?.theme?.name ?? null,
    prospectAvatarKey: s.prospectAvatarKey ?? null,
  };
}

export async function listExercises(
  organizationId: string,
  rawFilters: unknown = {},
) {
  const filters = ListFiltersSchema.parse(rawFilters ?? {});
  const where: {
    organizationId: string;
    status?: string;
    missionLevel?: number;
    missionStageId?: string | null;
    missionStage?: { themeId: string };
    OR?: Array<{
      name?: { contains: string; mode: "insensitive" };
      slug?: { contains: string; mode: "insensitive" };
    }>;
  } = { organizationId };
  if (filters.status) where.status = filters.status;
  if (filters.missionLevel != null) where.missionLevel = filters.missionLevel;
  // « Non classé » l'emporte sur un filtre de thème : les deux sont exclusifs.
  if (
    filters.missionStageId === MISSION_UNCLASSIFIED ||
    filters.missionThemeId === MISSION_UNCLASSIFIED
  ) {
    where.missionStageId = null;
  } else if (filters.missionStageId) {
    where.missionStageId = filters.missionStageId;
  } else if (filters.missionThemeId) {
    where.missionStage = { themeId: filters.missionThemeId };
  }
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { slug: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  const rows = await prisma.scenario.findMany({
    where,
    orderBy: [
      { missionLevel: "asc" },
      { sortOrder: "asc" },
      { name: "asc" },
    ],
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      level: true,
      missionLevel: true,
      sortOrder: true,
      publishedPromptBundleId: true,
      updatedAt: true,
      createdAt: true,
      missionStageId: true,
      prospectAvatarKey: true,
      missionStage: {
        select: {
          id: true,
          themeId: true,
          name: true,
          status: true,
          theme: { select: { id: true, name: true, status: true } },
        },
      },
    },
  });
  return rows.map(listItem);
}

export async function getExercise(id: string, organizationId: string) {
  const s = await loadExerciseOrThrow(id, organizationId);
  const current =
    s.promptBundles.find((b) => b.status === PromptBundleStatus.DRAFT) ??
    s.publishedPromptBundle ??
    s.promptBundles[0] ??
    null;
  return {
    ...listItem(s),
    callType: s.callType,
    campaign: s.campaign,
    offer: s.offer,
    prospectProfile: s.prospectProfile,
    initialSituation: s.initialSituation,
    objective: s.objective,
    personality: s.personality,
    allowedObjections: parseJson<string[]>(s.allowedObjections, []),
    secretInfos: parseJson<Array<{ question: string; answer: string }>>(
      s.secretInfos,
      [],
    ),
    successConditions: s.successConditions,
    failureConditions: s.failureConditions,
    targetDurationSec: s.targetDurationSec,
    traineeBrief: s.traineeBrief,
    authorId: s.authorId,
    referenceCounts: {
      simulations: s._count.simulations,
      assignments: s._count.assignments,
    },
    currentBundle: current ? bundleSummary(current) : null,
    versions: s.promptBundles.map((b) => ({
      id: b.id,
      version: b.version,
      status: b.status,
      changeNote: b.label,
      createdById: b.createdById,
      createdAt: b.createdAt,
      publishedAt: b.publishedAt,
      contentHash: b.contentHash,
    })),
  };
}

export async function createExerciseDraft(
  organizationId: string,
  actorId: string,
  raw: unknown,
) {
  const body = ExerciseMetadataSchema.parse(raw);
  const slug = body.slug ?? slugifyName(body.name);
  if (!slug) throw new HttpError(422, "Slug invalide.");
  await assertUniqueSlug(organizationId, slug);
  const missionStageId = body.missionStageId
    ? await resolveAssignableStageId(body.missionStageId, organizationId)
    : null;

  const now = nowIso();
  let scenario: Awaited<ReturnType<typeof prisma.scenario.create>>;
  let bundle: Awaited<ReturnType<typeof prisma.promptBundle.create>>;
  try {
    const created = await prisma.$transaction(async (tx) => {
      const createdScenario = await tx.scenario.create({
        data: {
          organizationId,
          authorId: actorId,
          name: body.name,
          slug,
          missionLevel: body.missionLevel,
          sortOrder: body.sortOrder,
          callType: body.callType,
          level: body.level,
          campaign: body.campaign ?? null,
          offer: body.offer ?? null,
          prospectProfile: body.prospectProfile ?? null,
          initialSituation: body.initialSituation ?? null,
          objective: body.objective ?? null,
          personality: body.personality ?? null,
          allowedObjections: stringifyJson(body.allowedObjections),
          secretInfos: stringifyJson(body.secretInfos),
          successConditions: body.successConditions ?? null,
          failureConditions: body.failureConditions ?? null,
          targetDurationSec: body.targetDurationSec,
          traineeBrief: body.traineeBrief ?? null,
          missionStageId,
          prospectAvatarKey: body.prospectAvatarKey ?? null,
          status: ScenarioStatus.DRAFT,
          createdAt: now,
          updatedAt: now,
        },
      });

      const personaBody = buildProspectPersona(
        scenarioToSimShape(createdScenario),
        [],
        "{{prospectName}}",
      );
      const artifacts: AdminPromptArtifacts = {
        [PromptKind.PROSPECT_PERSONA]: {
          body: personaBody,
          contentType: "text/plain",
        },
      };
      const contentHash = hashPromptArtifacts(artifacts);

      const createdBundle = await tx.promptBundle.create({
        data: {
          organizationId,
          scenarioId: createdScenario.id,
          version: 1,
          status: PromptBundleStatus.DRAFT,
          label: "v1 — brouillon initial",
          createdById: actorId,
          createdAt: now,
          artifacts: stringifyJson(artifacts),
          contentHash,
        },
      });

      return { scenario: createdScenario, bundle: createdBundle };
    });
    scenario = created.scenario;
    bundle = created.bundle;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      missionStageId
    ) {
      throw new HttpError(409, "Ce niveau contient déjà un exercice.");
    }
    throw err;
  }

  await logAudit({
    organizationId,
    actorId,
    action: "EXERCISE_CREATE",
    targetType: "Scenario",
    targetId: scenario.id,
    metadata: { slug, bundleId: bundle.id },
  });

  return getExercise(scenario.id, organizationId);
}

export async function updateExerciseMetadata(
  id: string,
  organizationId: string,
  actorId: string,
  raw: unknown,
) {
  const body = ExerciseMetadataSchema.partial().parse(raw);
  const existing = await loadExerciseOrThrow(id, organizationId);
  if (existing.status === ScenarioStatus.ARCHIVED) {
    throw new HttpError(409, "Exercice archivé : métadonnées non modifiables.");
  }

  // Classement Missions : undefined = inchangé, null = « Non classé ».
  let missionStageId = existing.missionStageId;
  if (body.missionStageId !== undefined) {
    missionStageId = body.missionStageId
      ? await resolveAssignableStageId(
          body.missionStageId,
          organizationId,
          id,
        )
      : null;
  }
  let prospectAvatarKey = existing.prospectAvatarKey;
  if (body.prospectAvatarKey !== undefined) {
    prospectAvatarKey = body.prospectAvatarKey ?? null;
  }

  let slug = existing.slug;
  if (body.slug !== undefined) {
    await assertUniqueSlug(organizationId, body.slug, id);
    slug = body.slug;
  } else if (body.name && !existing.slug) {
    slug = slugifyName(body.name);
    await assertUniqueSlug(organizationId, slug, id);
  }

  try {
    await prisma.scenario.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        slug,
        level: body.level ?? existing.level,
        missionLevel: body.missionLevel ?? existing.missionLevel,
        sortOrder: body.sortOrder ?? existing.sortOrder,
        callType: body.callType ?? existing.callType,
        campaign: body.campaign !== undefined ? body.campaign : existing.campaign,
        offer: body.offer !== undefined ? body.offer : existing.offer,
        prospectProfile:
          body.prospectProfile !== undefined
            ? body.prospectProfile
            : existing.prospectProfile,
        initialSituation:
          body.initialSituation !== undefined
            ? body.initialSituation
            : existing.initialSituation,
        objective:
          body.objective !== undefined ? body.objective : existing.objective,
        personality:
          body.personality !== undefined
            ? body.personality
            : existing.personality,
        allowedObjections: body.allowedObjections
          ? stringifyJson(body.allowedObjections)
          : existing.allowedObjections,
        secretInfos: body.secretInfos
          ? stringifyJson(body.secretInfos)
          : existing.secretInfos,
        successConditions:
          body.successConditions !== undefined
            ? body.successConditions
            : existing.successConditions,
        failureConditions:
          body.failureConditions !== undefined
            ? body.failureConditions
            : existing.failureConditions,
        targetDurationSec: body.targetDurationSec ?? existing.targetDurationSec,
        traineeBrief:
          body.traineeBrief !== undefined
            ? body.traineeBrief
            : existing.traineeBrief,
        // Le bundle de prompts n'est jamais touché par cette mise à jour.
        missionStageId,
        prospectAvatarKey,
        updatedAt: nowIso(),
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      missionStageId
    ) {
      throw new HttpError(409, "Ce niveau contient déjà un exercice.");
    }
    throw err;
  }

  await logAudit({
    organizationId,
    actorId,
    action: "EXERCISE_UPDATE_METADATA",
    targetType: "Scenario",
    targetId: id,
  });

  return getExercise(id, organizationId);
}

async function nextVersionNumber(scenarioId: string): Promise<number> {
  const agg = await prisma.promptBundle.aggregate({
    where: { scenarioId },
    _max: { version: true },
  });
  return (agg._max.version ?? 0) + 1;
}

async function createDraftBundle(opts: {
  organizationId: string;
  scenarioId: string;
  actorId: string;
  artifacts: AdminPromptArtifacts;
  changeNote: string;
  version?: number;
}) {
  const existingDraft = await prisma.promptBundle.findFirst({
    where: {
      scenarioId: opts.scenarioId,
      status: PromptBundleStatus.DRAFT,
    },
  });
  if (existingDraft) {
    throw new HttpError(
      409,
      "Un brouillon de prompts existe déjà ; modifiez-le ou publiez-le.",
    );
  }

  const version = opts.version ?? (await nextVersionNumber(opts.scenarioId));
  const contentHash = hashPromptArtifacts(opts.artifacts);
  const now = nowIso();

  try {
    return await prisma.promptBundle.create({
      data: {
        organizationId: opts.organizationId,
        scenarioId: opts.scenarioId,
        version,
        status: PromptBundleStatus.DRAFT,
        label: opts.changeNote,
        createdById: opts.actorId,
        createdAt: now,
        artifacts: stringifyJson(opts.artifacts),
        contentHash,
      },
    });
  } catch (err) {
    if (
      !(
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      )
    ) {
      throw err;
    }
    const retryVersion = await nextVersionNumber(opts.scenarioId);
    if (retryVersion === version) throw err;
    return prisma.promptBundle.create({
      data: {
        organizationId: opts.organizationId,
        scenarioId: opts.scenarioId,
        version: retryVersion,
        status: PromptBundleStatus.DRAFT,
        label: opts.changeNote,
        createdById: opts.actorId,
        createdAt: nowIso(),
        artifacts: stringifyJson(opts.artifacts),
        contentHash,
      },
    });
  }
}

export async function createPromptVersion(
  exerciseId: string,
  organizationId: string,
  actorId: string,
  raw: unknown,
) {
  const schema = z.object({
    artifacts: PromptArtifactsSchema,
    changeNote: z.string().min(1).max(240),
  });
  const body = schema.parse(raw);
  const exercise = await loadExerciseOrThrow(exerciseId, organizationId);
  if (exercise.status === ScenarioStatus.ARCHIVED) {
    throw new HttpError(409, "Exercice archivé.");
  }

  const artifacts = body.artifacts as AdminPromptArtifacts;
  const bundle = await createDraftBundle({
    organizationId,
    scenarioId: exercise.id,
    actorId,
    artifacts,
    changeNote: body.changeNote,
  });

  await logAudit({
    organizationId,
    actorId,
    action: "PROMPT_BUNDLE_CREATE",
    targetType: "PromptBundle",
    targetId: bundle.id,
    metadata: { scenarioId: exercise.id, version: bundle.version },
  });

  return getExercise(exerciseId, organizationId);
}

export async function updateDraftPromptBundle(
  exerciseId: string,
  organizationId: string,
  actorId: string,
  raw: unknown,
) {
  const schema = z.object({
    artifacts: PromptArtifactsSchema,
    changeNote: z.string().min(1).max(240).optional(),
  });
  const body = schema.parse(raw);
  const exercise = await loadExerciseOrThrow(exerciseId, organizationId);
  if (exercise.status === ScenarioStatus.ARCHIVED) {
    throw new HttpError(409, "Exercice archivé.");
  }
  const draft = exercise.promptBundles.find(
    (b) => b.status === PromptBundleStatus.DRAFT,
  );
  if (!draft) throw new HttpError(404, "Aucun brouillon de prompts.");

  const artifacts = body.artifacts as AdminPromptArtifacts;
  await prisma.promptBundle.update({
    where: { id: draft.id },
    data: {
      artifacts: stringifyJson(artifacts),
      contentHash: hashPromptArtifacts(artifacts),
      label: body.changeNote ?? draft.label,
    },
  });

  await logAudit({
    organizationId,
    actorId,
    action: "PROMPT_BUNDLE_UPDATE",
    targetType: "PromptBundle",
    targetId: draft.id,
  });

  return getExercise(exerciseId, organizationId);
}

export async function publishPromptBundle(
  exerciseId: string,
  organizationId: string,
  actorId: string,
) {
  const exercise = await loadExerciseOrThrow(exerciseId, organizationId);
  if (exercise.status === ScenarioStatus.ARCHIVED) {
    throw new HttpError(409, "Exercice archivé.");
  }
  const draft = exercise.promptBundles.find(
    (b) => b.status === PromptBundleStatus.DRAFT,
  );
  if (!draft) throw new HttpError(404, "Aucun brouillon à publier.");

  const now = nowIso();
  await prisma.$transaction(async (tx) => {
    await tx.promptBundle.updateMany({
      where: {
        scenarioId: exercise.id,
        status: PromptBundleStatus.PUBLISHED,
      },
      data: { status: PromptBundleStatus.SUPERSEDED },
    });
    await tx.promptBundle.update({
      where: { id: draft.id },
      data: {
        status: PromptBundleStatus.PUBLISHED,
        publishedAt: now,
      },
    });
    await tx.scenario.update({
      where: { id: exercise.id },
      data: {
        publishedPromptBundleId: draft.id,
        updatedAt: now,
      },
    });
  });

  await logAudit({
    organizationId,
    actorId,
    action: "PROMPT_BUNDLE_PUBLISH",
    targetType: "PromptBundle",
    targetId: draft.id,
    metadata: { scenarioId: exercise.id, version: draft.version },
  });

  return getExercise(exerciseId, organizationId);
}

export async function publishExercise(
  exerciseId: string,
  organizationId: string,
  actorId: string,
) {
  const exercise = await loadExerciseOrThrow(exerciseId, organizationId);
  if (!exercise.publishedPromptBundleId) {
    throw new HttpError(
      409,
      "Publiez d'abord un bundle de prompts avant de publier l'exercice.",
    );
  }
  if (exercise.status === ScenarioStatus.ARCHIVED) {
    throw new HttpError(409, "Exercice archivé.");
  }

  await prisma.scenario.update({
    where: { id: exerciseId },
    data: { status: ScenarioStatus.PUBLISHED, updatedAt: nowIso() },
  });

  await logAudit({
    organizationId,
    actorId,
    action: "EXERCISE_PUBLISH",
    targetType: "Scenario",
    targetId: exerciseId,
  });

  return getExercise(exerciseId, organizationId);
}

export async function unpublishExercise(
  exerciseId: string,
  organizationId: string,
  actorId: string,
) {
  const exercise = await loadExerciseOrThrow(exerciseId, organizationId);
  if (exercise.status !== ScenarioStatus.PUBLISHED) {
    throw new HttpError(409, "L'exercice n'est pas publié.");
  }

  await prisma.scenario.update({
    where: { id: exerciseId },
    data: { status: ScenarioStatus.DRAFT, updatedAt: nowIso() },
  });

  await logAudit({
    organizationId,
    actorId,
    action: "EXERCISE_UNPUBLISH",
    targetType: "Scenario",
    targetId: exerciseId,
  });

  return getExercise(exerciseId, organizationId);
}

export async function archiveExercise(
  exerciseId: string,
  organizationId: string,
  actorId: string,
) {
  const exercise = await loadExerciseOrThrow(exerciseId, organizationId);
  if (exercise.status === ScenarioStatus.ARCHIVED) {
    return getExercise(exerciseId, organizationId);
  }

  await prisma.scenario.update({
    where: { id: exerciseId },
    data: { status: ScenarioStatus.ARCHIVED, updatedAt: nowIso() },
  });

  await logAudit({
    organizationId,
    actorId,
    action: "EXERCISE_ARCHIVE",
    targetType: "Scenario",
    targetId: exerciseId,
    metadata: {
      simulations: exercise._count.simulations,
      assignments: exercise._count.assignments,
    },
  });

  return getExercise(exerciseId, organizationId);
}

export async function duplicateExercise(
  exerciseId: string,
  organizationId: string,
  actorId: string,
) {
  const source = await loadExerciseOrThrow(exerciseId, organizationId);
  const baseSlug = `${source.slug ?? slugifyName(source.name)}-copy`;
  let slug = baseSlug;
  let n = 2;
  while (
    await prisma.scenario.findFirst({
      where: { organizationId, slug },
      select: { id: true },
    })
  ) {
    slug = `${baseSlug}-${n}`;
    n += 1;
  }

  const now = nowIso();
  const sourceBundle =
    source.publishedPromptBundle ??
    source.promptBundles.find((b) => b.status === PromptBundleStatus.DRAFT) ??
    source.promptBundles[0];
  if (!sourceBundle) {
    throw new HttpError(409, "Aucun bundle source à dupliquer.");
  }

  const artifacts = parseArtifacts(sourceBundle.artifacts);
  const contentHash = hashPromptArtifacts(artifacts);

  const created = await prisma.$transaction(async (tx) => {
    const scenario = await tx.scenario.create({
      data: {
        organizationId,
        authorId: actorId,
        name: `${source.name} (copie)`,
        slug,
        missionLevel: source.missionLevel,
        sortOrder: source.sortOrder,
        callType: source.callType,
        level: source.level,
        campaign: source.campaign,
        offer: source.offer,
        prospectProfile: source.prospectProfile,
        initialSituation: source.initialSituation,
        objective: source.objective,
        personality: source.personality,
        allowedObjections: source.allowedObjections,
        secretInfos: source.secretInfos,
        successConditions: source.successConditions,
        failureConditions: source.failureConditions,
        targetDurationSec: source.targetDurationSec,
        traineeBrief: source.traineeBrief,
        knowledgeRefs: source.knowledgeRefs,
        aiProspect: source.aiProspect,
        relationshipHistory: source.relationshipHistory,
        expectedNextSteps: source.expectedNextSteps,
        targetSkills: source.targetSkills,
        coachingReference: source.coachingReference,
        status: ScenarioStatus.DRAFT,
        createdAt: now,
        updatedAt: now,
      },
    });

    if (source.rubric) {
      await tx.evaluationRubric.create({
        data: {
          organizationId,
          scenarioId: scenario.id,
          name: source.rubric.name,
          criteria: source.rubric.criteria,
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    await tx.promptBundle.create({
      data: {
        organizationId,
        scenarioId: scenario.id,
        version: 1,
        status: PromptBundleStatus.DRAFT,
        label: `copie depuis ${source.slug ?? source.id} v${sourceBundle.version}`,
        createdById: actorId,
        createdAt: now,
        artifacts: stringifyJson(artifacts),
        contentHash,
      },
    });

    return scenario;
  });

  await logAudit({
    organizationId,
    actorId,
    action: "EXERCISE_DUPLICATE",
    targetType: "Scenario",
    targetId: created.id,
    metadata: { sourceId: exerciseId },
  });

  return getExercise(created.id, organizationId);
}

export async function restorePromptVersion(
  exerciseId: string,
  organizationId: string,
  actorId: string,
  raw: unknown,
) {
  const schema = z.object({
    fromVersion: z.number().int().min(1),
    changeNote: z.string().min(1).max(240).optional(),
  });
  const body = schema.parse(raw);
  const exercise = await loadExerciseOrThrow(exerciseId, organizationId);
  if (exercise.status === ScenarioStatus.ARCHIVED) {
    throw new HttpError(409, "Exercice archivé.");
  }
  const source = exercise.promptBundles.find(
    (b) => b.version === body.fromVersion,
  );
  if (!source) throw new HttpError(404, "Version introuvable.");

  const artifacts = parseArtifacts(source.artifacts);
  const bundle = await createDraftBundle({
    organizationId,
    scenarioId: exercise.id,
    actorId,
    artifacts,
    changeNote:
      body.changeNote ?? `restauration depuis v${body.fromVersion}`,
  });

  await logAudit({
    organizationId,
    actorId,
    action: "PROMPT_BUNDLE_ROLLBACK",
    targetType: "PromptBundle",
    targetId: bundle.id,
    metadata: {
      scenarioId: exerciseId,
      fromVersion: body.fromVersion,
      newVersion: bundle.version,
    },
  });

  return getExercise(exerciseId, organizationId);
}

export async function deleteDraftExercise(
  exerciseId: string,
  organizationId: string,
  actorId: string,
) {
  const exercise = await loadExerciseOrThrow(exerciseId, organizationId);
  if (exercise.status !== ScenarioStatus.DRAFT) {
    throw new HttpError(
      409,
      "Suppression physique réservée aux brouillons ; archivez sinon.",
    );
  }
  if (exercise._count.simulations > 0 || exercise._count.assignments > 0) {
    throw new HttpError(
      409,
      "Exercice référencé (simulation ou assignation) : archivage uniquement.",
    );
  }
  const hasPublished = exercise.promptBundles.some(
    (b) =>
      b.status === PromptBundleStatus.PUBLISHED ||
      b.status === PromptBundleStatus.SUPERSEDED,
  );
  if (hasPublished) {
    throw new HttpError(
      409,
      "Des bundles publiés existent : suppression interdite.",
    );
  }

  await prisma.scenario.delete({ where: { id: exerciseId } });

  await logAudit({
    organizationId,
    actorId,
    action: "EXERCISE_DELETE_DRAFT",
    targetType: "Scenario",
    targetId: exerciseId,
  });

  return { deleted: true as const };
}

export async function previewPromptLocally(
  exerciseId: string,
  organizationId: string,
  raw: unknown,
) {
  const schema = z.object({
    fixtureId: z.string().min(1).max(40).default("default"),
    version: z.number().int().min(1).optional(),
  });
  const body = schema.parse(raw ?? {});
  const fixture = PREVIEW_FIXTURES[body.fixtureId];
  if (!fixture) throw new HttpError(404, "Fixture de preview inconnue.");

  const exercise = await loadExerciseOrThrow(exerciseId, organizationId);
  const bundle = body.version
    ? exercise.promptBundles.find((b) => b.version === body.version)
    : exercise.promptBundles.find(
        (b) => b.status === PromptBundleStatus.DRAFT,
      ) ??
      exercise.publishedPromptBundle ??
      exercise.promptBundles[0];
  if (!bundle) throw new HttpError(404, "Aucun bundle à prévisualiser.");

  const artifacts = parseArtifacts(bundle.artifacts);
  const persona = artifacts.PROSPECT_PERSONA.body;
  const rendered = interpolatePrompt(persona, {
    ...fixture,
    offer: exercise.offer ?? fixture.offer ?? "",
    callType: exercise.callType,
    level: exercise.level,
    objective: exercise.objective ?? fixture.objective ?? "",
  });

  return {
    fixtureId: body.fixtureId,
    version: bundle.version,
    rendered,
    network: false as const,
  };
}

export type AdminExerciseAction =
  | "publish"
  | "unpublish"
  | "archive"
  | "duplicate"
  | "createVersion"
  | "updateDraftPrompts"
  | "publishBundle"
  | "restoreVersion"
  | "preview";
