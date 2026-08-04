import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PromptBundleStatus,
  ScenarioStatus,
  SimulationMode,
  SimulationStatus,
} from "@/lib/enums";
import {
  hashPromptArtifacts,
  parsePromptArtifacts,
  renderPromptTemplate,
  verifyPromptArtifactsHash,
} from "@/lib/promptArtifacts";
import { TELEPRO_FORBIDDEN_PROMPT_KEYS } from "@/lib/exerciseAdminService";

const ORG = "00000000-0000-4000-8000-000000000001";
const TELEPRO_A = "00000000-0000-4000-8000-000000000002";
const TELEPRO_B = "00000000-0000-4000-8000-000000000003";
const SCENARIO = "00000000-0000-4000-8000-000000000004";

function personaBody(version: number) {
  return `Tu incarnes {{prospectName}} pour la version ${version} du bundle publie.`;
}

function makeArtifacts(version: number) {
  return {
    PROSPECT_PERSONA: {
      body: personaBody(version),
      contentType: "text/plain",
    },
  };
}

function makeBundle(
  version: number,
  status: string,
  overrides?: Partial<{
    id: string;
    organizationId: string;
    scenarioId: string;
    contentHash: string;
  }>,
) {
  const artifacts = makeArtifacts(version);
  const contentHash = overrides?.contentHash ?? hashPromptArtifacts(artifacts);
  return {
    id: overrides?.id ?? `bundle-v${version}`,
    organizationId: overrides?.organizationId ?? ORG,
    scenarioId: overrides?.scenarioId ?? SCENARIO,
    version,
    status,
    label: null,
    createdById: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    publishedAt: "2026-01-01T00:00:00.000Z",
    artifacts: JSON.stringify(artifacts),
    contentHash,
  };
}

type ScenarioRow = {
  id: string;
  organizationId: string;
  name: string;
  level: string;
  status: string;
  publishedPromptBundleId: string | null;
  callType: string;
  offer: string | null;
  objective: string | null;
  knowledgeRefs: string | null;
};

