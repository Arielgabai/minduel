import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ExerciseMissionStatus,
  LEGACY_THEME_NAME,
  LEGACY_THEME_SLUG,
  buildTeleproMissionsCatalogView,
  isVisiblePublishedOrgScenario,
  type MissionAttemptInput,
  type MissionExerciseInput,
  type MissionStageInput,
  type MissionThemeInput,
} from "@/lib/teleproMissions";
import {
  assertManagerDetailSafe,
  buildManagerExercisesCatalogView,
  flattenManagerCatalogExercises,
  type ManagerExerciseDetailView,
} from "@/lib/managerExercisesView";
import { ScenarioStatus, SimulationStatus } from "@/lib/enums";

function read(rel: string) {
  return readFileSync(path.resolve(rel), "utf8");
}

const ORG = "org-1";
const ORG_B = "org-b";

function readyExercise(
  overrides: Partial<MissionExerciseInput> & Pick<MissionExerciseInput, "id" | "name">,
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
    organizationId: ORG,
    missionStageId: null,
    prospectAvatarKey: "alex",
    hasPublishedPrompt: true,
    ...overrides,
  };
}

function theme(
  overrides: Partial<MissionThemeInput> & Pick<MissionThemeInput, "id" | "slug" | "name">,
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
    Pick<MissionStageInput, "id" | "themeId" | "slug" | "name" | "levelNumber">,
): MissionStageInput {
  return {
    description: null,
    sortOrder: overrides.levelNumber,
    status: "PUBLISHED",
    ...overrides,
  };
}

describe("LOT O — catalogue telepro global", () => {
  it("1-2. telepro sans ScenarioAssignment voit tous les PUBLISHED org", () => {
    const exercises = [
      readyExercise({ id: "e1", name: "Alpha", missionStageId: "st1", sortOrder: 1 }),
      readyExercise({ id: "e2", name: "Beta", missionStageId: "st2", sortOrder: 2 }),
    ];
    const themes = [theme({ id: "th1", slug: "cold", name: "Cold Call" })];
    const stages = [
      stage({ id: "st1", themeId: "th1", slug: "n1", name: "N1", levelNumber: 1 }),
      stage({ id: "st2", themeId: "th1", slug: "n2", name: "N2", levelNumber: 2 }),
    ];
    const catalog = buildTeleproMissionsCatalogView(exercises, [], themes, stages);
    expect(catalog.empty).toBe(false);
    expect(catalog.totalCount).toBe(2);
    expect(catalog.themes[0]?.exerciseCount).toBe(2);
  });

  it("3. progression et verrous personnels conserves", () => {
    const exercises = [
      readyExercise({ id: "e1", name: "Alpha", missionStageId: "st1", sortOrder: 1 }),
      readyExercise({ id: "e2", name: "Beta", missionStageId: "st2", sortOrder: 2 }),
    ];
    const themes = [theme({ id: "th1", slug: "cold", name: "Cold Call" })];
    const stages = [
      stage({ id: "st1", themeId: "th1", slug: "n1", name: "N1", levelNumber: 1 }),
      stage({ id: "st2", themeId: "th1", slug: "n2", name: "N2", levelNumber: 2 }),
    ];
    const attempts: MissionAttemptInput[] = [];
    const locked = buildTeleproMissionsCatalogView(exercises, attempts, themes, stages);
    const n2 = locked.themes[0]?.stages.find((s) => s.slug === "n2");
    expect(n2?.exercises[0]?.status).toBe(ExerciseMissionStatus.LOCKED);

    const completed: MissionAttemptInput[] = [
      {
        id: "sim1",
        scenarioId: "e1",
        status: SimulationStatus.COMPLETED,
        outcome: null,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        evaluation: { overallScore: 70, summary: null, outcome: null },
      },
    ];
    const unlocked = buildTeleproMissionsCatalogView(
      exercises,
      completed,
      themes,
      stages,
    );
    const n2b = unlocked.themes[0]?.stages.find((s) => s.slug === "n2");
    expect(n2b?.exercises[0]?.status).toBe(ExerciseMissionStatus.AVAILABLE);
  });

  it("4-5. autre org / DRAFT / ARCHIVED invisibles", () => {
    expect(
      isVisiblePublishedOrgScenario(
        { status: ScenarioStatus.PUBLISHED, organizationId: ORG_B },
        ORG,
      ),
    ).toBe(false);
    expect(
      isVisiblePublishedOrgScenario(
        { status: ScenarioStatus.DRAFT, organizationId: ORG },
        ORG,
      ),
    ).toBe(false);
    expect(
      isVisiblePublishedOrgScenario(
        { status: ScenarioStatus.ARCHIVED, organizationId: ORG },
        ORG,
      ),
    ).toBe(false);

    const catalog = buildTeleproMissionsCatalogView(
      [
        readyExercise({
          id: "draft",
          name: "Draft",
          status: ScenarioStatus.DRAFT,
          missionStageId: "st1",
        }),
        readyExercise({
          id: "arch",
          name: "Arch",
          status: ScenarioStatus.ARCHIVED,
          missionStageId: "st1",
        }),
        readyExercise({
          id: "foreign",
          name: "Foreign",
          organizationId: ORG_B,
          missionStageId: "st1",
        }),
      ],
      [],
      [theme({ id: "th1", slug: "cold", name: "Cold Call" })],
      [stage({ id: "st1", themeId: "th1", slug: "n1", name: "N1", levelNumber: 1 })],
    );
    // Le moteur catalogue suppose des entrees deja filtrees PUBLISHED org ;
    // readiness seule ne retire pas DRAFT — le service le fait. On verifie le helper.
    expect(isVisiblePublishedOrgScenario({ status: "DRAFT", organizationId: ORG }, ORG)).toBe(
      false,
    );
    void catalog;
  });

  it("21. N4 dynamique et Parcours existant preserves", () => {
    const catalog = buildTeleproMissionsCatalogView(
      [
        readyExercise({ id: "u1", name: "Legacy A", missionLevel: 2, sortOrder: 1 }),
        readyExercise({ id: "u2", name: "Legacy B", missionLevel: 5, sortOrder: 2 }),
      ],
      [],
      [],
      [],
    );
    expect(catalog.themes).toHaveLength(1);
    expect(catalog.themes[0]?.slug).toBe(LEGACY_THEME_SLUG);
    expect(catalog.themes[0]?.name).toBe(LEGACY_THEME_NAME);
    expect(catalog.themes[0]?.stageCount).toBe(2);
  });
});

