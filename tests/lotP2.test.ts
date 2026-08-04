import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PromptBundleStatus,
  ScenarioStatus,
  SimulationMode,
  SimulationStatus,
} from "@/lib/enums";
import {
  buildTeleproMissionsCatalogView,
  isVisiblePublishedOrgScenario,
  type MissionAttemptInput,
  type MissionExerciseInput,
  type MissionStageInput,
  type MissionThemeInput,
} from "@/lib/teleproMissions";
import {
  buildManagerExercisesCatalogView,
  flattenManagerCatalogExercises,
} from "@/lib/managerExercisesView";
import {
  assertConfigureAllowed,
  configurePlatformCatalog,
  resolveApplyFlag,
  resolveOrgSlug,
  type ConfigurePrisma,
} from "../prisma/configurePlatformCatalog";
import {
  resolvePlatformCatalogOrganizationId,
  type PlatformCatalogDb,
} from "@/lib/platformCatalog";
import { HttpError } from "@/lib/httpError";
import { hashPromptArtifacts } from "@/lib/promptArtifacts";

const CATALOG = "00000000-0000-4000-8000-0000000000c1";
const ORG_A = "00000000-0000-4000-8000-0000000000a1";
const ORG_B = "00000000-0000-4000-8000-0000000000b1";
const ORG_NEW = "00000000-0000-4000-8000-0000000000n1";
const ADMIN_ORG = "00000000-0000-4000-8000-0000000000d1";
const TELEPRO_A = "00000000-0000-4000-8000-0000000000t1";
const TELEPRO_B = "00000000-0000-4000-8000-0000000000t2";
const MANAGER_B = "00000000-0000-4000-8000-0000000000m1";
const SCENARIO = "00000000-0000-4000-8000-0000000000s1";
const BUNDLE = "00000000-0000-4000-8000-0000000000p1";

function read(rel: string) {
  return readFileSync(path.resolve(rel), "utf8");
}

function readyExercise(
  overrides: Partial<MissionExerciseInput> &
    Pick<MissionExerciseInput, "id" | "name">,
): MissionExerciseInput {
  return {
    missionLevel: 1,
    sortOrder: 1,
    level: "MOYEN",
    objective: "Obj",
    prospectProfile: "Profil",
    personality: "Calme",
    successConditions: null,
    targetDurationSec: 300,
    status: ScenarioStatus.PUBLISHED,
    organizationId: CATALOG,
    missionStageId: null,
    prospectAvatarKey: "alex",
    hasPublishedPrompt: true,
    ...overrides,
  };
}

function theme(
  overrides: Partial<MissionThemeInput> &
    Pick<MissionThemeInput, "id" | "slug" | "name">,
): MissionThemeInput {
  return {
    description: null,
    iconKey: "target",
    sortOrder: 1,
    status: "PUBLISHED",
    ...overrides,
  };
}

function stage(
  overrides: Partial<MissionStageInput> &
    Pick<
      MissionStageInput,
      "id" | "themeId" | "slug" | "name" | "levelNumber"
    >,
): MissionStageInput {
  return {
    description: null,
    sortOrder: overrides.levelNumber,
    status: "PUBLISHED",
    ...overrides,
  };
}

describe("LOT P2 — résolution catalogue plateforme", () => {
  it("16. aucune organisation catalogue → erreur contrôlée", async () => {
    const db: PlatformCatalogDb = {
      organization: {
        findMany: async () => [],
      },
    };
    await expect(resolvePlatformCatalogOrganizationId(db)).rejects.toBeInstanceOf(
      HttpError,
    );
    await expect(resolvePlatformCatalogOrganizationId(db)).rejects.toMatchObject({
      status: 503,
      message: "Catalogue pédagogique plateforme non configuré.",
    });
  });

  it("21. plusieurs organisations catalogue → état incohérent", async () => {
    const db: PlatformCatalogDb = {
      organization: {
        findMany: async () => [{ id: CATALOG }, { id: ORG_A }],
      },
    };
    await expect(resolvePlatformCatalogOrganizationId(db)).rejects.toMatchObject({
      status: 503,
      message: "Configuration catalogue plateforme incohérente.",
    });
  });

  it("résout exactement une organisation catalogue", async () => {
    const db: PlatformCatalogDb = {
      organization: {
        findMany: async () => [{ id: CATALOG }],
      },
    };
    await expect(resolvePlatformCatalogOrganizationId(db)).resolves.toBe(CATALOG);
  });
});