type SimulationRow = {
  id: string;
  organizationId: string;
  scenarioId: string;
  teleproId: string;
  mode: string;
  status: string;
  prospectName: string | null;
  promptBundleId: string | null;
  promptBundleVersion: number | null;
  promptContentHash: string | null;
  startedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

let scenarios: ScenarioRow[] = [];
let bundles: ReturnType<typeof makeBundle>[] = [];
let assignments: Array<{
  id: string;
  scenarioId: string;
  teleproId: string;
  status: string;
}> = [];
let simulations: SimulationRow[] = [];
let turns: Array<{
  simulationId: string;
  role: string;
  content: string;
  atMs: number;
}> = [];
let seq = 0;

function uid(prefix: string) {
  return `${prefix}-${++seq}`;
}

const teleproUser = {
  id: TELEPRO_A,
  email: "a@x.com",
  fullName: "Alice",
  organizationId: ORG,
  organizationName: "Org test",
  role: "TELEPRO",
};

vi.mock("@/lib/auth", () => ({
  requireTelepro: vi.fn(async () => teleproUser),
}));

vi.mock("@/lib/platformCatalog", () => ({
  resolvePlatformCatalogOrganizationId: vi.fn(async () => ORG),
}));

vi.mock("@/lib/config", () => ({
  isDemoMode: vi.fn(() => true),
}));

vi.mock("@/lib/ratelimit", () => ({
  rateLimit: vi.fn(() => ({ allowed: true, remaining: 9 })),
}));

const createEphemeralSession = vi.fn(async () => ({
  demo: true,
  model: "demo",
  voice: "alloy",
  clientSecret: null,
  expiresAt: null,
}));

vi.mock("@/lib/providers", () => ({
  getRealtimeSessionProvider: vi.fn(() => ({
    createEphemeralSession,
  })),
}));

vi.mock("@/lib/db", () => {
  const scenarioApi = {
    findFirst: async ({
      where,
    }: {
      where?: {
        id?: string;
        organizationId?: string;
        status?: string;
      };
    }) =>
      scenarios.find((s) => {
        if (where?.id && s.id !== where.id) return false;
        if (where?.organizationId && s.organizationId !== where.organizationId)
          return false;
        if (where?.status && s.status !== where.status) return false;
        return true;
      }) ?? null,
  };

  const promptBundleApi = {
    findFirst: async ({
      where,
    }: {
      where?: {
        id?: string;
        organizationId?: string;
        scenarioId?: string;
        status?: string;
      };
    }) =>
      bundles.find((b) => {
        if (where?.id && b.id !== where.id) return false;
        if (where?.organizationId && b.organizationId !== where.organizationId)
          return false;
        if (where?.scenarioId && b.scenarioId !== where.scenarioId) return false;
        if (where?.status && b.status !== where.status) return false;
        return true;
      }) ?? null,
  };

  const assignmentApi = {
    findFirst: async ({
      where,
    }: {
      where?: { scenarioId?: string; teleproId?: string };
    }) =>
      assignments.find(
        (a) =>
          a.scenarioId === where?.scenarioId && a.teleproId === where?.teleproId,
      ) ?? null,
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { status: string };
    }) => {
      const row = assignments.find((a) => a.id === where.id);
      if (row) row.status = data.status;
      return row;
    },
  };

  const simulationApi = {
    findFirst: async ({
      where,
      include,
    }: {
      where?: {
        id?: string;
        organizationId?: string;
        teleproId?: string;
      };
      include?: {
        scenario?: boolean;
        promptBundle?: boolean;
        turns?: unknown;
        evaluation?: unknown;
      };
    }) => {
      const found = simulations.find((s) => {
        if (where?.id && s.id !== where.id) return false;
        if (where?.organizationId && s.organizationId !== where.organizationId)
          return false;
        if (where?.teleproId && s.teleproId !== where?.teleproId) return false;
        return true;
      });
      if (!found) return null;
      const scenario = scenarios.find((sc) => sc.id === found.scenarioId);
      const promptBundle = found.promptBundleId
        ? bundles.find((b) => b.id === found.promptBundleId)
        : null;
      const simTurns = turns
        .filter((t) => t.simulationId === found.id)
        .sort((a, b) => a.atMs - b.atMs);
      return {
        ...found,
        scenario,
        promptBundle,
        turns: include?.turns ? simTurns : undefined,
        evaluation: null,
      };
    },
    create: async ({ data }: { data: Partial<SimulationRow> }) => {
      const row: SimulationRow = {
        id: uid("sim"),
        organizationId: data.organizationId!,
        scenarioId: data.scenarioId!,
        teleproId: data.teleproId!,
        mode: data.mode ?? SimulationMode.DEMO,
        status: data.status ?? SimulationStatus.CREATED,
        prospectName: data.prospectName ?? null,
        promptBundleId: data.promptBundleId ?? null,
        promptBundleVersion: data.promptBundleVersion ?? null,
        promptContentHash: data.promptContentHash ?? null,
        startedAt: data.startedAt ?? null,
        createdAt: data.createdAt!,
        updatedAt: data.updatedAt!,
      };
      simulations.push(row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<SimulationRow>;
    }) => {
      const row = simulations.find((s) => s.id === where.id);
      if (!row) throw new Error("missing sim");
      Object.assign(row, data);
      return row;
    },
  };

  const simulationTurnApi = {
    create: async ({
      data,
    }: {
      data: {
        simulationId: string;
        role: string;
        content: string;
        atMs: number;
      };
    }) => {
      turns.push({
        simulationId: data.simulationId,
        role: data.role,
        content: data.content,
        atMs: data.atMs,
      });
      return data;
    },
  };

  const knowledgeItemApi = {
    findMany: vi.fn(async () => []),
  };

  const processingJobApi = {
    findUnique: vi.fn(async () => null),
  };

  return {
    prisma: {
      scenario: scenarioApi,
      promptBundle: promptBundleApi,
      scenarioAssignment: assignmentApi,
      simulation: simulationApi,
      simulationTurn: simulationTurnApi,
      knowledgeItem: knowledgeItemApi,
      processingJob: processingJobApi,
      $transaction: async (fn: (tx: unknown) => Promise<void>) =>
        fn({
          simulation: simulationApi,
          processingJob: {
            upsert: vi.fn(async () => ({})),
          },
        }),
    },
  };
});

