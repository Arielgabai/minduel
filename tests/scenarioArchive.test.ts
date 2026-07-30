import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ScenarioStatus } from "@/lib/enums";

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-000000000099";
const MANAGER_ID = "00000000-0000-4000-8000-000000000010";
const TELEPRO_ID = "00000000-0000-4000-8000-000000000020";
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
  updatedAt: string;
  createdAt: string;
};

type AssignmentRow = {
  id: string;
  organizationId: string;
  scenarioId: string;
  teleproId: string;
  managerId: string | null;
  status: string;
  createdAt: string;
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

let scenarios: ScenarioRow[] = [];
let assignments: AssignmentRow[] = [];
let audits: AuditRow[] = [];
let simulations: Array<{ id: string; scenarioId: string }> = [];
let bundles: Array<{ id: string; scenarioId: string }> = [];
let rubrics: Array<{ id: string; scenarioId: string }> = [];
let seq = 0;
/** Simule une course : updateMany perd le CAS (count 0) après archivage concurrent. */
let simulateLostArchiveRace = false;
let scenarioDeleteCalls = 0;
let lastAssignmentFindManyArgs: unknown = null;

const managerUser = {
  id: MANAGER_ID,
  email: "manager@test.com",
  fullName: "Manager",
  organizationId: ORG,
  organizationName: "Org",
  role: "MANAGER",
};

const teleproUser = {
  id: TELEPRO_ID,
  email: "telepro@test.com",
  fullName: "Alice Telepro",
  organizationId: ORG,
  organizationName: "Org",
  role: "TELEPRO",
};

function uid(prefix: string) {
  return `${prefix}-${++seq}`;
}

function matchesNotStatus(
  rowStatus: string,
  statusFilter: unknown,
): boolean {
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

function matchScenarioWhere(where: Record<string, unknown> | undefined) {
  if (!where) return scenarios[0] ?? null;
  return (
    scenarios.find((s) => {
      if (where.id && s.id !== where.id) return false;
      if (where.organizationId && s.organizationId !== where.organizationId)
        return false;
      if (!matchesNotStatus(s.status, where.status)) return false;
      return true;
    }) ?? null
  );
}

function seedScenario(
  status: string,
  overrides: Partial<ScenarioRow> = {},
): ScenarioRow {
  const row: ScenarioRow = {
    id: SCENARIO_ID,
    organizationId: ORG,
    name: "Scénario test",
    callType: "VENTE",
    level: "MOYEN",
    campaign: "Campagne A",
    offer: "Offre",
    prospectProfile: "Profil",
    initialSituation: "Situation",
    objective: "Objectif",
    personality: "Perso",
    allowedObjections: "[]",
    secretInfos: "[]",
    successConditions: null,
    failureConditions: null,
    targetDurationSec: 300,
    knowledgeRefs: "[]",
    status,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
  scenarios = [row];
  return row;
}

vi.mock("@/lib/auth", () => ({
  requireManager: vi.fn(async () => managerUser),
  requireTelepro: vi.fn(async () => teleproUser),
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
    findMany: async () => scenarios,
    update: async () => {
      throw new Error("scenario.update ne doit pas être utilisé pour l'archive");
    },
    updateMany: async ({
      where,
      data,
    }: {
      where?: Record<string, unknown>;
      data: Partial<ScenarioRow>;
    }) => {
      if (simulateLostArchiveRace) {
        const s = matchScenarioWhere({
          id: where?.id,
          organizationId: where?.organizationId,
        } as Record<string, unknown>);
        if (s) {
          s.status = ScenarioStatus.ARCHIVED;
          s.updatedAt = data.updatedAt ?? s.updatedAt;
        }
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
        return true;
      });
      for (const t of targets) {
        Object.assign(t, data);
      }
      return { count: targets.length };
    },
    delete: async () => {
      scenarioDeleteCalls += 1;
      throw new Error("prisma.scenario.delete interdit");
    },
  };

  const auditEventApi = {
    create: async ({ data }: { data: Omit<AuditRow, "id"> }) => {
      const row: AuditRow = { id: uid("audit"), ...data };
      audits.push(row);
      return row;
    },
  };

  const assignmentApi = {
    findMany: async (args: {
      where?: Record<string, unknown>;
      include?: unknown;
      select?: unknown;
      orderBy?: unknown;
    }) => {
      lastAssignmentFindManyArgs = args;
      return assignments.filter((a) => {
        const w = args.where ?? {};
        if (w.teleproId && a.teleproId !== w.teleproId) return false;
        if (w.organizationId && a.organizationId !== w.organizationId)
          return false;
        if (w.scenarioId && a.scenarioId !== w.scenarioId) return false;
        if (
          w.scenario &&
          typeof w.scenario === "object" &&
          w.scenario !== null &&
          "status" in (w.scenario as object)
        ) {
          const sc = scenarios.find((s) => s.id === a.scenarioId);
          if (!sc || sc.status !== (w.scenario as { status: string }).status)
            return false;
        }
        return true;
      });
    },
    create: async ({ data }: { data: Omit<AssignmentRow, "id"> }) => {
      const row: AssignmentRow = { id: uid("asg"), ...data };
      assignments.push(row);
      return row;
    },
    deleteMany: async () => ({ count: 0 }),
  };

  const userApi = {
    findMany: async ({
      where,
    }: {
      where?: { id?: { in: string[] }; organizationId?: string; role?: string };
    }) => {
      const ids = where?.id?.in ?? [];
      return ids
        .filter((id) => id === TELEPRO_ID)
        .map((id) => ({ id }));
    },
    findUnique: async () => ({
      id: TELEPRO_ID,
      streakDays: 0,
    }),
  };

  const tx = {
    scenario: scenarioApi,
    auditEvent: auditEventApi,
    scenarioAssignment: assignmentApi,
  };

  return {
    prisma: {
      scenario: scenarioApi,
      auditEvent: auditEventApi,
      scenarioAssignment: assignmentApi,
      user: userApi,
      simulation: {
        groupBy: async () => [],
      },
      simulationEvaluation: {
        findMany: async () => [],
      },
      knowledgeItem: {
        findMany: async () => [],
      },
      $transaction: async <T>(
        fn: (client: typeof tx) => Promise<T>,
      ): Promise<T> => {
        const snapScenarios = scenarios.map((s) => ({ ...s }));
        const snapAudits = audits.map((a) => ({ ...a }));
        const snapAssignments = assignments.map((a) => ({ ...a }));
        try {
          return await fn(tx);
        } catch (err) {
          scenarios = snapScenarios;
          audits = snapAudits;
          assignments = snapAssignments;
          throw err;
        }
      },
    },
  };
});

async function deleteScenario(id = SCENARIO_ID) {
  const { DELETE } = await import("@/app/api/scenarios/[id]/route");
  return DELETE(new Request(`http://localhost/api/scenarios/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

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

async function assignScenario(id: string, teleproIds: string[]) {
  const { POST } = await import("@/app/api/scenarios/[id]/assign/route");
  return POST(
    new Request(`http://localhost/api/scenarios/${id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teleproIds }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(async () => {
  scenarios = [];
  assignments = [];
  audits = [];
  simulations = [];
  bundles = [];
  rubrics = [];
  seq = 0;
  simulateLostArchiveRace = false;
  scenarioDeleteCalls = 0;
  lastAssignmentFindManyArgs = null;
  vi.clearAllMocks();
  const auth = await import("@/lib/auth");
  vi.mocked(auth.requireManager).mockResolvedValue(managerUser as never);
  vi.mocked(auth.requireTelepro).mockResolvedValue(teleproUser as never);
});

describe("DELETE manager — soft-archive", () => {
  it("PUBLISHED → ARCHIVED, pas de delete physique, audit unique, réponse sans artifacts", async () => {
    seedScenario(ScenarioStatus.PUBLISHED);
    simulations = [{ id: "sim-1", scenarioId: SCENARIO_ID }];
    assignments = [
      {
        id: "asg-1",
        organizationId: ORG,
        scenarioId: SCENARIO_ID,
        teleproId: TELEPRO_ID,
        managerId: MANAGER_ID,
        status: "ASSIGNED",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    bundles = [{ id: "b1", scenarioId: SCENARIO_ID }];
    rubrics = [{ id: "r1", scenarioId: SCENARIO_ID }];
    const prevSims = simulations.length;
    const prevAsg = assignments.length;
    const prevBundles = bundles.length;
    const prevRubrics = rubrics.length;

    const res = await deleteScenario();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      id: SCENARIO_ID,
      status: ScenarioStatus.ARCHIVED,
      archived: true,
    });
    expect(body.data).not.toHaveProperty("deleted");
    expect(body.data).not.toHaveProperty("artifacts");
    expect(body.data).not.toHaveProperty("promptBundle");
    expect(body.data).not.toHaveProperty("contentHash");

    expect(scenarios[0]!.status).toBe(ScenarioStatus.ARCHIVED);
    expect(scenarioDeleteCalls).toBe(0);
    expect(simulations).toHaveLength(prevSims);
    expect(assignments).toHaveLength(prevAsg);
    expect(bundles).toHaveLength(prevBundles);
    expect(rubrics).toHaveLength(prevRubrics);

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: "EXERCISE_ARCHIVE",
      actorId: MANAGER_ID,
      targetType: "Scenario",
      targetId: SCENARIO_ID,
      organizationId: ORG,
    });
    const meta = JSON.parse(audits[0]!.metadata!);
    expect(meta).toEqual({ previousStatus: ScenarioStatus.PUBLISHED });
    expect(meta).not.toHaveProperty("prompt");
  });

  it("déjà ARCHIVED → 200 idempotent, aucun update destructif, aucun 2e audit", async () => {
    seedScenario(ScenarioStatus.ARCHIVED, {
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    const updatedAtBefore = scenarios[0]!.updatedAt;

    const res = await deleteScenario();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      id: SCENARIO_ID,
      status: ScenarioStatus.ARCHIVED,
      archived: true,
    });
    expect(audits).toHaveLength(0);
    expect(scenarios[0]!.updatedAt).toBe(updatedAtBefore);
    expect(scenarioDeleteCalls).toBe(0);
  });

  it("deux archivages concurrents → CAS, un seul audit", async () => {
    seedScenario(ScenarioStatus.PUBLISHED);
    const first = await deleteScenario();
    expect(first.status).toBe(200);
    expect(audits).toHaveLength(1);

    // Deuxième tx : trouve encore PUBLISHED puis perd le CAS (concurrent).
    scenarios[0]!.status = ScenarioStatus.PUBLISHED;
    simulateLostArchiveRace = true;
    const second = await deleteScenario();
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.data.archived).toBe(true);
    expect(audits).toHaveLength(1);
    expect(scenarios[0]!.status).toBe(ScenarioStatus.ARCHIVED);
  });

  it("échec AuditEvent → rollback transaction, scénario non archivé", async () => {
    seedScenario(ScenarioStatus.PUBLISHED);
    const { prisma } = await import("@/lib/db");
    const spy = vi
      .spyOn(prisma.auditEvent, "create")
      .mockRejectedValue(new Error("audit boom"));

    const res = await deleteScenario();
    expect(res.status).toBe(500);
    expect(scenarios[0]!.status).toBe(ScenarioStatus.PUBLISHED);
    expect(audits).toHaveLength(0);

    spy.mockRestore();
  });

  it("hors organisation → 404, aucune écriture", async () => {
    seedScenario(ScenarioStatus.PUBLISHED, { organizationId: OTHER_ORG });
    const res = await deleteScenario();
    expect(res.status).toBe(404);
    expect(scenarios[0]!.status).toBe(ScenarioStatus.PUBLISHED);
    expect(audits).toHaveLength(0);
    expect(scenarioDeleteCalls).toBe(0);
  });
});