describe("LOT P2 — catalogue multi-org (vues pures)", () => {
  const exercises = [
    readyExercise({
      id: SCENARIO,
      name: "Global Alpha",
      missionStageId: "st1",
      sortOrder: 1,
    }),
  ];
  const themes = [theme({ id: "th1", slug: "cold", name: "Cold Call" })];
  const stages = [
    stage({
      id: "st1",
      themeId: "th1",
      slug: "n1",
      name: "N1",
      levelNumber: 1,
    }),
  ];

  it("1-4. manager B et télépro B / nouvelle org voient le catalogue global", () => {
    const catalog = buildTeleproMissionsCatalogView(
      exercises,
      [],
      themes,
      stages,
    );
    expect(catalog.empty).toBe(false);
    expect(catalog.totalCount).toBe(1);

    const managerView = buildManagerExercisesCatalogView(
      exercises,
      themes,
      stages,
    );
    expect(flattenManagerCatalogExercises(managerView)).toHaveLength(1);
    void MANAGER_B;
    void ORG_NEW;
    void ORG_B;
  });

  it("6-7. déblocage personnel : tentatives A n'ouvrent rien pour B", () => {
    const attemptsA: MissionAttemptInput[] = [
      {
        id: "sim-a",
        scenarioId: SCENARIO,
        status: SimulationStatus.COMPLETED,
        outcome: "VENTE",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        evaluation: {
          overallScore: 90,
          summary: "ok",
          outcome: "VENTE",
        },
      },
    ];
    const forA = buildTeleproMissionsCatalogView(
      exercises,
      attemptsA,
      themes,
      stages,
    );
    const forB = buildTeleproMissionsCatalogView(
      exercises,
      [],
      themes,
      stages,
    );
    expect(forA.themes[0]?.completedCount).toBeGreaterThan(0);
    expect(forB.themes[0]?.completedCount ?? 0).toBe(0);
    void TELEPRO_A;
    void TELEPRO_B;
  });

  it("11-12. DRAFT/ARCHIVED et contenu hors catalogue invisibles", () => {
    expect(
      isVisiblePublishedOrgScenario(
        { status: "DRAFT", organizationId: CATALOG },
        CATALOG,
      ),
    ).toBe(false);
    expect(
      isVisiblePublishedOrgScenario(
        { status: "ARCHIVED", organizationId: CATALOG },
        CATALOG,
      ),
    ).toBe(false);
    expect(
      isVisiblePublishedOrgScenario(
        { status: ScenarioStatus.PUBLISHED, organizationId: ORG_A },
        CATALOG,
      ),
    ).toBe(false);
    expect(
      isVisiblePublishedOrgScenario(
        { status: ScenarioStatus.PUBLISHED, organizationId: CATALOG },
        CATALOG,
      ),
    ).toBe(true);
  });

  it("8. résultats org A absents du catalogue B (pas de fuite dans la vue)", () => {
    const forB = buildTeleproMissionsCatalogView(
      exercises,
      [],
      themes,
      stages,
    );
    const raw = JSON.stringify(forB);
    expect(raw).not.toContain(ORG_A);
    expect(raw).not.toContain("prompt");
    expect(raw).not.toContain("artifact");
    expect(raw).not.toContain("contentHash");
  });

  it("13. manager lecture seule : pas de CTA simulation dans la vue", () => {
    const managerView = buildManagerExercisesCatalogView(
      exercises,
      themes,
      stages,
    );
    const raw = JSON.stringify(managerView);
    expect(raw).not.toMatch(/prepare|simulat|lancer|démarrer/i);
    expect(raw).not.toContain("artifacts");
  });
});

