import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/httpError";
import { PromptBundleStatus, Role, ScenarioStatus } from "@/lib/enums";
import {
  TELEPRO_FORBIDDEN_PROMPT_KEYS,
  TELEPRO_SIMULATION_CREATE_CONTRACT,
  assertNoRawPromptsInTeleproPayload,
  hashPromptArtifacts,
  interpolatePrompt,
  slugifyName,
} from "@/lib/exerciseAdminService";

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

type ScenarioRow = {
  id: string;
  organizationId: string;
  authorId: string | null;
  name: string;
  slug: string | null;
  missionLevel: number;
  sortOrder: number;
  publishedPromptBundleId: string | null;
  callType: string;
  campaign: string | null;
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
  traineeBrief: string | null;
  knowledgeRefs: string | null;
  aiProspect: string | null;
  relationshipHistory: string | null;
  expectedNextSteps: string | null;
  targetSkills: string | null;
  coachingReference: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
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

let scenarios: ScenarioRow[] = [];
let bundles: BundleRow[] = [];
let rubrics: RubricRow[] = [];
let simulations: Array<{ id: string; scenarioId: string }> = [];
let assignments: Array<{ id: string; scenarioId: string }> = [];
let seq = 0;
const audits: Array<{ action: string }> = [];

function uid(prefix: string) {
  return `${prefix}-${++seq}`;
}

function matchScenario(where: Record<string, unknown> | undefined): ScenarioRow | null {
  if (!where) return scenarios[0] ?? null;
  return (
    scenarios.find((s) => {
      if (typeof where.id === "string" && s.id !== where.id) return false;
      if (
        where.id &&
        typeof where.id === "object" &&
        "not" in (where.id as object) &&
        s.id === (where.id as { not: string }).not
      ) {
        return false;
      }
      if (where.organizationId && s.organizationId !== where.organizationId)
        return false;
      if (where.slug && s.slug !== where.slug) return false;
      if (where.status && s.status !== where.status) return false;
      return true;
    }) ?? null
  );
}

vi.mock("@/lib/db", () => {
  const scenarioApi = {
    findMany: async ({ where }: { where?: Record<string, unknown> }) =>
      scenarios.filter((s) => {
        if (where?.organizationId && s.organizationId !== where.organizationId)
          return false;
        if (where?.status && s.status !== where.status) return false;
        if (
          where?.missionLevel != null &&
          s.missionLevel !== where.missionLevel
        )
          return false;
        return true;
      }),
    findFirst: async ({
      where,
      include,
    }: {
      where?: Record<string, unknown>;
      include?: Record<string, unknown>;
      select?: unknown;
    }) => {
      const found = matchScenario(where);
      if (!found) return null;
      if (!include) return found;
      const promptBundles = bundles
        .filter((b) => b.scenarioId === found.id)
        .sort((a, b) => b.version - a.version);
      const publishedPromptBundle =
        bundles.find((b) => b.id === found.publishedPromptBundleId) ?? null;
      const rubric = rubrics.find((r) => r.scenarioId === found.id) ?? null;
      return {
        ...found,
        promptBundles,
        publishedPromptBundle,
        rubric,
        _count: {
          simulations: simulations.filter((x) => x.scenarioId === found.id)
            .length,
          assignments: assignments.filter((x) => x.scenarioId === found.id)
            .length,
        },
      };
    },
    create: async ({ data }: { data: Partial<ScenarioRow> }) => {
      const row: ScenarioRow = {
        id: uid("ex"),
        organizationId: data.organizationId!,
        authorId: data.authorId ?? null,
        name: data.name!,
        slug: data.slug ?? null,
        missionLevel: data.missionLevel ?? 1,
        sortOrder: data.sortOrder ?? 0,
        publishedPromptBundleId: data.publishedPromptBundleId ?? null,
        callType: data.callType ?? "VENTE",
        campaign: data.campaign ?? null,
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
        traineeBrief: data.traineeBrief ?? null,
        knowledgeRefs: data.knowledgeRefs ?? null,
        aiProspect: data.aiProspect ?? null,
        relationshipHistory: data.relationshipHistory ?? null,
        expectedNextSteps: data.expectedNextSteps ?? null,
        targetSkills: data.targetSkills ?? null,
        coachingReference: data.coachingReference ?? null,
        status: data.status ?? "DRAFT",
        createdAt: data.createdAt!,
        updatedAt: data.updatedAt!,
      };
      scenarios.push(row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<ScenarioRow>;
    }) => {
      const idx = scenarios.findIndex((s) => s.id === where.id);
      scenarios[idx] = { ...scenarios[idx]!, ...data };
      return scenarios[idx];
    },
    delete: async ({ where }: { where: { id: string } }) => {
      scenarios = scenarios.filter((s) => s.id !== where.id);
      bundles = bundles.filter((b) => b.scenarioId !== where.id);
      return { id: where.id };
    },
  };

  const promptBundleApi = {
    findFirst: async ({ where }: { where?: Record<string, unknown> }) =>
      bundles.find((b) => {
        if (where?.scenarioId && b.scenarioId !== where.scenarioId) return false;
        if (where?.status && b.status !== where.status) return false;
        if (where?.version && b.version !== where.version) return false;
        return true;
      }) ?? null,
    aggregate: async ({ where }: { where?: { scenarioId?: string } }) => {
      const versions = bundles
        .filter((b) => !where?.scenarioId || b.scenarioId === where.scenarioId)
        .map((b) => b.version);
      return {
        _max: { version: versions.length ? Math.max(...versions) : null },
      };
    },
    create: async ({ data }: { data: Partial<BundleRow> }) => {
      if (
        bundles.some(
          (b) =>
            b.scenarioId === data.scenarioId && b.version === data.version,
        )
      ) {
        throw new Error("Unique constraint failed");
      }
      const row: BundleRow = {
        id: uid("pb"),
        organizationId: data.organizationId!,
        scenarioId: data.scenarioId!,
        version: data.version!,
        status: data.status ?? "DRAFT",
        label: data.label ?? null,
        createdById: data.createdById ?? null,
        createdAt: data.createdAt!,
        publishedAt: data.publishedAt ?? null,
        artifacts: data.artifacts!,
        contentHash: data.contentHash!,
      };
      bundles.push(row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<BundleRow>;
    }) => {
      const idx = bundles.findIndex((b) => b.id === where.id);
      bundles[idx] = { ...bundles[idx]!, ...data };
      return bundles[idx];
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { scenarioId: string; status: string };
      data: Partial<BundleRow>;
    }) => {
      let count = 0;
      bundles = bundles.map((b) => {
        if (b.scenarioId === where.scenarioId && b.status === where.status) {
          count += 1;
          return { ...b, ...data };
        }
        return b;
      });
      return { count };
    },
  };

  const evaluationRubricApi = {
    create: async ({ data }: { data: Partial<RubricRow> }) => {
      const row: RubricRow = {
        id: uid("rub"),
        organizationId: data.organizationId!,
        scenarioId: data.scenarioId!,
        name: data.name!,
        criteria: data.criteria!,
        createdAt: data.createdAt!,
        updatedAt: data.updatedAt!,
      };
      rubrics.push(row);
      return row;
    },
  };

  return {
    prisma: {
      scenario: scenarioApi,
      promptBundle: promptBundleApi,
      evaluationRubric: evaluationRubricApi,
      $transaction: async (
        fn: (tx: {
          scenario: typeof scenarioApi;
          promptBundle: typeof promptBundleApi;
          evaluationRubric: typeof evaluationRubricApi;
        }) => Promise<unknown>,
      ) =>
        fn({
          scenario: scenarioApi,
          promptBundle: promptBundleApi,
          evaluationRubric: evaluationRubricApi,
        }),
    },
  };
});