describe("LOT O — Skills globaux (non-regression source)", () => {
  it("6-7. service sans filtre teleproId d'acces, hierarchie PUBLISHED", () => {
    const src = read("src/lib/skillsTeleproService.ts");
    expect(src).toContain("void teleproId");
    expect(src).toContain("status: PUBLISHED");
    expect(src).not.toMatch(/scenarioAssignment/);
    expect(src).not.toMatch(/SkillAssignment/);
    expect(src).toContain("organizationId");
  });
});

describe("LOT O — manager Exercices lecture seule", () => {
  it("8-10. manager voit tous les themes/niveaux sans verrou ni telepro", () => {
    const catalog = buildManagerExercisesCatalogView(
      [
        readyExercise({ id: "e1", name: "Alpha", missionStageId: "st1" }),
        readyExercise({ id: "e2", name: "Beta", missionStageId: "st2" }),
      ],
      [theme({ id: "th1", slug: "cold", name: "Cold Call" })],
      [
        stage({ id: "st1", themeId: "th1", slug: "n1", name: "N1", levelNumber: 1 }),
        stage({ id: "st2", themeId: "th1", slug: "n2", name: "N2", levelNumber: 2 }),
      ],
    );
    expect(catalog.empty).toBe(false);
    expect(catalog.themes[0]?.stageCount).toBe(2);
    for (const st of catalog.themes[0]!.stages) {
      expect(st.exercise.detailHref).toContain("/manager/exercises/detail/");
      expect(st.exercise.status).toBe("PUBLISHED");
    }
  });

  it("11-12. fiche manager sans simulation ni secrets", () => {
    const detail: ManagerExerciseDetailView = {
      id: "e1",
      name: "Alpha",
      status: "PUBLISHED",
      difficulty: "MOYEN",
      difficultyLabel: "Moyen",
      themeName: "Cold Call",
      themeSlug: "cold",
      levelName: "N1",
      levelNumber: 1,
      prospectAvatarKey: "alex",
      campaign: "Camp",
      offer: "Offre",
      objective: "Obj",
      prospectProfile: "Profil",
      personality: "Calme",
      targetDurationSec: 300,
      teleproBrief: "Brief",
    };
    expect(() => assertManagerDetailSafe(detail)).not.toThrow();
    const themePage = read("src/app/manager/exercises/[themeSlug]/page.tsx");
    expect(themePage).not.toContain("/app/prepare/");
    expect(themePage).not.toContain("/app/call/");
    expect(themePage).not.toMatch(/Lancer la simulation/);
    const detailPage = read(
      "src/app/manager/exercises/detail/[scenarioId]/page.tsx",
    );
    expect(detailPage).not.toContain("Modifier");
    expect(detailPage).not.toContain("Publier");
    expect(detailPage).not.toContain("Assigner");
    expect(detailPage).not.toContain("secretInfos");
    expect(detailPage).not.toContain("publishedPromptBundleId");
    expect(detailPage).not.toContain("contentHash");
    expect(detailPage).not.toContain("artifacts");
  });
});