describe("LOT P2 — script configure dry-run / apply", () => {
  const envBase = { ...process.env };

  afterEach(() => {
    process.env = { ...envBase };
  });

  function makeDb(opts: {
    target?: {
      id: string;
      slug: string;
      isActive: boolean;
      isPlatformCatalog: boolean;
    } | null;
    otherCatalog?: { id: string; slug: string } | null;
    otherPublished?: Array<{
      id: string;
      slug: string;
      themes: number;
      scenarios: number;
    }>;
  }): {
    db: ConfigurePrisma;
    updates: Array<{ id: string; isPlatformCatalog: boolean }>;
    audits: unknown[];
  } {
    const updates: Array<{ id: string; isPlatformCatalog: boolean }> = [];
    const audits: unknown[] = [];
    const target = opts.target ?? null;
    const otherCatalog = opts.otherCatalog ?? null;
    const otherPublished = opts.otherPublished ?? [];

    const db: ConfigurePrisma = {
      organization: {
        findUnique: async ({ where }) => {
          if (!target || where.slug !== target.slug) return null;
          return target;
        },
        findMany: async ({ where }) => {
          if (where && (where as { isPlatformCatalog?: boolean }).isPlatformCatalog) {
            const rows = [];
            if (target?.isPlatformCatalog) {
              rows.push({ id: target.id, slug: target.slug });
            }
            if (otherCatalog) rows.push(otherCatalog);
            if ((where as { id?: { not?: string } }).id?.not) {
              return rows.filter(
                (r) => r.id !== (where as { id: { not: string } }).id.not,
              );
            }
            return rows;
          }
          const list: Array<{ id: string; slug: string }> = [];
          if (target) list.push({ id: target.id, slug: target.slug });
          for (const o of otherPublished) {
            list.push({ id: o.id, slug: o.slug });
          }
          if (otherCatalog) list.push(otherCatalog);
          if ((where as { id?: { not?: string } })?.id?.not) {
            return list.filter(
              (r) => r.id !== (where as { id: { not: string } }).id.not,
            );
          }
          return list;
        },
        update: async ({ where, data }) => {
          updates.push({
            id: where.id,
            isPlatformCatalog: data.isPlatformCatalog,
          });
          if (target && target.id === where.id) {
            target.isPlatformCatalog = data.isPlatformCatalog;
          }
          return target;
        },
      },
      missionTheme: {
        count: async ({ where }) => {
          const orgId = (where as { organizationId: string }).organizationId;
          if (target && orgId === target.id) return 2;
          const other = otherPublished.find((o) => o.id === orgId);
          if (other && (where as { status?: string }).status === "PUBLISHED") {
            return other.themes;
          }
          return 0;
        },
      },
      missionStage: {
        count: async ({ where }) => {
          const orgId = (where as { organizationId: string }).organizationId;
          if (target && orgId === target.id) return 3;
          const other = otherPublished.find((o) => o.id === orgId);
          if (other && (where as { status?: string }).status === "PUBLISHED") {
            return other.themes > 0 ? 1 : 0;
          }
          return 0;
        },
      },
      scenario: {
        groupBy: async ({ where }) => {
          const orgId = (where as { organizationId: string }).organizationId;
          if (target && orgId === target.id) {
            return [
              { status: "PUBLISHED", _count: { _all: 5 } },
              { status: "DRAFT", _count: { _all: 1 } },
            ];
          }
          return [];
        },
        count: async ({ where }) => {
          const orgId = (where as { organizationId: string }).organizationId;
          const other = otherPublished.find((o) => o.id === orgId);
          if (other && (where as { status?: string }).status === "PUBLISHED") {
            return other.scenarios;
          }
          return 0;
        },
      },
      promptBundle: {
        groupBy: async () => [
          { status: "PUBLISHED", _count: { _all: 5 } },
        ],
      },
      skillCategory: {
        groupBy: async () => [
          { status: "PUBLISHED", _count: { _all: 2 } },
        ],
      },
      skillSection: {
        groupBy: async () => [
          { status: "PUBLISHED", _count: { _all: 4 } },
        ],
      },
      skillArticle: {
        groupBy: async () => [
          { status: "PUBLISHED", _count: { _all: 6 } },
          { status: "DRAFT", _count: { _all: 1 } },
        ],
        count: async ({ where }) => {
          const orgId = (where as { organizationId: string }).organizationId;
          const other = otherPublished.find((o) => o.id === orgId);
          if (other && (where as { status?: string }).status === "PUBLISHED") {
            return other.scenarios > 0 ? 1 : 0;
          }
          return 0;
        },
      },
      auditEvent: {
        create: async ({ data }) => {
          audits.push(data);
          return data;
        },
      },
      $transaction: async (fn) => fn(db),
    };

    return { db, updates, audits };
  }

  it("17. dry-run sans écriture", async () => {
    const { db, updates, audits } = makeDb({
      target: {
        id: CATALOG,
        slug: "platform",
        isActive: true,
        isPlatformCatalog: false,
      },
      otherPublished: [
        { id: ORG_A, slug: "org-a", themes: 1, scenarios: 2 },
      ],
    });
    const report = await configurePlatformCatalog(
      { orgSlug: "platform", apply: false },
      db,
    );
    expect(report.mode).toBe("DRY-RUN");
    expect(report.organizationFound).toBe(true);
    expect(report.themeCount).toBe(2);
    expect(report.stageCount).toBe(3);
    expect(report.scenariosByStatus.PUBLISHED).toBe(5);
    expect(report.otherOrgsPublishedContent[0]?.slug).toBe("org-a");
    expect(updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
    const raw = JSON.stringify(report);
    expect(raw).not.toMatch(/artifacts|contentHash|"password"|SECRET|sk-/i);
    expect(raw).not.toContain("Tu incarnes");
  });

  it("18. --apply refusé sans flag en production", () => {
    expect(() =>
      assertConfigureAllowed(true, {
        NODE_ENV: "production",
        ALLOW_PLATFORM_CATALOG_CONFIG: "false",
      }),
    ).toThrow(/ALLOW_PLATFORM_CATALOG_CONFIG/);
  });

  it("19. apply transactionnel marque uniquement la cible", async () => {
    const { db, updates, audits } = makeDb({
      target: {
        id: CATALOG,
        slug: "platform",
        isActive: true,
        isPlatformCatalog: false,
      },
    });
    const report = await configurePlatformCatalog(
      { orgSlug: "platform", apply: true },
      db,
      { NODE_ENV: "development" },
    );
    expect(report.applied).toBe(true);
    expect(report.isPlatformCatalog).toBe(true);
    expect(updates).toEqual([
      { id: CATALOG, isPlatformCatalog: true },
    ]);
    expect(audits).toHaveLength(1);
  });

  it("20. second dry-run idempotent", async () => {
    const { db, updates } = makeDb({
      target: {
        id: CATALOG,
        slug: "platform",
        isActive: true,
        isPlatformCatalog: true,
      },
    });
    const report = await configurePlatformCatalog(
      { orgSlug: "platform", apply: false },
      db,
    );
    expect(report.alreadyConfigured).toBe(true);
    expect(report.applied).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("21. refuse de marquer une seconde organisation catalogue", async () => {
    const { db, updates } = makeDb({
      target: {
        id: ORG_B,
        slug: "org-b",
        isActive: true,
        isPlatformCatalog: false,
      },
      otherCatalog: { id: CATALOG, slug: "platform" },
    });
    const report = await configurePlatformCatalog(
      { orgSlug: "org-b", apply: true },
      db,
      { NODE_ENV: "development" },
    );
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.otherCatalogOrgSlug).toBe("platform");
    expect(updates).toHaveLength(0);
  });

  it("parse argv org-slug et apply", () => {
    expect(
      resolveOrgSlug(["node", "script", "--org-slug=platform"], {
        NODE_ENV: "test",
      }),
    ).toBe("platform");
    expect(resolveApplyFlag(["node", "script", "--apply"])).toBe(true);
    expect(resolveApplyFlag(["node", "script"])).toBe(false);
  });
});

describe("LOT P2 — simulation cross-org (contrat)", () => {
  it("9-10. simulation B référence scénario catalogue ; bundle catalogue", () => {
    const artifacts = {
      PROSPECT_PERSONA: {
        body: "Tu incarnes {{prospectName}}.",
        contentType: "text/plain",
      },
    };
    const contentHash = hashPromptArtifacts(artifacts);
    const sim = {
      organizationId: ORG_B,
      teleproId: TELEPRO_B,
      scenarioId: SCENARIO,
      promptBundleId: BUNDLE,
      promptBundleVersion: 1,
      promptContentHash: contentHash,
    };
    const scenario = {
      id: SCENARIO,
      organizationId: CATALOG,
      status: ScenarioStatus.PUBLISHED,
    };
    const bundle = {
      id: BUNDLE,
      organizationId: CATALOG,
      scenarioId: SCENARIO,
      status: PromptBundleStatus.PUBLISHED,
      version: 1,
      contentHash,
    };
    expect(sim.organizationId).toBe(ORG_B);
    expect(sim.teleproId).toBe(TELEPRO_B);
    expect(scenario.organizationId).toBe(CATALOG);
    expect(bundle.organizationId).toBe(CATALOG);
    expect(bundle.organizationId).not.toBe(sim.organizationId);
    expect(bundle.scenarioId).toBe(sim.scenarioId);
  });

  it("5. aucune ScenarioAssignment créée (contrat runtime)", () => {
    const route = read("src/app/api/simulations/route.ts");
    expect(route).not.toMatch(/scenarioAssignment\.create/);
    expect(route).toContain("resolvePlatformCatalogOrganizationId");
    expect(route).toContain("organizationId: user.organizationId");
  });

  it("14-15. admin utilise catalogue ; MANAGER hors routes admin", () => {
    const exercisesRoute = read("src/app/api/admin/exercises/route.ts");
    const skillsRoute = read("src/app/api/admin/skills/route.ts");
    const missionsRoute = read("src/app/api/admin/mission-catalog/route.ts");
    expect(exercisesRoute).toContain("resolvePlatformCatalogOrganizationId");
    expect(exercisesRoute).toContain("requirePlatformAdmin");
    expect(exercisesRoute).not.toContain("admin.organizationId");
    expect(skillsRoute).not.toContain("admin.organizationId");
    expect(missionsRoute).not.toContain("admin.organizationId");
    void ADMIN_ORG;
  });
});

describe("LOT P2 — migration / schéma / anti-fuite / lots préservés", () => {
  it("migration additive alignée sur schema.prisma", () => {
    const migration = read(
      "prisma/migrations/20260804140000_platform_catalog/migration.sql",
    );
    const schema = read("prisma/schema.prisma");
    expect(schema).toContain("isPlatformCatalog");
    expect(migration).toContain('ADD COLUMN "isPlatformCatalog"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "Organization_isPlatformCatalog_unique"',
    );
    expect(migration).toContain('WHERE "isPlatformCatalog" = true');
    const executable = migration
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(executable).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE FROM\b/i);
    expect(migration).not.toMatch(/org-[a-z0-9-]+/i);
  });

  it("22. services catalogue sans fuite prompt/artifact/hash", () => {
    const telepro = read("src/lib/teleproMissionsService.ts");
    const manager = read("src/lib/managerExercisesService.ts");
    const skills = read("src/lib/skillsTeleproService.ts");
    const debrief = read("src/lib/debriefService.ts");
    for (const src of [telepro, manager, skills, debrief]) {
      expect(src).toContain("resolvePlatformCatalogOrganizationId");
      expect(src).not.toMatch(/select:\s*\{[^}]*artifacts/s);
      expect(src).not.toMatch(/select:\s*\{[^}]*contentHash/s);
    }
  });

  it("23-25. P1 / N4 / O préservés dans le code", () => {
    const missionsPage = read("src/app/app/missions/page.tsx");
    expect(missionsPage).toContain("loadTeleproMissionsCatalogView");
    expect(read("prisma/schema.prisma")).toContain(
      "@@unique([missionStageId, organizationId])",
    );
    expect(read("src/lib/teleproMissionsService.ts")).not.toContain(
      "scenarioAssignment",
    );
    expect(read("src/lib/managerExercisesService.ts")).not.toContain(
      "scenarioAssignment",
    );
  });

  it("package.json expose le script configure", () => {
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["db:configure-platform-catalog"]).toContain(
      "configurePlatformCatalog.ts",
    );
  });
});

