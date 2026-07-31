import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PromptBundleStatus,
  PromptKind,
  ScenarioStatus,
} from "@/lib/enums";
import {
  hashPromptArtifacts,
  parsePromptArtifacts,
  verifyPromptArtifactsHash,
} from "@/lib/promptArtifacts";
import * as prospectPersona from "@/lib/prospectPersona";
import {
  assertBackfillAllowed,
  backfillPublishedPromptBundles,
  isLocalOrTestDatabase,
  resolveApplyFlag,
  resolveOrgSlug,
  type BackfillPrisma,
  type BackfillSummary,
} from "../prisma/backfillPublishedPromptBundles";

const ORG_A = "org-a";
const ORG_B = "org-b";
const SLUG_A = "acme";
const LOCAL_DB_URL = "postgresql://user:pass@localhost:5432/minduel";

type OrgRow = { id: string; slug: string };

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
  updatedAt: string;
};

type BundleRow = {
  id: string;
  organizationId: string;
  scenarioId: string;
  version: number;
  status: string;
  label: string | null;
  createdById: string | null;
  createdAt: string;
  publishedAt: string | null;
  artifacts: string;
  contentHash: string;
};

type KnowledgeRow = {
  id: string;
  organizationId: string;
  type: string;
  title: string;
  content: string;
  reviewStatus: string;
  enabled: boolean;
};

type AuditRow = {
  id: string;
  organizationId: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: string | null;
  createdAt: string;
};

function personaArtifacts(body: string) {
  const artifacts = {
    [PromptKind.PROSPECT_PERSONA]: {
      body,
      contentType: "text/plain",
    },
  };
  return {
    artifacts,
    raw: JSON.stringify(artifacts),
    hash: hashPromptArtifacts(artifacts),
  };
}

