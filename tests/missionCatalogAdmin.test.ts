import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Catalogue Missions — service admin (lot N1).
// Fixtures et mocks strictement locaux : aucune base, aucun réseau, aucun OpenAI.

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
  name?: string;
  status?: string;
  prospectAvatarKey?: string | null;
  personality?: string | null;
  publishedPromptBundleId?: string | null;
  publishedPromptBundleStatus?: string | null;
};

let themes: ThemeRow[] = [];
let stages: StageRow[] = [];
let scenarios: ScenarioRow[] = [];
let seq = 0;
const audits: Array<{ action: string; metadata?: Record<string, unknown> }> = [];

function uid(prefix: string) {
  return `${prefix}-${++seq}`;
}

/** Reproduit la projection Prisma : seul le `select` du service traverse la frontière. */
function project<T extends Record<string, unknown>>(
  row: T,
  select?: Record<string, boolean>,
): Record<string, unknown> {
  if (!select) return row;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    if (select[key]) out[key] = row[key];
  }
  return out;
}

function matches(row: Record<string, unknown>, where?: Record<string, unknown>) {
  if (!where) return true;
  for (const [key, expected] of Object.entries(where)) {
    if (expected == null) {
      if (row[key] != null) return false;
      continue;
    }
    if (typeof expected === "object" && "not" in (expected as object)) {
      if (row[key] === (expected as { not: unknown }).not) return false;
      continue;
    }
    if (row[key] !== expected) return false;
  }
  return true;
}

vi.mock("@/lib/db", () => {
  const missionThemeApi = {
    findFirst: async ({ where }: { where?: Record<string, unknown> }) =>
      themes.find((t) => matches(t, where)) ?? null,
    findMany: async ({
      where,
      select,
    }: {
      where?: Record<string, unknown>;
      select?: Record<string, boolean>;
    }) => themes.filter((t) => matches(t, where)).map((t) => project(t, select)),
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
    findMany: async ({
      where,
      select,
    }: {
      where?: Record<string, unknown>;
      select?: Record<string, boolean>;
    }) => stages.filter((s) => matches(s, where)).map((s) => project(s, select)),
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

  function projectScenario(s: ScenarioRow) {
    return {
      id: s.id,
      name: s.name ?? s.id,
      status: s.status ?? "DRAFT",
      prospectAvatarKey: s.prospectAvatarKey ?? null,
      personality: s.personality ?? null,
      publishedPromptBundleId: s.publishedPromptBundleId ?? null,
      missionStageId: s.missionStageId,
      publishedPromptBundle:
        s.publishedPromptBundleId && s.publishedPromptBundleStatus
          ? {
              id: s.publishedPromptBundleId,
              status: s.publishedPromptBundleStatus,
            }
          : null,
    };
  }

  const scenarioApi = {
    count: async ({ where }: { where?: Record<string, unknown> }) =>
      scenarios.filter((s) => matches(s as unknown as Record<string, unknown>, where))
        .length,
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
      const idx = scenarios.findIndex((x) => x.id === where.id);
      scenarios[idx] = { ...scenarios[idx]!, ...data };
      return projectScenario(scenarios[idx]!);
    },
    groupBy: async () => {
      const counts = new Map<string, number>();
      for (const row of scenarios) {
        if (!row.missionStageId) continue;
        counts.set(
          row.missionStageId,
          (counts.get(row.missionStageId) ?? 0) + 1,
        );
      }
      return [...counts.entries()].map(([missionStageId, n]) => ({
        missionStageId,
        _count: { _all: n },
      }));
    },
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
  logAudit: async (input: {
    action: string;
    metadata?: Record<string, unknown>;
  }) => {
    audits.push({ action: input.action, metadata: input.metadata });
  },
}));

beforeEach(() => {
  themes = [];
  stages = [];
  scenarios = [];
  audits.length = 0;
  seq = 0;
  vi.clearAllMocks();
});

async function svc() {
  return import("@/lib/missionCatalogAdminService");
}

async function seedPublishedTheme(orgId = "org1") {
  const s = await svc();
  const theme = await s.createMissionTheme(orgId, "admin1", {
    name: "Prise de rendez-vous",
  });
  await s.publishMissionTheme(theme.id, orgId, "admin1");
  return theme.id;
}