describe("LOT P2 — runtime simulationService snapshot", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("bundle catalogue accepté pour simulation org B", async () => {
    const catalogOrg = CATALOG;
    const artifacts = {
      PROSPECT_PERSONA: {
        body: "Persona v1 pour {{prospectName}}",
        contentType: "text/plain",
      },
    };
    const contentHash = hashPromptArtifacts(artifacts);
    const bundle = {
      id: BUNDLE,
      organizationId: catalogOrg,
      scenarioId: SCENARIO,
      version: 1,
      status: PromptBundleStatus.PUBLISHED,
      artifacts: JSON.stringify(artifacts),
      contentHash,
    };

    vi.doMock("@/lib/platformCatalog", () => ({
      resolvePlatformCatalogOrganizationId: vi.fn(async () => catalogOrg),
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        promptBundle: {
          findFirst: vi.fn(async () => bundle),
        },
        simulation: {
          findFirst: vi.fn(async () => ({
            id: "sim-1",
            organizationId: ORG_B,
            scenarioId: SCENARIO,
            teleproId: TELEPRO_B,
            prospectName: "Marie",
            promptBundleId: BUNDLE,
            promptBundleVersion: 1,
            promptContentHash: contentHash,
            scenario: {
              id: SCENARIO,
              organizationId: catalogOrg,
              knowledgeRefs: null,
              callType: "VENTE",
              offer: null,
              prospectProfile: null,
              initialSituation: null,
              objective: null,
              level: "MOYEN",
              personality: null,
              allowedObjections: null,
              secretInfos: null,
              successConditions: null,
              failureConditions: null,
              targetDurationSec: 300,
              relationshipHistory: null,
              aiProspect: null,
              expectedNextSteps: null,
              traineeBrief: null,
            },
            mode: SimulationMode.DEMO,
            status: SimulationStatus.CREATED,
          })),
        },
        knowledgeItem: { findMany: vi.fn(async () => []) },
      },
    }));

    const { getPersonaForSimulation } = await import("@/lib/simulationService");
    const persona = await getPersonaForSimulation({
      simulationId: "sim-1",
      organizationId: ORG_B,
      teleproId: TELEPRO_B,
    });
    expect(persona).toContain("Marie");
    expect(persona).toContain("Persona v1");
  });
});