function seedPublishedScenario(bundleId: string) {
  scenarios = [
    {
      id: SCENARIO,
      organizationId: ORG,
      name: "Exercice test",
      level: "MOYEN",
      status: ScenarioStatus.PUBLISHED,
      publishedPromptBundleId: bundleId,
      callType: "VENTE",
      offer: "Offre demo",
      objective: "Qualifier",
      knowledgeRefs: null,
    },
  ];
  assignments = [
    {
      id: "assign-1",
      scenarioId: SCENARIO,
      teleproId: TELEPRO_A,
      status: "ASSIGNED",
    },
  ];
}

beforeEach(async () => {
  scenarios = [];
  bundles = [];
  assignments = [];
  simulations = [];
  turns = [];
  seq = 0;
  createEphemeralSession.mockClear();
  const { prisma } = await import("@/lib/db");
  vi.mocked(prisma.knowledgeItem.findMany).mockResolvedValue([]);
  const auth = await import("@/lib/auth");
  vi.mocked(auth.requireTelepro).mockResolvedValue(teleproUser);
});

describe("helpers promptArtifacts (snapshot)", () => {
  it("parse, render et hash coherent", () => {
    const artifacts = makeArtifacts(1);
    const raw = JSON.stringify(artifacts);
    const parsed = parsePromptArtifacts(raw);
    expect(parsed.PROSPECT_PERSONA.body).toContain("version 1");
    expect(
      renderPromptTemplate(parsed.PROSPECT_PERSONA.body, {
        prospectName: "Marie",
      }),
    ).toContain("Marie");
    expect(
      verifyPromptArtifactsHash(artifacts, hashPromptArtifacts(artifacts)),
    ).toBe(true);
  });
});