function createMockClient() {
  const organizations: OrgRow[] = [];
  const scenarios: ScenarioRow[] = [];
  const bundles: BundleRow[] = [];
  const knowledge: KnowledgeRow[] = [];
  const audits: AuditRow[] = [];
  let seq = 0;
  const uid = (prefix: string) => `${prefix}-${++seq}`;

  const counters = {
    scenarioCreate: 0,
    scenarioUpdate: 0,
    bundleCreate: 0,
    bundleUpdate: 0,
    auditCreate: 0,
    organizationCreate: 0,
    knowledgeFind: 0,
  };

  const matchWhere = (
    row: Record<string, unknown>,
    where: Record<string, unknown> | undefined,
  ): boolean => {
    if (!where) return true;
    for (const [key, value] of Object.entries(where)) {
      if (value === null) {
        if (row[key] !== null) return false;
        continue;
      }
      if (typeof value === "object" && value !== null && "in" in value) {
        const list = (value as { in: unknown[] }).in;
        if (!list.includes(row[key])) return false;
        continue;
      }
      if (row[key] !== value) return false;
    }
    return true;
  };

  const organizationApi = {
    findUnique: async ({ where }: { where: { slug: string } }) =>
      organizations.find((o) => o.slug === where.slug) ?? null,
    create: async ({ data }: { data: { slug: string } }) => {
      counters.organizationCreate += 1;
      const row = { id: uid("org"), slug: data.slug };
      organizations.push(row);
      return row;
    },
  };

  const scenarioApi = {
    findMany: async ({
      where,
    }: {
      where: { organizationId: string; status: string };
    }) =>
      scenarios.filter(
        (s) =>
          s.organizationId === where.organizationId &&
          s.status === where.status,
      ),
    findFirst: async ({
      where,
    }: {
      where: {
        id?: string;
        organizationId?: string;
        status?: string;
        publishedPromptBundleId?: null;
      };
    }) =>
      scenarios.find((s) =>
        matchWhere(s as unknown as Record<string, unknown>, where),
      ) ?? null,
    updateMany: async ({
      where,
      data,
    }: {
      where: {
        id: string;
        organizationId: string;
        status: string;
        publishedPromptBundleId: null;
      };
      data: { publishedPromptBundleId?: string; updatedAt?: string };
    }) => {
      const matches = scenarios.filter((s) =>
        matchWhere(s as unknown as Record<string, unknown>, where),
      );
      for (const row of matches) {
        Object.assign(row, data);
      }
      if (matches.length > 0) counters.scenarioUpdate += 1;
      return { count: matches.length };
    },
    create: async ({ data }: { data: Partial<ScenarioRow> }) => {
      counters.scenarioCreate += 1;
      const row = {
        id: uid("sc"),
        organizationId: data.organizationId!,
        name: data.name ?? "Scénario",
        status: data.status ?? ScenarioStatus.DRAFT,
        publishedPromptBundleId: data.publishedPromptBundleId ?? null,
        knowledgeRefs: data.knowledgeRefs ?? null,
        callType: data.callType ?? "VENTE",
        offer: data.offer ?? null,
        prospectProfile: data.prospectProfile ?? null,
        initialSituation: data.initialSituation ?? null,
        objective: data.objective ?? null,
        level: data.level ?? "MOYEN",
        personality: data.personality ?? null,
        allowedObjections: data.allowedObjections ?? null,
        secretInfos: data.secretInfos ?? null,
        successConditions: data.successConditions ?? null,
        failureConditions: data.failureConditions ?? null,
        targetDurationSec: data.targetDurationSec ?? 300,
        relationshipHistory: data.relationshipHistory ?? null,
        aiProspect: data.aiProspect ?? null,
        expectedNextSteps: data.expectedNextSteps ?? null,
        traineeBrief: data.traineeBrief ?? null,
        updatedAt: data.updatedAt ?? "2026-01-01T00:00:00.000Z",
      } satisfies ScenarioRow;
      scenarios.push(row);
      return row;
    },
  };

  const promptBundleApi = {
    findFirst: async ({
      where,
    }: {
      where: Record<string, unknown>;
    }) =>
      bundles.find((b) =>
        matchWhere(b as unknown as Record<string, unknown>, where),
      ) ?? null,
    findMany: async ({
      where,
      orderBy,
    }: {
      where: { scenarioId: string; organizationId?: string };
      orderBy?: { version: "desc" | "asc" };
    }) => {
      let rows = bundles.filter((b) => {
        if (b.scenarioId !== where.scenarioId) return false;
        if (
          where.organizationId != null &&
          b.organizationId !== where.organizationId
        ) {
          return false;
        }
        return true;
      });
      if (orderBy?.version === "desc") {
        rows = [...rows].sort((a, b) => b.version - a.version);
      } else if (orderBy?.version === "asc") {
        rows = [...rows].sort((a, b) => a.version - b.version);
      }
      return rows;
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      counters.bundleCreate += 1;
      const row: BundleRow = {
        id: uid("pb"),
        organizationId: data.organizationId as string,
        scenarioId: data.scenarioId as string,
        version: data.version as number,
        status: data.status as string,
        label: (data.label as string) ?? null,
        createdById: (data.createdById as string | null) ?? null,
        createdAt: data.createdAt as string,
        publishedAt: (data.publishedAt as string | null) ?? null,
        artifacts: data.artifacts as string,
        contentHash: data.contentHash as string,
      };
      bundles.push(row);
      return row;
    },
    update: async () => {
      counters.bundleUpdate += 1;
      throw new Error("bundle update should not be called by backfill");
    },
  };

  const knowledgeItemApi = {
    findMany: async ({
      where,
    }: {
      where: Record<string, unknown>;
    }) => {
      counters.knowledgeFind += 1;
      const ids =
        where.id &&
        typeof where.id === "object" &&
        where.id !== null &&
        "in" in where.id
          ? ((where.id as { in: string[] }).in ?? [])
          : null;
      return knowledge.filter((k) => {
        if (ids && !ids.includes(k.id)) return false;
        if (
          where.organizationId != null &&
          k.organizationId !== where.organizationId
        ) {
          return false;
        }
        if (
          where.reviewStatus != null &&
          k.reviewStatus !== where.reviewStatus
        ) {
          return false;
        }
        if (where.enabled != null && k.enabled !== where.enabled) {
          return false;
        }
        return true;
      });
    },
  };

  const auditEventApi = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      counters.auditCreate += 1;
      const row: AuditRow = {
        id: uid("aud"),
        organizationId: data.organizationId as string,
        actorId: (data.actorId as string | null) ?? null,
        action: data.action as string,
        targetType: (data.targetType as string | null) ?? null,
        targetId: (data.targetId as string | null) ?? null,
        metadata: (data.metadata as string | null) ?? null,
        createdAt: data.createdAt as string,
      };
      audits.push(row);
      return row;
    },
  };

  const api = {
    organization: organizationApi,
    scenario: scenarioApi,
    promptBundle: promptBundleApi,
    knowledgeItem: knowledgeItemApi,
    auditEvent: auditEventApi,
  };

  /** Sérialise les transactions mock pour éviter qu'un rollback n'efface un commit concurrent. */
  let txTail: Promise<unknown> = Promise.resolve();

  const client = {
    ...api,
    $transaction: async <T>(fn: (tx: BackfillPrisma) => Promise<T>) => {
      const run = async (): Promise<T> => {
        const snap = {
          scenarios: scenarios.map((s) => ({ ...s })),
          bundles: bundles.map((b) => ({ ...b })),
          audits: audits.map((a) => ({ ...a })),
          counters: { ...counters },
          seq,
        };
        try {
          return await fn(client as unknown as BackfillPrisma);
        } catch (err) {
          scenarios.splice(
            0,
            scenarios.length,
            ...snap.scenarios.map((s) => ({ ...s })),
          );
          bundles.splice(
            0,
            bundles.length,
            ...snap.bundles.map((b) => ({ ...b })),
          );
          audits.splice(
            0,
            audits.length,
            ...snap.audits.map((a) => ({ ...a })),
          );
          Object.assign(counters, snap.counters);
          seq = snap.seq;
          throw err;
        }
      };
      const pending = txTail.then(run, run);
      txTail = pending.then(
        () => undefined,
        () => undefined,
      );
      return pending;
    },
    _state: { organizations, scenarios, bundles, knowledge, audits, counters },
  };

  return client;
}

