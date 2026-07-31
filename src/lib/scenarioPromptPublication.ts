import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/httpError";
import {
  PromptBundleStatus,
  PromptKind,
  ScenarioStatus,
} from "@/lib/enums";
import {
  hashPromptArtifacts,
  parsePromptArtifacts,
  verifyPromptArtifactsHash,
  type PromptArtifacts,
} from "@/lib/promptArtifacts";
import {
  buildProspectPersona,
  type ApprovedKnowledge,
  type ScenarioForSim,
} from "@/lib/prospectPersona";
import { nowIso, parseJson, stringifyJson } from "@/lib/utils";

const MSG_ARCHIVED = "Scénario archivé : modification interdite.";
const MSG_INCOHERENT =
  "Bundle de prompts incohérent : intervention administrateur requise.";
const MSG_MULTI =
  "Plusieurs bundles de prompts publiés : intervention administrateur requise.";
const MSG_DRAFT_EXISTS =
  "Un brouillon de prompts existe : publication administrateur requise.";
const MSG_NOT_FOUND = "Scénario introuvable.";
const MSG_CONCURRENT = "Modification concurrente : réessaie.";

const AUTO_LABEL = "publication manager — bundle généré localement";
const AUTO_SOURCE = "MANAGER_AUTO_PUBLICATION";
const MAX_ATTEMPTS = 2;

export type ManagerScenarioPatchInput = {
  name?: string;
  callType?: string;
  level?: string;
  campaign?: string | null;
  offer?: string | null;
  prospectProfile?: string | null;
  initialSituation?: string | null;
  objective?: string | null;
  personality?: string | null;
  allowedObjections?: string[];
  secretInfos?: Array<{ question: string; answer: string }>;
  successConditions?: string | null;
  failureConditions?: string | null;
  targetDurationSec?: number;
  knowledgeRefs?: string[];
  status?: "DRAFT" | "PUBLISHED";
};

type ScenarioRow = {
  id: string;
  organizationId: string;
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
  knowledgeRefs: string | null;
  status: string;
  publishedPromptBundleId: string | null;
  campaign: string | null;
  relationshipHistory: string | null;
  aiProspect: string | null;
  expectedNextSteps: string | null;
  traineeBrief: string | null;
  updatedAt: string;
};

type BundleRow = {
  id: string;
  organizationId: string;
  scenarioId: string;
  version: number;
  status: string;
  artifacts: string;
  contentHash: string;
};

type Tx = {
  scenario: {
    findFirst: (args: {
      where: Record<string, unknown>;
    }) => Promise<ScenarioRow | null>;
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
  promptBundle: {
    findFirst: (args: {
      where: Record<string, unknown>;
    }) => Promise<BundleRow | null>;
    findMany: (args: {
      where: Record<string, unknown>;
      orderBy?: { version: "desc" | "asc" };
    }) => Promise<BundleRow[]>;
    create: (args: { data: Record<string, unknown> }) => Promise<BundleRow>;
  };
  knowledgeItem: {
    findMany: (args: {
      where: Record<string, unknown>;
    }) => Promise<
      Array<{ type: string; title: string; content: string }>
    >;
  };
  auditEvent: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
};

class PublicationRaceError extends Error {
  constructor() {
    super("publication_race");
    this.name = "PublicationRaceError";
  }
}

function isPrismaRetryable(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === "P2002" || err.code === "P2034")
  );
}

function isRetryable(err: unknown): boolean {
  return err instanceof PublicationRaceError || isPrismaRetryable(err);
}

