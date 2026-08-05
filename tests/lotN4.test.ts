import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  ExerciseMissionStatus,
  LEGACY_THEME_NAME,
  LEGACY_THEME_SLUG,
  buildTeleproMissionsCatalogView,
  isReadyCatalogExercise,
  legacyStageSlug,
  type MissionAttemptInput,
  type MissionExerciseInput,
  type MissionStageInput,
  type MissionThemeInput,
} from "@/lib/teleproMissions";
import { SimulationStatus } from "@/lib/enums";
import {
  buildMissionLevelReadiness,
  type MissionStageNode,
} from "@/lib/missionCatalog";
import { collectOccupiedStageIds, isStageSelectable } from "@/lib/adminExercisesUi";

const ROOT = process.cwd();
const N1_MIGRATION = "20260803112000_mission_catalog";
const N4_MIGRATION = "20260804100000_mission_stage_single_scenario";

function read(...segments: string[]) {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

const ORG = "org-1";

function readyExercise(
  overrides: Partial<MissionExerciseInput> & Pick<MissionExerciseInput, "id" | "name">,
): MissionExerciseInput {
  return {
    missionLevel: 1,
    sortOrder: 0,
    level: "MOYEN",
    objective: "RDV",
    prospectProfile: "DRH",
    personality: "Direct",
    successConditions: "ok",
    targetDurationSec: 300,
    status: "PUBLISHED",
    organizationId: ORG,
    missionStageId: null,
    prospectAvatarKey: "lena",
    hasPublishedPrompt: true,
    ...overrides,
  };
}

function attempt(
  overrides: Partial<MissionAttemptInput> &
    Pick<MissionAttemptInput, "id" | "scenarioId" | "status">,
): MissionAttemptInput {
  return {
    outcome: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    evaluation: null,
    ...overrides,
  };
}

function theme(
  overrides: Partial<MissionThemeInput> & Pick<MissionThemeInput, "id" | "slug" | "name">,
): MissionThemeInput {
  return {
    description: null,
    iconKey: "target",
    sortOrder: 0,
    status: "PUBLISHED",
    ...overrides,
  };
}

function stage(
  overrides: Partial<MissionStageInput> &
    Pick<MissionStageInput, "id" | "themeId" | "slug" | "name">,
): MissionStageInput {
  return {
    description: null,
    levelNumber: 1,
    sortOrder: 0,
    status: "PUBLISHED",
    ...overrides,
  };
}

function emptyReadiness(themeStatus = "DRAFT") {
  return buildMissionLevelReadiness({ themeStatus, exercise: null });
}

type ThemeRow = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  iconKey: string;
  sortOrder: number;
  status: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
};

type StageRow = {
  id: string;
  organizationId: string;
  themeId: string;
  name: string;
  slug: string;
  description: string | null;
  levelNumber: number;
  sortOrder: number;
  status: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
};

type ScenarioRow = {
  id: string;
  organizationId: string;
  missionStageId: string | null;
  name: string;
  status: string;
  prospectAvatarKey: string | null;
  personality: string | null;
  publishedPromptBundleId: string | null;
  publishedPromptBundleStatus: string | null;
};

let themes: ThemeRow[] = [];
let stages: StageRow[] = [];
let scenarios: ScenarioRow[] = [];
let seq = 0;
let forceP2002OnScenarioUpdate = false;

function uid(prefix: string) {
  return `${prefix}-${++seq}`;
}

function matches(row: Record<string, unknown>, where?: Record<string, unknown>) {
  if (!where) return true;
  for (const [key, expected] of Object.entries(where)) {
    if (expected == null) {
      if (row[key] != null) return false;
      continue;
    }
    if (typeof expected === "object" && expected !== null && "not" in expected) {
      if (row[key] === (expected as { not: unknown }).not) return false;
      continue;
    }
    if (row[key] !== expected) return false;
  }
  return true;
}

function projectScenario(s: ScenarioRow) {
  return {
    id: s.id,
    name: s.name,
    status: s.status,
    prospectAvatarKey: s.prospectAvatarKey,
    personality: s.personality,
    publishedPromptBundleId: s.publishedPromptBundleId,
    missionStageId: s.missionStageId,
    publishedPromptBundle:
      s.publishedPromptBundleId && s.publishedPromptBundleStatus
        ? { id: s.publishedPromptBundleId, status: s.publishedPromptBundleStatus }
        : null,
  };
}