function seedOrg(client: ReturnType<typeof createMockClient>) {
  client._state.organizations.push({ id: ORG_A, slug: SLUG_A });
  client._state.organizations.push({ id: ORG_B, slug: "other" });
}

function baseScenario(
  overrides: Partial<ScenarioRow> & Pick<ScenarioRow, "id" | "status">,
): ScenarioRow {
  return {
    organizationId: ORG_A,
    name: "Scénario test",
    publishedPromptBundleId: null,
    knowledgeRefs: null,
    callType: "VENTE",
    offer: "Offre démo",
    prospectProfile: "Dirigeant PME",
    initialSituation: "Appel entrant",
    objective: "Qualifier",
    level: "MOYEN",
    personality: "prudent",
    allowedObjections: JSON.stringify(["pas le temps"]),
    secretInfos: JSON.stringify([
      { question: "budget", answer: "50k" },
    ]),
    successConditions: "RDV",
    failureConditions: "Raccroche",
    targetDurationSec: 300,
    relationshipHistory: null,
    aiProspect: null,
    expectedNextSteps: null,
    traineeBrief: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makePublishedBundle(
  scenarioId: string,
  version: number,
  body = "Tu incarnes {{prospectName}}, un prospect appelé au téléphone pour le backfill test.",
  overrides: Partial<BundleRow> = {},
): BundleRow {
  const { raw, hash } = personaArtifacts(body);
  return {
    id: `pb-${scenarioId}-v${version}`,
    organizationId: ORG_A,
    scenarioId,
    version,
    status: PromptBundleStatus.PUBLISHED,
    label: "existing",
    createdById: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    publishedAt: "2026-01-01T00:00:00.000Z",
    artifacts: raw,
    contentHash: hash,
    ...overrides,
  };
}

async function run(
  client: ReturnType<typeof createMockClient>,
  apply: boolean,
): Promise<BackfillSummary> {
  return backfillPublishedPromptBundles(client as unknown as BackfillPrisma, {
    orgSlug: SLUG_A,
    apply,
  });
}

function withLocalDbEnv() {
  const prevUrl = process.env.DATABASE_URL;
  const prevAllow = process.env.ALLOW_PROMPT_BUNDLE_BACKFILL;
  process.env.DATABASE_URL = LOCAL_DB_URL;
  delete process.env.ALLOW_PROMPT_BUNDLE_BACKFILL;
  return () => {
    if (prevUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevUrl;
    if (prevAllow === undefined) delete process.env.ALLOW_PROMPT_BUNDLE_BACKFILL;
    else process.env.ALLOW_PROMPT_BUNDLE_BACKFILL = prevAllow;
  };
}

describe("resolveOrgSlug / resolveApplyFlag", () => {
  it("lit --org-slug et --apply", () => {
    expect(
      resolveOrgSlug(["node", "script", "--org-slug=acme"], {}),
    ).toBe("acme");
    expect(resolveApplyFlag(["node", "script"])).toBe(false);
    expect(resolveApplyFlag(["node", "script", "--apply"])).toBe(true);
  });

  it("lit BACKFILL_ORG_SLUG", () => {
    expect(
      resolveOrgSlug(["node", "script"], { BACKFILL_ORG_SLUG: "from-env" }),
    ).toBe("from-env");
  });
});

describe("isLocalOrTestDatabase / assertBackfillAllowed", () => {
  const prevUrl = process.env.DATABASE_URL;
  const prevAllow = process.env.ALLOW_PROMPT_BUNDLE_BACKFILL;

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevUrl;
    if (prevAllow === undefined) delete process.env.ALLOW_PROMPT_BUNDLE_BACKFILL;
    else process.env.ALLOW_PROMPT_BUNDLE_BACKFILL = prevAllow;
  });

  it("autorise dry-run sans contrainte", () => {
    process.env.DATABASE_URL = "postgresql://prod.example/db";
    delete process.env.ALLOW_PROMPT_BUNDLE_BACKFILL;
    expect(() => assertBackfillAllowed(false)).not.toThrow();
  });

  it("refuse apply hors local sans ALLOW", () => {
    process.env.DATABASE_URL = "postgresql://prod.example/db";
    delete process.env.ALLOW_PROMPT_BUNDLE_BACKFILL;
    expect(() => assertBackfillAllowed(true)).toThrow(
      /ALLOW_PROMPT_BUNDLE_BACKFILL/,
    );
  });

  it("autorise apply local", () => {
    process.env.DATABASE_URL = "postgresql://localhost:5432/minduel";
    delete process.env.ALLOW_PROMPT_BUNDLE_BACKFILL;
    expect(() => assertBackfillAllowed(true)).not.toThrow();
  });

  it("username contenant test_ sur serveur de production : apply refusé", () => {
    const url =
      "postgresql://test_user:secret@db.prod.example.com:5432/minduel";
    expect(isLocalOrTestDatabase(url)).toBe(false);
    process.env.DATABASE_URL = url;
    delete process.env.ALLOW_PROMPT_BUNDLE_BACKFILL;
    expect(() => assertBackfillAllowed(true)).toThrow(
      /ALLOW_PROMPT_BUNDLE_BACKFILL/,
    );
  });

  it("URL invalide ou vide : apply refusé sans autorisation", () => {
    expect(isLocalOrTestDatabase("")).toBe(false);
    expect(isLocalOrTestDatabase("not-a-url")).toBe(false);
    process.env.DATABASE_URL = "";
    delete process.env.ALLOW_PROMPT_BUNDLE_BACKFILL;
    expect(() => assertBackfillAllowed(true)).toThrow(
      /ALLOW_PROMPT_BUNDLE_BACKFILL/,
    );
    process.env.DATABASE_URL = ":::invalid:::";
    expect(() => assertBackfillAllowed(true)).toThrow(
      /ALLOW_PROMPT_BUNDLE_BACKFILL/,
    );
  });

  it("accepte hostname .local et bases test_* / *_test", () => {
    expect(
      isLocalOrTestDatabase("postgresql://u@db.internal.local:5432/app"),
    ).toBe(true);
    expect(
      isLocalOrTestDatabase("postgresql://u@prod.example.com:5432/minduel_test"),
    ).toBe(true);
    expect(
      isLocalOrTestDatabase("postgresql://u@prod.example.com:5432/test_minduel"),
    ).toBe(true);
  });
});

describe("module pur prospectPersona + script sans contournement", () => {
  it("prospectPersona est importable directement et reste pur", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../src/lib/prospectPersona.ts"),
      "utf8",
    );
    expect(src).not.toContain("server-only");
    expect(src).not.toMatch(/\bfetch\b/);
    expect(src).not.toMatch(/\bprisma\b/i);
    expect(src).not.toMatch(/\bprocess\.env\b/);
    const body = prospectPersona.buildProspectPersona(
      {
        id: "s1",
        name: "N",
        callType: "VENTE",
        offer: "O",
        prospectProfile: "P",
        initialSituation: "I",
        objective: "Obj",
        level: "MOYEN",
        personality: "calme",
        allowedObjections: "[]",
        secretInfos: "[]",
        successConditions: null,
        failureConditions: null,
        targetDurationSec: 300,
      },
      [],
      "{{prospectName}}",
    );
    expect(body).toContain("{{prospectName}}");
    expect(body.length).toBeGreaterThan(20);
  });

  it("aucun createRequire, require.cache, neutralizeServerOnly ou dynamic import", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../prisma/backfillPublishedPromptBundles.ts"),
      "utf8",
    );
    expect(src).not.toContain("createRequire");
    expect(src).not.toContain("require.cache");
    expect(src).not.toContain("neutralizeServerOnly");
    expect(src).not.toMatch(/await import\(/);
    expect(src).toContain('from "../src/lib/prospectPersona"');
  });
});