function toSimShape(s: ScenarioRow): ScenarioForSim {
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

/** Fusionne le scénario existant et le PATCH validé (état final demandé). */
export function mergeManagerScenarioFinal(
  scenario: ScenarioRow,
  patch: ManagerScenarioPatchInput,
): ScenarioRow {
  return {
    ...scenario,
    name: patch.name ?? scenario.name,
    callType: patch.callType ?? scenario.callType,
    level: patch.level ?? scenario.level,
    campaign:
      patch.campaign !== undefined ? patch.campaign : scenario.campaign,
    offer: patch.offer !== undefined ? patch.offer : scenario.offer,
    prospectProfile:
      patch.prospectProfile !== undefined
        ? patch.prospectProfile
        : scenario.prospectProfile,
    initialSituation:
      patch.initialSituation !== undefined
        ? patch.initialSituation
        : scenario.initialSituation,
    objective:
      patch.objective !== undefined ? patch.objective : scenario.objective,
    personality:
      patch.personality !== undefined
        ? patch.personality
        : scenario.personality,
    allowedObjections: patch.allowedObjections
      ? stringifyJson(patch.allowedObjections)
      : scenario.allowedObjections,
    secretInfos: patch.secretInfos
      ? stringifyJson(patch.secretInfos)
      : scenario.secretInfos,
    successConditions:
      patch.successConditions !== undefined
        ? patch.successConditions
        : scenario.successConditions,
    failureConditions:
      patch.failureConditions !== undefined
        ? patch.failureConditions
        : scenario.failureConditions,
    targetDurationSec:
      patch.targetDurationSec ?? scenario.targetDurationSec,
    knowledgeRefs: patch.knowledgeRefs
      ? stringifyJson(patch.knowledgeRefs)
      : scenario.knowledgeRefs,
    status: patch.status ?? scenario.status,
  };
}

function metadataUpdateData(final: ScenarioRow, updatedAt: string) {
  return {
    name: final.name,
    callType: final.callType,
    level: final.level,
    campaign: final.campaign,
    offer: final.offer,
    prospectProfile: final.prospectProfile,
    initialSituation: final.initialSituation,
    objective: final.objective,
    personality: final.personality,
    allowedObjections: final.allowedObjections,
    secretInfos: final.secretInfos,
    successConditions: final.successConditions,
    failureConditions: final.failureConditions,
    targetDurationSec: final.targetDurationSec,
    knowledgeRefs: final.knowledgeRefs,
    status: final.status,
    updatedAt,
  };
}

function validatePublishedBundle(
  bundle: BundleRow,
  scenarioId: string,
  organizationId: string,
): boolean {
  if (bundle.id == null) return false;
  if (bundle.organizationId !== organizationId) return false;
  if (bundle.scenarioId !== scenarioId) return false;
  if (bundle.status !== PromptBundleStatus.PUBLISHED) return false;
  if (!Number.isInteger(bundle.version) || bundle.version < 1) return false;
  let artifacts: ReturnType<typeof parsePromptArtifacts>;
  try {
    artifacts = parsePromptArtifacts(bundle.artifacts);
  } catch {
    return false;
  }
  if (!artifacts[PromptKind.PROSPECT_PERSONA]) return false;
  if (!verifyPromptArtifactsHash(artifacts, bundle.contentHash)) return false;
  return true;
}

function jsonArraysEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Vérifie que chaque champ présent dans le PATCH est déjà persisté. */
function patchFullyApplied(
  fresh: ScenarioRow,
  patch: ManagerScenarioPatchInput,
): boolean {
  if (patch.name !== undefined && fresh.name !== patch.name) return false;
  if (patch.callType !== undefined && fresh.callType !== patch.callType)
    return false;
  if (patch.level !== undefined && fresh.level !== patch.level) return false;
  if (patch.campaign !== undefined && fresh.campaign !== patch.campaign)
    return false;
  if (patch.offer !== undefined && fresh.offer !== patch.offer) return false;
  if (
    patch.prospectProfile !== undefined &&
    fresh.prospectProfile !== patch.prospectProfile
  )
    return false;
  if (
    patch.initialSituation !== undefined &&
    fresh.initialSituation !== patch.initialSituation
  )
    return false;
  if (patch.objective !== undefined && fresh.objective !== patch.objective)
    return false;
  if (
    patch.personality !== undefined &&
    fresh.personality !== patch.personality
  )
    return false;
  if (patch.allowedObjections !== undefined) {
    const persisted = parseJson<string[]>(fresh.allowedObjections, []);
    if (!jsonArraysEqual(persisted, patch.allowedObjections)) return false;
  }
  if (patch.secretInfos !== undefined) {
    const persisted = parseJson<
      Array<{ question: string; answer: string }>
    >(fresh.secretInfos, []);
    if (!jsonArraysEqual(persisted, patch.secretInfos)) return false;
  }
  if (
    patch.successConditions !== undefined &&
    fresh.successConditions !== patch.successConditions
  )
    return false;
  if (
    patch.failureConditions !== undefined &&
    fresh.failureConditions !== patch.failureConditions
  )
    return false;
  if (
    patch.targetDurationSec !== undefined &&
    fresh.targetDurationSec !== patch.targetDurationSec
  )
    return false;
  if (patch.knowledgeRefs !== undefined) {
    const persisted = parseJson<string[]>(fresh.knowledgeRefs, []);
    if (!jsonArraysEqual(persisted, patch.knowledgeRefs)) return false;
  }
  if (patch.status !== undefined && fresh.status !== patch.status) return false;
  return true;
}

async function loadApprovedKnowledge(
  tx: Tx,
  organizationId: string,
  knowledgeRefs: string | null,
): Promise<ApprovedKnowledge[]> {
  const refs = parseJson<string[]>(knowledgeRefs, []);
  if (refs.length === 0) return [];
  const items = await tx.knowledgeItem.findMany({
    where: {
      id: { in: refs },
      organizationId,
      reviewStatus: "APPROVED",
      enabled: true,
    },
  });
  return items.map((k) => ({
    type: k.type,
    title: k.title,
    content: k.content,
  }));
}

async function prepareLocalPersonaArtifacts(
  tx: Tx,
  final: ScenarioRow,
): Promise<{ artifactsJson: string; contentHash: string }> {
  const knowledge = await loadApprovedKnowledge(
    tx,
    final.organizationId,
    final.knowledgeRefs,
  );
  const personaBody = buildProspectPersona(
    toSimShape(final),
    knowledge,
    "{{prospectName}}",
  );
  const artifacts: PromptArtifacts = {
    [PromptKind.PROSPECT_PERSONA]: {
      body: personaBody,
      contentType: "text/plain",
    },
  };
  const artifactsJson = stringifyJson(artifacts);
  const parsed = parsePromptArtifacts(artifactsJson);
  const contentHash = hashPromptArtifacts(parsed);
  if (!verifyPromptArtifactsHash(parsed, contentHash)) {
    throw new HttpError(409, MSG_INCOHERENT);
  }
  return { artifactsJson, contentHash };
}

async function casUpdateScenario(
  tx: Tx,
  organizationId: string,
  scenarioId: string,
  data: Record<string, unknown>,
  extraWhere: Record<string, unknown> = {},
): Promise<void> {
  const result = await tx.scenario.updateMany({
    where: {
      id: scenarioId,
      organizationId,
      status: { not: ScenarioStatus.ARCHIVED },
      ...extraWhere,
    },
    data,
  });
  if (result.count === 1) return;

  const again = await tx.scenario.findFirst({
    where: { id: scenarioId, organizationId },
  });
  if (!again) throw new HttpError(404, MSG_NOT_FOUND);
  if (again.status === ScenarioStatus.ARCHIVED) {
    throw new HttpError(409, MSG_ARCHIVED);
  }
  throw new PublicationRaceError();
}

async function resolvePublishedBundle(
  tx: Tx,
  organizationId: string,
  actorId: string,
  existing: ScenarioRow,
  final: ScenarioRow,
): Promise<{ bundleId: string; created: boolean; version?: number }> {
  if (existing.publishedPromptBundleId) {
    const pointed = await tx.promptBundle.findFirst({
      where: { id: existing.publishedPromptBundleId },
    });
    if (
      !pointed ||
      pointed.id !== existing.publishedPromptBundleId ||
      !validatePublishedBundle(pointed, existing.id, organizationId)
    ) {
      throw new HttpError(409, MSG_INCOHERENT);
    }
    return { bundleId: pointed.id, created: false };
  }

  const allBundles = await tx.promptBundle.findMany({
    where: { scenarioId: existing.id, organizationId },
    orderBy: { version: "desc" },
  });
  const published = allBundles.filter(
    (b) => b.status === PromptBundleStatus.PUBLISHED,
  );

  if (published.length > 1) {
    throw new HttpError(409, MSG_MULTI);
  }
  if (published.length === 1) {
    const bundle = published[0]!;
    if (!validatePublishedBundle(bundle, existing.id, organizationId)) {
      throw new HttpError(409, MSG_INCOHERENT);
    }
    return { bundleId: bundle.id, created: false };
  }

  const hasDraft = allBundles.some(
    (b) => b.status === PromptBundleStatus.DRAFT,
  );
  if (hasDraft) {
    throw new HttpError(409, MSG_DRAFT_EXISTS);
  }

  const maxVersion =
    allBundles.length === 0
      ? 0
      : Math.max(...allBundles.map((b) => b.version));
  const nextVersion = maxVersion + 1;
  const now = nowIso();
  const { artifactsJson, contentHash } = await prepareLocalPersonaArtifacts(
    tx,
    final,
  );

  const created = await tx.promptBundle.create({
    data: {
      organizationId,
      scenarioId: existing.id,
      version: nextVersion,
      status: PromptBundleStatus.PUBLISHED,
      label: AUTO_LABEL,
      createdById: actorId,
      createdAt: now,
      publishedAt: now,
      artifacts: artifactsJson,
      contentHash,
    },
  });

  await tx.auditEvent.create({
    data: {
      organizationId,
      actorId,
      action: "PROMPT_BUNDLE_CREATE",
      targetType: "PromptBundle",
      targetId: created.id,
      metadata: stringifyJson({
        scenarioId: existing.id,
        version: nextVersion,
        source: AUTO_SOURCE,
      }),
      createdAt: now,
    },
  });

  return { bundleId: created.id, created: true, version: nextVersion };
}

async function applyOnce(
  tx: Tx,
  organizationId: string,
  actorId: string,
  scenarioId: string,
  patch: ManagerScenarioPatchInput,
): Promise<{ id: string; status: string }> {
  const existing = await tx.scenario.findFirst({
    where: { id: scenarioId, organizationId },
  });
  if (!existing) throw new HttpError(404, MSG_NOT_FOUND);

  if (existing.status === ScenarioStatus.ARCHIVED) {
    throw new HttpError(409, MSG_ARCHIVED);
  }

  const final = mergeManagerScenarioFinal(existing, patch);
  const updatedAt = nowIso();

  if (final.status !== ScenarioStatus.PUBLISHED) {
    await casUpdateScenario(
      tx,
      organizationId,
      scenarioId,
      metadataUpdateData(final, updatedAt),
    );
    return { id: scenarioId, status: final.status };
  }

  const resolved = await resolvePublishedBundle(
    tx,
    organizationId,
    actorId,
    existing,
    final,
  );

  const data: Record<string, unknown> = {
    ...metadataUpdateData(final, updatedAt),
    publishedPromptBundleId: resolved.bundleId,
  };

  const extraWhere =
    existing.publishedPromptBundleId == null
      ? { publishedPromptBundleId: null }
      : { publishedPromptBundleId: existing.publishedPromptBundleId };

  await casUpdateScenario(
    tx,
    organizationId,
    scenarioId,
    data,
    extraWhere,
  );

  return { id: scenarioId, status: ScenarioStatus.PUBLISHED };
}

/**
 * Convergence sans 3e écriture : succès seulement si tout l'effet PATCH
 * est déjà présent (y compris chaque métadonnée fournie).
 */
async function convergeAfterRetries(opts: {
  organizationId: string;
  scenarioId: string;
  patch: ManagerScenarioPatchInput;
}): Promise<{ id: string; status: string }> {
  const { organizationId, scenarioId, patch } = opts;

  const fresh = await prisma.scenario.findFirst({
    where: { id: scenarioId, organizationId },
  });
  if (!fresh) throw new HttpError(404, MSG_NOT_FOUND);
  if (fresh.status === ScenarioStatus.ARCHIVED) {
    throw new HttpError(409, MSG_ARCHIVED);
  }

  // Sans status PUBLISHED demandé : jamais de succès approximatif.
  if (patch.status !== "PUBLISHED") {
    throw new HttpError(409, MSG_CONCURRENT);
  }

  if (fresh.status !== ScenarioStatus.PUBLISHED) {
    throw new HttpError(409, MSG_CONCURRENT);
  }
  if (!fresh.publishedPromptBundleId) {
    throw new HttpError(409, MSG_CONCURRENT);
  }

  const bundle = await prisma.promptBundle.findFirst({
    where: { id: fresh.publishedPromptBundleId },
  });
  if (
    !bundle ||
    !validatePublishedBundle(bundle, fresh.id, organizationId)
  ) {
    throw new HttpError(409, MSG_INCOHERENT);
  }

  if (!patchFullyApplied(fresh as ScenarioRow, patch)) {
    throw new HttpError(409, MSG_CONCURRENT);
  }

  return { id: scenarioId, status: ScenarioStatus.PUBLISHED };
}

/**
 * Applique un PATCH manager : métadonnées + publication garantie par un
 * PromptBundle PUBLISHED valide. organizationId et actorId sont fournis
 * explicitement par la route autorisée (aucune auth implicite).
 *
 * Max 2 tentatives d'écriture, chacune dans une nouvelle $transaction.
 * P2002 / P2034 / PublicationRaceError sont retryables.
 */
export async function applyManagerScenarioPatch(opts: {
  organizationId: string;
  actorId: string;
  scenarioId: string;
  patch: ManagerScenarioPatchInput;
}): Promise<{ id: string; status: string }> {
  const { organizationId, actorId, scenarioId, patch } = opts;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(async (tx) =>
        applyOnce(
          tx as unknown as Tx,
          organizationId,
          actorId,
          scenarioId,
          patch,
        ),
      );
    } catch (err) {
      lastError = err;
      if (err instanceof HttpError) throw err;
      if (!isRetryable(err) || attempt + 1 >= MAX_ATTEMPTS) {
        break;
      }
      // Nouvelle tentative = nouvelle $transaction (la précédente a échoué).
    }
  }

  if (isRetryable(lastError)) {
    return convergeAfterRetries({ organizationId, scenarioId, patch });
  }

  if (lastError instanceof HttpError) throw lastError;
  if (lastError instanceof PublicationRaceError) {
    throw new HttpError(409, MSG_CONCURRENT);
  }
  if (lastError) throw lastError;
  throw new HttpError(409, MSG_CONCURRENT);
}
