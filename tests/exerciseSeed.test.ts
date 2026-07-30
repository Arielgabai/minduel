import { afterEach, describe, expect, it } from "vitest";
import { PromptKind } from "@/lib/enums";
import { hashPromptArtifacts } from "@/lib/promptArtifacts";
import { seedRefonteExercises } from "../prisma/seedExercises";
import { REFONTE_EXERCISES } from "../prisma/seedExercisesData";

describe("refonte exercise seed data", () => {
  it("definit 12 exercices avec slugs uniques", () => {
    expect(REFONTE_EXERCISES).toHaveLength(12);
    const slugs = REFONTE_EXERCISES.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(12);
  });

  it("couvre les 4 niveaux mission", () => {
    for (let level = 1; level <= 4; level += 1) {
      const atLevel = REFONTE_EXERCISES.filter((e) => e.missionLevel === level);
      expect(atLevel).toHaveLength(3);
    }
  });

  it("structure metier complete", () => {
    for (const ex of REFONTE_EXERCISES) {
      expect(ex.knownFacts).toHaveLength(3);
      expect(ex.objections).toHaveLength(2);
      expect(ex.successCriteria).toHaveLength(3);
      expect(ex.rubric).toHaveLength(3);
      expect(ex.roleplayPrompt.length).toBeGreaterThan(50);
      expect(ex.openingLine.length).toBeGreaterThan(5);
    }
  });

  it("prompts persona sans format evaluation", () => {
    for (const ex of REFONTE_EXERCISES) {
      expect(ex.roleplayPrompt.toLowerCase()).not.toContain("skillscores");
    }
  });
});

describe("hashPromptArtifacts partagé", () => {
  it("deux bodies différents donnent deux hashes différents", () => {
    const a = hashPromptArtifacts({
      [PromptKind.PROSPECT_PERSONA]: {
        body: "premier corps",
        contentType: "text/plain",
      },
    });
    const b = hashPromptArtifacts({
      [PromptKind.PROSPECT_PERSONA]: {
        body: "second corps",
        contentType: "text/plain",
      },
    });
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(b).toMatch(/^[a-f0-9]{64}$/);
  });

  it("objets identiques avec ordre de clés différent donnent le même hash", () => {
    const artifactsA = {
      [PromptKind.PROSPECT_PERSONA]: {
        body: "test",
        contentType: "text/plain",
      },
      [PromptKind.EVALUATION_SYSTEM]: {
        body: "eval",
        contentType: "text/plain",
      },
    };
    const artifactsB = {
      [PromptKind.EVALUATION_SYSTEM]: {
        contentType: "text/plain",
        body: "eval",
      },
      [PromptKind.PROSPECT_PERSONA]: {
        contentType: "text/plain",
        body: "test",
      },
    };
    expect(hashPromptArtifacts(artifactsA)).toBe(hashPromptArtifacts(artifactsB));
  });
});

type OrgRow = { id: string; slug: string };
type ScenarioRow = {
  id: string;
  organizationId: string;
  slug: string | null;
  name: string;
  status: string;
  [key: string]: unknown;
};
type RubricRow = {
  id: string;
  organizationId: string;
  scenarioId: string;
  name: string;
  criteria: string;
  createdAt: string;
  updatedAt: string;
};
type BundleRow = {
  id: string;
  organizationId: string;
  scenarioId: string;
  version: number;
  status: string;
  label: string | null;
  artifacts: string;
  contentHash: string;
  createdAt: string;
};

