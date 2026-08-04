import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
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

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-000000000099";
const MANAGER_ID = "00000000-0000-4000-8000-000000000010";
const SCENARIO_ID = "00000000-0000-4000-8000-000000000030";

type ScenarioRow = {
  id: string;
  organizationId: string;
  name: string;
  callType: string;
  level: string;
  campaign: string | null;
  offer: string | null;
  prospectProfile: string | null;
  initialSituation: string | null;
  objective: string | null;
  personality: string | null;
  allowedObjections: string | null;
  secretInfos: string | null;
  successConditions: string | null;
  failureConditions: string | null;
  targetDurationSec: number;
  knowledgeRefs: string | null;
  status: string;
  publishedPromptBundleId: string | null;
  relationshipHistory: string | null;
  aiProspect: string | null;
  expectedNextSteps: string | null;
  traineeBrief: string | null;
  updatedAt: string;
  createdAt: string;
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

type KnowledgeRow = {
  id: string;
  organizationId: string;
  type: string;
  title: string;
  content: string;
  reviewStatus: string;
  enabled: boolean;
};

let scenarios: ScenarioRow[] = [];
let bundles: BundleRow[] = [];
let audits: AuditRow[] = [];
let knowledge: KnowledgeRow[] = [];
let seq = 0;
let auditShouldFail = false;
let fetchSpy: { mock: { calls: unknown[] } } | null = null;

/** Compteurs pour prouver retry / P2002. */
let transactionCalls = 0;
let createCalls = 0;
let createThrowP2002Calls = 0;

/**
 * Collision déterministe : au prochain promptBundle.create,
 * injecte un gagnant concurrent après rollback et lève P2002.
 */
let collideNextCreate = false;
let pendingWinner: null | (() => void) = null;

/** updateMany renvoie count=0 N fois (PublicationRaceError). */
let raceUpdateRemaining = 0;

/** Première $transaction lève P2034 avant d'exécuter le callback. */
let throwP2034Once = false;

const managerUser = {
  id: MANAGER_ID,
  email: "manager@test.com",
  fullName: "Manager",
  organizationId: ORG,
  organizationName: "Org",
  role: "MANAGER",
};

function uid(prefix: string) {
  return `${prefix}-${++seq}`;
}

function matchesNotStatus(rowStatus: string, statusFilter: unknown): boolean {
  if (statusFilter == null) return true;
  if (typeof statusFilter === "string") return rowStatus === statusFilter;
  if (
    typeof statusFilter === "object" &&
    statusFilter !== null &&
    "not" in statusFilter
  ) {
    return rowStatus !== (statusFilter as { not: string }).not;
  }
  return true;
}

function matchPublishedPointer(
  row: ScenarioRow,
  where: Record<string, unknown>,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(where, "publishedPromptBundleId")) {
    return true;
  }
  if (where.publishedPromptBundleId === null) {
    return row.publishedPromptBundleId === null;
  }
  return row.publishedPromptBundleId === where.publishedPromptBundleId;
}

function matchScenarioWhere(where: Record<string, unknown> | undefined) {
  if (!where) return scenarios[0] ?? null;
  return (
    scenarios.find((s) => {
      if (where.id && s.id !== where.id) return false;
      if (where.organizationId && s.organizationId !== where.organizationId)
        return false;
      if (!matchesNotStatus(s.status, where.status)) return false;
      if (!matchPublishedPointer(s, where)) return false;
      return true;
    }) ?? null
  );
}

function makePersonaArtifacts(body: string) {
  return {
    [PromptKind.PROSPECT_PERSONA]: {
      body,
      contentType: "text/plain",
    },
  };
}

function seedValidBundle(
  overrides: Partial<BundleRow> & { body?: string } = {},
): BundleRow {
  const body =
    overrides.body ??
    "Tu incarnes {{prospectName}}, persona de test suffisamment longue pour valider le schema.";
  const artifacts = makePersonaArtifacts(body);
  const contentHash = overrides.contentHash ?? hashPromptArtifacts(artifacts);
  const row: BundleRow = {
    id: overrides.id ?? uid("pb"),
    organizationId: overrides.organizationId ?? ORG,
    scenarioId: overrides.scenarioId ?? SCENARIO_ID,
    version: overrides.version ?? 1,
    status: overrides.status ?? PromptBundleStatus.PUBLISHED,
    label: overrides.label ?? "admin",
    createdById: overrides.createdById ?? "admin-1",
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    publishedAt: overrides.publishedAt ?? "2026-01-01T00:00:00.000Z",
    artifacts: overrides.artifacts ?? JSON.stringify(artifacts),
    contentHash,
  };
  bundles.push(row);
  return row;
}