vi.mock("@/lib/audit", () => ({
  logAudit: async (input: { action: string }) => {
    audits.push({ action: input.action });
  },
}));

beforeEach(() => {
  scenarios = [];
  bundles = [];
  rubrics = [];
  simulations = [];
  assignments = [];
  audits.length = 0;
  seq = 0;
  vi.clearAllMocks();
});

describe("helpers purs (sans réseau)", () => {
  it("hash et interpolation locaux", () => {
    const artifacts = {
      PROSPECT_PERSONA: {
        body: "Bonjour {{prospectName}}, offre {{offer}}",
        contentType: "text/plain",
      },
    };
    expect(hashPromptArtifacts(artifacts)).toMatch(/^[a-f0-9]{64}$/);
    expect(
      interpolatePrompt(artifacts.PROSPECT_PERSONA.body, {
        prospectName: "Marie",
        offer: "X",
      }),
    ).toBe("Bonjour Marie, offre X");
    expect(slugifyName("Appel Découverte RH")).toBe("appel-decouverte-rh");
  });

  it("contrat télépro sans prompts bruts", () => {
    const payload = { ...TELEPRO_SIMULATION_CREATE_CONTRACT };
    expect(() => assertNoRawPromptsInTeleproPayload(payload)).not.toThrow();
    for (const key of TELEPRO_FORBIDDEN_PROMPT_KEYS) {
      expect(payload).not.toHaveProperty(key);
    }
    expect(() =>
      assertNoRawPromptsInTeleproPayload({
        id: "1",
        artifacts: { PROSPECT_PERSONA: { body: "secret" } },
      }),
    ).toThrow(/Fuite prompt/);
  });
});