function createMockSeedClient() {
  const organizations: OrgRow[] = [];
  const scenarios: ScenarioRow[] = [];
  const rubrics: RubricRow[] = [];
  const bundles: BundleRow[] = [];
  let seq = 0;

  const uid = (prefix: string) => `${prefix}-${++seq}`;

  const scenarioApi = {
    findFirst: async ({
      where,
    }: {
      where?: { organizationId?: string; slug?: string };
    }) =>
      scenarios.find(
        (s) =>
          (!where?.organizationId || s.organizationId === where.organizationId) &&
          (!where?.slug || s.slug === where.slug),
      ) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row: ScenarioRow = {
        id: uid("sc"),
        organizationId: data.organizationId as string,
        slug: (data.slug as string) ?? null,
        name: data.name as string,
        status: (data.status as string) ?? "DRAFT",
        ...data,
      };
      scenarios.push(row);
      return row;
    },
  };

  const evaluationRubricApi = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row: RubricRow = {
        id: uid("rub"),
        organizationId: data.organizationId as string,
        scenarioId: data.scenarioId as string,
        name: data.name as string,
        criteria: data.criteria as string,
        createdAt: data.createdAt as string,
        updatedAt: data.updatedAt as string,
      };
      rubrics.push(row);
      return row;
    },
  };

  const promptBundleApi = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row: BundleRow = {
        id: uid("pb"),
        organizationId: data.organizationId as string,
        scenarioId: data.scenarioId as string,
        version: data.version as number,
        status: data.status as string,
        label: (data.label as string) ?? null,
        artifacts: data.artifacts as string,
        contentHash: data.contentHash as string,
        createdAt: data.createdAt as string,
      };
      bundles.push(row);
      return row;
    },
  };

  const organizationApi = {
    findUnique: async ({ where }: { where: { slug: string } }) =>
      organizations.find((o) => o.slug === where.slug) ?? null,
    create: async ({ data }: { data: { slug: string } }) => {
      const row = { id: uid("org"), slug: data.slug };
      organizations.push(row);
      return row;
    },
  };

  const client = {
    organization: organizationApi,
    scenario: scenarioApi,
    evaluationRubric: evaluationRubricApi,
    promptBundle: promptBundleApi,
    $transaction: async (
      fn: (tx: {
        scenario: typeof scenarioApi;
        evaluationRubric: typeof evaluationRubricApi;
        promptBundle: typeof promptBundleApi;
      }) => Promise<unknown>,
    ) =>
      fn({
        scenario: scenarioApi,
        evaluationRubric: evaluationRubricApi,
        promptBundle: promptBundleApi,
      }),
    _state: { organizations, scenarios, rubrics, bundles },
  };

  return client;
}

describe("seedRefonteExercises", () => {
  const originalSlug = process.env.SEED_ORG_SLUG;

  afterEach(() => {
    if (originalSlug === undefined) delete process.env.SEED_ORG_SLUG;
    else process.env.SEED_ORG_SLUG = originalSlug;
  });

  it("exige SEED_ORG_SLUG", async () => {
    delete process.env.SEED_ORG_SLUG;
    const client = createMockSeedClient();
    await expect(seedRefonteExercises(client as never)).rejects.toThrow(
      /SEED_ORG_SLUG est requis/,
    );
  });

  it("échoue si l'organisation est absente sans en créer", async () => {
    process.env.SEED_ORG_SLUG = "org-inexistante";
    const client = createMockSeedClient();
    await expect(seedRefonteExercises(client as never)).rejects.toThrow(
      /Organisation introuvable/,
    );
    expect(client._state.organizations).toHaveLength(0);
    expect(client._state.scenarios).toHaveLength(0);
  });

  it("utilise le client injecté et crée scénario, grille et bundle", async () => {
    process.env.SEED_ORG_SLUG = "demo-org";
    const client = createMockSeedClient();
    client._state.organizations.push({ id: "org-1", slug: "demo-org" });

    const result = await seedRefonteExercises(client as never);
    expect(result.createdCount).toBe(12);
    expect(result.skippedCount).toBe(0);
    expect(client._state.scenarios).toHaveLength(12);
    expect(client._state.rubrics).toHaveLength(12);
    expect(client._state.bundles).toHaveLength(12);
    expect(client._state.bundles.every((b) => b.status === "DRAFT")).toBe(true);
  });

  it("un second seed ne réécrit pas les données modifiées", async () => {
    process.env.SEED_ORG_SLUG = "demo-org";
    const client = createMockSeedClient();
    client._state.organizations.push({ id: "org-1", slug: "demo-org" });

    await seedRefonteExercises(client as never);

    const first = client._state.scenarios[0]!;
    first.name = "Nom modifié manuellement";
    first.status = "PUBLISHED";
    const rubric = client._state.rubrics[0]!;
    rubric.criteria = JSON.stringify([{ key: "x", label: "modifié" }]);
    const bundle = client._state.bundles[0]!;
    bundle.artifacts = JSON.stringify({ changed: true });
    bundle.label = "bundle modifié";

    const second = await seedRefonteExercises(client as never);
    expect(second.createdCount).toBe(0);
    expect(second.skippedCount).toBe(12);
    expect(client._state.scenarios[0]!.name).toBe("Nom modifié manuellement");
    expect(client._state.scenarios[0]!.status).toBe("PUBLISHED");
    expect(client._state.rubrics[0]!.criteria).toContain("modifié");
    expect(client._state.bundles[0]!.label).toBe("bundle modifié");
  });
});