vi.mock("@/lib/db", () => {
  const missionThemeApi = {
    findFirst: async ({ where }: { where?: Record<string, unknown> }) =>
      themes.find((t) => matches(t, where)) ?? null,
    findMany: async ({ where }: { where?: Record<string, unknown> }) =>
      themes.filter((t) => matches(t, where)),
    count: async ({ where }: { where?: Record<string, unknown> }) =>
      themes.filter((t) => matches(t, where)).length,
    create: async ({ data }: { data: Partial<ThemeRow> }) => {
      const row: ThemeRow = {
        id: uid("theme"),
        organizationId: data.organizationId!,
        name: data.name!,
        slug: data.slug!,
        description: data.description ?? null,
        iconKey: data.iconKey ?? "target",
        sortOrder: data.sortOrder ?? 0,
        status: data.status ?? "DRAFT",
        createdById: data.createdById ?? null,
        createdAt: data.createdAt!,
        updatedAt: data.updatedAt!,
        publishedAt: data.publishedAt ?? null,
        archivedAt: data.archivedAt ?? null,
      };
      themes.push(row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<ThemeRow>;
    }) => {
      const idx = themes.findIndex((t) => t.id === where.id);
      themes[idx] = { ...themes[idx]!, ...data };
      return themes[idx];
    },
    delete: async ({ where }: { where: { id: string } }) => {
      themes = themes.filter((t) => t.id !== where.id);
      return { id: where.id };
    },
  };

  const missionStageApi = {
    findFirst: async ({ where }: { where?: Record<string, unknown> }) =>
      stages.find((s) => matches(s, where)) ?? null,
    findMany: async ({ where }: { where?: Record<string, unknown> }) =>
      stages.filter((s) => matches(s, where)),
    count: async ({ where }: { where?: Record<string, unknown> }) =>
      stages.filter((s) => matches(s, where)).length,
    create: async ({ data }: { data: Partial<StageRow> }) => {
      const row: StageRow = {
        id: uid("stage"),
        organizationId: data.organizationId!,
        themeId: data.themeId!,
        name: data.name!,
        slug: data.slug!,
        description: data.description ?? null,
        levelNumber: data.levelNumber ?? 1,
        sortOrder: data.sortOrder ?? 0,
        status: data.status ?? "DRAFT",
        createdById: data.createdById ?? null,
        createdAt: data.createdAt!,
        updatedAt: data.updatedAt!,
        publishedAt: data.publishedAt ?? null,
        archivedAt: data.archivedAt ?? null,
      };
      stages.push(row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<StageRow>;
    }) => {
      const idx = stages.findIndex((s) => s.id === where.id);
      stages[idx] = { ...stages[idx]!, ...data };
      return stages[idx];
    },
    delete: async ({ where }: { where: { id: string } }) => {
      stages = stages.filter((s) => s.id !== where.id);
      return { id: where.id };
    },
  };

  const scenarioApi = {
    count: async ({ where }: { where?: Record<string, unknown> }) =>
      scenarios.filter((s) =>
        matches(s as unknown as Record<string, unknown>, where),
      ).length,
    findFirst: async ({ where }: { where?: Record<string, unknown> }) => {
      const found = scenarios.find((s) =>
        matches(s as unknown as Record<string, unknown>, where),
      );
      return found ? projectScenario(found) : null;
    },
    findMany: async ({ where }: { where?: Record<string, unknown> }) =>
      scenarios
        .filter((s) => matches(s as unknown as Record<string, unknown>, where))
        .map(projectScenario),
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<ScenarioRow>;
    }) => {
      if (forceP2002OnScenarioUpdate) {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint", {
          code: "P2002",
          clientVersion: "test",
        });
      }
      const idx = scenarios.findIndex((s) => s.id === where.id);
      scenarios[idx] = { ...scenarios[idx]!, ...data };
      return projectScenario(scenarios[idx]!);
    },
    groupBy: async () => [],
  };

  return {
    prisma: {
      missionTheme: missionThemeApi,
      missionStage: missionStageApi,
      scenario: scenarioApi,
      $transaction: async (
        fn: (tx: { scenario: typeof scenarioApi }) => Promise<unknown>,
      ) => fn({ scenario: scenarioApi }),
    },
  };
});

