import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ExerciseMissionStatus,
  buildTeleproMissionsCatalogView,
  type MissionAttemptInput,
  type MissionExerciseInput,
  type MissionStageInput,
  type MissionThemeInput,
} from "@/lib/teleproMissions";
import { ScenarioStatus, SimulationStatus } from "@/lib/enums";

function read(rel: string) {
  return readFileSync(path.resolve(rel), "utf8");
}

const ORG = "org-p1";
const PAGE = "src/app/app/missions/page.tsx";

function exercise(
  overrides: Partial<MissionExerciseInput> &
    Pick<MissionExerciseInput, "id" | "name">,
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
    status: ScenarioStatus.PUBLISHED,
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
  overrides: Partial<MissionThemeInput> &
    Pick<MissionThemeInput, "id" | "slug" | "name">,
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

function catalogWithThemes(count: number) {
  const themes: MissionThemeInput[] = [];
  const stages: MissionStageInput[] = [];
  const exercises: MissionExerciseInput[] = [];
  for (let i = 0; i < count; i += 1) {
    const themeId = `t-${i}`;
    const stageId = `s-${i}`;
    themes.push(
      theme({
        id: themeId,
        slug: `theme-${i}`,
        name: `Thème ${i + 1}`,
        sortOrder: i,
        description: i === 0 ? "Description du premier thème" : null,
      }),
    );
    stages.push(
      stage({
        id: stageId,
        themeId,
        slug: `n1`,
        name: "Niveau 1",
        levelNumber: 1,
      }),
    );
    exercises.push(
      exercise({
        id: `e-${i}`,
        name: `Ex ${i + 1}`,
        missionStageId: stageId,
        sortOrder: i,
      }),
    );
  }
  return buildTeleproMissionsCatalogView(exercises, [], themes, stages);
}

describe("LOT P1 — parcours thèmes /app/missions (page 14)", () => {
  const pageSrc = read(PAGE);

  it("1. rend un nombre dynamique de thèmes", () => {
    expect(catalogWithThemes(0).themes).toHaveLength(0);
    expect(catalogWithThemes(1).themes).toHaveLength(1);
    expect(catalogWithThemes(5).themes).toHaveLength(5);
    expect(catalogWithThemes(10).themes).toHaveLength(10);
    expect(pageSrc).toContain("catalog.themes.map");
    expect(pageSrc).not.toMatch(/\b5 thèmes\b/);
    expect(pageSrc).not.toMatch(/\b7 exercices\b/);
    expect(pageSrc).not.toMatch(/\b35 appels\b/);
  });

  it("2. conserve l'ordre reçu du moteur", () => {
    const themes = [
      theme({ id: "tb", slug: "bravo", name: "Bravo", sortOrder: 2 }),
      theme({ id: "ta", slug: "alpha", name: "Alpha", sortOrder: 1 }),
      theme({ id: "tc", slug: "charlie", name: "Charlie", sortOrder: 3 }),
    ];
    const stages = [
      stage({ id: "sb", themeId: "tb", slug: "n1", name: "N1" }),
      stage({ id: "sa", themeId: "ta", slug: "n1", name: "N1" }),
      stage({ id: "sc", themeId: "tc", slug: "n1", name: "N1" }),
    ];
    const exercises = [
      exercise({ id: "eb", name: "B", missionStageId: "sb" }),
      exercise({ id: "ea", name: "A", missionStageId: "sa" }),
      exercise({ id: "ec", name: "C", missionStageId: "sc" }),
    ];
    const catalog = buildTeleproMissionsCatalogView(
      exercises,
      [],
      themes,
      stages,
    );
    expect(catalog.themes.map((t) => t.slug)).toEqual([
      "alpha",
      "bravo",
      "charlie",
    ]);
    expect(pageSrc).toContain("catalog.themes.map((theme, index)");
  });

  it("3. numérotation calculée 1…N", () => {
    expect(pageSrc).toContain("const number = index + 1");
    expect(pageSrc).toContain("{number}");
    expect(pageSrc).not.toMatch(/number\s*=\s*[1-9]\b/);
  });

  it("4. liens /app/missions/[themeSlug]", () => {
    expect(pageSrc).toContain("`/app/missions/${theme.slug}`");
    const catalog = catalogWithThemes(2);
    for (const t of catalog.themes) {
      expect(`/app/missions/${t.slug}`).toMatch(/^\/app\/missions\/theme-\d+$/);
    }
    expect(pageSrc).not.toContain("/app/missions/${theme.slug}/");
    expect(pageSrc).not.toMatch(/\/app\/missions\/\$\{theme\.slug\}\/\$\{/);
  });

  it("5. progression réelle terminé/total", () => {
    const themes = [
      theme({ id: "t1", slug: "a", name: "A", sortOrder: 1 }),
    ];
    const stages = [
      stage({ id: "s1", themeId: "t1", slug: "n1", name: "N1", levelNumber: 1 }),
      stage({ id: "s2", themeId: "t1", slug: "n2", name: "N2", levelNumber: 2 }),
    ];
    const exercises = [
      exercise({ id: "e1", name: "E1", missionStageId: "s1" }),
      exercise({ id: "e2", name: "E2", missionStageId: "s2" }),
    ];
    const attempts = [
      attempt({
        id: "att1",
        scenarioId: "e1",
        status: SimulationStatus.COMPLETED,
      }),
    ];
    const catalog = buildTeleproMissionsCatalogView(
      exercises,
      attempts,
      themes,
      stages,
    );
    expect(catalog.themes[0]!.completedCount).toBe(1);
    expect(catalog.themes[0]!.exerciseCount).toBe(2);
    expect(pageSrc).toContain(
      "`${theme.completedCount}/${theme.exerciseCount} exercices terminés`",
    );
    expect(pageSrc).toContain("catalog.completedCount");
    expect(pageSrc).toContain("catalog.totalCount");
  });

  it("6. thème terminé → état COMPLETED", () => {
    const themes = [theme({ id: "t1", slug: "a", name: "A" })];
    const stages = [
      stage({ id: "s1", themeId: "t1", slug: "n1", name: "N1" }),
    ];
    const exercises = [
      exercise({ id: "e1", name: "E1", missionStageId: "s1" }),
    ];
    const attempts = [
      attempt({
        id: "att1",
        scenarioId: "e1",
        status: SimulationStatus.COMPLETED,
      }),
    ];
    const catalog = buildTeleproMissionsCatalogView(
      exercises,
      attempts,
      themes,
      stages,
    );
    expect(catalog.themes[0]!.state).toBe("COMPLETED");
    expect(pageSrc).toContain('theme.state === "COMPLETED"');
    expect(pageSrc).toContain("from-electric-400 via-violet-500 to-flame-500");
  });

  it("7. thème en cours → IN_PROGRESS + anneau orange", () => {
    const themes = [theme({ id: "t1", slug: "a", name: "A" })];
    const stages = [
      stage({ id: "s1", themeId: "t1", slug: "n1", name: "N1" }),
      stage({ id: "s2", themeId: "t1", slug: "n2", name: "N2", levelNumber: 2 }),
    ];
    const exercises = [
      exercise({ id: "e1", name: "E1", missionStageId: "s1" }),
      exercise({ id: "e2", name: "E2", missionStageId: "s2" }),
    ];
    const attempts = [
      attempt({
        id: "att1",
        scenarioId: "e1",
        status: SimulationStatus.IN_PROGRESS,
      }),
    ];
    const catalog = buildTeleproMissionsCatalogView(
      exercises,
      attempts,
      themes,
      stages,
    );
    expect(catalog.themes[0]!.state).toBe("IN_PROGRESS");
    expect(pageSrc).toContain('theme.state === "IN_PROGRESS"');
    expect(pageSrc).toContain("border-flame-500");
  });

  it("8. thème non commencé toujours accessible", () => {
    const catalog = catalogWithThemes(3);
    expect(catalog.themes.every((t) => t.state === "AVAILABLE")).toBe(true);
    expect(pageSrc).toContain("`/app/missions/${theme.slug}`");
    expect(pageSrc).not.toMatch(/disabled|pointer-events-none.*theme/i);
    // Pas de verrouillage inter-thèmes dans la page
    expect(pageSrc).not.toContain("Verrouillé");
  });

  it("9. thème vide → texte explicite sans faux compteur", () => {
    expect(pageSrc).toContain("Aucun exercice disponible");
    expect(pageSrc).toContain('theme.state === "EMPTY"');
    expect(pageSrc).toContain("theme.exerciseCount === 0");
    // Le libellé vide remplace le compteur x/y
    expect(pageSrc).toMatch(
      /kind === "empty"[\s\S]*Aucun exercice disponible/,
    );
  });

  it("10. aucun texte Verrouillé au niveau thème", () => {
    expect(pageSrc).not.toContain("Verrouillé");
    expect(pageSrc).not.toContain("verrouillé");
    expect(pageSrc).not.toContain("LOCKED");
  });

  it("11. aucun nombre de thèmes ou d'exercices codé en dur", () => {
    expect(pageSrc).not.toMatch(/\b5 thèmes\b/);
    expect(pageSrc).not.toMatch(/\b7 exercices\b/);
    expect(pageSrc).not.toContain("35 appels");
    expect(pageSrc).not.toMatch(/=\s*5\s*;/);
    expect(pageSrc).not.toMatch(/=\s*7\s*;/);
    expect(pageSrc).toContain("themeCount");
    expect(pageSrc).toContain("catalog.themes.length");
  });

  it("12. aucune donnée sensible", () => {
    for (const needle of [
      "secretInfos",
      "aiProspect",
      "artifacts",
      "contentHash",
      "PROSPECT_PERSONA",
      "dangerouslySetInnerHTML",
      "openai",
      "OpenAI",
    ]) {
      expect(pageSrc).not.toContain(needle);
    }
  });

  it("13. aucune modification des routes de niveaux", () => {
    expect(pageSrc).not.toContain("[stageSlug]");
    expect(pageSrc).not.toContain("/app/prepare/");
    expect(pageSrc).not.toContain("/app/call/");
    const themePage = read("src/app/app/missions/[themeSlug]/page.tsx");
    expect(themePage).toContain("MissionsPath");
    const stagePage = read(
      "src/app/app/missions/[themeSlug]/[stageSlug]/page.tsx",
    );
    expect(stagePage).toContain("loadTeleproMissionStageView");
  });

  it("14. attributs d'accessibilité présents", () => {
    expect(pageSrc).toContain("aria-label={ariaLabel}");
    expect(pageSrc).toContain("focus-visible:outline");
    expect(pageSrc).toContain("min-h-11");
    expect(pageSrc).toContain("sr-only");
    expect(pageSrc).toContain("h-[60px] w-[60px]");
    expect(pageSrc).toContain("pb-10");
  });

  it("15. seul export default dans page.tsx", () => {
    expect(pageSrc).toMatch(/export\s+default\s+async\s+function\s+MissionsPage/);
    const named = pageSrc.match(/^export\s+(?!default)/gm) ?? [];
    expect(named).toEqual([]);
  });

  it("compat N2 : conserve Voir les niveaux + loaders", () => {
    expect(pageSrc).toContain("Voir les niveaux");
    expect(pageSrc).toContain("loadTeleproMissionsCatalogView");
    expect(pageSrc).toContain("loadTeleproMissionsView");
    expect(pageSrc).toContain("EmptyState");
    expect(pageSrc).toContain("requireTelepro");
  });

  it("statut exercice IN_PROGRESS reste visible via le moteur", () => {
    const themes = [theme({ id: "t1", slug: "a", name: "A" })];
    const stages = [
      stage({ id: "s1", themeId: "t1", slug: "n1", name: "N1" }),
    ];
    const exercises = [
      exercise({ id: "e1", name: "E1", missionStageId: "s1" }),
    ];
    const attempts = [
      attempt({
        id: "att1",
        scenarioId: "e1",
        status: SimulationStatus.CREATED,
      }),
    ];
    const catalog = buildTeleproMissionsCatalogView(
      exercises,
      attempts,
      themes,
      stages,
    );
    const node = catalog.themes[0]!.stages[0]!.exercises[0]!;
    expect(node.status).toBe(ExerciseMissionStatus.IN_PROGRESS);
    expect(catalog.themes[0]!.state).toBe("IN_PROGRESS");
  });
});