describe("backfillPublishedPromptBundles", () => {
  let client: ReturnType<typeof createMockClient>;
  let fetchSpy: { mockRestore: () => void; mock: { calls: unknown[] } } | undefined;
  let restoreEnv: (() => void) | undefined;

  beforeEach(() => {
    restoreEnv = withLocalDbEnv();
    client = createMockClient();
    seedOrg(client);
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("fetch ne doit pas être appelé");
    });
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    restoreEnv?.();
    vi.restoreAllMocks();
  });

  it("1. dry-run : zéro create/update/audit", async () => {
    client._state.scenarios.push(
      baseScenario({ id: "sc-1", status: ScenarioStatus.PUBLISHED }),
    );

    const summary = await run(client, false);

    expect(summary.mode).toBe("DRY-RUN");
    expect(summary.toCreate).toBe(1);
    expect(summary.appliedCreate).toBe(0);
    expect(client._state.counters.bundleCreate).toBe(0);
    expect(client._state.counters.scenarioUpdate).toBe(0);
    expect(client._state.counters.auditCreate).toBe(0);
    expect(client._state.bundles).toHaveLength(0);
  });

  it("2. scénario publié sans bundle : création et rattachement", async () => {
    client._state.scenarios.push(
      baseScenario({ id: "sc-create", status: ScenarioStatus.PUBLISHED }),
    );

    const summary = await run(client, true);

    expect(summary.mode).toBe("APPLY");
    expect(summary.appliedCreate).toBe(1);
    expect(client._state.bundles).toHaveLength(1);
    const bundle = client._state.bundles[0]!;
    expect(client._state.scenarios[0]!.publishedPromptBundleId).toBe(bundle.id);
    expect(client._state.audits).toHaveLength(1);
    expect(client._state.audits[0]!.action).toBe(
      "BACKFILL_PUBLISHED_PROMPT_BUNDLE",
    );
    expect(client._state.audits[0]!.actorId).toBeNull();
    expect(client._state.audits[0]!.targetType).toBe("Scenario");
  });

  it("3. bundle créé PUBLISHED avec hash valide et uniquement PROSPECT_PERSONA", async () => {
    client._state.scenarios.push(
      baseScenario({ id: "sc-hash", status: ScenarioStatus.PUBLISHED }),
    );

    await run(client, true);

    const bundle = client._state.bundles[0]!;
    expect(bundle.status).toBe(PromptBundleStatus.PUBLISHED);
    expect(bundle.publishedAt).toBeTruthy();
    expect(bundle.label).toBe("backfill legacy");
    expect(bundle.createdById).toBeNull();
    expect(bundle.version).toBe(1);

    const parsed = parsePromptArtifacts(bundle.artifacts);
    expect(Object.keys(parsed)).toEqual([PromptKind.PROSPECT_PERSONA]);
    expect(parsed.PROSPECT_PERSONA.body).toContain("{{prospectName}}");
    expect(verifyPromptArtifactsHash(parsed, bundle.contentHash)).toBe(true);
    expect(parsed).not.toHaveProperty(PromptKind.EVALUATION_SYSTEM);
    expect(parsed).not.toHaveProperty(PromptKind.EVALUATION_USER);
  });

  it("4. bundle PUBLISHED valide existant : rattachement sans duplication", async () => {
    const scenario = baseScenario({
      id: "sc-attach",
      status: ScenarioStatus.PUBLISHED,
    });
    const existing = makePublishedBundle(scenario.id, 2);
    client._state.scenarios.push(scenario);
    client._state.bundles.push(existing);

    const summary = await run(client, true);

    expect(summary.appliedAttach).toBe(1);
    expect(summary.appliedCreate).toBe(0);
    expect(client._state.bundles).toHaveLength(1);
    expect(client._state.scenarios[0]!.publishedPromptBundleId).toBe(
      existing.id,
    );
    expect(client._state.bundles[0]!.artifacts).toBe(existing.artifacts);
  });

  it("5. bundle DRAFT existant : laissé inchangé, nouvelle version PUBLISHED", async () => {
    const scenario = baseScenario({
      id: "sc-draft",
      status: ScenarioStatus.PUBLISHED,
    });
    const draftBody =
      "Corps brouillon suffisamment long pour passer le schéma artifacts.";
    const draftArts = personaArtifacts(draftBody);
    const draft: BundleRow = {
      id: "pb-draft",
      organizationId: ORG_A,
      scenarioId: scenario.id,
      version: 1,
      status: PromptBundleStatus.DRAFT,
      label: "v1 draft",
      createdById: "user-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      publishedAt: null,
      artifacts: draftArts.raw,
      contentHash: draftArts.hash,
    };
    client._state.scenarios.push(scenario);
    client._state.bundles.push(draft);

    await run(client, true);

    expect(client._state.bundles).toHaveLength(2);
    const stillDraft = client._state.bundles.find((b) => b.id === "pb-draft")!;
    expect(stillDraft.status).toBe(PromptBundleStatus.DRAFT);
    expect(stillDraft.artifacts).toBe(draftArts.raw);
    expect(stillDraft.label).toBe("v1 draft");

    const created = client._state.bundles.find((b) => b.id !== "pb-draft")!;
    expect(created.status).toBe(PromptBundleStatus.PUBLISHED);
    expect(created.version).toBe(2);
    expect(created.label).toBe("backfill legacy");
    expect(client._state.scenarios[0]!.publishedPromptBundleId).toBe(
      created.id,
    );
  });

  it("6. pointeur déjà valide : aucune écriture", async () => {
    const scenario = baseScenario({
      id: "sc-ok",
      status: ScenarioStatus.PUBLISHED,
      publishedPromptBundleId: "pb-ok",
    });
    const bundle = makePublishedBundle(scenario.id, 1, undefined, {
      id: "pb-ok",
    });
    client._state.scenarios.push(scenario);
    client._state.bundles.push(bundle);

    const summary = await run(client, true);

    expect(summary.alreadyValid).toBe(1);
    expect(summary.appliedAttach).toBe(0);
    expect(summary.appliedCreate).toBe(0);
    expect(client._state.counters.bundleCreate).toBe(0);
    expect(client._state.counters.scenarioUpdate).toBe(0);
    expect(client._state.counters.auditCreate).toBe(0);
  });

  it("7. pointeur ou hash invalide : échec sans écriture", async () => {
    const badPointer = baseScenario({
      id: "sc-bad-ptr",
      status: ScenarioStatus.PUBLISHED,
      publishedPromptBundleId: "missing-bundle",
    });
    const badHashScenario = baseScenario({
      id: "sc-bad-hash",
      status: ScenarioStatus.PUBLISHED,
      publishedPromptBundleId: "pb-bad-hash",
    });
    const badHashBundle = makePublishedBundle(
      badHashScenario.id,
      1,
      undefined,
      { id: "pb-bad-hash", contentHash: "deadbeef".repeat(8) },
    );
    client._state.scenarios.push(badPointer, badHashScenario);
    client._state.bundles.push(badHashBundle);

    const summary = await run(client, true);

    expect(summary.errors.length).toBeGreaterThanOrEqual(2);
    expect(summary.appliedAttach).toBe(0);
    expect(summary.appliedCreate).toBe(0);
    expect(client._state.counters.bundleCreate).toBe(0);
    expect(client._state.counters.scenarioUpdate).toBe(0);
    expect(client._state.counters.auditCreate).toBe(0);
    expect(client._state.scenarios[0]!.publishedPromptBundleId).toBe(
      "missing-bundle",
    );
    expect(client._state.scenarios[1]!.publishedPromptBundleId).toBe(
      "pb-bad-hash",
    );
  });

  it("8. deuxième exécution : idempotence complète", async () => {
    client._state.scenarios.push(
      baseScenario({ id: "sc-idem", status: ScenarioStatus.PUBLISHED }),
    );

    const first = await run(client, true);
    expect(first.appliedCreate).toBe(1);
    const bundleCount = client._state.bundles.length;
    const auditCount = client._state.audits.length;
    const pointer = client._state.scenarios[0]!.publishedPromptBundleId;

    const second = await run(client, true);
    expect(second.alreadyValid).toBe(1);
    expect(second.appliedCreate).toBe(0);
    expect(second.appliedAttach).toBe(0);
    expect(client._state.bundles).toHaveLength(bundleCount);
    expect(client._state.audits).toHaveLength(auditCount);
    expect(client._state.scenarios[0]!.publishedPromptBundleId).toBe(pointer);
  });

  it("9. DRAFT, ARCHIVED et autre organisation : jamais modifiés", async () => {
    const draft = baseScenario({
      id: "sc-draft-status",
      status: ScenarioStatus.DRAFT,
    });
    const archived = baseScenario({
      id: "sc-arch",
      status: ScenarioStatus.ARCHIVED,
    });
    const otherOrg = baseScenario({
      id: "sc-other",
      status: ScenarioStatus.PUBLISHED,
      organizationId: ORG_B,
    });
    const target = baseScenario({
      id: "sc-target",
      status: ScenarioStatus.PUBLISHED,
    });
    client._state.scenarios.push(draft, archived, otherOrg, target);

    await run(client, true);

    expect(draft.publishedPromptBundleId).toBeNull();
    expect(archived.publishedPromptBundleId).toBeNull();
    expect(otherOrg.publishedPromptBundleId).toBeNull();
    expect(target.publishedPromptBundleId).toBeTruthy();
    expect(
      client._state.bundles.every((b) => b.scenarioId === "sc-target"),
    ).toBe(true);
  });

  it("10. organisation absente : échec sans création", async () => {
    const empty = createMockClient();
    await expect(
      backfillPublishedPromptBundles(empty as unknown as BackfillPrisma, {
        orgSlug: "missing-org",
        apply: true,
      }),
    ).rejects.toThrow(/Organisation introuvable/);
    expect(empty._state.organizations).toHaveLength(0);
    expect(empty._state.counters.organizationCreate).toBe(0);
    expect(empty._state.scenarios).toHaveLength(0);
    expect(empty._state.bundles).toHaveLength(0);
  });

  it("11. connaissances approuvées seulement dans la persona", async () => {
    client._state.knowledge.push(
      {
        id: "k-ok",
        organizationId: ORG_A,
        type: "OBJECTION",
        title: "Prix",
        content: "Mentionner le ROI clairement",
        reviewStatus: "APPROVED",
        enabled: true,
      },
      {
        id: "k-pending",
        organizationId: ORG_A,
        type: "OBJECTION",
        title: "Secret pending",
        content: "NE_DOIT_PAS_APPARAITRE_PENDING",
        reviewStatus: "PENDING",
        enabled: true,
      },
      {
        id: "k-disabled",
        organizationId: ORG_A,
        type: "OBJECTION",
        title: "Disabled",
        content: "NE_DOIT_PAS_APPARAITRE_DISABLED",
        reviewStatus: "APPROVED",
        enabled: false,
      },
    );
    client._state.scenarios.push(
      baseScenario({
        id: "sc-know",
        status: ScenarioStatus.PUBLISHED,
        knowledgeRefs: JSON.stringify(["k-ok", "k-pending", "k-disabled"]),
      }),
    );

    await run(client, true);

    const body = parsePromptArtifacts(client._state.bundles[0]!.artifacts)
      .PROSPECT_PERSONA.body;
    expect(body).toContain("Mentionner le ROI clairement");
    expect(body).not.toContain("NE_DOIT_PAS_APPARAITRE_PENDING");
    expect(body).not.toContain("NE_DOIT_PAS_APPARAITRE_DISABLED");
  });

  it("12. aucun fetch / OpenAI / provider externe", async () => {
    client._state.scenarios.push(
      baseScenario({ id: "sc-net", status: ScenarioStatus.PUBLISHED }),
    );

    await run(client, true);

    expect(fetchSpy?.mock.calls ?? []).toHaveLength(0);
  });

  it("précontrôle : incohérence bloque toute écriture même en apply", async () => {
    const ok = baseScenario({
      id: "sc-ok-blocked",
      status: ScenarioStatus.PUBLISHED,
    });
    const bad = baseScenario({
      id: "sc-bad-blocked",
      status: ScenarioStatus.PUBLISHED,
      publishedPromptBundleId: "ghost",
    });
    client._state.scenarios.push(ok, bad);

    const summary = await run(client, true);

    expect(summary.errors.length).toBe(1);
    expect(summary.toCreate).toBe(1);
    expect(client._state.counters.bundleCreate).toBe(0);
    expect(client._state.counters.scenarioUpdate).toBe(0);
    expect(ok.publishedPromptBundleId).toBeNull();
  });

  it("bundle SUPERSEDED existant : laissé inchangé, nouvelle version PUBLISHED", async () => {
    const scenario = baseScenario({
      id: "sc-super",
      status: ScenarioStatus.PUBLISHED,
    });
    const superseded = makePublishedBundle(scenario.id, 3, undefined, {
      id: "pb-super",
      status: PromptBundleStatus.SUPERSEDED,
      label: "old",
    });
    client._state.scenarios.push(scenario);
    client._state.bundles.push(superseded);

    await run(client, true);

    expect(
      client._state.bundles.find((b) => b.id === "pb-super")!.status,
    ).toBe(PromptBundleStatus.SUPERSEDED);
    const created = client._state.bundles.find((b) => b.id !== "pb-super")!;
    expect(created.version).toBe(4);
    expect(created.status).toBe(PromptBundleStatus.PUBLISHED);
  });

  it("dry-run charge les connaissances et prépare réellement les artifacts", async () => {
    client._state.knowledge.push({
      id: "k-dry",
      organizationId: ORG_A,
      type: "OBJECTION",
      title: "Dry",
      content: "Connaissance dry-run visible",
      reviewStatus: "APPROVED",
      enabled: true,
    });
    client._state.scenarios.push(
      baseScenario({
        id: "sc-dry-prep",
        status: ScenarioStatus.PUBLISHED,
        knowledgeRefs: JSON.stringify(["k-dry"]),
      }),
    );

    const summary = await run(client, false);

    expect(summary.mode).toBe("DRY-RUN");
    expect(summary.toCreate).toBe(1);
    expect(summary.errors).toHaveLength(0);
    expect(client._state.counters.knowledgeFind).toBeGreaterThan(0);
    expect(client._state.counters.bundleCreate).toBe(0);
    expect(client._state.counters.scenarioUpdate).toBe(0);
    expect(client._state.counters.auditCreate).toBe(0);
    expect(JSON.stringify(summary)).not.toContain("Connaissance dry-run visible");
    expect(JSON.stringify(summary.plans)).not.toContain("Tu incarnes");
  });

  it("dry-run avec préparation invalide : zéro écriture", async () => {
    const spy = vi
      .spyOn(prospectPersona, "buildProspectPersona")
      .mockReturnValue("trop-court");
    client._state.scenarios.push(
      baseScenario({ id: "sc-bad-prep", status: ScenarioStatus.PUBLISHED }),
    );

    const summary = await run(client, false);

    expect(summary.errors.length).toBe(1);
    expect(summary.errors[0]).toMatch(
      /préparation locale des artifacts impossible \(sc-bad-prep\)/,
    );
    expect(summary.errors[0]).not.toContain("trop-court");
    expect(JSON.stringify(summary)).not.toMatch(/Too small|ZodError|min/i);
    expect(summary.toCreate).toBe(0);
    expect(client._state.counters.bundleCreate).toBe(0);
    expect(client._state.counters.scenarioUpdate).toBe(0);
    expect(client._state.counters.auditCreate).toBe(0);
    spy.mockRestore();
  });

  it("bundle devenu DRAFT entre plan et transaction : attach refusé sans écriture", async () => {
    const scenario = baseScenario({
      id: "sc-race-attach",
      status: ScenarioStatus.PUBLISHED,
    });
    const existing = makePublishedBundle(scenario.id, 1, undefined, {
      id: "pb-race-attach",
    });
    client._state.scenarios.push(scenario);
    client._state.bundles.push(existing);

    const originalTx = client.$transaction.bind(client);
    client.$transaction = async <T>(fn: (tx: BackfillPrisma) => Promise<T>) => {
      existing.status = PromptBundleStatus.DRAFT;
      return originalTx(fn);
    };

    await expect(run(client, true)).rejects.toThrow(/Race|n'est pas PUBLISHED/);
    expect(scenario.publishedPromptBundleId).toBeNull();
    expect(client._state.counters.scenarioUpdate).toBe(0);
    expect(client._state.counters.auditCreate).toBe(0);
  });

  it("scénario modifié avant la transaction : création depuis l'état frais", async () => {
    const scenario = baseScenario({
      id: "sc-fresh",
      status: ScenarioStatus.PUBLISHED,
      offer: "OFFRE_INITIALE",
    });
    client._state.scenarios.push(scenario);

    const originalTx = client.$transaction.bind(client);
    client.$transaction = async <T>(fn: (tx: BackfillPrisma) => Promise<T>) => {
      scenario.offer = "OFFRE_FRAICHE_UNIQUE_XYZ";
      return originalTx(fn);
    };

    await run(client, true);

    const body = parsePromptArtifacts(client._state.bundles[0]!.artifacts)
      .PROSPECT_PERSONA.body;
    expect(body).toContain("OFFRE_FRAICHE_UNIQUE_XYZ");
    expect(body).not.toContain("OFFRE_INITIALE");
  });

  it("nouvelle version DRAFT apparue entre plan et transaction : version recalculée", async () => {
    const scenario = baseScenario({
      id: "sc-ver-race",
      status: ScenarioStatus.PUBLISHED,
    });
    client._state.scenarios.push(scenario);

    const originalTx = client.$transaction.bind(client);
    client.$transaction = async <T>(fn: (tx: BackfillPrisma) => Promise<T>) => {
      const draftArts = personaArtifacts(
        "Draft intercalé suffisamment long pour le schéma artifacts.",
      );
      client._state.bundles.push({
        id: "pb-intercalated",
        organizationId: ORG_A,
        scenarioId: scenario.id,
        version: 1,
        status: PromptBundleStatus.DRAFT,
        label: "intercalated",
        createdById: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        publishedAt: null,
        artifacts: draftArts.raw,
        contentHash: draftArts.hash,
      });
      return originalTx(fn);
    };

    const summary = await run(client, true);

    expect(summary.appliedCreate).toBe(1);
    const created = client._state.bundles.find(
      (b) => b.id !== "pb-intercalated",
    )!;
    expect(created.version).toBe(2);
    expect(created.status).toBe(PromptBundleStatus.PUBLISHED);
    expect(
      client._state.bundles.find((b) => b.id === "pb-intercalated")!.status,
    ).toBe(PromptBundleStatus.DRAFT);
  });

  it("A. attach compare-and-set perdu : aucun pointeur, audit ni bundle", async () => {
    const scenario = baseScenario({
      id: "sc-cas-attach",
      status: ScenarioStatus.PUBLISHED,
    });
    const existing = makePublishedBundle(scenario.id, 1, undefined, {
      id: "pb-cas-attach",
    });
    client._state.scenarios.push(scenario);
    client._state.bundles.push(existing);

    client.scenario.updateMany = async () => ({ count: 0 });

    await expect(run(client, true)).rejects.toThrow(/compare-and-set perdu/);
    expect(
      client._state.scenarios.find((s) => s.id === "sc-cas-attach")!
        .publishedPromptBundleId,
    ).toBeNull();
    expect(client._state.audits).toHaveLength(0);
    expect(client._state.bundles).toHaveLength(1);
    expect(client._state.bundles[0]!.id).toBe("pb-cas-attach");
  });

  it("B. create compare-and-set perdu après création : rollback total", async () => {
    client._state.scenarios.push(
      baseScenario({ id: "sc-cas-create", status: ScenarioStatus.PUBLISHED }),
    );

    client.scenario.updateMany = async () => ({ count: 0 });

    await expect(run(client, true)).rejects.toThrow(/compare-and-set perdu/);
    expect(
      client._state.scenarios.find((s) => s.id === "sc-cas-create")!
        .publishedPromptBundleId,
    ).toBeNull();
    expect(client._state.bundles).toHaveLength(0);
    expect(client._state.audits).toHaveLength(0);
    expect(client._state.counters.bundleCreate).toBe(0);
    expect(client._state.counters.auditCreate).toBe(0);
  });

  it("C. deux attach concurrents : un seul count=1, aucun audit en double", async () => {
    const scenario = baseScenario({
      id: "sc-cas-dual",
      status: ScenarioStatus.PUBLISHED,
    });
    const existing = makePublishedBundle(scenario.id, 1, undefined, {
      id: "pb-cas-dual",
    });
    client._state.scenarios.push(scenario);
    client._state.bundles.push(existing);

    const results = await Promise.allSettled([
      run(client, true),
      run(client, true),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect(
      client._state.scenarios.find((s) => s.id === "sc-cas-dual")!
        .publishedPromptBundleId,
    ).toBe("pb-cas-dual");
    expect(client._state.audits).toHaveLength(1);
    expect(client._state.bundles).toHaveLength(1);
  });

  it("D. erreurs de préparation sans fuite de prompt ni exception brute", async () => {
    const secret =
      "CORPS_PROMPT_SECRET_NE_DOIT_PAS_FUITER_DANS_SUMMARY_OU_ERREUR";
    const spy = vi
      .spyOn(prospectPersona, "buildProspectPersona")
      .mockImplementation(() => {
        throw new Error(secret);
      });
    client._state.scenarios.push(
      baseScenario({ id: "sc-leak", status: ScenarioStatus.PUBLISHED }),
    );

    const dry = await run(client, false);
    expect(dry.errors[0]).toBe(
      "sc-leak: préparation locale des artifacts impossible (sc-leak)",
    );
    expect(dry.errors[0]).not.toContain(secret);
    expect(JSON.stringify(dry)).not.toContain(secret);
    expect(JSON.stringify(dry)).not.toContain("Tu incarnes");

    const apply = await run(client, true);
    expect(apply.errors[0]).toBe(
      "sc-leak: préparation locale des artifacts impossible (sc-leak)",
    );
    expect(apply.errors[0]).not.toContain(secret);
    expect(JSON.stringify(apply)).not.toContain(secret);
    expect(client._state.bundles).toHaveLength(0);
    expect(client._state.audits).toHaveLength(0);

    spy.mockRestore();
  });
});