vi.mock("@/lib/audit", () => ({
  logAudit: async () => undefined,
}));

beforeEach(() => {
  themes = [];
  stages = [];
  scenarios = [];
  seq = 0;
  forceP2002OnScenarioUpdate = false;
  vi.clearAllMocks();
});

async function catalogSvc() {
  return import("@/lib/missionCatalogAdminService");
}

function seedReadyScenario(overrides: Partial<ScenarioRow> = {}): ScenarioRow {
  const row: ScenarioRow = {
    id: uid("ex"),
    organizationId: "org1",
    missionStageId: null,
    name: "Exercice pret",
    status: "PUBLISHED",
    prospectAvatarKey: "lena",
    personality: "Direct et presse",
    publishedPromptBundleId: "pb-1",
    publishedPromptBundleStatus: "PUBLISHED",
    ...overrides,
  };
  scenarios.push(row);
  return row;
}

describe("lot N4 — schema et migrations", () => {
  it("1. MissionStage.scenario est optionnel 1:1 (pas scenarios[])", () => {
    const schema = read("prisma", "schema.prisma");
    expect(schema).toMatch(/scenario\s+Scenario\?/);
    const stageBlock = schema.slice(
      schema.indexOf("model MissionStage"),
      schema.indexOf("@@unique([themeId, slug])"),
    );
    expect(stageBlock).toMatch(/scenario\s+Scenario\?/);
    expect(stageBlock).not.toMatch(/scenarios\s+Scenario\[\]/);
    expect(stageBlock).not.toMatch(/scenarios\s+/);
  });

  it("2. migration N4 existe ; N1 inchangee (MissionTheme, pas d unicite Scenario)", () => {
    const n4Path = join(ROOT, "prisma", "migrations", N4_MIGRATION, "migration.sql");
    expect(existsSync(n4Path)).toBe(true);
    const n1 = read("prisma", "migrations", N1_MIGRATION, "migration.sql");
    expect(n1).toContain('CREATE TABLE "MissionTheme"');
    expect(n1).toContain('CREATE TABLE "MissionStage"');
    expect(n1).not.toContain("Scenario_missionStageId_organizationId_key");
    expect(n1).not.toContain(
      'CREATE UNIQUE INDEX "Scenario_missionStageId_organizationId_key"',
    );
  });

  it("3. index unique N4 + @@unique schema", () => {
    const n4 = read("prisma", "migrations", N4_MIGRATION, "migration.sql");
    expect(n4).toContain(
      'CREATE UNIQUE INDEX "Scenario_missionStageId_organizationId_key"',
    );
    const schema = read("prisma", "schema.prisma");
    expect(schema).toContain("@@unique([missionStageId, organizationId])");
  });

  it("4. N4 documente NULL / garde doublons / aucun seed UPDATE INSERT", () => {
    const n4 = read("prisma", "migrations", N4_MIGRATION, "migration.sql");
    const upper = n4
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .toUpperCase();
    expect(n4.toLowerCase()).toMatch(/null/);
    expect(n4).toMatch(/doublon/i);
    expect(n4).toContain("RAISE EXCEPTION");
    expect(upper).not.toContain("INSERT ");
    expect(upper).not.toContain("UPDATE ");
    // Commentaire explicite : aucun seed (le mot peut apparaitre en negation).
    expect(n4.toLowerCase()).toMatch(/aucun seed/);
    expect(upper).not.toMatch(/INSERT[\s\S]{0,40}SEED|SEED[\s\S]{0,40}INSERT/);
  });
});