describe("assertPlatformAdmin", () => {
  it("anonyme → 401", async () => {
    const { assertPlatformAdmin } = await import("@/lib/auth");
    try {
      assertPlatformAdmin(null);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toMatchObject({ status: 401 });
    }
  });

  it("téléprospecteur → 403", async () => {
    const { assertPlatformAdmin } = await import("@/lib/auth");
    try {
      assertPlatformAdmin({
        id: "u1",
        email: "t@x.com",
        fullName: "Télé",
        role: Role.TELEPRO,
        organizationId: "org1",
        organizationName: "Org",
      });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toMatchObject({ status: 403 });
    }
  });

  it("manager → 403", async () => {
    const { assertPlatformAdmin } = await import("@/lib/auth");
    try {
      assertPlatformAdmin({
        id: "u2",
        email: "m@x.com",
        fullName: "Mgr",
        role: Role.MANAGER,
        organizationId: "org1",
        organizationName: "Org",
      });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toMatchObject({ status: 403 });
    }
  });

  it("admin autorisé", async () => {
    const { assertPlatformAdmin } = await import("@/lib/auth");
    const user = assertPlatformAdmin({
      id: "u3",
      email: "a@x.com",
      fullName: "Admin",
      role: Role.PLATFORM_ADMIN,
      organizationId: "org1",
      organizationName: "Org",
    });
    expect(user.role).toBe(Role.PLATFORM_ADMIN);
    expect(user.organizationId).toBe("org1");
  });
});