function seedScenario(
  status: string,
  overrides: Partial<ScenarioRow> = {},
): ScenarioRow {
  const row: ScenarioRow = {
    id: SCENARIO_ID,
    organizationId: ORG,
    name: "Scenario test",
    callType: "VENTE",
    level: "MOYEN",
    campaign: "Campagne A",
    offer: "Offre initiale",
    prospectProfile: "Profil initial",
    initialSituation: "Situation initiale",
    objective: "Objectif initial",
    personality: "mechant",
    allowedObjections: "[]",
    secretInfos: "[]",
    successConditions: null,
    failureConditions: null,
    targetDurationSec: 300,
    knowledgeRefs: "[]",
    status,
    publishedPromptBundleId: null,
    relationshipHistory: null,
    aiProspect: null,
    expectedNextSteps: null,
    traineeBrief: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  scenarios = [row];
  return row;
}
vi.mock("@/lib/auth", () => ({
  requireManager: vi.fn(async () => managerUser),
}));

vi.mock("@/lib/db", () => {
  const scenarioApi = {
    findFirst: async ({
      where,
    }: {
      where?: Record<string, unknown>;
    }) => {
      const found = matchScenarioWhere(where);
      return found ? { ...found } : null;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where?: Record<string, unknown>;
      data: Partial<ScenarioRow>;
    }) => {
      if (raceUpdateRemaining > 0) {
        raceUpdateRemaining -= 1;
        return { count: 0 };
      }
      const targets = scenarios.filter((s) => {
        if (where?.id && s.id !== where.id) return false;
        if (
          where?.organizationId &&
          s.organizationId !== where.organizationId
        )
          return false;
        if (!matchesNotStatus(s.status, where?.status)) return false;
        if (where && !matchPublishedPointer(s, where)) return false;
        return true;
      });
      for (const t of targets) Object.assign(t, data);
      return { count: targets.length };
    },
  };

  const promptBundleApi = {
    findFirst: async ({
      where,
    }: {
      where?: Record<string, unknown>;
    }) => {
      const found = bundles.find((b) => {
        if (where?.id && b.id !== where.id) return false;
        if (where?.scenarioId && b.scenarioId !== where.scenarioId) return false;
        if (
          where?.organizationId &&
          b.organizationId !== where.organizationId
        )
          return false;
        if (where?.status && b.status !== where.status) return false;
        return true;
      });
      return found ? { ...found } : null;
    },
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: Record<string, unknown>;
      orderBy?: { version: "desc" | "asc" };
    }) => {
      let rows = bundles.filter((b) => {
        if (where?.scenarioId && b.scenarioId !== where.scenarioId) return false;
        if (
          where?.organizationId &&
          b.organizationId !== where.organizationId
        )
          return false;
        if (where?.status && b.status !== where.status) return false;
        return true;
      });
      if (orderBy?.version === "desc") {
        rows = [...rows].sort((a, c) => c.version - a.version);
      }
      return rows.map((b) => ({ ...b }));
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      createCalls += 1;

      if (collideNextCreate) {
        collideNextCreate = false;
        createThrowP2002Calls += 1;
        const winnerId = "pb-winner-concurrent";
        const body =
          "Tu incarnes {{prospectName}}, persona GAGNANTE concurrente suffisamment longue.";
        const artifacts = makePersonaArtifacts(body);
        const contentHash = hashPromptArtifacts(artifacts);
        pendingWinner = () => {
          if (!bundles.some((b) => b.id === winnerId)) {
            bundles.push({
              id: winnerId,
              organizationId: ORG,
              scenarioId: SCENARIO_ID,
              version: 1,
              status: PromptBundleStatus.PUBLISHED,
              label: "gagnant concurrent",
              createdById: "other-actor",
              createdAt: "2026-01-01T00:00:00.000Z",
              publishedAt: "2026-01-01T00:00:00.000Z",
              artifacts: JSON.stringify(artifacts),
              contentHash,
            });
          }
          const sc = scenarios.find((s) => s.id === SCENARIO_ID);
          if (sc) {
            sc.status = ScenarioStatus.PUBLISHED;
            sc.publishedPromptBundleId = winnerId;
          }
          if (
            !audits.some(
              (a) =>
                a.action === "PROMPT_BUNDLE_CREATE" && a.targetId === winnerId,
            )
          ) {
            audits.push({
              id: uid("audit"),
              organizationId: ORG,
              actorId: "other-actor",
              action: "PROMPT_BUNDLE_CREATE",
              targetType: "PromptBundle",
              targetId: winnerId,
              metadata: JSON.stringify({
                scenarioId: SCENARIO_ID,
                version: 1,
                source: "CONCURRENT_WINNER",
              }),
              createdAt: "2026-01-01T00:00:00.000Z",
            });
          }
        };
        throw new Prisma.PrismaClientKnownRequestError(
          "Unique published bundle",
          { code: "P2002", clientVersion: "test" },
        );
      }

      if (
        data.status === PromptBundleStatus.PUBLISHED &&
        bundles.some(
          (b) =>
            b.scenarioId === data.scenarioId &&
            b.status === PromptBundleStatus.PUBLISHED,
        )
      ) {
        throw new Prisma.PrismaClientKnownRequestError(
          "Unique published bundle",
          { code: "P2002", clientVersion: "test" },
        );
      }
      if (
        bundles.some(
          (b) =>
            b.scenarioId === data.scenarioId && b.version === data.version,
        )
      ) {
        throw new Prisma.PrismaClientKnownRequestError("Unique version", {
          code: "P2002",
          clientVersion: "test",
        });
      }
      const row: BundleRow = {
        id: uid("pb"),
        organizationId: String(data.organizationId),
        scenarioId: String(data.scenarioId),
        version: Number(data.version),
        status: String(data.status),
        label: (data.label as string | null) ?? null,
        createdById: (data.createdById as string | null) ?? null,
        createdAt: String(data.createdAt),
        publishedAt: (data.publishedAt as string | null) ?? null,
        artifacts: String(data.artifacts),
        contentHash: String(data.contentHash),
      };
      bundles.push(row);
      return { ...row };
    },
  };

  const auditEventApi = {
    create: async ({ data }: { data: Omit<AuditRow, "id"> }) => {
      if (auditShouldFail) throw new Error("audit boom");
      const row: AuditRow = { id: uid("audit"), ...data };
      audits.push(row);
      return row;
    },
  };

  const knowledgeItemApi = {
    findMany: async ({
      where,
    }: {
      where?: Record<string, unknown>;
    }) => {
      const ids =
        where &&
        typeof where.id === "object" &&
        where.id !== null &&
        "in" in (where.id as object)
          ? ((where.id as { in: string[] }).in ?? [])
          : [];
      return knowledge.filter((k) => {
        if (ids.length && !ids.includes(k.id)) return false;
        if (where?.organizationId && k.organizationId !== where.organizationId)
          return false;
        if (where?.reviewStatus && k.reviewStatus !== where.reviewStatus)
          return false;
        if (where?.enabled != null && k.enabled !== where.enabled) return false;
        return true;
      });
    },
  };

  const tx = {
    scenario: scenarioApi,
    promptBundle: promptBundleApi,
    auditEvent: auditEventApi,
    knowledgeItem: knowledgeItemApi,
  };

  return {
    prisma: {
      scenario: scenarioApi,
      promptBundle: promptBundleApi,
      auditEvent: auditEventApi,
      knowledgeItem: knowledgeItemApi,
      $transaction: async <T>(fn: (client: typeof tx) => Promise<T>) => {
        transactionCalls += 1;
        if (throwP2034Once) {
          throwP2034Once = false;
          throw new Prisma.PrismaClientKnownRequestError("write conflict", {
            code: "P2034",
            clientVersion: "test",
          });
        }
        const snapScenarios = scenarios.map((s) => ({ ...s }));
        const snapBundles = bundles.map((b) => ({ ...b }));
        const snapAudits = audits.map((a) => ({ ...a }));
        try {
          return await fn(tx);
        } catch (err) {
          scenarios = snapScenarios;
          bundles = snapBundles;
          audits = snapAudits;
          if (pendingWinner) {
            const apply = pendingWinner;
            pendingWinner = null;
            apply();
          }
          throw err;
        }
      },
    },
  };
});