describe("PATCH manager — blocage ARCHIVED", () => {
  it("scénario ARCHIVED → 409, status PUBLISHED et métadonnées refusés", async () => {
    seedScenario(ScenarioStatus.ARCHIVED);
    const res = await patchScenario(SCENARIO_ID, {
      status: "PUBLISHED",
      name: "Hack rename",
      objective: "Ne doit pas passer",
    });
    expect(res.status).toBe(409);
    expect(scenarios[0]!.status).toBe(ScenarioStatus.ARCHIVED);
    expect(scenarios[0]!.name).toBe("Scénario test");
    expect(scenarios[0]!.objective).toBe("Objectif");
  });

  it("course PATCH/archive → updateMany count 0 → 409", async () => {
    seedScenario(ScenarioStatus.PUBLISHED);
    simulateLostArchiveRace = true;
    const res = await patchScenario(SCENARIO_ID, { name: "Trop tard" });
    expect(res.status).toBe(409);
    expect(scenarios[0]!.name).toBe("Scénario test");
    expect(scenarios[0]!.status).toBe(ScenarioStatus.ARCHIVED);
  });

  it("scénario non archivé → contrat préservé", async () => {
    seedScenario(ScenarioStatus.DRAFT);
    const res = await patchScenario(SCENARIO_ID, {
      name: "Nouveau nom",
      status: "PUBLISHED",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      id: SCENARIO_ID,
      status: ScenarioStatus.PUBLISHED,
    });
    expect(scenarios[0]!.name).toBe("Nouveau nom");
    expect(scenarios[0]!.status).toBe(ScenarioStatus.PUBLISHED);
  });
});