describe("lot N4 — association 1:1 et publication (mocks)", () => {
  it("5. second exercice sur le meme niveau → 409", async () => {
    const s = await catalogSvc();
    const themeRow = await s.createMissionTheme("org1", "admin1", {
      name: "Closing",
    });
    const stageRow = await s.createMissionStage("org1", "admin1", {
      themeId: themeRow.id,
      name: "Niveau 1",
    });
    const first = seedReadyScenario({ missionStageId: stageRow.id });
    const second = seedReadyScenario({ id: "ex-second", name: "Autre" });
    expect(first.missionStageId).toBe(stageRow.id);
    await expect(
      s.assignExerciseToStage(stageRow.id, "org1", "admin1", second.id),
    ).rejects.toMatchObject({
      status: 409,
      message: "Ce niveau contient déjà un exercice.",
    });
  });

  it("6. association inter-org refusee 404", async () => {
    const s = await catalogSvc();
    const themeRow = await s.createMissionTheme("org1", "admin1", {
      name: "Closing",
    });
    const stageRow = await s.createMissionStage("org1", "admin1", {
      themeId: themeRow.id,
      name: "Niveau 1",
    });
    seedReadyScenario({
      id: "ex-foreign",
      organizationId: "org2",
      name: "Etranger",
    });
    await expect(
      s.assignExerciseToStage(stageRow.id, "org1", "admin1", "ex-foreign"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("7. P2002 → 409 message niveau occupe", async () => {
    const s = await catalogSvc();
    const themeRow = await s.createMissionTheme("org1", "admin1", {
      name: "Closing",
    });
    const stageRow = await s.createMissionStage("org1", "admin1", {
      themeId: themeRow.id,
      name: "Niveau 1",
    });
    const ex = seedReadyScenario({ missionStageId: null });
    forceP2002OnScenarioUpdate = true;
    await expect(
      s.assignExerciseToStage(stageRow.id, "org1", "admin1", ex.id),
    ).rejects.toMatchObject({
      status: 409,
      message: "Ce niveau contient déjà un exercice.",
    });
  });

  it("8. niveau DRAFT sans exercice autorise (exerciseCount 0)", async () => {
    const s = await catalogSvc();
    const themeRow = await s.createMissionTheme("org1", "admin1", {
      name: "Closing",
    });
    const stageRow = await s.createMissionStage("org1", "admin1", {
      themeId: themeRow.id,
      name: "Niveau vide",
    });
    expect(stageRow.status).toBe("DRAFT");
    expect(stageRow.exerciseCount).toBe(0);
    expect(stageRow.exercise).toBeNull();
  });

  it("9. publication d un niveau vide refusee", async () => {
    const s = await catalogSvc();
    const themeRow = await s.createMissionTheme("org1", "admin1", {
      name: "Closing",
    });
    await s.publishMissionTheme(themeRow.id, "org1", "admin1");
    const stageRow = await s.createMissionStage("org1", "admin1", {
      themeId: themeRow.id,
      name: "Niveau vide",
    });
    await expect(
      s.publishMissionStage(stageRow.id, "org1", "admin1"),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      s.publishMissionStage(stageRow.id, "org1", "admin1"),
    ).rejects.toThrow(/Aucun exercice associé/);
  });

  it("10. publication refusee si scenario/avatar/personnalite/prompt manquant", async () => {
    const s = await catalogSvc();
    const themeRow = await s.createMissionTheme("org1", "admin1", {
      name: "Closing",
    });
    await s.publishMissionTheme(themeRow.id, "org1", "admin1");
    const stageRow = await s.createMissionStage("org1", "admin1", {
      themeId: themeRow.id,
      name: "Niveau 1",
    });
    seedReadyScenario({
      missionStageId: stageRow.id,
      status: "DRAFT",
      prospectAvatarKey: null,
      personality: "  ",
      publishedPromptBundleId: null,
      publishedPromptBundleStatus: null,
    });
    await expect(
      s.publishMissionStage(stageRow.id, "org1", "admin1"),
    ).rejects.toThrow(/Exercice non publié|Avatar manquant|Personnalité|PromptBundle/);
  });
});

describe("lot N4 — catalogue telepro dynamique", () => {
  it("11-12. aucun MAX_THEMES=5 ni plafond 7 niveaux hardcode (src allowlist)", () => {
    const allowlist = [
      "src/lib/missionCatalog.ts",
      "src/lib/missionCatalogAdminService.ts",
      "src/lib/teleproMissions.ts",
      "src/lib/teleproMissionsService.ts",
      "src/lib/missionsPath.ts",
      "src/app/admin/missions/page.tsx",
      "src/app/app/missions/page.tsx",
      "src/app/app/missions/MissionsPath.tsx",
      "src/app/app/missions/[themeSlug]/page.tsx",
    ];
    for (const rel of allowlist) {
      const src = read(...rel.split("/"));
      expect(src).not.toMatch(/MAX_THEMES\s*=\s*5/);
      expect(src).not.toMatch(/MAX_LEVELS?\s*=\s*7/);
      expect(src).not.toMatch(/maxThemes\s*=\s*5/i);
      expect(src).not.toMatch(/maxLevels?\s*=\s*7/i);
      expect(src).not.toMatch(/for\s*\(\s*let\s+\w+\s*=\s*1\s*;\s*\w+\s*<=\s*7\s*;/);
    }
    expect(read("src", "lib", "missionCatalog.ts")).toContain("Aucun plafond métier");
    expect(read("src", "app", "admin", "missions", "page.tsx")).toContain(
      "pas de plafond",
    );
  });

  it("13. themes avec 1, 3, 7, 10 niveaux rendus dynamiquement", () => {
    for (const count of [1, 3, 7, 10]) {
      const themeId = `t-${count}`;
      const stagesLocal = Array.from({ length: count }, (_, i) =>
        stage({
          id: `s-${count}-${i + 1}`,
          themeId,
          slug: `n${i + 1}`,
          name: `Niveau ${i + 1}`,
          levelNumber: i + 1,
          sortOrder: i,
        }),
      );
      const exercises = stagesLocal.map((st, i) =>
        readyExercise({
          id: `e-${count}-${i + 1}`,
          name: `Ex ${i + 1}`,
          missionStageId: st.id,
          sortOrder: i,
        }),
      );
      const catalog = buildTeleproMissionsCatalogView(
        exercises,
        [],
        [theme({ id: themeId, slug: `theme-${count}`, name: `Theme ${count}` })],
        stagesLocal,
      );
      expect(catalog.themes).toHaveLength(1);
      expect(catalog.themes[0]!.stages).toHaveLength(count);
      expect(catalog.themes[0]!.exerciseCount).toBe(count);
    }
    const pathSrc = read("src", "app", "app", "missions", "MissionsPath.tsx");
    expect(pathSrc).toContain("theme.stages");
    expect(pathSrc).not.toMatch(/\.slice\s*\(\s*0\s*,\s*7\s*\)/);
  });

  it("14. tri deterministe levelNumber → sortOrder → name → id", () => {
    const catalog = buildTeleproMissionsCatalogView(
      [
        readyExercise({ id: "e-b", name: "B", missionStageId: "s-b" }),
        readyExercise({ id: "e-a", name: "A", missionStageId: "s-a" }),
        readyExercise({ id: "e-c", name: "C", missionStageId: "s-c" }),
        readyExercise({ id: "e-d", name: "D", missionStageId: "s-d" }),
      ],
      [],
      [theme({ id: "t1", slug: "t", name: "T" })],
      [
        stage({
          id: "s-d",
          themeId: "t1",
          slug: "d",
          name: "Zulu",
          levelNumber: 2,
          sortOrder: 0,
        }),
        stage({
          id: "s-c",
          themeId: "t1",
          slug: "c",
          name: "Beta",
          levelNumber: 2,
          sortOrder: 1,
        }),
        stage({
          id: "s-b",
          themeId: "t1",
          slug: "b",
          name: "Alpha",
          levelNumber: 2,
          sortOrder: 1,
        }),
        stage({
          id: "s-a",
          themeId: "t1",
          slug: "a",
          name: "Intro",
          levelNumber: 1,
          sortOrder: 9,
        }),
      ],
    );
    expect(catalog.themes[0]!.stages.map((s) => s.id)).toEqual([
      "s-a",
      "s-d",
      "s-b",
      "s-c",
    ]);
  });

  it("15. trous de numerotation non bloquants", () => {
    const catalog = buildTeleproMissionsCatalogView(
      [
        readyExercise({ id: "e1", name: "E1", missionStageId: "s1" }),
        readyExercise({ id: "e3", name: "E3", missionStageId: "s3" }),
      ],
      [
        attempt({
          id: "sim",
          scenarioId: "e1",
          status: SimulationStatus.COMPLETED,
          evaluation: { overallScore: 80, summary: null, outcome: null },
        }),
      ],
      [theme({ id: "t1", slug: "t", name: "T" })],
      [
        stage({
          id: "s1",
          themeId: "t1",
          slug: "n1",
          name: "N1",
          levelNumber: 1,
        }),
        stage({
          id: "s3",
          themeId: "t1",
          slug: "n3",
          name: "N3",
          levelNumber: 3,
        }),
      ],
    );
    expect(catalog.themes[0]!.stages[0]!.state).toBe("COMPLETED");
    expect(catalog.themes[0]!.stages[1]!.state).toBe("OPEN");
    expect(catalog.themes[0]!.stages[1]!.exercises[0]!.status).toBe(
      ExerciseMissionStatus.AVAILABLE,
    );
  });

  it("16. deblocage independant par theme", () => {
    const catalog = buildTeleproMissionsCatalogView(
      [
        readyExercise({ id: "a1", name: "A1", missionStageId: "sa1" }),
        readyExercise({ id: "b1", name: "B1", missionStageId: "sb1" }),
        readyExercise({ id: "b2", name: "B2", missionStageId: "sb2" }),
      ],
      [
        attempt({
          id: "sim",
          scenarioId: "a1",
          status: SimulationStatus.COMPLETED,
          evaluation: { overallScore: 80, summary: null, outcome: null },
        }),
      ],
      [
        theme({ id: "ta", slug: "a", name: "A", sortOrder: 1 }),
        theme({ id: "tb", slug: "b", name: "B", sortOrder: 2 }),
      ],
      [
        stage({
          id: "sa1",
          themeId: "ta",
          slug: "n1",
          name: "A1",
          levelNumber: 1,
        }),
        stage({
          id: "sb1",
          themeId: "tb",
          slug: "n1",
          name: "B1",
          levelNumber: 1,
        }),
        stage({
          id: "sb2",
          themeId: "tb",
          slug: "n2",
          name: "B2",
          levelNumber: 2,
        }),
      ],
    );
    expect(catalog.themes[0]!.stages[0]!.state).toBe("COMPLETED");
    expect(catalog.themes[1]!.stages[0]!.state).toBe("OPEN");
    expect(catalog.themes[1]!.stages[1]!.exercises[0]!.status).toBe(
      ExerciseMissionStatus.LOCKED,
    );
  });

  it("17. COMPLETED / IN_PROGRESS prioritaires sur LOCKED", () => {
    const catalog = buildTeleproMissionsCatalogView(
      [
        readyExercise({ id: "e1", name: "E1", missionStageId: "s1" }),
        readyExercise({ id: "e2", name: "E2", missionStageId: "s2" }),
      ],
      [
        attempt({
          id: "sim-done",
          scenarioId: "e2",
          status: SimulationStatus.COMPLETED,
          evaluation: { overallScore: 80, summary: null, outcome: null },
        }),
        attempt({
          id: "sim-active",
          scenarioId: "e1",
          status: SimulationStatus.IN_PROGRESS,
        }),
      ],
      [theme({ id: "t1", slug: "t", name: "T" })],
      [
        stage({
          id: "s1",
          themeId: "t1",
          slug: "n1",
          name: "N1",
          levelNumber: 1,
        }),
        stage({
          id: "s2",
          themeId: "t1",
          slug: "n2",
          name: "N2",
          levelNumber: 2,
        }),
      ],
    );
    expect(catalog.themes[0]!.stages[0]!.exercises[0]!.status).toBe(
      ExerciseMissionStatus.IN_PROGRESS,
    );
    expect(catalog.themes[0]!.stages[1]!.exercises[0]!.status).toBe(
      ExerciseMissionStatus.PASSED,
    );
    expect(catalog.themes[0]!.stages[1]!.state).not.toBe("LOCKED");
  });

  it("23. niveau incomplet invisible cote service telepro", () => {
    expect(isReadyCatalogExercise(readyExercise({ id: "ok", name: "OK" }))).toBe(
      true,
    );
    expect(
      isReadyCatalogExercise(
        readyExercise({ id: "no-av", name: "X", prospectAvatarKey: null }),
      ),
    ).toBe(false);
    expect(
      isReadyCatalogExercise(
        readyExercise({ id: "no-pers", name: "X", personality: "  " }),
      ),
    ).toBe(false);
    expect(
      isReadyCatalogExercise(
        readyExercise({
          id: "no-prompt",
          name: "X",
          hasPublishedPrompt: false,
        }),
      ),
    ).toBe(false);
    const svc = read("src", "lib", "teleproMissionsService.ts");
    expect(svc).toContain("isReadyCatalogExercise");
    expect(svc).toContain("hasPublishedPrompt");
  });

  it("24. theme vide invisible", () => {
    const catalog = buildTeleproMissionsCatalogView(
      [],
      [],
      [theme({ id: "t-empty", slug: "empty", name: "Vide" })],
      [
        stage({
          id: "s-empty",
          themeId: "t-empty",
          slug: "n1",
          name: "N1",
          levelNumber: 1,
        }),
      ],
    );
    expect(catalog.themes).toHaveLength(0);
    expect(catalog.empty).toBe(true);
  });

  it("25. parcours existant : un noeud synthetique par exercice", () => {
    const catalog = buildTeleproMissionsCatalogView(
      [
        readyExercise({
          id: "u1",
          name: "U1",
          missionLevel: 1,
          missionStageId: null,
        }),
        readyExercise({
          id: "u3",
          name: "U3",
          missionLevel: 3,
          missionStageId: null,
        }),
      ],
      [],
      [],
      [],
    );
    const legacy = catalog.themes.find((t) => t.isLegacy)!;
    expect(legacy.name).toBe(LEGACY_THEME_NAME);
    expect(legacy.slug).toBe(LEGACY_THEME_SLUG);
    expect(legacy.stages).toHaveLength(2);
    expect(legacy.stages.map((s) => s.levelNumber)).toEqual([1, 2]);
    expect(legacy.stages[0]!.slug).toBe(legacyStageSlug("u1"));
    expect(legacy.stages[1]!.slug).toBe(legacyStageSlug("u3"));
    expect(legacy.stages[0]!.exercises).toHaveLength(1);
    expect(legacy.stages[1]!.exercises).toHaveLength(1);
  });
});

describe("lot N4 — UI source Missions / admin", () => {
  it("18-21. page theme = MissionsPath / portraits ; accessible → prepare ; verrouille sans lien", () => {
    const themePage = read(
      "src",
      "app",
      "app",
      "missions",
      "[themeSlug]",
      "page.tsx",
    );
    expect(themePage).toContain("MissionsPath");
    expect(themePage).toContain("<MissionsPath theme={theme} />");
    expect(themePage).not.toMatch(/stages\.map\([\s\S]*href=\{`\/app\/missions/);
    expect(themePage.toLowerCase()).not.toContain("carte de phase");

    const pathSrc = read("src", "app", "app", "missions", "MissionsPath.tsx");
    expect(pathSrc).toContain("ProspectAvatar");
    expect(pathSrc).toContain("prepareHref");
    // Q2 : le clic suit le CTA du moteur (reprise/analyse/preparation), pas prepareHref seul.
    expect(pathSrc).toContain("exercise.ctaHref");
    expect(pathSrc).toContain("isLaunchableNode");
    expect(pathSrc).toContain("href ?");
    expect(pathSrc).toContain("cartes phase");

    const missionsPathLib = read("src", "lib", "missionsPath.ts");
    expect(missionsPathLib).toContain("isLaunchableNode");
    expect(missionsPathLib).toContain("ExerciseMissionStatus.LOCKED");
    expect(pathSrc).toMatch(/LOCKED[\s\S]*null|null[\s\S]*LOCKED|avatarKey=\{null\}/);
  });

  it("19. pas de liste cartes exercices / phases sur la page theme", () => {
    const themePage = read(
      "src",
      "app",
      "app",
      "missions",
      "[themeSlug]",
      "page.tsx",
    );
    expect(themePage).not.toContain("theme.stages.map");
    expect(themePage).not.toContain("/exercices");
    expect(themePage).toContain("MissionsPath");
  });

  it("22. route stage historique redirige sans contourner le verrou", () => {
    const stagePage = read(
      "src",
      "app",
      "app",
      "missions",
      "[themeSlug]",
      "[stageSlug]",
      "page.tsx",
    );
    expect(stagePage).toContain("notFound");
    expect(stagePage).toContain("redirect");
    expect(stagePage).toContain("/app/prepare/");
    expect(stagePage).toContain("`/app/missions/${theme.slug}`");
    expect(stagePage).toContain("ExerciseMissionStatus.LOCKED");
    expect(stagePage).not.toContain("MissionsPath");
  });

  it("26. pas de fuite prompt/artifact/hash dans serialisation admin", () => {
    const readiness = buildMissionLevelReadiness({
      themeStatus: "PUBLISHED",
      exercise: {
        id: "ex-1",
        name: "Demo",
        status: "PUBLISHED",
        prospectAvatarKey: "lena",
        hasPersonality: true,
        hasPublishedPrompt: true,
      },
    });
    const node: MissionStageNode = {
      id: "stage-1",
      themeId: "theme-1",
      name: "Niveau 1",
      slug: "niveau-1",
      description: null,
      levelNumber: 1,
      sortOrder: 0,
      status: "DRAFT",
      createdAt: "t",
      updatedAt: "t",
      exerciseCount: 1,
      exercise: {
        id: "ex-1",
        name: "Demo",
        status: "PUBLISHED",
        prospectAvatarKey: "lena",
        hasPersonality: true,
        hasPublishedPrompt: true,
      },
      readiness,
    };
    const serialized = JSON.stringify(node);
    for (const forbidden of [
      "artifacts",
      "contentHash",
      "organizationId",
      "createdById",
      "publishedPromptBundleId",
      "secret",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toMatch(/"prompt"\s*:/);
    expect(serialized).not.toContain("PROSPECT_PERSONA");

    const svc = read("src", "lib", "missionCatalogAdminService.ts");
    expect(svc).toContain(
      "jamais de prompt, artifact, hash ni publishedPromptBundleId",
    );
    expect(svc).toContain("hasPersonality");
    expect(svc).toContain("hasPublishedPrompt");
  });

  it("27. libelle Difficulte pour Scenario.level (admin exercices)", () => {
    const list = read("src", "app", "admin", "exercises", "page.tsx");
    const detail = read("src", "app", "admin", "exercises", "[id]", "page.tsx");
    expect(list).toContain("Difficulté");
    expect(detail).toContain("Difficulté");
  });

  it("28. Niveau visible ; pas de concept fonctionnel Phase admin/telepro", () => {
    const adminMissions = read("src", "app", "admin", "missions", "page.tsx");
    const teleproMissions = read("src", "app", "app", "missions", "page.tsx");
    const themePage = read(
      "src",
      "app",
      "app",
      "missions",
      "[themeSlug]",
      "page.tsx",
    );
    const pathSrc = read("src", "app", "app", "missions", "MissionsPath.tsx");

    expect(adminMissions).toMatch(/Niveau/);
    expect(adminMissions).not.toMatch(/\bPhase\b/);
    expect(teleproMissions.toLowerCase()).toContain("niveau");
    expect(teleproMissions).not.toMatch(/\bPhase\b/);
    expect(themePage.toLowerCase()).toContain("niveau");
    expect(pathSrc).toContain("Niveau {levelNumber}");
  });

  it("selectivite des niveaux occupes (collectOccupiedStageIds)", () => {
    const occupied = collectOccupiedStageIds(
      [
        { id: "ex-1", missionStageId: "stage-1" },
        { id: "ex-2", missionStageId: "stage-2" },
        { id: "ex-3", missionStageId: null },
      ],
      "ex-1",
    );
    expect([...occupied]).toEqual(["stage-2"]);
    const themeNode = {
      id: "theme-1",
      name: "T",
      slug: "t",
      description: null,
      iconKey: "target" as const,
      sortOrder: 0,
      status: "PUBLISHED",
      createdAt: "t",
      updatedAt: "t",
      stages: [] as MissionStageNode[],
    };
    const freeStage: MissionStageNode = {
      id: "stage-free",
      themeId: "theme-1",
      name: "Libre",
      slug: "libre",
      description: null,
      levelNumber: 1,
      sortOrder: 0,
      status: "PUBLISHED",
      createdAt: "t",
      updatedAt: "t",
      exerciseCount: 0,
      exercise: null,
      readiness: emptyReadiness("PUBLISHED"),
    };
    const takenStage: MissionStageNode = {
      ...freeStage,
      id: "stage-2",
      name: "Pris",
      slug: "pris",
      exerciseCount: 1,
    };
    expect(
      isStageSelectable(themeNode, freeStage, {
        occupiedStageIds: occupied,
        currentStageId: "stage-1",
      }),
    ).toBe(true);
    expect(
      isStageSelectable(themeNode, takenStage, {
        occupiedStageIds: occupied,
        currentStageId: "stage-1",
      }),
    ).toBe(false);
    expect(
      isStageSelectable(themeNode, takenStage, {
        occupiedStageIds: occupied,
        currentStageId: "stage-2",
      }),
    ).toBe(true);
  });
});