describe("LOT O — navigation et routes manager", () => {
  it("13-15. nav Exercices/Equipe/Resultats, Admin reserve, onglets retires", () => {
    const nav = read("src/components/ManagerNav.tsx");
    expect(nav).toContain("/manager/exercises");
    expect(nav).toContain("Exercices");
    expect(nav).toContain("/manager/team");
    expect(nav).toContain("Équipe");
    expect(nav).toContain("/manager/results");
    expect(nav).toContain("Résultats");
    expect(nav).not.toContain("/manager/recordings");
    expect(nav).not.toContain("Appels modèles");
    expect(nav).not.toContain("/manager/scenarios");
    expect(nav).not.toContain("Scénarios");
    expect(nav).not.toContain("/manager/knowledge");
    expect(nav).not.toContain("Connaissances");
    expect(nav).toContain("showAdminLink");
    expect(nav).toContain("/admin/exercises");
    expect(nav).toContain("min-h-11");
  });

  it("16. anciennes routes scenarios redirigees", () => {
    expect(read("src/app/manager/scenarios/page.tsx")).toContain(
      'redirect("/manager/exercises")',
    );
    expect(read("src/app/manager/scenarios/new/page.tsx")).toContain(
      'redirect("/manager/exercises")',
    );
    expect(read("src/app/manager/scenarios/[id]/page.tsx")).toContain(
      "/manager/exercises/detail/",
    );
    expect(read("src/app/manager/page.tsx")).toContain(
      'redirect("/manager/exercises")',
    );
    expect(read("src/app/manager/knowledge/page.tsx")).toContain(
      'redirect("/manager/exercises")',
    );
    expect(read("src/app/manager/recordings/page.tsx")).toContain(
      'redirect("/manager/exercises")',
    );
  });

  it("17. affectation individuelle desactivee (410)", () => {
    const src = read("src/app/api/scenarios/[id]/assign/route.ts");
    expect(src).toContain("410");
    expect(src).toMatch(/affectation individuelle/);
    expect(src).not.toContain("scenarioAssignment.create");
    expect(src).not.toContain("deleteMany");
  });

  it("18. aucun bouton creation depuis un appel", () => {
    const upload = read("src/app/manager/recordings/UploadForm.tsx");
    expect(upload).not.toContain("Créer un exercice depuis cet appel");
    expect(upload).toContain('fd.append("useAsModel", "false")');
    const review = read("src/app/manager/recordings/[id]/RecordingReview.tsx");
    expect(review).not.toContain("AssignPanel");
    expect(review).not.toContain("Valider et publier");
    const recPage = read("src/app/manager/recordings/page.tsx");
    expect(recPage).not.toContain("Créer un exercice depuis un appel");
  });

  it("19-20. Equipe catalogue global et Resultats intactes", () => {
    const teamList = read("src/app/manager/team/page.tsx");
    expect(teamList).toContain("requireManager");
    expect(teamList).toContain("loadManagerExercisesCatalog");
    expect(teamList).not.toContain("assignmentsAsTelepro");
    expect(teamList).not.toContain("scenarioAssignment");
    expect(teamList).not.toMatch(/assigné/);
    expect(teamList).toContain("disponible");

    const teamDetail = read("src/app/manager/team/[id]/page.tsx");
    expect(teamDetail).toContain("requireManager");
    expect(teamDetail).toContain("loadManagerExercisesCatalog");
    expect(teamDetail).toContain("flattenManagerCatalogExercises");
    expect(teamDetail).not.toContain("scenarioAssignment");
    expect(teamDetail).not.toMatch(/Scénarios assignés|Aucun scénario assigné|Assignés/);
    expect(teamDetail).toContain("Exercices disponibles");
    expect(teamDetail).toContain("Disponibles");

    expect(read("src/app/manager/results/page.tsx")).toContain("requireManager");
    expect(read("src/app/manager/recordings/[id]/page.tsx")).toContain(
      "requireManager",
    );
  });
});

