import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ExerciseMissionStatus,
  EXERCISE_MISSION_STATUS_LABELS,
  buildTeleproMissionsView,
  filterVisibleAssignments,
  isActiveSimulationStatus,
  isFinishedSimulationStatus,
  isVisibleAssignedScenario,
  isVisiblePublishedOrgScenario,
  pickRecommendedExercise,
  resolveExerciseCta,
  resolveExerciseMissionStatus,
  resolveUnlockedLevels,
  sortMissionExercises,
  type MissionAssignmentInput,
  type MissionAttemptInput,
  type MissionExerciseInput,
  type MissionExerciseView,
} from "@/lib/teleproMissions";
import { ScenarioStatus, SimulationStatus } from "@/lib/enums";

function read(rel: string) {
  return readFileSync(path.resolve(rel), "utf8");
}

const ORG = "org-1";
const TELEPRO = "telepro-1";

function exercise(
  overrides: Partial<MissionExerciseInput> & Pick<MissionExerciseInput, "id" | "name">,
): MissionExerciseInput {
  return {
    missionLevel: 1,
    sortOrder: 0,
    level: "MOYEN",
    objective: "Obtenir un RDV",
    prospectProfile: "DRH PME",
    personality: "Direct",
    successConditions: "RDV calendrier",
    targetDurationSec: 300,
    status: ScenarioStatus.PUBLISHED,
    organizationId: ORG,
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

function assignment(
  scenario: MissionExerciseInput,
  overrides: Partial<MissionAssignmentInput> = {},
): MissionAssignmentInput {
  return {
    teleproId: TELEPRO,
    organizationId: ORG,
    scenarioId: scenario.id,
    scenario,
    ...overrides,
  };
}

describe("teleproMissions ? visibilite", () => {
  it("1. DRAFT invisible", () => {
    const draft = exercise({
      id: "d1",
      name: "Draft",
      status: ScenarioStatus.DRAFT,
    });
    expect(
      isVisibleAssignedScenario(draft, assignment(draft), TELEPRO, ORG),
    ).toBe(false);
    expect(
      filterVisibleAssignments([assignment(draft)], TELEPRO, ORG),
    ).toHaveLength(0);
  });

  it("2. ARCHIVED invisible", () => {
    const archived = exercise({
      id: "a1",
      name: "Archived",
      status: ScenarioStatus.ARCHIVED,
    });
    expect(
      isVisibleAssignedScenario(archived, assignment(archived), TELEPRO, ORG),
    ).toBe(false);
  });

  it("3. scenario autre organisation invisible", () => {
    const foreign = exercise({
      id: "f1",
      name: "Foreign",
      organizationId: "org-other",
    });
    expect(
      isVisibleAssignedScenario(
        foreign,
        assignment(foreign, { organizationId: ORG }),
        TELEPRO,
        ORG,
      ),
    ).toBe(false);
  });

  it("4. scenario non assigne: historique assignment invisible, catalogue org visible", () => {
    const s = exercise({ id: "s1", name: "Solo" });
    expect(isVisibleAssignedScenario(s, null, TELEPRO, ORG)).toBe(false);
    expect(
      isVisibleAssignedScenario(
        s,
        assignment(s, { teleproId: "other-telepro" }),
        TELEPRO,
        ORG,
      ),
    ).toBe(false);
    expect(isVisiblePublishedOrgScenario(s, ORG)).toBe(true);
    const catalog = buildTeleproMissionsView([s], []);
    expect(catalog.empty).toBe(false);
    expect(catalog.totalCount).toBe(1);
  });

  it("22. isolation stricte organizationId + teleproId", () => {
    const s = exercise({ id: "ok", name: "OK" });
    expect(
      isVisibleAssignedScenario(s, assignment(s), TELEPRO, ORG),
    ).toBe(true);
    expect(
      isVisibleAssignedScenario(
        s,
        assignment(s, { organizationId: "org-x" }),
        TELEPRO,
        ORG,
      ),
    ).toBe(false);
    const view = buildTeleproMissionsView(
      filterVisibleAssignments(
        [
          assignment(s),
          assignment(exercise({ id: "x", name: "X", organizationId: "org-x" }), {
            organizationId: "org-x",
          }),
        ],
        TELEPRO,
        ORG,
      ),
      [],
    );
    expect(view.exercises.map((e) => e.id)).toEqual(["ok"]);
  });
});

describe("teleproMissions ? tri et niveaux", () => {
  it("5. tri missionLevel / sortOrder / name / id", () => {
    const sorted = sortMissionExercises([
      exercise({ id: "b", name: "Beta", missionLevel: 2, sortOrder: 0 }),
      exercise({ id: "a2", name: "Alpha", missionLevel: 1, sortOrder: 1 }),
      exercise({ id: "a1", name: "Alpha", missionLevel: 1, sortOrder: 0 }),
      exercise({ id: "c", name: "Alpha", missionLevel: 1, sortOrder: 0 }),
      exercise({ id: "legacy", name: "Legacy", missionLevel: 1, sortOrder: 0 }),
    ]);
    expect(sorted.map((e) => e.id)).toEqual([
      "a1",
      "c",
      "legacy",
      "a2",
      "b",
    ]);
  });

  it("6. premier niveau present debloque", () => {
    const exercises = [
      exercise({ id: "l3", name: "L3", missionLevel: 3 }),
      exercise({ id: "l5", name: "L5", missionLevel: 5 }),
    ];
    const unlocked = resolveUnlockedLevels(exercises, new Set());
    expect(unlocked.has(3)).toBe(true);
    expect(unlocked.has(5)).toBe(false);
  });

  it("7. niveau superieur verrouille", () => {
    const view = buildTeleproMissionsView(
      [
        exercise({ id: "e1", name: "E1", missionLevel: 1 }),
        exercise({ id: "e2", name: "E2", missionLevel: 2 }),
      ],
      [],
    );
    expect(view.exercises[0]?.status).toBe(ExerciseMissionStatus.AVAILABLE);
    expect(view.exercises[1]?.status).toBe(ExerciseMissionStatus.LOCKED);
  });

  it("8. niveau superieur debloque quand precedents termines", () => {
    const view = buildTeleproMissionsView(
      [
        exercise({ id: "e1", name: "E1", missionLevel: 1 }),
        exercise({ id: "e2", name: "E2", missionLevel: 2 }),
      ],
      [
        attempt({
          id: "sim1",
          scenarioId: "e1",
          status: SimulationStatus.COMPLETED,
          evaluation: {
            overallScore: 80,
            summary: "Bien",
            outcome: "RDV",
          },
        }),
      ],
    );
    expect(view.exercises[0]?.status).toBe(ExerciseMissionStatus.PASSED);
    expect(view.exercises[1]?.status).toBe(ExerciseMissionStatus.AVAILABLE);
  });

  it("9. trou dans les numeros de niveau sans blocage artificiel", () => {
    const view = buildTeleproMissionsView(
      [
        exercise({ id: "e1", name: "E1", missionLevel: 1 }),
        exercise({ id: "e3", name: "E3", missionLevel: 3 }),
      ],
      [
        attempt({
          id: "sim1",
          scenarioId: "e1",
          status: SimulationStatus.COMPLETED,
          evaluation: { overallScore: 70, summary: null, outcome: "RDV" },
        }),
      ],
    );
    expect(view.exercises.find((e) => e.id === "e3")?.status).toBe(
      ExerciseMissionStatus.AVAILABLE,
    );
  });
});

describe("teleproMissions ? statuts", () => {
  it("10. tentative active -> IN_PROGRESS", () => {
    expect(isActiveSimulationStatus(SimulationStatus.CREATED)).toBe(true);
    expect(isActiveSimulationStatus(SimulationStatus.IN_PROGRESS)).toBe(true);
    const view = buildTeleproMissionsView(
      [exercise({ id: "e1", name: "E1" })],
      [
        attempt({
          id: "sim-active",
          scenarioId: "e1",
          status: SimulationStatus.IN_PROGRESS,
        }),
      ],
    );
    expect(view.exercises[0]?.status).toBe(ExerciseMissionStatus.IN_PROGRESS);
    expect(view.exercises[0]?.activeSimulationId).toBe("sim-active");
  });

  it("11. tentative terminee sans evaluation ne valide pas (reste AVAILABLE)", () => {
    expect(isFinishedSimulationStatus(SimulationStatus.COMPLETED)).toBe(true);
    expect(isFinishedSimulationStatus(SimulationStatus.EVALUATION_FAILED)).toBe(
      true,
    );
    expect(
      isFinishedSimulationStatus(SimulationStatus.EVALUATION_PENDING),
    ).toBe(true);
    // Une tentative terminee sans score valide (ex. EVALUATION_FAILED) ne
    // valide jamais l'exercice : le niveau reste simplement disponible.
    const view = buildTeleproMissionsView(
      [exercise({ id: "e1", name: "E1" })],
      [
        attempt({
          id: "sim-end",
          scenarioId: "e1",
          status: SimulationStatus.EVALUATION_FAILED,
        }),
      ],
    );
    expect(view.exercises[0]?.status).toBe(ExerciseMissionStatus.AVAILABLE);
    expect(view.exercises[0]?.isPassed).toBe(false);
  });

  it("12. PASSED prioritaire sur verrouillage", () => {
    const view = buildTeleproMissionsView(
      [
        exercise({ id: "e1", name: "E1", missionLevel: 1 }),
        exercise({ id: "e2", name: "E2", missionLevel: 2 }),
      ],
      [
        attempt({
          id: "sim2",
          scenarioId: "e2",
          status: SimulationStatus.COMPLETED,
          evaluation: { overallScore: 90, summary: "Top", outcome: "VENTE" },
        }),
      ],
    );
    const e2 = view.exercises.find((e) => e.id === "e2");
    expect(e2?.status).toBe(ExerciseMissionStatus.PASSED);
    expect(e2?.statusLabel).toBe(EXERCISE_MISSION_STATUS_LABELS.PASSED);
  });

  it("priorite resolver pur", () => {
    // Actif prioritaire sur tout, meme deja passe.
    expect(
      resolveExerciseMissionStatus({
        isPassed: true,
        hasActiveAttempt: true,
        hasAnalysisPending: false,
        hasEvaluatedBelowThreshold: false,
        levelUnlocked: false,
      }),
    ).toBe(ExerciseMissionStatus.IN_PROGRESS);
    // Analyse en cours prioritaire sur verrouillage.
    expect(
      resolveExerciseMissionStatus({
        isPassed: false,
        hasActiveAttempt: false,
        hasAnalysisPending: true,
        hasEvaluatedBelowThreshold: false,
        levelUnlocked: false,
      }),
    ).toBe(ExerciseMissionStatus.ANALYSIS_PENDING);
    // Score valide -> PASSED.
    expect(
      resolveExerciseMissionStatus({
        isPassed: true,
        hasActiveAttempt: false,
        hasAnalysisPending: false,
        hasEvaluatedBelowThreshold: false,
        levelUnlocked: false,
      }),
    ).toBe(ExerciseMissionStatus.PASSED);
    // Sous le seuil mais niveau deverrouille -> TO_RETRY.
    expect(
      resolveExerciseMissionStatus({
        isPassed: false,
        hasActiveAttempt: false,
        hasAnalysisPending: false,
        hasEvaluatedBelowThreshold: true,
        levelUnlocked: true,
      }),
    ).toBe(ExerciseMissionStatus.TO_RETRY);
    // Sous le seuil et niveau verrouille -> LOCKED (jamais TO_RETRY).
    expect(
      resolveExerciseMissionStatus({
        isPassed: false,
        hasActiveAttempt: false,
        hasAnalysisPending: false,
        hasEvaluatedBelowThreshold: true,
        levelUnlocked: false,
      }),
    ).toBe(ExerciseMissionStatus.LOCKED);
    expect(
      resolveExerciseMissionStatus({
        isPassed: false,
        hasActiveAttempt: false,
        hasAnalysisPending: false,
        hasEvaluatedBelowThreshold: false,
        levelUnlocked: true,
      }),
    ).toBe(ExerciseMissionStatus.AVAILABLE);
    expect(
      resolveExerciseMissionStatus({
        isPassed: false,
        hasActiveAttempt: false,
        hasAnalysisPending: false,
        hasEvaluatedBelowThreshold: false,
        levelUnlocked: false,
      }),
    ).toBe(ExerciseMissionStatus.LOCKED);
  });
});

describe("teleproMissions ? recommandation", () => {
  it("13. recommandation IN_PROGRESS prioritaire", () => {
    const view = buildTeleproMissionsView(
      [
        exercise({ id: "e1", name: "A", missionLevel: 1, sortOrder: 0 }),
        exercise({ id: "e2", name: "B", missionLevel: 1, sortOrder: 1 }),
      ],
      [
        attempt({
          id: "sim-b",
          scenarioId: "e2",
          status: SimulationStatus.CREATED,
        }),
      ],
    );
    expect(view.recommended?.id).toBe("e2");
    expect(view.recommended?.status).toBe(ExerciseMissionStatus.IN_PROGRESS);
  });

  it("14. recommandation premier AVAILABLE sinon", () => {
    const view = buildTeleproMissionsView(
      [
        exercise({ id: "e1", name: "A", sortOrder: 0 }),
        exercise({ id: "e2", name: "B", sortOrder: 1 }),
      ],
      [],
    );
    expect(view.recommended?.id).toBe("e1");
    expect(view.recommended?.status).toBe(ExerciseMissionStatus.AVAILABLE);
  });

  it("15. tout termine -> aucune recommandation", () => {
    // Score >= seuil (60) requis pour que l'exercice compte comme termine.
    const view = buildTeleproMissionsView(
      [exercise({ id: "e1", name: "A" })],
      [
        attempt({
          id: "sim1",
          scenarioId: "e1",
          status: SimulationStatus.COMPLETED,
          evaluation: { overallScore: 80, summary: null, outcome: null },
        }),
      ],
    );
    expect(view.allCompleted).toBe(true);
    expect(view.recommended).toBeNull();
    expect(pickRecommendedExercise(view.exercises)).toBeNull();
  });

  it("16. catalogue vide sans exercices -> etat vide", () => {
    const view = buildTeleproMissionsView([], []);
    expect(view.empty).toBe(true);
    expect(view.totalCount).toBe(0);
    expect(view.recommended).toBeNull();
    expect(view.groups).toEqual([]);
  });
});

describe("teleproMissions ? resultat precedent et CTA", () => {
  it("17. resultat precedent le plus recent", () => {
    const view = buildTeleproMissionsView(
      [exercise({ id: "e1", name: "A" })],
      [
        attempt({
          id: "old",
          scenarioId: "e1",
          status: SimulationStatus.COMPLETED,
          updatedAt: "2026-07-01T10:00:00.000Z",
          evaluation: { overallScore: 40, summary: "Ancien", outcome: "REFUS" },
        }),
        attempt({
          id: "new",
          scenarioId: "e1",
          status: SimulationStatus.COMPLETED,
          updatedAt: "2026-08-01T12:00:00.000Z",
          evaluation: { overallScore: 88, summary: "Recent", outcome: "RDV" },
        }),
      ],
    );
    expect(view.exercises[0]?.previousResult?.simulationId).toBe("new");
    expect(view.exercises[0]?.previousResult?.overallScore).toBe(88);
    expect(view.exercises[0]?.previousResult?.summary).toBe("Recent");
  });

  it("18. evaluation absente sans relance", () => {
    const view = buildTeleproMissionsView(
      [exercise({ id: "e1", name: "A" })],
      [
        attempt({
          id: "pending",
          scenarioId: "e1",
          status: SimulationStatus.EVALUATION_PENDING,
          evaluation: null,
          outcome: "RDV",
        }),
      ],
    );
    const prev = view.exercises[0]?.previousResult;
    expect(prev?.evaluationPending).toBe(true);
    expect(prev?.overallScore).toBeNull();
    expect(prev?.analysisHref).toBe("/app/analysis/pending");
    const src = read("src/lib/teleproMissions.ts");
    expect(src).not.toContain("runSimulationEvaluation");
    expect(src).not.toContain("retry-evaluation");
    expect(src).not.toMatch(/from\s+["']openai["']/);
  });

  it("19. CTA prepare/call/analysis corrects", () => {
    expect(
      resolveExerciseCta(ExerciseMissionStatus.IN_PROGRESS, "ex", "sim-9"),
    ).toEqual({
      ctaHref: "/app/call/sim-9",
      ctaLabel: "Reprendre",
    });
    expect(
      resolveExerciseCta(ExerciseMissionStatus.AVAILABLE, "ex", null),
    ).toEqual({
      ctaHref: "/app/prepare/ex",
      ctaLabel: "Commencer",
    });
    expect(
      resolveExerciseCta(ExerciseMissionStatus.LOCKED, "ex", null),
    ).toEqual({ ctaHref: null, ctaLabel: null });

    const view = buildTeleproMissionsView(
      [
        exercise({ id: "avail", name: "Avail", sortOrder: 0 }),
        exercise({ id: "active", name: "Active", sortOrder: 1 }),
        exercise({ id: "done", name: "Done", missionLevel: 2 }),
      ],
      [
        attempt({
          id: "sim-active",
          scenarioId: "active",
          status: SimulationStatus.IN_PROGRESS,
        }),
        attempt({
          id: "sim-done",
          scenarioId: "done",
          status: SimulationStatus.COMPLETED,
          evaluation: { overallScore: 77, summary: "OK", outcome: "RDV" },
        }),
      ],
    );
    const byId = Object.fromEntries(view.exercises.map((e) => [e.id, e]));
    expect(byId.avail?.ctaHref).toBe("/app/prepare/avail");
    expect(byId.active?.ctaHref).toBe("/app/call/sim-active");
    expect(byId.done?.previousResult?.analysisHref).toBe(
      "/app/analysis/sim-done",
    );
    expect(byId.done?.ctaHref).toBe("/app/prepare/done");
  });
});

describe("teleproMissions ? isolation secrets et OpenAI", () => {
  it("20. absence de prompt/artifact/hash/secret dans le modele de vue", () => {
    const view = buildTeleproMissionsView(
      [exercise({ id: "e1", name: "Safe" })],
      [],
    );
    const json = JSON.stringify(view);
    for (const needle of [
      "artifacts",
      "contentHash",
      "secretInfos",
      "aiProspect",
      "PROSPECT_PERSONA",
      "promptBundle",
      "EVALUATION_SYSTEM",
    ]) {
      expect(json.toLowerCase()).not.toContain(needle.toLowerCase());
    }
    const ex = view.exercises[0] as MissionExerciseView;
    expect(ex).toHaveProperty("prospectProfile");
    expect(ex).not.toHaveProperty("secretInfos");
    expect(ex).not.toHaveProperty("aiProspect");
  });

  it("21. aucune dependance OpenAI", () => {
    for (const rel of [
      "src/lib/teleproMissions.ts",
      "src/lib/teleproMissionsService.ts",
      "src/app/app/page.tsx",
      "src/app/app/missions/page.tsx",
    ]) {
      const src = read(rel);
      expect(src).not.toMatch(/from\s+["']openai["']/);
      expect(src).not.toMatch(/providers\/openai/);
      expect(src).not.toMatch(/\bcreateOpenAI\b/);
      expect(src.toLowerCase()).not.toContain("from \"openai\"");
    }
  });

  it("service filtre PUBLISHED org global et select sur champs surs uniquement", () => {
    const src = read("src/lib/teleproMissionsService.ts");
    expect(src).toContain("ScenarioStatus.PUBLISHED");
    expect(src).toContain("teleproId");
    expect(src).toContain("organizationId");
    expect(src).toContain("SCENARIO_SAFE_SELECT");
    expect(src).toContain("loadPublishedOrgExercisesAndAttempts");
    expect(src).not.toMatch(/scenarioAssignment\.findMany/);
    expect(src).not.toContain("secretInfos");
    expect(src).not.toContain("aiProspect");
    expect(src).not.toMatch(/artifacts\s*:/);
    expect(src).not.toMatch(/contentHash\s*:/);
    expect(src).toContain("SCENARIO_SAFE_SELECT");
    expect(src).toContain("jamais artifacts");
    expect(src).toContain('import "server-only"');
  });

  it("pages Accueil et Missions consomment le moteur partage", () => {
    for (const rel of ["src/app/app/page.tsx", "src/app/app/missions/page.tsx"]) {
      const src = read(rel);
      expect(src).toContain("requireTelepro");
      expect(src).toContain("loadTeleproMissionsView");
      expect(src).not.toContain("secretInfos");
      expect(src).not.toContain("aiProspect");
      expect(src).not.toContain("artifacts");
    }
  });
});