describe("POST assign — ARCHIVED", () => {
  it("ARCHIVED → 409, aucune assignation créée/modifiée", async () => {
    seedScenario(ScenarioStatus.ARCHIVED);
    const before = assignments.length;
    const res = await assignScenario(SCENARIO_ID, [TELEPRO_ID]);
    expect(res.status).toBe(409);
    expect(assignments).toHaveLength(before);
  });

  it("DRAFT non PUBLISHED → 400 inchangé", async () => {
    seedScenario(ScenarioStatus.DRAFT);
    const res = await assignScenario(SCENARIO_ID, [TELEPRO_ID]);
    expect(res.status).toBe(400);
    expect(assignments).toHaveLength(0);
  });
});

describe("Accueil télépro — filtre Prisma PUBLISHED", () => {
  it("findMany assignments filtre scenario.status = PUBLISHED (pas un filter JS)", async () => {
    seedScenario(ScenarioStatus.PUBLISHED);
    assignments = [
      {
        id: "asg-pub",
        organizationId: ORG,
        scenarioId: SCENARIO_ID,
        teleproId: TELEPRO_ID,
        managerId: MANAGER_ID,
        status: "ASSIGNED",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const pageSrc = readFileSync(
      path.resolve("src/app/app/page.tsx"),
      "utf8",
    );
    // Filtre relationnel Prisma dans le where — pas un .filter JS post-chargement.
    expect(pageSrc).toContain('scenario: { status: "PUBLISHED" }');
    expect(pageSrc).toMatch(/scenario:\s*\{\s*status:\s*["']PUBLISHED["']\s*\}/);
    expect(pageSrc).not.toMatch(
      /assignments\.filter\([^)]*ARCHIVED/,
    );
    expect(pageSrc).not.toMatch(
      /\.filter\(\s*\(?a\)?\s*=>\s*a\.scenario\.status/,
    );

    const { prisma } = await import("@/lib/db");
    await prisma.scenarioAssignment.findMany({
      where: {
        teleproId: TELEPRO_ID,
        organizationId: ORG,
        scenario: { status: "PUBLISHED" },
      },
      include: { scenario: true },
      orderBy: { createdAt: "desc" },
    });
    expect(lastAssignmentFindManyArgs).toMatchObject({
      where: {
        teleproId: TELEPRO_ID,
        organizationId: ORG,
        scenario: { status: "PUBLISHED" },
      },
    });
  });
});

describe("UI manager — archive", () => {
  it("texte Archiver, contrôle res.ok, badge ARCHIVED, détail archivé sans actions", () => {
    const actionsSrc = readFileSync(
      path.resolve("src/app/manager/scenarios/[id]/ScenarioActions.tsx"),
      "utf8",
    );
    expect(actionsSrc).toContain("Archiver");
    expect(actionsSrc).toContain("Confirmer l&apos;archivage");
    expect(actionsSrc).toContain("historique sera conservé");
    expect(actionsSrc).toMatch(/if\s*\(\s*!res\.ok\s*\)/);
    expect(actionsSrc).toContain("allowArchive");
    expect(actionsSrc).not.toMatch(/>\s*Supprimer\s*</);

    const listSrc = readFileSync(
      path.resolve("src/app/manager/scenarios/page.tsx"),
      "utf8",
    );
    expect(listSrc).toContain("Archivé");
    expect(listSrc).toContain("ScenarioStatus.ARCHIVED");
    // Ne jamais afficher ARCHIVED comme Brouillon
    expect(listSrc).toMatch(
      /ARCHIVED[\s\S]*\?[\s\S]*["']Archivé["'][\s\S]*:[\s\S]*PUBLISHED/,
    );

    const detailSrc = readFileSync(
      path.resolve("src/app/manager/scenarios/[id]/page.tsx"),
      "utf8",
    );
    expect(detailSrc).toContain("Archivé");
    expect(detailSrc).toContain("isArchived");
    expect(detailSrc).toMatch(/if\s*\(\s*isArchived\s*\)/);
    const archivedBranch = detailSrc.match(
      /if \(isArchived\) \{([\s\S]*?)\n  \}\n\n  return \(/,
    );
    expect(archivedBranch?.[1]).toBeTruthy();
    expect(archivedBranch![1]).not.toContain("ScenarioForm");
    expect(archivedBranch![1]).not.toContain("AssignPanel");
    expect(archivedBranch![1]).not.toContain("ScenarioActions");
    expect(archivedBranch![1]).toContain("Archivé");
  });
});

describe("Contrat source route manager", () => {
  it("aucun prisma.scenario.delete dans la route manager", () => {
    const src = readFileSync(
      path.resolve("src/app/api/scenarios/[id]/route.ts"),
      "utf8",
    );
    expect(src).not.toContain("scenario.delete");
    expect(src).not.toContain("deleted: true");
    expect(src).toContain("EXERCISE_ARCHIVE");
    expect(src).toContain("updateMany");
    expect(src).toContain("ARCHIVED");
  });
});