describe("cycle de vie exercice / versions", () => {
  it("création brouillon + nouvelle version + auteur / note", async () => {
    const svc = await import("@/lib/exerciseAdminService");
    const created = await svc.createExerciseDraft("org1", "admin1", {
      name: "Découverte budget",
      level: "MOYEN",
      missionLevel: 2,
      sortOrder: 1,
      offer: "SaaS",
    });
    expect(created.status).toBe(ScenarioStatus.DRAFT);
    expect(created.slug).toBe("decouverte-budget");
    expect(created.currentBundle?.version).toBe(1);
    expect(created.currentBundle?.changeNote).toContain("brouillon");
    expect(created.currentBundle?.createdById).toBe("admin1");
    expect(
      created.currentBundle?.artifacts.PROSPECT_PERSONA.body.length,
    ).toBeGreaterThan(20);

    await svc.publishPromptBundle(created.id, "org1", "admin1");
    const withV2 = await svc.createPromptVersion(created.id, "org1", "admin1", {
      changeNote: "ajuste ton",
      artifacts: {
        PROSPECT_PERSONA: {
          body: "Tu incarnes {{prospectName}}, prospect exigeant pour {{offer}}.".padEnd(
            40,
            ".",
          ),
          contentType: "text/plain",
        },
      },
    });
    expect(withV2.versions.map((v) => v.version).sort()).toEqual([1, 2]);
    expect(withV2.currentBundle?.version).toBe(2);
    expect(withV2.currentBundle?.changeNote).toBe("ajuste ton");
    expect(audits.map((a) => a.action)).toContain("PROMPT_BUNDLE_CREATE");
  });

  it("archivage d'un exercice référencé + refus de suppression", async () => {
    const svc = await import("@/lib/exerciseAdminService");
    const created = await svc.createExerciseDraft("org1", "admin1", {
      name: "Exercice référencé",
      slug: "ex-ref",
    });
    simulations.push({ id: "sim1", scenarioId: created.id });

    const archived = await svc.archiveExercise(created.id, "org1", "admin1");
    expect(archived.status).toBe(ScenarioStatus.ARCHIVED);

    await expect(
      svc.deleteDraftExercise(created.id, "org1", "admin1"),
    ).rejects.toBeInstanceOf(HttpError);

    try {
      await svc.deleteDraftExercise(created.id, "org1", "admin1");
    } catch (e) {
      expect(e).toMatchObject({ status: 409 });
      expect(String((e as Error).message)).toMatch(
        /archivé|référencé|brouillons/i,
      );
    }
  });

  it("suppression physique d'un brouillon jamais référencé", async () => {
    const svc = await import("@/lib/exerciseAdminService");
    const created = await svc.createExerciseDraft("org1", "admin1", {
      name: "Jetable",
      slug: "jetable",
    });
    const result = await svc.deleteDraftExercise(created.id, "org1", "admin1");
    expect(result.deleted).toBe(true);
    await expect(svc.getExercise(created.id, "org1")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("restauration crée une nouvelle version DRAFT", async () => {
    const svc = await import("@/lib/exerciseAdminService");
    const created = await svc.createExerciseDraft("org1", "admin1", {
      name: "Restore me",
      slug: "restore-me",
    });
    await svc.publishPromptBundle(created.id, "org1", "admin1");
    await svc.createPromptVersion(created.id, "org1", "admin1", {
      changeNote: "v2",
      artifacts: {
        PROSPECT_PERSONA: {
          body: "Version deux du persona prospect pour test local.",
          contentType: "text/plain",
        },
      },
    });
    await svc.publishPromptBundle(created.id, "org1", "admin1");

    const restored = await svc.restorePromptVersion(
      created.id,
      "org1",
      "admin1",
      { fromVersion: 1, changeNote: "rollback v1" },
    );
    expect(restored.currentBundle?.status).toBe(PromptBundleStatus.DRAFT);
    expect(restored.currentBundle?.version).toBe(3);
    expect(restored.currentBundle?.changeNote).toBe("rollback v1");
    expect(
      restored.currentBundle?.artifacts.PROSPECT_PERSONA.body,
    ).toContain("{{prospectName}}");
  });

  it("preview locale sans fetch / OpenAI", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const svc = await import("@/lib/exerciseAdminService");
    const created = await svc.createExerciseDraft("org1", "admin1", {
      name: "Preview",
      slug: "preview-ex",
      offer: "Pack Pro",
    });
    await svc.updateDraftPromptBundle(created.id, "org1", "admin1", {
      changeNote: "preview vars",
      artifacts: {
        PROSPECT_PERSONA: {
          body: "Salut {{prospectName}}, sujet {{offer}} niveau {{level}}.",
          contentType: "text/plain",
        },
      },
    });
    const preview = await svc.previewPromptLocally(created.id, "org1", {
      fixtureId: "default",
    });
    expect(preview.network).toBe(false);
    expect(preview.rendered).toContain("Marie Dupont");
    expect(preview.rendered).toContain("Pack Pro");
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("publish / unpublish exercice", async () => {
    const svc = await import("@/lib/exerciseAdminService");
    const created = await svc.createExerciseDraft("org1", "admin1", {
      name: "Pub",
      slug: "pub-ex",
    });
    await expect(
      svc.publishExercise(created.id, "org1", "admin1"),
    ).rejects.toMatchObject({ status: 409 });

    await svc.publishPromptBundle(created.id, "org1", "admin1");
    const published = await svc.publishExercise(created.id, "org1", "admin1");
    expect(published.status).toBe(ScenarioStatus.PUBLISHED);
    const unpublished = await svc.unpublishExercise(
      created.id,
      "org1",
      "admin1",
    );
    expect(unpublished.status).toBe(ScenarioStatus.DRAFT);
  });

  it("refuse updateDraft, publishBundle et restore sur exercice archivé (409)", async () => {
    const svc = await import("@/lib/exerciseAdminService");
    const created = await svc.createExerciseDraft("org1", "admin1", {
      name: "Archivé prompts",
      slug: "archived-prompts",
    });
    await svc.archiveExercise(created.id, "org1", "admin1");

    const draftBody = {
      changeNote: "tentative",
      artifacts: {
        PROSPECT_PERSONA: {
          body: "Tentative de modification sur exercice archivé.",
          contentType: "text/plain",
        },
      },
    };

    await expect(
      svc.updateDraftPromptBundle(created.id, "org1", "admin1", draftBody),
    ).rejects.toMatchObject({ status: 409 });

    await expect(
      svc.publishPromptBundle(created.id, "org1", "admin1"),
    ).rejects.toMatchObject({ status: 409 });

    await expect(
      svc.restorePromptVersion(created.id, "org1", "admin1", {
        fromVersion: 1,
        changeNote: "rollback",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("autorise preview et duplication sur exercice archivé", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const svc = await import("@/lib/exerciseAdminService");
    const created = await svc.createExerciseDraft("org1", "admin1", {
      name: "Archivé lecture",
      slug: "archived-read",
      offer: "Offre test",
    });
    await svc.archiveExercise(created.id, "org1", "admin1");

    const preview = await svc.previewPromptLocally(created.id, "org1", {
      fixtureId: "default",
    });
    expect(preview.network).toBe(false);
    expect(preview.rendered.length).toBeGreaterThan(10);
    expect(fetchSpy).not.toHaveBeenCalled();

    const dup = await svc.duplicateExercise(created.id, "org1", "admin1");
    expect(dup.status).toBe(ScenarioStatus.DRAFT);
    expect(dup.slug).toContain("archived-read-copy");
    vi.unstubAllGlobals();
  });

  it("duplication conserve champs riches et grille d'évaluation", async () => {
    const svc = await import("@/lib/exerciseAdminService");
    const now = new Date().toISOString();
    const sourceId = "ex-rich";
    scenarios.push({
      id: sourceId,
      organizationId: "org1",
      authorId: "admin1",
      name: "Exercice riche",
      slug: "ex-riche",
      missionLevel: 2,
      sortOrder: 3,
      publishedPromptBundleId: null,
      callType: "VENTE",
      campaign: "Campagne",
      offer: "Offre premium",
      prospectProfile: "Directeur",
      initialSituation: "Relance",
      objective: "RDV",
      level: "DIFFICILE",
      personality: "exigeant",
      allowedObjections: JSON.stringify(["prix"]),
      secretInfos: JSON.stringify([{ question: "q", answer: "a" }]),
      successConditions: "succès",
      failureConditions: "échec",
      targetDurationSec: 420,
      traineeBrief: "Brief détaillé",
      knowledgeRefs: null,
      aiProspect: JSON.stringify({ persona: "IA", openingLine: "Bonjour" }),
      relationshipHistory: JSON.stringify({ priorCalls: 2 }),
      expectedNextSteps: JSON.stringify(["RDV", "Devis"]),
      targetSkills: JSON.stringify(["Closing", "Écoute"]),
      coachingReference: JSON.stringify(["Reformuler"]),
      status: ScenarioStatus.PUBLISHED,
      createdAt: now,
      updatedAt: now,
    });
    rubrics.push({
      id: "rub-1",
      organizationId: "org1",
      scenarioId: sourceId,
      name: "Grille source",
      criteria: JSON.stringify([
        { key: "closing", label: "Closing", weight: 50, description: "x" },
      ]),
      createdAt: now,
      updatedAt: now,
    });
    bundles.push({
      id: "pb-1",
      organizationId: "org1",
      scenarioId: sourceId,
      version: 1,
      status: PromptBundleStatus.PUBLISHED,
      label: "v1",
      createdById: "admin1",
      createdAt: now,
      publishedAt: now,
      artifacts: JSON.stringify({
        PROSPECT_PERSONA: {
          body: "Persona source pour duplication test local.",
          contentType: "text/plain",
        },
      }),
      contentHash: "abc",
    });
    scenarios[0]!.publishedPromptBundleId = "pb-1";

    const dup = await svc.duplicateExercise(sourceId, "org1", "admin1");
    const copied = scenarios.find((s) => s.id === dup.id)!;
    expect(copied.aiProspect).toBe(scenarios[0]!.aiProspect);
    expect(copied.relationshipHistory).toBe(scenarios[0]!.relationshipHistory);
    expect(copied.expectedNextSteps).toBe(scenarios[0]!.expectedNextSteps);
    expect(copied.targetSkills).toBe(scenarios[0]!.targetSkills);
    expect(copied.coachingReference).toBe(scenarios[0]!.coachingReference);

    const copiedRubric = rubrics.find((r) => r.scenarioId === dup.id);
    expect(copiedRubric).toBeDefined();
    expect(copiedRubric!.name).toBe("Grille source");
    expect(JSON.parse(copiedRubric!.criteria)).toHaveLength(1);

    const copiedBundle = bundles.find((b) => b.scenarioId === dup.id);
    expect(copiedBundle?.version).toBe(1);
    expect(copiedBundle?.status).toBe(PromptBundleStatus.DRAFT);
  });
});

describe("aucune dépendance OpenAI dans ce module", () => {
  it("n'importe pas les providers openai", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      new URL("../src/lib/exerciseAdminService.ts", import.meta.url),
      "utf8",
    );
    expect(src).not.toMatch(/providers\/openai|openai\.com|OpenAI/);
    const authSrc = await fs.readFile(
      new URL("../src/lib/auth.ts", import.meta.url),
      "utf8",
    );
    expect(authSrc).toContain("requirePlatformAdmin");
  });
});