describe("POST /api/simulations — snapshot au start", () => {
  it("scenario PUBLISHED sans bundle publie -> 409", async () => {
    scenarios = [
      {
        id: SCENARIO,
        organizationId: ORG,
        name: "Sans bundle",
        level: "MOYEN",
        status: ScenarioStatus.PUBLISHED,
        publishedPromptBundleId: null,
        callType: "VENTE",
        offer: null,
        objective: null,
        knowledgeRefs: null,
      },
    ];
    assignments = [
      {
        id: "assign-1",
        scenarioId: SCENARIO,
        teleproId: TELEPRO_A,
        status: "ASSIGNED",
      },
    ];

    const { POST } = await import("@/app/api/simulations/route");
    const res = await POST(
      new Request("http://localhost/api/simulations", {
        method: "POST",
        body: JSON.stringify({ scenarioId: SCENARIO }),
      }),
    );
    expect(res.status).toBe(409);
  });

  it("creation valide -> snapshot persiste, reponse sans prompt", async () => {
    const bundle = makeBundle(1, PromptBundleStatus.PUBLISHED);
    bundles = [bundle];
    seedPublishedScenario(bundle.id);

    const { POST } = await import("@/app/api/simulations/route");
    const res = await POST(
      new Request("http://localhost/api/simulations", {
        method: "POST",
        body: JSON.stringify({ scenarioId: SCENARIO }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    const data = body.data;

    expect(data).toMatchObject({
      prospectName: expect.any(String),
      mode: SimulationMode.DEMO,
      demo: true,
      opener: expect.any(String),
      level: "MOYEN",
      scenarioName: "Exercice test",
    });
    expect(data).toHaveProperty("id");
    for (const key of TELEPRO_FORBIDDEN_PROMPT_KEYS) {
      expect(data).not.toHaveProperty(key);
    }
    expect(data).not.toHaveProperty("promptBundleId");
    expect(data).not.toHaveProperty("promptBundleVersion");
    expect(data).not.toHaveProperty("promptContentHash");

    const created = simulations[0]!;
    expect(created.promptBundleId).toBe(bundle.id);
    expect(created.promptBundleVersion).toBe(1);
    expect(created.promptContentHash).toBe(bundle.contentHash);
  });

  it("bundle autre organisation ou scenario refuse", async () => {
    const bundle = makeBundle(1, PromptBundleStatus.PUBLISHED, {
      organizationId: "00000000-0000-4000-8000-000000000099",
      scenarioId: "00000000-0000-4000-8000-000000000098",
    });
    bundles = [bundle];
    seedPublishedScenario(bundle.id);

    const { POST } = await import("@/app/api/simulations/route");
    const res = await POST(
      new Request("http://localhost/api/simulations", {
        method: "POST",
        body: JSON.stringify({ scenarioId: SCENARIO }),
      }),
    );
    expect(res.status).toBe(409);
  });

  it("hash artifacts incoherent refuse", async () => {
    const bundle = makeBundle(1, PromptBundleStatus.PUBLISHED, {
      contentHash: "deadbeef",
    });
    bundles = [bundle];
    seedPublishedScenario(bundle.id);

    const { POST } = await import("@/app/api/simulations/route");
    const res = await POST(
      new Request("http://localhost/api/simulations", {
        method: "POST",
        body: JSON.stringify({ scenarioId: SCENARIO }),
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toBe("Bundle de prompts incohérent.");
  });

  it("artifacts JSON invalide au POST -> 409 generique", async () => {
    const bundle = makeBundle(1, PromptBundleStatus.PUBLISHED);
    bundle.artifacts = "{ invalid json";
    bundles = [bundle];
    seedPublishedScenario(bundle.id);

    const { POST } = await import("@/app/api/simulations/route");
    const res = await POST(
      new Request("http://localhost/api/simulations", {
        method: "POST",
        body: JSON.stringify({ scenarioId: SCENARIO }),
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toBe("Bundle de prompts incohérent.");
    expect(JSON.stringify(body)).not.toMatch(/Zod|PROSPECT_PERSONA|syntax/i);
  });

  it("artifacts structure invalide au POST -> 409 generique", async () => {
    const bundle = makeBundle(1, PromptBundleStatus.PUBLISHED);
    bundle.artifacts = JSON.stringify({ FOO: { body: "court" } });
    bundles = [bundle];
    seedPublishedScenario(bundle.id);

    const { POST } = await import("@/app/api/simulations/route");
    const res = await POST(
      new Request("http://localhost/api/simulations", {
        method: "POST",
        body: JSON.stringify({ scenarioId: SCENARIO }),
      }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toBe("Bundle de prompts incohérent.");
    expect(JSON.stringify(body)).not.toMatch(/Zod|PROSPECT_PERSONA/i);
  });
});

describe("persona figee sur snapshot bundle", () => {
  function createSimWithBundle(bundle: ReturnType<typeof makeBundle>) {
    const simId = uid("sim");
    simulations.push({
      id: simId,
      organizationId: ORG,
      scenarioId: SCENARIO,
      teleproId: TELEPRO_A,
      mode: SimulationMode.REALTIME,
      status: SimulationStatus.CREATED,
      prospectName: "Sophie",
      promptBundleId: bundle.id,
      promptBundleVersion: bundle.version,
      promptContentHash: bundle.contentHash,
      startedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    return simId;
  }

  function seedScenario(publishedBundleId: string | null) {
    scenarios = [
      {
        id: SCENARIO,
        organizationId: ORG,
        name: "Exercice",
        level: "MOYEN",
        status: ScenarioStatus.PUBLISHED,
        publishedPromptBundleId: publishedBundleId,
        callType: "VENTE",
        offer: "Offre",
        objective: "Objectif",
        knowledgeRefs: null,
      },
    ];
  }

  it("apres publication v2, simulation epinglee sur v1 utilise v1", async () => {
    const v1 = makeBundle(1, PromptBundleStatus.SUPERSEDED);
    const v2 = makeBundle(2, PromptBundleStatus.PUBLISHED);
    bundles = [v1, v2];
    seedScenario(v2.id);
    const simId = createSimWithBundle(v1);

    expect(scenarios[0]!.publishedPromptBundleId).toBe(v2.id);

    const { getPersonaForSimulation } = await import("@/lib/simulationService");
    const persona = await getPersonaForSimulation({
      simulationId: simId,
      organizationId: ORG,
      teleproId: TELEPRO_A,
    });
    expect(persona).toContain("version 1");
    expect(persona).not.toContain("version 2");
    expect(persona).toContain("Sophie");
  });

  it("bundle v1 SUPERSEDED reste utilisable par simulation epinglee", async () => {
    const v1 = makeBundle(1, PromptBundleStatus.SUPERSEDED);
    bundles = [v1];
    seedScenario(v1.id);
    const simId = createSimWithBundle(v1);

    const { getPersonaForSimulation } = await import("@/lib/simulationService");
    const persona = await getPersonaForSimulation({
      simulationId: simId,
      organizationId: ORG,
      teleproId: TELEPRO_A,
    });
    expect(persona).toContain("version 1");
  });

  it("simulation historique promptBundleId=null -> fallback legacy", async () => {
    const simId = uid("sim");
    simulations.push({
      id: simId,
      organizationId: ORG,
      scenarioId: SCENARIO,
      teleproId: TELEPRO_A,
      mode: SimulationMode.REALTIME,
      status: SimulationStatus.CREATED,
      prospectName: "Karim",
      promptBundleId: null,
      promptBundleVersion: null,
      promptContentHash: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    scenarios = [
      {
        id: SCENARIO,
        organizationId: ORG,
        name: "Legacy",
        level: "MOYEN",
        status: ScenarioStatus.PUBLISHED,
        publishedPromptBundleId: null,
        callType: "VENTE",
        offer: "Offre legacy",
        objective: "Legacy objectif",
        knowledgeRefs: null,
      },
    ];

    const { getPersonaForSimulation } = await import("@/lib/simulationService");
    const persona = await getPersonaForSimulation({
      simulationId: simId,
      organizationId: ORG,
      teleproId: TELEPRO_A,
    });
    expect(persona).toContain("Karim");
    expect(persona).not.toContain("version 1");
  });

  it("snapshot partiel -> erreur sans fallback legacy", async () => {
    const bundle = makeBundle(1, PromptBundleStatus.PUBLISHED);
    bundles = [bundle];
    seedScenario(bundle.id);
    const simId = uid("sim");
    simulations.push({
      id: simId,
      organizationId: ORG,
      scenarioId: SCENARIO,
      teleproId: TELEPRO_A,
      mode: SimulationMode.REALTIME,
      status: SimulationStatus.CREATED,
      prospectName: "Partial",
      promptBundleId: bundle.id,
      promptBundleVersion: null,
      promptContentHash: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const { getPersonaForSimulation } = await import("@/lib/simulationService");
    await expect(
      getPersonaForSimulation({
        simulationId: simId,
        organizationId: ORG,
        teleproId: TELEPRO_A,
      }),
    ).rejects.toMatchObject({
      status: 500,
      message: "Snapshot de prompts incomplet pour la simulation.",
    });
  });

  it("bundle epingle DRAFT -> erreur", async () => {
    const draft = makeBundle(1, PromptBundleStatus.DRAFT);
    bundles = [draft];
    seedScenario(draft.id);
    const simId = createSimWithBundle(draft);

    const { getPersonaForSimulation } = await import("@/lib/simulationService");
    await expect(
      getPersonaForSimulation({
        simulationId: simId,
        organizationId: ORG,
        teleproId: TELEPRO_A,
      }),
    ).rejects.toMatchObject({
      status: 500,
      message: "Bundle de prompts non utilisable pour la simulation.",
    });
  });

  it("route Realtime transmet instructions v1 alors que Scenario pointe v2", async () => {
    const v1 = makeBundle(1, PromptBundleStatus.SUPERSEDED);
    const v2 = makeBundle(2, PromptBundleStatus.PUBLISHED);
    bundles = [v1, v2];
    seedScenario(v2.id);
    const simId = createSimWithBundle(v1);

    expect(scenarios[0]!.publishedPromptBundleId).toBe(v2.id);

    const { POST } = await import("@/app/api/simulations/[id]/realtime/route");
    const res = await POST(
      new Request("http://localhost", { method: "POST" }),
      { params: Promise.resolve({ id: simId }) },
    );
    expect(res.status).toBe(200);
    expect(createEphemeralSession).toHaveBeenCalledOnce();
    const call = createEphemeralSession.mock.calls[0] as
      [{ instructions: string }] | undefined;
    expect(call).toBeDefined();
    const instructions = call![0].instructions;
    expect(instructions).toContain("version 1");
    expect(instructions).not.toContain("version 2");
    expect(instructions).toContain("Sophie");
  });
});

describe("controle proprietaire telepro", () => {
  function seedOwnedSimulation() {
    const bundle = makeBundle(1, PromptBundleStatus.PUBLISHED);
    bundles = [bundle];
    const simId = uid("sim");
    simulations.push({
      id: simId,
      organizationId: ORG,
      scenarioId: SCENARIO,
      teleproId: TELEPRO_A,
      mode: SimulationMode.DEMO,
      status: SimulationStatus.CREATED,
      prospectName: "Nadia",
      promptBundleId: bundle.id,
      promptBundleVersion: 1,
      promptContentHash: bundle.contentHash,
      startedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    scenarios = [
      {
        id: SCENARIO,
        organizationId: ORG,
        name: "Owned",
        level: "MOYEN",
        status: ScenarioStatus.PUBLISHED,
        publishedPromptBundleId: bundle.id,
        callType: "VENTE",
        offer: null,
        objective: null,
        knowledgeRefs: null,
      },
    ];
    turns.push({
      simulationId: simId,
      role: "PROSPECT",
      content: "Bonjour",
      atMs: 1000,
    });
    return simId;
  }

  it("autre telepro meme org refuse sur turn, realtime-turn et end", async () => {
    const simId = seedOwnedSimulation();
    const otherTelepro = { ...teleproUser, id: TELEPRO_B };
    const { requireTelepro } = await import("@/lib/auth");
    vi.mocked(requireTelepro).mockResolvedValue(otherTelepro);

    const { POST: turnPost } = await import(
      "@/app/api/simulations/[id]/turn/route"
    );
    const turnRes = await turnPost(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ message: "Bonjour" }),
      }),
      { params: Promise.resolve({ id: simId }) },
    );
    expect(turnRes.status).toBe(404);

    const { POST: rtTurnPost } = await import(
      "@/app/api/simulations/[id]/realtime-turn/route"
    );
    const rtTurnRes = await rtTurnPost(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ role: "AGENT", content: "Salut" }),
      }),
      { params: Promise.resolve({ id: simId }) },
    );
    expect(rtTurnRes.status).toBe(404);

    const { POST: endPost } = await import(
      "@/app/api/simulations/[id]/end/route"
    );
    const endRes = await endPost(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ durationSec: 30 }),
      }),
      { params: Promise.resolve({ id: simId }) },
    );
    expect(endRes.status).toBe(404);
  });

  it("aucun fetch reseau ni appel OpenAI sur realtime", async () => {
    const simId = seedOwnedSimulation();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { POST } = await import("@/app/api/simulations/[id]/realtime/route");
    const res = await POST(
      new Request("http://localhost", { method: "POST" }),
      { params: Promise.resolve({ id: simId }) },
    );
    expect(res.status).toBe(200);
    expect(createEphemeralSession).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