async function patchScenario(id: string, body: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/scenarios/[id]/route");
  return PATCH(
    new Request(`http://localhost/api/scenarios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

function assertNoSensitiveKeys(data: Record<string, unknown>) {
  for (const key of [
    "artifacts",
    "prompt",
    "promptBundle",
    "promptBundles",
    "publishedPromptBundleId",
    "contentHash",
    "hash",
    "version",
  ]) {
    expect(data).not.toHaveProperty(key);
  }
}

beforeEach(async () => {
  scenarios = [];
  bundles = [];
  audits = [];
  knowledge = [];
  seq = 0;
  auditShouldFail = false;
  transactionCalls = 0;
  createCalls = 0;
  createThrowP2002Calls = 0;
  collideNextCreate = false;
  pendingWinner = null;
  raceUpdateRemaining = 0;
  throwP2034Once = false;
  vi.clearAllMocks();
  const auth = await import("@/lib/auth");
  vi.mocked(auth.requireManager).mockResolvedValue(managerUser as never);
  if (!fetchSpy) {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("fetch interdit dans les tests F2");
    }) as unknown as { mock: { calls: unknown[] } };
  }
});
describe("PATCH manager — publication PromptBundle", () => {
  it("1. DRAFT sans bundle → crée PUBLISHED v1, pointeur, persona, pas EVAL", async () => {
    seedScenario(ScenarioStatus.DRAFT);
    const res = await patchScenario(SCENARIO_ID, { status: "PUBLISHED" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      id: SCENARIO_ID,
      status: ScenarioStatus.PUBLISHED,
    });
    assertNoSensitiveKeys(body.data);

    expect(scenarios[0]!.status).toBe(ScenarioStatus.PUBLISHED);
    expect(scenarios[0]!.publishedPromptBundleId).toBeTruthy();
    expect(bundles).toHaveLength(1);
    const b = bundles[0]!;
    expect(b.status).toBe(PromptBundleStatus.PUBLISHED);
    expect(b.version).toBe(1);
    expect(b.createdById).toBe(MANAGER_ID);
    expect(b.label).toContain("publication manager");
    expect(scenarios[0]!.publishedPromptBundleId).toBe(b.id);

    const artifacts = parsePromptArtifacts(b.artifacts);
    expect(artifacts.PROSPECT_PERSONA?.body).toContain("{{prospectName}}");
    expect(artifacts).not.toHaveProperty("EVALUATION_SYSTEM");
    expect(artifacts).not.toHaveProperty("EVALUATION_USER");
    expect(verifyPromptArtifactsHash(artifacts, b.contentHash)).toBe(true);

    expect(audits).toHaveLength(1);
    expect(audits[0]!.action).toBe("PROMPT_BUNDLE_CREATE");
    const meta = JSON.parse(audits[0]!.metadata!);
    expect(meta).toEqual({
      scenarioId: SCENARIO_ID,
      version: 1,
      source: "MANAGER_AUTO_PUBLICATION",
    });
    expect(meta).not.toHaveProperty("artifacts");
    expect(meta).not.toHaveProperty("contentHash");
  });

  it("2. persona générée depuis métadonnées finales du même PATCH", async () => {
    seedScenario(ScenarioStatus.DRAFT, {
      offer: "Ancienne offre",
      personality: "ancienne",
    });
    const res = await patchScenario(SCENARIO_ID, {
      status: "PUBLISHED",
      offer: "Offre FINALE unique XYZ",
      personality: "curieux presse",
      name: "Nom final publish",
    });
    expect(res.status).toBe(200);
    expect(scenarios[0]!.offer).toBe("Offre FINALE unique XYZ");
    expect(scenarios[0]!.name).toBe("Nom final publish");
    const artifacts = parsePromptArtifacts(bundles[0]!.artifacts);
    expect(artifacts.PROSPECT_PERSONA.body).toContain("Offre FINALE unique XYZ");
    expect(artifacts.PROSPECT_PERSONA.body).toContain("curieux presse");
    expect(artifacts.PROSPECT_PERSONA.body).not.toContain("Ancienne offre");
  });

  it("3. pointeur PUBLISHED valide → conservé, aucun nouveau bundle", async () => {
    const existing = seedValidBundle({
      body: "Persona ADMIN personnalisee — ne doit jamais etre ecrasee automatiquement.",
    });
    seedScenario(ScenarioStatus.DRAFT, {
      publishedPromptBundleId: existing.id,
    });
    const before = existing.artifacts;
    const res = await patchScenario(SCENARIO_ID, { status: "PUBLISHED" });
    expect(res.status).toBe(200);
    expect(bundles).toHaveLength(1);
    expect(bundles[0]!.artifacts).toBe(before);
    expect(scenarios[0]!.publishedPromptBundleId).toBe(existing.id);
    expect(audits).toHaveLength(0);
  });

  it("4. pointeur null + un PUBLISHED valide → rattachement seul", async () => {
    const existing = seedValidBundle();
    seedScenario(ScenarioStatus.DRAFT);
    const res = await patchScenario(SCENARIO_ID, { status: "PUBLISHED" });
    expect(res.status).toBe(200);
    expect(bundles).toHaveLength(1);
    expect(scenarios[0]!.publishedPromptBundleId).toBe(existing.id);
    expect(audits).toHaveLength(0);
  });

  it("5. pointeur incoherent → 409 et rollback", async () => {
    const cases: Array<{
      label: string;
      bundle: Partial<BundleRow> & { body?: string };
    }> = [
      {
        label: "mauvais scenarioId",
        bundle: {
          id: "bad-sc",
          scenarioId: "00000000-0000-4000-8000-000000000099",
        },
      },
      {
        label: "mauvaise org",
        bundle: { id: "bad-org", organizationId: OTHER_ORG },
      },
      {
        label: "DRAFT",
        bundle: { id: "bad-draft", status: PromptBundleStatus.DRAFT },
      },
      {
        label: "SUPERSEDED",
        bundle: { id: "bad-sup", status: PromptBundleStatus.SUPERSEDED },
      },
      {
        label: "JSON invalide",
        bundle: {
          id: "bad-json",
          artifacts: "{not-json",
          contentHash: "x".repeat(64),
        },
      },
      {
        label: "structure invalide",
        bundle: {
          id: "bad-struct",
          artifacts: JSON.stringify({
            FOO: { body: "x".repeat(30), contentType: "text/plain" },
          }),
          contentHash: "y".repeat(64),
        },
      },
      {
        label: "hash invalide",
        bundle: {
          id: "bad-hash",
          body: "Persona hash invalide suffisamment longue pour le schema zod.",
          contentHash: "0".repeat(64),
        },
      },
    ];

    for (const c of cases) {
      bundles = [];
      audits = [];
      const b = seedValidBundle(c.bundle);
      seedScenario(ScenarioStatus.DRAFT, {
        name: "Avant",
        publishedPromptBundleId: b.id,
      });
      const res = await patchScenario(SCENARIO_ID, {
        status: "PUBLISHED",
        name: "Apres hack",
      });
      expect(res.status, c.label).toBe(409);
      const body = await res.json();
      expect(body.error.message).toContain("intervention administrateur");
      expect(body.error.message.toLowerCase()).not.toMatch(/hash|artifact|zod/);
      expect(scenarios[0]!.name).toBe("Avant");
      expect(scenarios[0]!.status).toBe(ScenarioStatus.DRAFT);
      expect(scenarios[0]!.publishedPromptBundleId).toBe(b.id);
    }
  });

  it("6. plusieurs PUBLISHED → 409, aucune ecriture", async () => {
    seedValidBundle({ id: "pb-a", version: 1 });
    seedValidBundle({ id: "pb-b", version: 2 });
    seedScenario(ScenarioStatus.DRAFT, { name: "Stable" });
    const res = await patchScenario(SCENARIO_ID, { status: "PUBLISHED" });
    expect(res.status).toBe(409);
    expect(scenarios[0]!.status).toBe(ScenarioStatus.DRAFT);
    expect(scenarios[0]!.publishedPromptBundleId).toBeNull();
    expect(scenarios[0]!.name).toBe("Stable");
    expect(bundles).toHaveLength(2);
    expect(audits).toHaveLength(0);
  });

  it("7. DRAFT prompts sans PUBLISHED → 409, DRAFT intact", async () => {
    seedValidBundle({
      id: "draft-only",
      status: PromptBundleStatus.DRAFT,
      version: 1,
    });
    seedScenario(ScenarioStatus.DRAFT);
    const res = await patchScenario(SCENARIO_ID, { status: "PUBLISHED" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toContain("brouillon de prompts");
    expect(bundles).toHaveLength(1);
    expect(bundles[0]!.status).toBe(PromptBundleStatus.DRAFT);
    expect(scenarios[0]!.publishedPromptBundleId).toBeNull();
    expect(audits).toHaveLength(0);
  });

  it("8. Scenario ARCHIVED → 409", async () => {
    seedScenario(ScenarioStatus.ARCHIVED);
    const res = await patchScenario(SCENARIO_ID, { status: "PUBLISHED" });
    expect(res.status).toBe(409);
    expect(scenarios[0]!.status).toBe(ScenarioStatus.ARCHIVED);
    expect(bundles).toHaveLength(0);
  });
  it("9. depublication conserve pointeur et bundle PUBLISHED", async () => {
    const b = seedValidBundle();
    seedScenario(ScenarioStatus.PUBLISHED, {
      publishedPromptBundleId: b.id,
    });
    const res = await patchScenario(SCENARIO_ID, { status: "DRAFT" });
    expect(res.status).toBe(200);
    expect(scenarios[0]!.status).toBe(ScenarioStatus.DRAFT);
    expect(scenarios[0]!.publishedPromptBundleId).toBe(b.id);
    expect(bundles[0]!.status).toBe(PromptBundleStatus.PUBLISHED);
  });

  it("10. republication reutilise le bundle pointe", async () => {
    const b = seedValidBundle({
      body: "Persona republie — contenu admin a conserver tel quel apres unpublish.",
    });
    seedScenario(ScenarioStatus.DRAFT, {
      publishedPromptBundleId: b.id,
    });
    const before = b.artifacts;
    const res = await patchScenario(SCENARIO_ID, { status: "PUBLISHED" });
    expect(res.status).toBe(200);
    expect(scenarios[0]!.status).toBe(ScenarioStatus.PUBLISHED);
    expect(scenarios[0]!.publishedPromptBundleId).toBe(b.id);
    expect(bundles).toHaveLength(1);
    expect(bundles[0]!.artifacts).toBe(before);
    expect(audits).toHaveLength(0);
  });

  it("11. PUBLISHED + prompt admin : metadonnees OK, bundle inchange", async () => {
    const b = seedValidBundle({
      body: "PROMPT ADMIN CUSTOM — ne pas regenerer lors d une simple MAJ metadata.",
    });
    seedScenario(ScenarioStatus.PUBLISHED, {
      publishedPromptBundleId: b.id,
      name: "Ancien nom",
    });
    const before = b.artifacts;
    const res = await patchScenario(SCENARIO_ID, {
      name: "Nouveau nom manager",
      offer: "Nouvelle offre",
    });
    expect(res.status).toBe(200);
    expect(scenarios[0]!.name).toBe("Nouveau nom manager");
    expect(scenarios[0]!.offer).toBe("Nouvelle offre");
    expect(scenarios[0]!.publishedPromptBundleId).toBe(b.id);
    expect(bundles[0]!.artifacts).toBe(before);
    expect(audits).toHaveLength(0);
  });

  it("12. reponse HTTP sans prompt/hash/artifact/bundleId", async () => {
    seedScenario(ScenarioStatus.DRAFT);
    const res = await patchScenario(SCENARIO_ID, { status: "PUBLISHED" });
    const body = await res.json();
    assertNoSensitiveKeys(body.data);
    expect(JSON.stringify(body)).not.toMatch(/PROSPECT_PERSONA|contentHash|sha256/i);
  });

  it("13. payload artifacts / publishedPromptBundleId sans effet", async () => {
    seedScenario(ScenarioStatus.DRAFT);
    const res = await patchScenario(SCENARIO_ID, {
      status: "PUBLISHED",
      artifacts: { EVIL: true },
      publishedPromptBundleId: "attacker-chosen",
      prompt: "hack",
      contentHash: "evil",
    } as Record<string, unknown>);
    expect(res.status).toBe(200);
    expect(scenarios[0]!.publishedPromptBundleId).not.toBe("attacker-chosen");
    expect(bundles[0]!.id).not.toBe("attacker-chosen");
    const artifacts = parsePromptArtifacts(bundles[0]!.artifacts);
    expect(artifacts).toHaveProperty("PROSPECT_PERSONA");
    expect(artifacts).not.toHaveProperty("EVIL");
  });

  it("14. echec audit → rollback bundle, pointeur, statut, metadonnees", async () => {
    seedScenario(ScenarioStatus.DRAFT, { name: "Original" });
    auditShouldFail = true;
    const res = await patchScenario(SCENARIO_ID, {
      status: "PUBLISHED",
      name: "Ne doit pas rester",
    });
    expect(res.status).toBe(500);
    expect(scenarios[0]!.status).toBe(ScenarioStatus.DRAFT);
    expect(scenarios[0]!.name).toBe("Original");
    expect(scenarios[0]!.publishedPromptBundleId).toBeNull();
    expect(bundles).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("15. idempotence sequentielle — deux publications successives", async () => {
    seedScenario(ScenarioStatus.DRAFT);
    const r1 = await patchScenario(SCENARIO_ID, { status: "PUBLISHED" });
    const r2 = await patchScenario(SCENARIO_ID, { status: "PUBLISHED" });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(
      bundles.filter((b) => b.status === PromptBundleStatus.PUBLISHED),
    ).toHaveLength(1);
    expect(bundles[0]!.version).toBe(1);
    expect(
      audits.filter((a) => a.action === "PROMPT_BUNDLE_CREATE"),
    ).toHaveLength(1);
  });

  it("15b. P2002 reel — deuxieme $transaction, rollback perdant, PATCH applique", async () => {
    seedScenario(ScenarioStatus.DRAFT, { name: "Avant course" });
    collideNextCreate = true;
    const txBefore = transactionCalls;
    const res = await patchScenario(SCENARIO_ID, {
      status: "PUBLISHED",
      name: "Nom apres retry P2002",
    });
    expect(res.status).toBe(200);
    expect(transactionCalls - txBefore).toBeGreaterThanOrEqual(2);
    expect(createThrowP2002Calls).toBe(1);
    expect(createCalls).toBe(1);
    expect(
      bundles.filter((b) => b.status === PromptBundleStatus.PUBLISHED),
    ).toHaveLength(1);
    expect(bundles[0]!.id).toBe("pb-winner-concurrent");
    expect(bundles[0]!.version).toBe(1);
    expect(
      audits.filter((a) => a.action === "PROMPT_BUNDLE_CREATE"),
    ).toHaveLength(1);
    expect(audits[0]!.targetId).toBe("pb-winner-concurrent");
    expect(scenarios[0]!.name).toBe("Nom apres retry P2002");
    expect(scenarios[0]!.status).toBe(ScenarioStatus.PUBLISHED);
    expect(scenarios[0]!.publishedPromptBundleId).toBe("pb-winner-concurrent");
  });

  it("15c. faux succes convergence — metadonnees non appliquees → 409", async () => {
    const b = seedValidBundle();
    seedScenario(ScenarioStatus.PUBLISHED, {
      publishedPromptBundleId: b.id,
      name: "Nom concurrent",
    });
    raceUpdateRemaining = 2;
    const res = await patchScenario(SCENARIO_ID, {
      status: "PUBLISHED",
      name: "Nom demande jamais applique",
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toBe("Modification concurrente : réessaie.");
    expect(scenarios[0]!.name).toBe("Nom concurrent");
    expect(scenarios[0]!.status).toBe(ScenarioStatus.PUBLISHED);
  });

  it("15d. P2034 — nouvelle $transaction au retry", async () => {
    seedScenario(ScenarioStatus.DRAFT);
    throwP2034Once = true;
    const txBefore = transactionCalls;
    const res = await patchScenario(SCENARIO_ID, { status: "PUBLISHED" });
    expect(res.status).toBe(200);
    expect(transactionCalls - txBefore).toBeGreaterThanOrEqual(2);
    expect(scenarios[0]!.status).toBe(ScenarioStatus.PUBLISHED);
    expect(bundles).toHaveLength(1);
  });

  it("16. hors organisation → 404, aucune ecriture", async () => {
    seedScenario(ScenarioStatus.DRAFT, { organizationId: OTHER_ORG });
    const res = await patchScenario(SCENARIO_ID, { status: "PUBLISHED" });
    expect(res.status).toBe(404);
    expect(scenarios[0]!.status).toBe(ScenarioStatus.DRAFT);
    expect(bundles).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it("17. scenario publie satisfait preconditions E1A simulation", async () => {
    seedScenario(ScenarioStatus.DRAFT);
    const res = await patchScenario(SCENARIO_ID, { status: "PUBLISHED" });
    expect(res.status).toBe(200);
    const sc = scenarios[0]!;
    expect(sc.status).toBe(ScenarioStatus.PUBLISHED);
    expect(sc.publishedPromptBundleId).toBeTruthy();
    const bundle = bundles.find((b) => b.id === sc.publishedPromptBundleId)!;
    expect(bundle.organizationId).toBe(ORG);
    expect(bundle.scenarioId).toBe(SCENARIO_ID);
    expect(bundle.status).toBe(PromptBundleStatus.PUBLISHED);
    const artifacts = parsePromptArtifacts(bundle.artifacts);
    expect(verifyPromptArtifactsHash(artifacts, bundle.contentHash)).toBe(true);
  });

  it("18. aucun fetch / reseau pendant publication", async () => {
    seedScenario(ScenarioStatus.DRAFT);
    await patchScenario(SCENARIO_ID, { status: "PUBLISHED" });
    expect(fetchSpy?.mock.calls.length ?? -1).toBe(0);
  });

  it("19. SUPERSEDED v3 → nouveau PUBLISHED v4, SUPERSEDED intact", async () => {
    seedValidBundle({
      id: "pb-sup",
      version: 3,
      status: PromptBundleStatus.SUPERSEDED,
      body: "Ancienne persona SUPERSEDED suffisamment longue pour le schema.",
    });
    seedScenario(ScenarioStatus.DRAFT);
    const res = await patchScenario(SCENARIO_ID, { status: "PUBLISHED" });
    expect(res.status).toBe(200);
    expect(bundles).toHaveLength(2);
    const superseded = bundles.find((b) => b.id === "pb-sup")!;
    expect(superseded.status).toBe(PromptBundleStatus.SUPERSEDED);
    expect(superseded.version).toBe(3);
    const published = bundles.find(
      (b) => b.status === PromptBundleStatus.PUBLISHED,
    )!;
    expect(published.version).toBe(4);
    expect(scenarios[0]!.publishedPromptBundleId).toBe(published.id);
  });

  it("20. connaissances — seul item APPROVED+enabled+reference injecte", async () => {
    knowledge = [
      {
        id: "k-ok",
        organizationId: ORG,
        type: "OBJECTION",
        title: "Connaissance AUTORISEE UNIQUE",
        content: "Contenu autorise uniquement",
        reviewStatus: "APPROVED",
        enabled: true,
      },
      {
        id: "k-pending",
        organizationId: ORG,
        type: "OBJECTION",
        title: "Connaissance PENDING",
        content: "Ne doit pas apparaitre",
        reviewStatus: "PENDING",
        enabled: true,
      },
      {
        id: "k-disabled",
        organizationId: ORG,
        type: "OBJECTION",
        title: "Connaissance DISABLED",
        content: "Ne doit pas apparaitre non plus",
        reviewStatus: "APPROVED",
        enabled: false,
      },
      {
        id: "k-unref",
        organizationId: ORG,
        type: "OBJECTION",
        title: "Connaissance NON REFERENCEE",
        content: "Hors refs scenario",
        reviewStatus: "APPROVED",
        enabled: true,
      },
    ];
    seedScenario(ScenarioStatus.DRAFT, {
      knowledgeRefs: JSON.stringify(["k-ok", "k-pending", "k-disabled"]),
    });
    const res = await patchScenario(SCENARIO_ID, { status: "PUBLISHED" });
    expect(res.status).toBe(200);
    const body = await res.json();
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("Contenu autorise uniquement");
    expect(raw).not.toContain("Ne doit pas apparaitre");
    const artifacts = parsePromptArtifacts(bundles[0]!.artifacts);
    expect(artifacts.PROSPECT_PERSONA.body).toContain("Connaissance AUTORISEE UNIQUE");
    expect(artifacts.PROSPECT_PERSONA.body).not.toContain("Connaissance PENDING");
    expect(artifacts.PROSPECT_PERSONA.body).not.toContain("Connaissance DISABLED");
    expect(artifacts.PROSPECT_PERSONA.body).not.toContain(
      "Connaissance NON REFERENCEE",
    );
    const meta = JSON.parse(audits[0]!.metadata!);
    expect(JSON.stringify(meta)).not.toContain("Contenu autorise");
  });
});

describe("UI manager — gestion erreurs publication (assertions source)", () => {
  it("ScenarioForm verifie res.ok, message brouillon, pas de redirect en echec", () => {
    const src = readFileSync(
      path.resolve("src/app/manager/scenarios/ScenarioForm.tsx"),
      "utf8",
    );
    expect(src).toContain("if (!pubRes.ok)");
    expect(src).toContain(
      "Le brouillon a été enregistré, mais la publication a échoué",
    );
    const failIdx = src.indexOf("if (!pubRes.ok)");
    const returnIdx = src.indexOf("return;", failIdx);
    const pushIdx = src.indexOf("router.push", failIdx);
    expect(failIdx).toBeGreaterThanOrEqual(0);
    expect(returnIdx).toBeGreaterThan(failIdx);
    expect(pushIdx).toBeGreaterThan(returnIdx);
  });

  it("ScenarioForm memorise l'id cree hors form et choisit POST/PATCH dessus", () => {
    const src = readFileSync(
      path.resolve("src/app/manager/scenarios/ScenarioForm.tsx"),
      "utf8",
    );
    expect(src).toContain("persistedScenarioId");
    expect(src).toContain("setPersistedScenarioId");
    expect(src).toContain("useState<string | undefined>");
    expect(src).toMatch(
      /method:\s*persistedScenarioId\s*\?\s*"PATCH"\s*:\s*"POST"/,
    );
    expect(src).toMatch(
      /persistedScenarioId\s*\?\s*`\/api\/scenarios\/\$\{persistedScenarioId\}`\s*:\s*"\/api\/scenarios"/,
    );
    expect(src).toContain("setPersistedScenarioId(scenarioId)");
    expect(src).not.toMatch(
      /setForm\(\s*\(f\)\s*=>\s*\(\s*\{\s*\.\.\.f\s*,\s*id\s*:/,
    );
    expect(src).not.toContain("const id = form.id");
  });

  it("ScenarioActions.togglePublish verifie res.ok et setError", () => {
    const src = readFileSync(
      path.resolve("src/app/manager/scenarios/[id]/ScenarioActions.tsx"),
      "utf8",
    );
    expect(src).toContain("async function togglePublish");
    expect(src).toContain("if (!res.ok)");
    expect(src).toContain("setError");
    expect(src).toContain(
      "Publication impossible. Réessaie ou contacte un administrateur.",
    );
  });

  it("RecordingReview LOT O lecture seule sans publish/assign", () => {
    const src = readFileSync(
      path.resolve("src/app/manager/recordings/[id]/RecordingReview.tsx"),
      "utf8",
    );
    expect(src).not.toContain("async function publish");
    expect(src).not.toContain("AssignPanel");
    expect(src).not.toContain("Valider et publier");
    expect(src).toContain("Consultation historique");
  });
});
