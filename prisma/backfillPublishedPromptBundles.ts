/**
 * Backfill ops idempotent : rattache ou crée un PromptBundle PUBLISHED
 * pour les scénarios PUBLISHED sans publishedPromptBundleId.
 *
 * Usage :
 *   npm run db:backfill-prompt-bundles -- --org-slug=<slug>
 *   npm run db:backfill-prompt-bundles -- --org-slug=<slug> --apply
 *   BACKFILL_ORG_SLUG=<slug> npm run db:backfill-prompt-bundles
 *
 * Mode par défaut : DRY-RUN (aucune écriture).
 * Hors base locale/test, --apply exige ALLOW_PROMPT_BUNDLE_BACKFILL=true.
 * Ne jamais lancer au démarrage de l'application.
 *
 * Atomicité : scénario par scénario (pas org-wide) ; idempotent au redémarrage.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  PromptBundleStatus,
  PromptKind,
  ScenarioStatus,
} from "../src/lib/enums";
import {
  hashPromptArtifacts,
  parsePromptArtifacts,
  verifyPromptArtifactsHash,
  type PromptArtifacts,
} from "../src/lib/promptArtifacts";
import {
  buildProspectPersona,
  type ApprovedKnowledge,
  type ScenarioForSim,
} from "../src/lib/prospectPersona";
import { parseJson } from "../src/lib/utils";

const prisma = new PrismaClient();

const AUDIT_ACTION = "BACKFILL_PUBLISHED_PROMPT_BUNDLE";
const BACKFILL_LABEL = "backfill legacy";

export type BackfillMode = "DRY-RUN" | "APPLY";

export type BackfillPlanKind = "skip" | "attach" | "create" | "error";

export type BackfillScenarioPlan = {
  scenarioId: string;
  kind: BackfillPlanKind;
  detail: string;
  existingBundleId?: string;
  nextVersion?: number;
};

export type BackfillSummary = {
  organizationSlug: string;
  organizationId: string;
  mode: BackfillMode;
  analyzed: number;
  alreadyValid: number;
  toAttach: number;
  toCreate: number;
  errors: string[];
  plans: BackfillScenarioPlan[];
  appliedAttach: number;
  appliedCreate: number;
};

export type BackfillOptions = {
  orgSlug: string;
  apply?: boolean;
};

type ScenarioRow = {
  id: string;
  organizationId: string;
  name: string;
  status: string;
  publishedPromptBundleId: string | null;
  knowledgeRefs: string | null;
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
  relationshipHistory: string | null;
  aiProspect: string | null;
  expectedNextSteps: string | null;
  traineeBrief: string | null;
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

/** Client Prisma minimal injectable (tests / ops). */
export type BackfillPrisma = {
  organization: {
    findUnique: (args: {
      where: { slug: string };
    }) => Promise<{ id: string; slug: string } | null>;
  };
  scenario: {
    findMany: (args: {
      where: { organizationId: string; status: string };
    }) => Promise<ScenarioRow[]>;
    findFirst: (args: {
      where: {
        id: string;
        organizationId: string;
        status?: string;
        publishedPromptBundleId?: null;
      };
    }) => Promise<ScenarioRow | null>;
    updateMany: (args: {
      where: {
        id: string;
        organizationId: string;
        status: string;
        publishedPromptBundleId: null;
      };
      data: { publishedPromptBundleId: string; updatedAt: string };
    }) => Promise<{ count: number }>;
  };
  promptBundle: {
    findFirst: (args: {
      where: Record<string, unknown>;
    }) => Promise<BundleRow | null>;
    findMany: (args: {
      where: { scenarioId: string; organizationId?: string };
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
  $transaction: <T>(fn: (tx: BackfillPrisma) => Promise<T>) => Promise<T>;
};

function isTruthyEnv(value: string | undefined): boolean {
  return ["true", "1", "yes"].includes((value ?? "").toLowerCase());
}

function isTestDatabaseName(dbName: string): boolean {
  const name = dbName.toLowerCase();
  if (!name) return false;
  return (
    name === "minduel_test" ||
    name === "test_minduel" ||
    name.startsWith("test_") ||
    name.endsWith("_test")
  );
}

/**
 * Détermine si DATABASE_URL cible une base locale ou explicitement de test.
 * N'inspecte que hostname et nom de base (pathname) — jamais user/password/query/fragment.
 */
export function isLocalOrTestDatabase(url: string): boolean {
  const raw = (url ?? "").trim();
  if (!raw) return false;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host.endsWith(".local")
  ) {
    return true;
  }
  const dbName = decodeURIComponent(
    parsed.pathname.replace(/^\//, "").split("/")[0] ?? "",
  );
  return isTestDatabaseName(dbName);
}

export function assertBackfillAllowed(apply: boolean): void {
  if (!apply) return;
  const url = process.env.DATABASE_URL ?? "";
  if (isLocalOrTestDatabase(url)) return;
  if (!isTruthyEnv(process.env.ALLOW_PROMPT_BUNDLE_BACKFILL)) {
    throw new Error(
      "Backfill refusé : DATABASE_URL non locale/test. " +
        "Définissez ALLOW_PROMPT_BUNDLE_BACKFILL=true pour une opération ops contrôlée.",
    );
  }
}

export function resolveOrgSlug(
  argv: string[] = process.argv,
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): string {
  const fromEnv = (env.BACKFILL_ORG_SLUG ?? "").trim();
  const arg = argv.find((a) => a.startsWith("--org-slug="));
  const fromArg = arg ? arg.slice("--org-slug=".length).trim() : "";
  const slug = fromArg || fromEnv;
  if (!slug) {
    throw new Error(
      "Slug organisation requis : --org-slug=<slug> ou BACKFILL_ORG_SLUG.",
    );
  }
  return slug;
}

export function resolveApplyFlag(argv: string[] = process.argv): boolean {
  return argv.includes("--apply");
}

function iso(): string {
  return new Date().toISOString();
}

function scenarioToSimShape(s: ScenarioRow): ScenarioForSim {
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

async function loadApprovedKnowledge(
  client: BackfillPrisma,
  scenario: Pick<ScenarioRow, "organizationId" | "knowledgeRefs">,
): Promise<ApprovedKnowledge[]> {
  const refs = parseJson<string[]>(scenario.knowledgeRefs, []);
  if (refs.length === 0) return [];
  const items = await client.knowledgeItem.findMany({
    where: {
      id: { in: refs },
      organizationId: scenario.organizationId,
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

/**
 * Valide un bundle PUBLISHED pour un scénario (JSON, hash, org, scenarioId).
 * Ne log jamais le contenu des artifacts.
 */
function validatePublishedBundle(
  bundle: BundleRow,
  scenario: ScenarioRow,
  organizationId: string,
): { ok: true } | { ok: false; reason: string } {
  if (bundle.organizationId !== organizationId) {
    return {
      ok: false,
      reason: `bundle ${bundle.id} hors organisation du scénario ${scenario.id}`,
    };
  }
  if (bundle.scenarioId !== scenario.id) {
    return {
      ok: false,
      reason: `bundle ${bundle.id} ne correspond pas au scénario ${scenario.id}`,
    };
  }
  if (bundle.status !== PromptBundleStatus.PUBLISHED) {
    return {
      ok: false,
      reason: `bundle ${bundle.id} n'est pas PUBLISHED (status=${bundle.status})`,
    };
  }
  if (!Number.isInteger(bundle.version) || bundle.version < 1) {
    return {
      ok: false,
      reason: `bundle ${bundle.id} version invalide`,
    };
  }
  let artifacts: ReturnType<typeof parsePromptArtifacts>;
  try {
    artifacts = parsePromptArtifacts(bundle.artifacts);
  } catch {
    return {
      ok: false,
      reason: `bundle ${bundle.id} artifacts JSON invalides`,
    };
  }
  if (!verifyPromptArtifactsHash(artifacts, bundle.contentHash)) {
    return {
      ok: false,
      reason: `bundle ${bundle.id} contentHash incohérent`,
    };
  }
  return { ok: true };
}

/**
 * Prépare et valide localement les artifacts CREATE (sans écrire).
 * artifactsJson contient bien le prompt mais reste strictement interne :
 * jamais ajouté au summary ni journalisé.
 */
async function prepareCreateArtifacts(
  client: BackfillPrisma,
  scenario: ScenarioRow,
): Promise<{ artifactsJson: string; contentHash: string }> {
  const knowledge = await loadApprovedKnowledge(client, scenario);
  const personaBody = buildProspectPersona(
    scenarioToSimShape(scenario),
    knowledge,
    "{{prospectName}}",
  );
  const artifacts: PromptArtifacts = {
    [PromptKind.PROSPECT_PERSONA]: {
      body: personaBody,
      contentType: "text/plain",
    },
  };
  const artifactsJson = JSON.stringify(artifacts);
  const parsed = parsePromptArtifacts(artifactsJson);
  const contentHash = hashPromptArtifacts(parsed);
  if (!verifyPromptArtifactsHash(parsed, contentHash)) {
    throw new Error("hash artifacts incohérent après préparation");
  }
  return { artifactsJson, contentHash };
}

const PREP_FAIL_DETAIL = "préparation locale des artifacts impossible";

/** Compare-and-set du pointeur publishedPromptBundleId (null → bundleId). */
async function casSetPublishedPointer(
  tx: BackfillPrisma,
  organizationId: string,
  scenarioId: string,
  bundleId: string,
  updatedAt: string,
): Promise<void> {
  const result = await tx.scenario.updateMany({
    where: {
      id: scenarioId,
      organizationId,
      status: ScenarioStatus.PUBLISHED,
      publishedPromptBundleId: null,
    },
    data: {
      publishedPromptBundleId: bundleId,
      updatedAt,
    },
  });
  if (result.count !== 1) {
    throw new Error(
      `Race / compare-and-set perdu : scénario ${scenarioId} (count=${result.count})`,
    );
  }
}

async function planScenario(
  client: BackfillPrisma,
  scenario: ScenarioRow,
  organizationId: string,
): Promise<BackfillScenarioPlan> {
  if (scenario.organizationId !== organizationId) {
    return {
      scenarioId: scenario.id,
      kind: "error",
      detail: "scénario hors organisation ciblée",
    };
  }
  if (scenario.status !== ScenarioStatus.PUBLISHED) {
    return {
      scenarioId: scenario.id,
      kind: "error",
      detail: `statut inattendu ${scenario.status}`,
    };
  }

  // Cas 1 — pointeur déjà renseigné
  if (scenario.publishedPromptBundleId) {
    const pointed = await client.promptBundle.findFirst({
      where: { id: scenario.publishedPromptBundleId },
    });
    if (!pointed) {
      return {
        scenarioId: scenario.id,
        kind: "error",
        detail: `publishedPromptBundleId=${scenario.publishedPromptBundleId} introuvable`,
      };
    }
    const check = validatePublishedBundle(pointed, scenario, organizationId);
    if (!check.ok) {
      return { scenarioId: scenario.id, kind: "error", detail: check.reason };
    }
    return {
      scenarioId: scenario.id,
      kind: "skip",
      detail: "pointeur déjà valide",
      existingBundleId: pointed.id,
    };
  }

  // Cas 2 / 3 — pas de pointeur
  const allBundles = await client.promptBundle.findMany({
    where: { scenarioId: scenario.id, organizationId },
    orderBy: { version: "desc" },
  });
  const published = allBundles.filter(
    (b) => b.status === PromptBundleStatus.PUBLISHED,
  );

  if (published.length > 1) {
    return {
      scenarioId: scenario.id,
      kind: "error",
      detail: `${published.length} bundles PUBLISHED concurrent — correction manuelle requise`,
    };
  }

  if (published.length === 1) {
    const bundle = published[0]!;
    const check = validatePublishedBundle(bundle, scenario, organizationId);
    if (!check.ok) {
      return { scenarioId: scenario.id, kind: "error", detail: check.reason };
    }
    return {
      scenarioId: scenario.id,
      kind: "attach",
      detail: "rattacher bundle PUBLISHED existant",
      existingBundleId: bundle.id,
    };
  }

  const maxVersion =
    allBundles.length === 0
      ? 0
      : Math.max(...allBundles.map((b) => b.version));
  const nextVersion = maxVersion + 1;

  try {
    await prepareCreateArtifacts(client, scenario);
  } catch {
    return {
      scenarioId: scenario.id,
      kind: "error",
      detail: `${PREP_FAIL_DETAIL} (${scenario.id})`,
    };
  }

  return {
    scenarioId: scenario.id,
    kind: "create",
    detail: "créer bundle PUBLISHED backfill",
    nextVersion,
  };
}

async function applyAttach(
  client: BackfillPrisma,
  organizationId: string,
  scenarioId: string,
  bundleId: string,
): Promise<void> {
  const now = iso();
  await client.$transaction(async (tx) => {
    const fresh = await tx.scenario.findFirst({
      where: { id: scenarioId, organizationId },
    });
    if (
      !fresh ||
      fresh.status !== ScenarioStatus.PUBLISHED ||
      fresh.publishedPromptBundleId !== null
    ) {
      throw new Error(
        `Race / état changé : scénario ${scenarioId} non éligible au rattachement`,
      );
    }

    const bundle = await tx.promptBundle.findFirst({
      where: { id: bundleId },
    });
    if (!bundle) {
      throw new Error(
        `Race / état changé : bundle ${bundleId} introuvable pour rattachement`,
      );
    }
    const check = validatePublishedBundle(bundle, fresh, organizationId);
    if (!check.ok) {
      throw new Error(`Race / état changé : ${check.reason}`);
    }

    await casSetPublishedPointer(
      tx,
      organizationId,
      scenarioId,
      bundleId,
      now,
    );

    await tx.auditEvent.create({
      data: {
        organizationId,
        actorId: null,
        action: AUDIT_ACTION,
        targetType: "Scenario",
        targetId: scenarioId,
        metadata: JSON.stringify({
          kind: "attach",
          promptBundleId: bundleId,
        }),
        createdAt: now,
      },
    });
  });
}

async function applyCreate(
  client: BackfillPrisma,
  organizationId: string,
  scenarioId: string,
): Promise<void> {
  const now = iso();
  await client.$transaction(async (tx) => {
    const fresh = await tx.scenario.findFirst({
      where: { id: scenarioId, organizationId },
    });
    if (
      !fresh ||
      fresh.status !== ScenarioStatus.PUBLISHED ||
      fresh.publishedPromptBundleId !== null
    ) {
      throw new Error(
        `Race / état changé : scénario ${scenarioId} non éligible à la création`,
      );
    }

    const allBundles = await tx.promptBundle.findMany({
      where: { scenarioId, organizationId },
      orderBy: { version: "desc" },
    });
    const existingPublished = allBundles.find(
      (b) => b.status === PromptBundleStatus.PUBLISHED,
    );
    if (existingPublished) {
      throw new Error(
        `Race : un bundle PUBLISHED existe déjà pour ${scenarioId}`,
      );
    }

    const maxVersion =
      allBundles.length === 0
        ? 0
        : Math.max(...allBundles.map((b) => b.version));
    const nextVersion = maxVersion + 1;

    let artifactsJson: string;
    let contentHash: string;
    try {
      const prepared = await prepareCreateArtifacts(tx, fresh);
      artifactsJson = prepared.artifactsJson;
      contentHash = prepared.contentHash;
    } catch {
      throw new Error(`${PREP_FAIL_DETAIL} (${scenarioId})`);
    }

    const created = await tx.promptBundle.create({
      data: {
        organizationId,
        scenarioId,
        version: nextVersion,
        status: PromptBundleStatus.PUBLISHED,
        label: BACKFILL_LABEL,
        createdById: null,
        createdAt: now,
        publishedAt: now,
        artifacts: artifactsJson,
        contentHash,
      },
    });

    await casSetPublishedPointer(
      tx,
      organizationId,
      scenarioId,
      created.id,
      now,
    );

    await tx.auditEvent.create({
      data: {
        organizationId,
        actorId: null,
        action: AUDIT_ACTION,
        targetType: "Scenario",
        targetId: scenarioId,
        metadata: JSON.stringify({
          kind: "create",
          promptBundleId: created.id,
          version: nextVersion,
        }),
        createdAt: now,
      },
    });
  });
}

/**
 * Analyse (et optionnellement applique) le backfill pour une organisation.
 * N'affiche jamais les prompts, artifacts ou secrets.
 * Atomicité : scénario par scénario (pas pour toute l'organisation).
 */
export async function backfillPublishedPromptBundles(
  client: BackfillPrisma,
  options: BackfillOptions,
): Promise<BackfillSummary> {
  const apply = options.apply === true;
  assertBackfillAllowed(apply);

  const orgSlug = options.orgSlug.trim();
  if (!orgSlug) {
    throw new Error(
      "Slug organisation requis : --org-slug=<slug> ou BACKFILL_ORG_SLUG.",
    );
  }

  const org = await client.organization.findUnique({
    where: { slug: orgSlug },
  });
  if (!org) {
    throw new Error(
      `Organisation introuvable pour slug="${orgSlug}". Aucune organisation créée.`,
    );
  }

  const scenarios = await client.scenario.findMany({
    where: {
      organizationId: org.id,
      status: ScenarioStatus.PUBLISHED,
    },
  });

  const plans: BackfillScenarioPlan[] = [];
  for (const scenario of scenarios) {
    plans.push(await planScenario(client, scenario, org.id));
  }

  const errors = plans
    .filter((p) => p.kind === "error")
    .map((p) => `${p.scenarioId}: ${p.detail}`);
  const alreadyValid = plans.filter((p) => p.kind === "skip").length;
  const toAttach = plans.filter((p) => p.kind === "attach").length;
  const toCreate = plans.filter((p) => p.kind === "create").length;

  const summary: BackfillSummary = {
    organizationSlug: org.slug,
    organizationId: org.id,
    mode: apply ? "APPLY" : "DRY-RUN",
    analyzed: scenarios.length,
    alreadyValid,
    toAttach,
    toCreate,
    errors,
    plans,
    appliedAttach: 0,
    appliedCreate: 0,
  };

  // Précontrôle : aucune écriture si incohérence (y compris préparation CREATE).
  if (errors.length > 0) {
    return summary;
  }

  if (!apply) {
    return summary;
  }

  for (const plan of plans) {
    if (plan.kind === "attach" && plan.existingBundleId) {
      await applyAttach(client, org.id, plan.scenarioId, plan.existingBundleId);
      summary.appliedAttach += 1;
    } else if (plan.kind === "create") {
      await applyCreate(client, org.id, plan.scenarioId);
      summary.appliedCreate += 1;
    }
  }

  return summary;
}

export function formatBackfillSummary(summary: BackfillSummary): string {
  const lines = [
    `organisation: ${summary.organizationSlug} (${summary.organizationId})`,
    `scénarios analysés: ${summary.analyzed}`,
    `déjà valides: ${summary.alreadyValid}`,
    `bundles existants à rattacher: ${summary.toAttach}`,
    `bundles à créer: ${summary.toCreate}`,
    `erreurs: ${summary.errors.length}`,
    `mode: ${summary.mode}`,
  ];
  if (summary.mode === "APPLY") {
    lines.push(
      `appliqués (attach): ${summary.appliedAttach}`,
      `appliqués (create): ${summary.appliedCreate}`,
    );
  }
  if (summary.errors.length > 0) {
    lines.push("détail erreurs (sans contenu de prompts) :");
    for (const err of summary.errors) {
      lines.push(`  - ${err}`);
    }
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const orgSlug = resolveOrgSlug();
  const apply = resolveApplyFlag();
  const summary = await backfillPublishedPromptBundles(
    prisma as unknown as BackfillPrisma,
    {
      orgSlug,
      apply,
    },
  );
  console.log(formatBackfillSummary(summary));
  if (summary.errors.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