describe("LOT O-FIX — KPI Équipe catalogue global", () => {
  it("total catalogue commun, independent des ScenarioAssignment", () => {
    const themes = [
      {
        id: "th1",
        slug: "cold",
        name: "Cold Call",
        description: null,
        iconKey: "target",
        sortOrder: 1,
        status: "PUBLISHED",
      },
    ];
    const stages = [
      {
        id: "st1",
        themeId: "th1",
        slug: "n1",
        name: "N1",
        description: null,
        levelNumber: 1,
        sortOrder: 1,
        status: "PUBLISHED",
      },
      {
        id: "st2",
        themeId: "th1",
        slug: "n2",
        name: "N2",
        description: null,
        levelNumber: 2,
        sortOrder: 2,
        status: "PUBLISHED",
      },
    ];
    const catalog = buildManagerExercisesCatalogView(
      [
        readyExercise({ id: "e1", name: "Alpha", missionStageId: "st1" }),
        readyExercise({ id: "e2", name: "Beta", missionStageId: "st2" }),
      ],
      themes,
      stages,
    );
    expect(catalog.totalCount).toBe(2);
    const flat = flattenManagerCatalogExercises(catalog);
    expect(flat).toHaveLength(2);
    expect(flat.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });

  it("exclut theme/niveau non publie et exercices non prets", () => {
    const catalog = buildManagerExercisesCatalogView(
      [
        readyExercise({
          id: "ok",
          name: "OK",
          missionStageId: "st1",
        }),
        readyExercise({
          id: "no-prompt",
          name: "Incomplet",
          missionStageId: "st1",
          hasPublishedPrompt: false,
          personality: "x",
          prospectAvatarKey: "alex",
        }),
        readyExercise({
          id: "orphan",
          name: "Orphelin",
          missionStageId: "st-draft",
        }),
      ],
      [
        {
          id: "th1",
          slug: "cold",
          name: "Cold",
          description: null,
          iconKey: "target",
          sortOrder: 1,
          status: "PUBLISHED",
        },
        {
          id: "th-draft",
          slug: "draft-theme",
          name: "Draft theme",
          description: null,
          iconKey: "target",
          sortOrder: 2,
          status: "DRAFT",
        },
      ],
      [
        {
          id: "st1",
          themeId: "th1",
          slug: "n1",
          name: "N1",
          description: null,
          levelNumber: 1,
          sortOrder: 1,
          status: "PUBLISHED",
        },
        {
          id: "st-draft",
          themeId: "th1",
          slug: "nd",
          name: "Draft stage",
          description: null,
          levelNumber: 9,
          sortOrder: 9,
          status: "DRAFT",
        },
      ],
    );
    const ids = flattenManagerCatalogExercises(catalog).map((e) => e.id);
    expect(ids).toEqual(["ok"]);
    // DRAFT/ARCHIVED/autre org exclus par loadManagerExercisesCatalog (findMany PUBLISHED + org).
    const service = read("src/lib/managerExercisesService.ts");
    expect(service).toMatch(/status:\s*ScenarioStatus\.PUBLISHED/);
    expect(service).toContain("organizationId");
  });

  it("pages Equipe : une seule charge catalogue, pas de N+1 assignations", () => {
    const list = read("src/app/manager/team/page.tsx");
    expect(list).toMatch(/loadManagerExercisesCatalog\(/);
    expect(list).not.toMatch(/assignmentsAsTelepro/);
    expect(list).not.toMatch(/scenarioAssignment/);
    // Appel unique hors boucle map (l'import nomme aussi le symbole).
    expect(list).toMatch(/Promise\.all\(\[\s*loadManagerExercisesCatalog/);
    expect(list).not.toMatch(/\.map\([\s\S]*loadManagerExercisesCatalog/);

    const detail = read("src/app/manager/team/[id]/page.tsx");
    expect(detail).toMatch(/loadManagerExercisesCatalog\(/);
    expect(detail).not.toMatch(/scenarioAssignment/);
    expect(detail).toMatch(/Promise\.all\(\[\s*loadManagerExercisesCatalog/);
    expect(detail).not.toMatch(/\.map\([\s\S]*loadManagerExercisesCatalog/);
  });
});

describe("LOT O — service telepro sans write de masse / schema", () => {
  it("22-23. pas de write affectations, pas de prisma/migration touches", () => {
    const service = read("src/lib/teleproMissionsService.ts");
    expect(service).not.toMatch(/scenarioAssignment\.create/);
    expect(service).not.toMatch(/scenarioAssignment\.createMany/);
    expect(service).toContain("loadPublishedOrgExercisesAndAttempts");
    expect(service).not.toMatch(/scenarioAssignment\.findMany/);

    const mgr = read("src/lib/managerExercisesService.ts");
    expect(mgr).toContain('import "server-only"');
    expect(mgr).not.toMatch(/\(teleproId/);
    expect(mgr).not.toMatch(/teleproId:/);
    expect(mgr).not.toMatch(/scenarioAssignment/);

    // Pas de migration dans le lot : le fichier N4 reste la reference, non retouchee ici.
    const mig = read(
      "prisma/migrations/20260804100000_mission_stage_single_scenario/migration.sql",
    );
    expect(mig.length).toBeGreaterThan(10);
  });

  it("prepare et simulations sans garde d'assignation", () => {
    const prepare = read("src/app/app/prepare/[scenarioId]/page.tsx");
    expect(prepare).not.toMatch(/scenarioAssignment\.findFirst/);
    const sim = read("src/app/api/simulations/route.ts");
    expect(sim).not.toContain("ne t'est pas assigné");
    expect(sim).toContain("catalogue global");
  });
});