describe("thèmes", () => {
  it("crée un thème en brouillon avec slug normalisé", async () => {
    const s = await svc();
    const theme = await s.createMissionTheme("org1", "admin1", {
      name: "Découverte du besoin",
      description: "  ",
    });
    expect(theme.status).toBe("DRAFT");
    expect(theme.slug).toBe("decouverte-du-besoin");
    expect(theme.description).toBeNull();
    expect(theme.stageCount).toBe(0);
    expect(audits.map((a) => a.action)).toContain("MISSION_THEME_CREATE");
  });

  it("refuse un slug déjà utilisé dans la même organisation", async () => {
    const s = await svc();
    await s.createMissionTheme("org1", "admin1", { name: "Closing" });
    await expect(
      s.createMissionTheme("org1", "admin1", { name: "Closing" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("autorise le même slug dans une autre organisation", async () => {
    const s = await svc();
    const a = await s.createMissionTheme("org1", "admin1", { name: "Closing" });
    const b = await s.createMissionTheme("org2", "admin2", { name: "Closing" });
    expect(a.slug).toBe(b.slug);
    expect(a.id).not.toBe(b.id);
  });

  it("thème d'une autre organisation : 404", async () => {
    const s = await svc();
    const theme = await s.createMissionTheme("org1", "admin1", {
      name: "Closing",
    });
    await expect(s.getMissionTheme(theme.id, "org2")).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      s.updateMissionTheme(theme.id, "org2", "admin2", { name: "Pirate" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("archive idempotente puis lecture seule", async () => {
    const s = await svc();
    const theme = await s.createMissionTheme("org1", "admin1", {
      name: "Closing",
    });
    const first = await s.archiveMissionTheme(theme.id, "org1", "admin1");
    const second = await s.archiveMissionTheme(theme.id, "org1", "admin1");
    expect(first.status).toBe("ARCHIVED");
    expect(second.status).toBe("ARCHIVED");
    expect(
      audits.filter((a) => a.action === "MISSION_THEME_ARCHIVE"),
    ).toHaveLength(1);
    await expect(
      s.updateMissionTheme(theme.id, "org1", "admin1", { name: "Nouveau" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("supprime un thème brouillon non référencé, refuse s'il a des niveaux", async () => {
    const s = await svc();
    const theme = await s.createMissionTheme("org1", "admin1", {
      name: "Closing",
    });
    await s.createMissionStage("org1", "admin1", {
      themeId: theme.id,
      name: "Niveau 1",
    });
    await expect(
      s.deleteMissionTheme(theme.id, "org1", "admin1"),
    ).rejects.toMatchObject({ status: 409 });

    const empty = await s.createMissionTheme("org1", "admin1", {
      name: "Objections",
    });
    await expect(
      s.deleteMissionTheme(empty.id, "org1", "admin1"),
    ).resolves.toEqual({ deleted: true });
  });
});

describe("niveaux", () => {
  it("crée un niveau rattaché au thème", async () => {
    const s = await svc();
    const theme = await s.createMissionTheme("org1", "admin1", {
      name: "Closing",
    });
    const stage = await s.createMissionStage("org1", "admin1", {
      themeId: theme.id,
      name: "Traiter l'objection prix",
      levelNumber: 2,
    });
    expect(stage.themeId).toBe(theme.id);
    expect(stage.status).toBe("DRAFT");
    expect(stage.levelNumber).toBe(2);
    expect(stage.exerciseCount).toBe(0);
  });

  it("refuse un thème parent d'une autre organisation", async () => {
    const s = await svc();
    const theme = await s.createMissionTheme("org2", "admin2", {
      name: "Closing",
    });
    await expect(
      s.createMissionStage("org1", "admin1", {
        themeId: theme.id,
        name: "Niveau 1",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuse deux niveaux de même numéro dans un thème", async () => {
    const s = await svc();
    const theme = await s.createMissionTheme("org1", "admin1", {
      name: "Closing",
    });
    await s.createMissionStage("org1", "admin1", {
      themeId: theme.id,
      name: "Niveau 1",
      levelNumber: 1,
    });
    await expect(
      s.createMissionStage("org1", "admin1", {
        themeId: theme.id,
        name: "Autre niveau 1",
        levelNumber: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("publication refusée tant que le thème est en brouillon", async () => {
    const s = await svc();
    const theme = await s.createMissionTheme("org1", "admin1", {
      name: "Closing",
    });
    const stage = await s.createMissionStage("org1", "admin1", {
      themeId: theme.id,
      name: "Niveau 1",
    });
    scenarios.push({
      id: "ex-ready-draft-theme",
      organizationId: "org1",
      missionStageId: stage.id,
      name: "Pret",
      status: "PUBLISHED",
      prospectAvatarKey: "lena",
      personality: "Direct",
      publishedPromptBundleId: "pb-1",
      publishedPromptBundleStatus: "PUBLISHED",
    });
    await expect(
      s.publishMissionStage(stage.id, "org1", "admin1"),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      s.publishMissionStage(stage.id, "org1", "admin1"),
    ).rejects.toThrow(/Thème non publié|Niveau non prêt/);
  });

  it("après thème publié, niveau vide refuse ; niveau prêt publie", async () => {
    const s = await svc();
    const theme = await s.createMissionTheme("org1", "admin1", {
      name: "Closing",
    });
    const empty = await s.createMissionStage("org1", "admin1", {
      themeId: theme.id,
      name: "Niveau vide",
      levelNumber: 1,
    });
    const readyStage = await s.createMissionStage("org1", "admin1", {
      themeId: theme.id,
      name: "Niveau prêt",
      levelNumber: 2,
    });
    await s.publishMissionTheme(theme.id, "org1", "admin1");
    await expect(
      s.publishMissionStage(empty.id, "org1", "admin1"),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      s.publishMissionStage(empty.id, "org1", "admin1"),
    ).rejects.toThrow(/Aucun exercice associé/);

    scenarios.push({
      id: "ex-ready-pub",
      organizationId: "org1",
      missionStageId: readyStage.id,
      name: "Pret",
      status: "PUBLISHED",
      prospectAvatarKey: "lena",
      personality: "Direct",
      publishedPromptBundleId: "pb-ready",
      publishedPromptBundleStatus: "PUBLISHED",
    });
    const published = await s.publishMissionStage(
      readyStage.id,
      "org1",
      "admin1",
    );
    expect(published.status).toBe("PUBLISHED");
    expect(published.publishedAt).not.toBeNull();
  });

  it("hard-delete refusé si des exercices référencent le niveau", async () => {
    const s = await svc();
    const themeId = await seedPublishedTheme();
    const stage = await s.createMissionStage("org1", "admin1", {
      themeId,
      name: "Niveau 1",
    });
    scenarios.push({
      id: "ex-1",
      organizationId: "org1",
      missionStageId: stage.id,
      name: "Ex",
      status: "DRAFT",
      prospectAvatarKey: "lena",
      personality: "Direct",
      publishedPromptBundleId: null,
      publishedPromptBundleStatus: null,
    });
    await expect(
      s.deleteMissionStage(stage.id, "org1", "admin1"),
    ).rejects.toMatchObject({ status: 409 });

    scenarios = [];
    await expect(
      s.deleteMissionStage(stage.id, "org1", "admin1"),
    ).resolves.toEqual({ deleted: true });
  });

  it("niveau d'une autre organisation : 404", async () => {
    const s = await svc();
    const themeId = await seedPublishedTheme();
    const stage = await s.createMissionStage("org1", "admin1", {
      themeId,
      name: "Niveau 1",
    });
    await expect(s.getMissionStage(stage.id, "org2")).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      s.archiveMissionStage(stage.id, "org2", "admin2"),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("arbre du catalogue", () => {
  it("ne renvoie que des données de classement, jamais de contenu sensible", async () => {
    const s = await svc();
    const themeId = await seedPublishedTheme();
    const stage = await s.createMissionStage("org1", "admin1", {
      themeId,
      name: "Niveau 1",
    });
    scenarios.push({
      id: "ex-1",
      organizationId: "org1",
      missionStageId: stage.id,
      name: "Exercice classé",
      status: "PUBLISHED",
      prospectAvatarKey: "lena",
      personality: "secret-persona-text",
      publishedPromptBundleId: "pb-secret",
      publishedPromptBundleStatus: "PUBLISHED",
    });
    scenarios.push({
      id: "ex-2",
      organizationId: "org1",
      missionStageId: null,
      name: "Legacy",
      status: "DRAFT",
    });

    const tree = await s.listMissionCatalog("org1");
    expect(tree).toHaveLength(1);
    expect(tree[0]!.stages[0]!.exerciseCount).toBe(1);
    expect(tree[0]!.stages[0]!.exercise).toMatchObject({
      id: "ex-1",
      name: "Exercice classé",
      status: "PUBLISHED",
      prospectAvatarKey: "lena",
      hasPersonality: true,
      hasPublishedPrompt: true,
    });
    expect(tree[0]!.stages[0]!.readiness.readyToPublish).toBe(true);

    const serialized = JSON.stringify(tree);
    for (const forbidden of [
      "artifacts",
      "contentHash",
      "secret",
      "organizationId",
      "createdById",
      "publishedPromptBundleId",
      "secret-persona-text",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toMatch(/"prompt"\s*:/);
    expect(serialized).not.toMatch(/"personality"\s*:/);
  });

  it("isole strictement les organisations", async () => {
    const s = await svc();
    await s.createMissionTheme("org1", "admin1", { name: "Closing" });
    await s.createMissionTheme("org2", "admin2", { name: "Autre" });
    const tree = await s.listMissionCatalog("org2");
    expect(tree.map((t) => t.name)).toEqual(["Autre"]);
  });
});

// ---------------- Contrôles statiques (fichiers du dépôt) ----------------

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "prisma", "migrations");
const MIGRATION_DIR = "20260803112000_mission_catalog";

function readRepoFile(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

describe("migration du catalogue", () => {
  const sql = readFileSync(
    join(MIGRATIONS_DIR, MIGRATION_DIR, "migration.sql"),
    "utf8",
  );

  it("est additive : aucune donnée, aucune suppression, aucun renommage", () => {
    const statements = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .toUpperCase();
    expect(statements).not.toContain("INSERT ");
    expect(statements).not.toContain("DROP TABLE");
    expect(statements).not.toContain("DROP COLUMN");
    expect(statements).not.toContain("RENAME");
    expect(statements).not.toContain("DELETE FROM");
    expect(statements).not.toContain("TRUNCATE");
    // Les seules colonnes ajoutées sont nullables et sans valeur par défaut.
    expect(sql).toContain('ADD COLUMN     "missionStageId" TEXT');
    expect(sql).toContain('ADD COLUMN     "prospectAvatarKey" TEXT');
    expect(sql).not.toMatch(/ADD COLUMN[^;]*NOT NULL/);
  });

  it("déclare les FK composites multi-tenant sans cascade vers Scenario", () => {
    expect(sql).toContain(
      'FOREIGN KEY ("themeId", "organizationId") REFERENCES "MissionTheme"("id", "organizationId")',
    );
    expect(sql).toContain(
      'FOREIGN KEY ("missionStageId", "organizationId") REFERENCES "MissionStage"("id", "organizationId")',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "MissionTheme_id_organizationId_key"',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "MissionStage_id_organizationId_key"',
    );
    const scenarioFk = sql
      .split("\n")
      .find((l) => l.includes('ALTER TABLE "Scenario" ADD CONSTRAINT'));
    expect(scenarioFk).toBeTruthy();
    expect(scenarioFk).toContain("ON DELETE RESTRICT");
    expect(scenarioFk).not.toContain("ON DELETE CASCADE");
    expect(scenarioFk).not.toContain("ON DELETE SET NULL");
  });

  it("respecte la syntaxe attendue et documente le rollback", () => {
    expect(sql).not.toContain(")REFERENCES");
    expect(sql).toContain("ROLLBACK");
    expect(sql.startsWith("--")).toBe(true);
  });

  it("ne modifie aucune migration antérieure à N1", () => {
    const n4Dir = "20260804100000_mission_stage_single_scenario";
    const previous = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter(
        (e) =>
          e.isDirectory() &&
          e.name !== MIGRATION_DIR &&
          e.name !== n4Dir &&
          e.name < MIGRATION_DIR,
      )
      .map((e) => e.name);
    expect(previous.length).toBeGreaterThan(0);
    for (const dir of previous) {
      const previousSql = readFileSync(
        join(MIGRATIONS_DIR, dir, "migration.sql"),
        "utf8",
      );
      expect(previousSql).not.toContain("MissionTheme");
      expect(previousSql).not.toContain("MissionStage");
      expect(previousSql).not.toContain("missionStageId");
      expect(previousSql).not.toContain("prospectAvatarKey");
    }
  });

  it("migration N4 existe ; N1 inchangée (pas d'index unique Scenario)", () => {
    const n4Dir = "20260804100000_mission_stage_single_scenario";
    const n4Path = join(MIGRATIONS_DIR, n4Dir, "migration.sql");
    expect(readdirSync(MIGRATIONS_DIR)).toContain(n4Dir);
    const n4 = readFileSync(n4Path, "utf8");
    expect(n4).toContain(
      'CREATE UNIQUE INDEX "Scenario_missionStageId_organizationId_key"',
    );
    expect(n4).toMatch(/doublon/i);
    expect(sql).toContain('CREATE TABLE "MissionTheme"');
    expect(sql).not.toContain(
      'CREATE UNIQUE INDEX "Scenario_missionStageId_organizationId_key"',
    );
  });

  it("le schéma Prisma conserve les champs legacy des exercices", () => {
    const schema = readRepoFile("prisma", "schema.prisma");
    expect(schema).toMatch(/missionLevel\s+Int/);
    expect(schema).toMatch(/sortOrder\s+Int/);
    expect(schema).toMatch(/missionStageId\s+String\?/);
    expect(schema).toMatch(/prospectAvatarKey\s+String\?/);
    expect(schema).toContain("onDelete: Restrict");
    expect(schema).toContain("@@unique([missionStageId, organizationId])");
    expect(schema).toMatch(/scenario\s+Scenario\?/);
  });
});

describe("garde-fous applicatifs", () => {
  it("la page /admin/missions n'expose qu'un export par défaut", () => {
    const page = readRepoFile("src", "app", "admin", "missions", "page.tsx");
    const exports = page.match(/^export\s+[^\n]*/gm) ?? [];
    expect(exports).toHaveLength(1);
    expect(exports[0]).toContain("export default function");
  });

  it("chaque appel réseau de l'UI admin traite !res.ok", () => {
    const page = readRepoFile("src", "app", "admin", "missions", "page.tsx");
    const fetchCalls = (page.match(/await fetch\(/g) ?? []).length;
    const okChecks = (page.match(/!res\.ok/g) ?? []).length;
    expect(fetchCalls).toBeGreaterThan(0);
    expect(okChecks).toBe(fetchCalls);
  });

  it("le service catalogue n'effectue aucun appel réseau ni OpenAI", () => {
    const source = readRepoFile("src", "lib", "missionCatalogAdminService.ts");
    expect(source).toContain('import "server-only"');
    expect(source).not.toMatch(/fetch\(/);
    expect(source.toLowerCase()).not.toContain("openai");
    expect(source).not.toContain("http://");
    expect(source).not.toContain("https://");
  });

  it("le catalogue d'avatars est local et stable", async () => {
    const { PROSPECT_AVATARS, PROSPECT_AVATAR_KEYS, isProspectAvatarKey } =
      await import("@/lib/prospectAvatars");
    expect(PROSPECT_AVATAR_KEYS.length).toBeGreaterThanOrEqual(8);
    expect(PROSPECT_AVATAR_KEYS.length).toBeLessThanOrEqual(12);
    expect(new Set(PROSPECT_AVATAR_KEYS).size).toBe(
      PROSPECT_AVATAR_KEYS.length,
    );
    for (const avatar of PROSPECT_AVATARS) {
      expect(avatar.from).toMatch(/^#[0-9a-f]{6}$/i);
      expect(avatar.initials.length).toBeGreaterThan(0);
    }
    expect(isProspectAvatarKey("alex")).toBe(true);
    expect(isProspectAvatarKey("inconnu")).toBe(false);
    const source = readRepoFile("src", "lib", "prospectAvatars.ts");
    expect(source).not.toContain("http://");
    expect(source).not.toContain("https://");
  });

  it("le composant ProspectAvatar n'injecte jamais de HTML brut", () => {
    const source = readRepoFile("src", "components", "ProspectAvatar.tsx");
    expect(source).not.toMatch(/dangerouslySetInnerHTML\s*[=:]/);
    expect(source).toContain("aria-hidden");
    expect(source).toContain('role: "img"');
  });
});
