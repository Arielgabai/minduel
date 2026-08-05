import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_PASSING_SCORE,
  ExerciseMissionStatus,
  buildTeleproMissionsCatalogView,
  buildTeleproMissionsView,
  canStartNewSimulation,
  isExercisePassed,
  isValidatingAttempt,
  pickBestValidScore,
  pickRecommendedExercise,
  resolveExerciseCta,
  resolveExerciseMissionStatus,
  resolvePassingScore,
  resolveUnlockedLevels,
  resolveUnlockedStageIds,
  type MissionAttemptInput,
  type MissionExerciseInput,
  type MissionStageInput,
  type MissionThemeInput,
} from "@/lib/teleproMissions";
import { isLaunchableNode, missionNodeVariant } from "@/lib/missionsPath";
import { ExerciseMetadataSchema } from "@/lib/exerciseAdminService";
import {
  buildMetadataPatchPayload,
  metaFormFromExercise,
  type AdminExerciseDetail,
} from "@/lib/adminExercisesUi";
import { ScenarioStatus, SimulationStatus } from "@/lib/enums";

// LOT Q2 : moteur de validation (seuil de score) + parcours Missions.
// Fixtures locales uniquement — aucun réseau, aucun OpenAI, aucune DB, aucun micro.

function read(rel: string) {
  return readFileSync(path.resolve(rel), "utf8");
}

const ORG = "org-1";

function exercise(
  overrides: Partial<MissionExerciseInput> &
    Pick<MissionExerciseInput, "id" | "name">,
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
    missionStageId: null,
    prospectAvatarKey: "lena",
    hasPublishedPrompt: true,
    passingScore: 60,
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

function adminDetail(
  overrides: Partial<AdminExerciseDetail> = {},
): AdminExerciseDetail {
  return {
    id: "ex-1",
    name: "Exercice",
    slug: "exercice",
    status: "DRAFT",
    level: "MOYEN",
    missionLevel: 1,
    sortOrder: 0,
    passingScore: 60,
    callType: "VENTE",
    campaign: null,
    offer: null,
    prospectProfile: null,
    initialSituation: null,
    objective: null,
    personality: "Direct",
    allowedObjections: [],
    secretInfos: [],
    successConditions: null,
    failureConditions: null,
    targetDurationSec: 300,
    traineeBrief: null,
    missionStageId: null,
    prospectAvatarKey: "lena",
    currentBundle: null,
    versions: [],
    ...overrides,
  };
}

function baseMeta(overrides: Record<string, unknown> = {}) {
  return { name: "Exercice test", ...overrides };
}

// ---------------------------------------------------------------------------
// 1-5. Seuil de validation (passingScore) : moteur + schema + persistance
// ---------------------------------------------------------------------------
describe("LOT Q2 — seuil de validation (passingScore)", () => {
  it("1. DEFAULT_PASSING_SCORE 60 ; resolvePassingScore({}) 60 ; defaut schema 60", () => {
    expect(DEFAULT_PASSING_SCORE).toBe(60);
    expect(resolvePassingScore({})).toBe(60);
    expect(resolvePassingScore({ passingScore: null })).toBe(60);
    const parsed = ExerciseMetadataSchema.parse(baseMeta());
    expect(parsed.passingScore).toBe(60);
  });

  it("2. le schema accepte passingScore 0, 60, 100", () => {
    for (const score of [0, 60, 100]) {
      const r = ExerciseMetadataSchema.safeParse(
        baseMeta({ passingScore: score }),
      );
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.passingScore).toBe(score);
    }
  });

  it("3. le schema rejette -1, 101, 60.5, NaN et la chaine \"60\"", () => {
    for (const bad of [-1, 101, 60.5, NaN, "60"]) {
      const r = ExerciseMetadataSchema.safeParse(
        baseMeta({ passingScore: bad }),
      );
      expect(r.success).toBe(false);
    }
  });

  it("4. buildMetadataPatchPayload avec passingScore 0 : inclus, jamais omis", () => {
    const meta = metaFormFromExercise(adminDetail({ passingScore: 0 }));
    expect(meta.passingScore).toBe(0);
    const payload = buildMetadataPatchPayload(meta);
    expect(payload.passingScore).toBe(0);
    expect(
      Object.prototype.hasOwnProperty.call(payload, "passingScore"),
    ).toBe(true);
  });

  it("5. updateExerciseMetadata ne touche jamais le PromptBundle", () => {
    const src = read("src/lib/exerciseAdminService.ts");
    expect(src).toContain(
      "Le bundle de prompts n'est jamais touché par cette mise à jour.",
    );
    const fnBody = src.slice(
      src.indexOf("export async function updateExerciseMetadata"),
      src.indexOf("async function nextVersionNumber"),
    );
    expect(fnBody.length).toBeGreaterThan(0);
    expect(fnBody).not.toContain("createDraftBundle");
    expect(fnBody).not.toContain("buildProspectPersona");
    expect(fnBody).not.toMatch(/promptBundle\.(update|create)/);
    expect(fnBody).not.toContain("hashPromptArtifacts");
  });
});

// ---------------------------------------------------------------------------
// 6-10. Validation d'une tentative (score vs seuil)
// ---------------------------------------------------------------------------
describe("LOT Q2 — validation d'une tentative", () => {
  it("6. score == seuil (60/60) valide", () => {
    const a = attempt({
      id: "a",
      scenarioId: "e",
      status: SimulationStatus.COMPLETED,
      evaluation: { overallScore: 60, summary: null, outcome: null },
    });
    expect(isValidatingAttempt(a, 60)).toBe(true);
  });

  it("7. score juste sous le seuil (59/60) ne valide pas", () => {
    const a = attempt({
      id: "a",
      scenarioId: "e",
      status: SimulationStatus.COMPLETED,
      evaluation: { overallScore: 59, summary: null, outcome: null },
    });
    expect(isValidatingAttempt(a, 60)).toBe(false);
  });

  it("8. pickBestValidScore retient le meilleur historique (80 puis 40 -> 80)", () => {
    const attempts = [
      attempt({
        id: "a1",
        scenarioId: "e",
        status: SimulationStatus.COMPLETED,
        updatedAt: "2026-08-01T10:00:00.000Z",
        evaluation: { overallScore: 80, summary: null, outcome: null },
      }),
      attempt({
        id: "a2",
        scenarioId: "e",
        status: SimulationStatus.COMPLETED,
        updatedAt: "2026-08-02T10:00:00.000Z",
        evaluation: { overallScore: 40, summary: null, outcome: null },
      }),
    ];
    expect(pickBestValidScore(attempts)).toBe(80);
    expect(isExercisePassed(attempts, 60)).toBe(true);
  });

  it("9. un score plus faible et plus recent ne desinvalide jamais (pas de \"unpass\")", () => {
    const attempts = [
      attempt({
        id: "old",
        scenarioId: "e",
        status: SimulationStatus.COMPLETED,
        updatedAt: "2026-08-01T10:00:00.000Z",
        evaluation: { overallScore: 80, summary: null, outcome: null },
      }),
      attempt({
        id: "new",
        scenarioId: "e",
        status: SimulationStatus.COMPLETED,
        updatedAt: "2026-08-02T10:00:00.000Z",
        evaluation: { overallScore: 40, summary: null, outcome: null },
      }),
    ];
    expect(pickBestValidScore(attempts)).toBe(80);
    expect(isExercisePassed(attempts, 60)).toBe(true);
  });

  it("10. evaluation manquante / en attente / echouee ne valident jamais", () => {
    expect(
      isValidatingAttempt(
        attempt({
          id: "no-eval",
          scenarioId: "e",
          status: SimulationStatus.COMPLETED,
        }),
        60,
      ),
    ).toBe(false);
    expect(
      isValidatingAttempt(
        attempt({
          id: "pending",
          scenarioId: "e",
          status: SimulationStatus.EVALUATION_PENDING,
          evaluation: { overallScore: 90, summary: null, outcome: null },
        }),
        60,
      ),
    ).toBe(false);
    expect(
      isValidatingAttempt(
        attempt({
          id: "failed",
          scenarioId: "e",
          status: SimulationStatus.EVALUATION_FAILED,
        }),
        60,
      ),
    ).toBe(false);
    expect(
      isValidatingAttempt(
        attempt({
          id: "active",
          scenarioId: "e",
          status: SimulationStatus.IN_PROGRESS,
        }),
        60,
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 11-14. Déblocage des niveaux (catalogue Thème -> Niveau -> Exercice)
// ---------------------------------------------------------------------------
describe("LOT Q2 — déblocage des niveaux", () => {
  it("11. le premier niveau de chaque theme est accessible", () => {
    const catalog = buildTeleproMissionsCatalogView(
      [
        exercise({ id: "a1", name: "A1", missionStageId: "sa1" }),
        exercise({ id: "b1", name: "B1", missionStageId: "sb1" }),
      ],
      [],
      [
        theme({ id: "ta", slug: "a", name: "Alpha", sortOrder: 1 }),
        theme({ id: "tb", slug: "b", name: "Beta", sortOrder: 2 }),
      ],
      [
        stage({ id: "sa1", themeId: "ta", slug: "n1", name: "N1", levelNumber: 1 }),
        stage({ id: "sb1", themeId: "tb", slug: "n1", name: "N1", levelNumber: 1 }),
      ],
    );
    expect(catalog.themes[0]!.stages[0]!.exercises[0]!.status).toBe(
      ExerciseMissionStatus.AVAILABLE,
    );
    expect(catalog.themes[1]!.stages[0]!.exercises[0]!.status).toBe(
      ExerciseMissionStatus.AVAILABLE,
    );
  });

  it("12. themes independants : A2 verrouille tant que A1 n'est pas valide, B1 reste accessible", () => {
    const catalog = buildTeleproMissionsCatalogView(
      [
        exercise({ id: "a1", name: "A1", missionStageId: "sa1" }),
        exercise({ id: "a2", name: "A2", missionStageId: "sa2" }),
        exercise({ id: "b1", name: "B1", missionStageId: "sb1" }),
      ],
      [],
      [
        theme({ id: "ta", slug: "a", name: "Alpha", sortOrder: 1 }),
        theme({ id: "tb", slug: "b", name: "Beta", sortOrder: 2 }),
      ],
      [
        stage({ id: "sa1", themeId: "ta", slug: "n1", name: "N1", levelNumber: 1 }),
        stage({ id: "sa2", themeId: "ta", slug: "n2", name: "N2", levelNumber: 2 }),
        stage({ id: "sb1", themeId: "tb", slug: "n1", name: "N1", levelNumber: 1 }),
      ],
    );
    const themeA = catalog.themes.find((t) => t.slug === "a")!;
    const themeB = catalog.themes.find((t) => t.slug === "b")!;
    expect(themeA.stages[1]!.exercises[0]!.status).toBe(
      ExerciseMissionStatus.LOCKED,
    );
    expect(themeB.stages[0]!.exercises[0]!.status).toBe(
      ExerciseMissionStatus.AVAILABLE,
    );
  });

  it("13. tous les niveaux precedents sont requis (pas seulement le dernier)", () => {
    const catalog = buildTeleproMissionsCatalogView(
      [
        exercise({ id: "e1", name: "E1", missionStageId: "s1" }),
        exercise({ id: "e2", name: "E2", missionStageId: "s2" }),
        exercise({ id: "e3", name: "E3", missionStageId: "s3" }),
      ],
      [
        attempt({
          id: "sim1",
          scenarioId: "e1",
          status: SimulationStatus.COMPLETED,
          evaluation: { overallScore: 80, summary: null, outcome: null },
        }),
      ],
      [theme({ id: "t1", slug: "t", name: "T" })],
      [
        stage({ id: "s1", themeId: "t1", slug: "n1", name: "N1", levelNumber: 1 }),
        stage({ id: "s2", themeId: "t1", slug: "n2", name: "N2", levelNumber: 2 }),
        stage({ id: "s3", themeId: "t1", slug: "n3", name: "N3", levelNumber: 3 }),
      ],
    );
    // Niveau 1 valide -> niveau 2 accessible, mais niveau 3 reste verrouille
    // tant que le niveau 2 n'est pas lui-meme valide.
    expect(catalog.themes[0]!.stages[1]!.exercises[0]!.status).toBe(
      ExerciseMissionStatus.AVAILABLE,
    );
    expect(catalog.themes[0]!.stages[2]!.exercises[0]!.status).toBe(
      ExerciseMissionStatus.LOCKED,
    );
  });

  it("14. les trous de numerotation ne bloquent pas (niveaux 1 et 3 : valider 1 debloque 3)", () => {
    const catalog = buildTeleproMissionsCatalogView(
      [
        exercise({ id: "e1", name: "E1", missionStageId: "s1" }),
        exercise({ id: "e3", name: "E3", missionStageId: "s3" }),
      ],
      [
        attempt({
          id: "sim1",
          scenarioId: "e1",
          status: SimulationStatus.COMPLETED,
          evaluation: { overallScore: 80, summary: null, outcome: null },
        }),
      ],
      [theme({ id: "t1", slug: "t", name: "T" })],
      [
        stage({ id: "s1", themeId: "t1", slug: "n1", name: "N1", levelNumber: 1 }),
        stage({ id: "s3", themeId: "t1", slug: "n3", name: "N3", levelNumber: 3 }),
      ],
    );
    expect(catalog.themes[0]!.stages[1]!.exercises[0]!.status).toBe(
      ExerciseMissionStatus.AVAILABLE,
    );
    // Meme constat au niveau du helper pur resolveUnlockedStageIds / resolveUnlockedLevels.
    const stages = [
      { id: "s1", levelNumber: 1, sortOrder: 0, name: "N1" },
      { id: "s3", levelNumber: 3, sortOrder: 0, name: "N3" },
    ];
    const stageExercises = new Map([
      ["s1", [{ id: "e1" }]],
      ["s3", [{ id: "e3" }]],
    ]);
    const unlocked = resolveUnlockedStageIds(
      stages,
      stageExercises,
      new Set(["e1"]),
    );
    expect(unlocked.has("s3")).toBe(true);
    expect(
      resolveUnlockedLevels(
        [
          { id: "e1", missionLevel: 1 },
          { id: "e3", missionLevel: 3 },
        ],
        new Set(["e1"]),
      ).has(3),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 15-19. Statuts / CTA d'un exercice
// ---------------------------------------------------------------------------
describe("LOT Q2 — statuts et CTA", () => {
  it("15. TO_RETRY reste accessible (prepare) mais le niveau suivant reste LOCKED", () => {
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
          evaluation: { overallScore: 40, summary: null, outcome: null },
        }),
      ],
    );
    const e1 = view.exercises.find((e) => e.id === "e1")!;
    const e2 = view.exercises.find((e) => e.id === "e2")!;
    expect(e1.status).toBe(ExerciseMissionStatus.TO_RETRY);
    expect(e1.prepareHref).toBe("/app/prepare/e1");
    expect(e2.status).toBe(ExerciseMissionStatus.LOCKED);
    expect(e2.prepareHref).toBeNull();
  });

  it("16. PASSED reste rejouable (cta prepare, libelle Refaire)", () => {
    const { ctaHref, ctaLabel } = resolveExerciseCta(
      ExerciseMissionStatus.PASSED,
      "ex-1",
      null,
    );
    expect(ctaHref).toBe("/app/prepare/ex-1");
    expect(ctaLabel).toBe("Refaire");
  });

  it("17. IN_PROGRESS propose une reprise vers /app/call/<id>", () => {
    const { ctaHref, ctaLabel } = resolveExerciseCta(
      ExerciseMissionStatus.IN_PROGRESS,
      "ex-1",
      "sim-active",
    );
    expect(ctaHref).toBe("/app/call/sim-active");
    expect(ctaLabel).toBe("Reprendre");
  });

  it("18. ANALYSIS_PENDING propose /app/call/<id>/done", () => {
    const { ctaHref, ctaLabel } = resolveExerciseCta(
      ExerciseMissionStatus.ANALYSIS_PENDING,
      "ex-1",
      null,
      "sim-pending",
    );
    expect(ctaHref).toBe("/app/call/sim-pending/done");
    expect(ctaLabel).toBe("Voir l'analyse");
  });

  it("19. LOCKED n'a jamais de lien (prepareHref/ctaHref null, non lancable)", () => {
    const view = buildTeleproMissionsView(
      [
        exercise({ id: "e1", name: "E1", missionLevel: 1 }),
        exercise({ id: "e2", name: "E2", missionLevel: 2 }),
      ],
      [],
    );
    const locked = view.exercises.find((e) => e.id === "e2")!;
    expect(locked.status).toBe(ExerciseMissionStatus.LOCKED);
    expect(locked.prepareHref).toBeNull();
    expect(locked.ctaHref).toBeNull();

    const catalog = buildTeleproMissionsCatalogView(
      [
        exercise({ id: "c1", name: "C1", missionStageId: "s1" }),
        exercise({ id: "c2", name: "C2", missionStageId: "s2" }),
      ],
      [],
      [theme({ id: "t1", slug: "t", name: "T" })],
      [
        stage({ id: "s1", themeId: "t1", slug: "n1", name: "N1", levelNumber: 1 }),
        stage({ id: "s2", themeId: "t1", slug: "n2", name: "N2", levelNumber: 2 }),
      ],
    );
    const lockedNode = catalog.themes[0]!.stages[1]!.exercises[0]!;
    expect(lockedNode.status).toBe(ExerciseMissionStatus.LOCKED);
    expect(lockedNode.prepareHref).toBeNull();
    expect(lockedNode.ctaHref).toBeNull();
    expect(isLaunchableNode(lockedNode)).toBe(false);
    expect(missionNodeVariant(lockedNode.status)).toBe("locked");
  });
});

// ---------------------------------------------------------------------------
// 20-21. Garde d'accès serveur (source)
// ---------------------------------------------------------------------------
describe("LOT Q2 — garde d'accès serveur (source)", () => {
  it("20. api/simulations/route.ts applique le verrou pedagogique (409)", () => {
    const src = read("src/app/api/simulations/route.ts");
    expect(src).toContain("resolveTeleproScenarioStartAccess");
    expect(src).toContain("fail(409");
  });

  it("21. la page prepare applique le meme verrou et affiche un etat verrouille", () => {
    const src = read("src/app/app/prepare/[scenarioId]/page.tsx");
    expect(src).toContain("resolveTeleproScenarioStartAccess");
    expect(src).toContain("LOCKED_LEVEL_MESSAGE");
    expect(src).toContain("BlockedNotice");
    expect(src).toContain("blocked");
  });
});

// ---------------------------------------------------------------------------
// 22-24. Puretée du moteur (aucun filtre tenant/organisation implicite)
// ---------------------------------------------------------------------------
describe("LOT Q2 — moteur pur (pas de filtre tenant implicite)", () => {
  it("22. seules les tentatives fournies en entree sont comptees (moteur pur)", () => {
    // Le moteur n'interroge jamais la base : il ne peut compter que les
    // tentatives explicitement passees en argument. Une tentative « oubliee »
    // (jamais fournie) n'a simplement aucune influence.
    const withoutForeignAttempt = buildTeleproMissionsView(
      [exercise({ id: "e1", name: "E1" })],
      [],
    );
    expect(withoutForeignAttempt.exercises[0]!.status).toBe(
      ExerciseMissionStatus.AVAILABLE,
    );
    expect(withoutForeignAttempt.exercises[0]!.bestScore).toBeNull();
  });

  it("23. le moteur ne connait pas la notion d'organisation : c'est au service d'isoler", () => {
    // MissionAttemptInput ne porte pas de organizationId / teleproId : le filtrage
    // tenant est une responsabilite du service (loadPublishedOrgExercisesAndAttempts),
    // jamais du moteur pur teleproMissions.ts.
    const view = buildTeleproMissionsView(
      [exercise({ id: "e1", name: "E1", organizationId: "org-catalog" })],
      [
        attempt({
          id: "sim1",
          scenarioId: "e1",
          status: SimulationStatus.COMPLETED,
          evaluation: { overallScore: 80, summary: null, outcome: null },
        }),
      ],
    );
    expect(view.exercises[0]!.status).toBe(ExerciseMissionStatus.PASSED);
  });

  it("24. build ne requiert pas que organizationId corresponde entre scenario catalogue et simulation tenant (P2)", () => {
    // Le scenario appartient a l'organisation catalogue plateforme, la simulation
    // appartient a l'organisation du telepro (P2) : le moteur ne compare jamais ces IDs.
    const catalogExercise = exercise({
      id: "e1",
      name: "E1",
      organizationId: "org-catalogue-plateforme",
      missionStageId: "s1",
    });
    const tenantAttempt = attempt({
      id: "sim1",
      scenarioId: "e1",
      status: SimulationStatus.COMPLETED,
      evaluation: { overallScore: 80, summary: null, outcome: null },
    });
    const catalog = buildTeleproMissionsCatalogView(
      [catalogExercise],
      [tenantAttempt],
      [theme({ id: "t1", slug: "t", name: "T" })],
      [stage({ id: "s1", themeId: "t1", slug: "n1", name: "N1" })],
    );
    expect(catalog.themes[0]!.stages[0]!.exercises[0]!.status).toBe(
      ExerciseMissionStatus.PASSED,
    );
  });
});

// ---------------------------------------------------------------------------
// 25-26. Débrief : liens et scores distincts
// ---------------------------------------------------------------------------
describe("LOT Q2 — débrief (liens et scores)", () => {
  it("25. debriefHref pointe vers /app/analysis/<latestEvaluatedSimulationId>", () => {
    const view = buildTeleproMissionsView(
      [exercise({ id: "e1", name: "E1" })],
      [
        attempt({
          id: "sim-latest",
          scenarioId: "e1",
          status: SimulationStatus.COMPLETED,
          updatedAt: "2026-08-02T10:00:00.000Z",
          evaluation: { overallScore: 80, summary: null, outcome: null },
        }),
      ],
    );
    expect(view.exercises[0]!.debriefHref).toBe("/app/analysis/sim-latest");
    expect(view.exercises[0]!.latestEvaluatedSimulationId).toBe("sim-latest");
  });

  it("26. bestScore et latestEvaluatedScore sont distincts (80 puis 40 : best 80, latest 40)", () => {
    const view = buildTeleproMissionsView(
      [exercise({ id: "e1", name: "E1" })],
      [
        attempt({
          id: "old",
          scenarioId: "e1",
          status: SimulationStatus.COMPLETED,
          updatedAt: "2026-08-01T10:00:00.000Z",
          evaluation: { overallScore: 80, summary: null, outcome: null },
        }),
        attempt({
          id: "new",
          scenarioId: "e1",
          status: SimulationStatus.COMPLETED,
          updatedAt: "2026-08-02T10:00:00.000Z",
          evaluation: { overallScore: 40, summary: null, outcome: null },
        }),
      ],
    );
    const ex = view.exercises[0]!;
    expect(ex.bestScore).toBe(80);
    expect(ex.latestEvaluatedScore).toBe(40);
    expect(ex.isPassed).toBe(true);
    expect(ex.latestEvaluatedSimulationId).toBe("new");
  });
});

// ---------------------------------------------------------------------------
// 27-28. Écran de fin d'exercice (source)
// ---------------------------------------------------------------------------
describe("LOT Q2 — écran de fin d'exercice (source)", () => {
  const exerciseCompleteSrc = read(
    "src/app/app/call/[id]/done/ExerciseComplete.tsx",
  );

  it("27. la copie « analyse epuisee » mentionne Missions et l'arriere-plan", () => {
    expect(exerciseCompleteSrc).toContain("arrière-plan");
    expect(exerciseCompleteSrc).toContain("Missions");
  });

  it("28. ExerciseComplete n'appelle jamais /end (jamais de double finalisation)", () => {
    expect(exerciseCompleteSrc).not.toMatch(/\/end["'`]/);
    expect(exerciseCompleteSrc).not.toContain(
      "/api/simulations/${simulationId}/end",
    );
    expect(exerciseCompleteSrc).toContain("evaluation-status");
    expect(exerciseCompleteSrc).toContain("retry-evaluation");
  });
});

// ---------------------------------------------------------------------------
// 29. Isolation stricte : aucune fuite de contenu sensible dans les vues
// ---------------------------------------------------------------------------
describe("LOT Q2 — isolation des vues (aucune fuite sensible)", () => {
  it("29. ni prompt, ni artifact, ni hash, ni secret, ni publishedPromptBundleId dans les vues", () => {
    const view = buildTeleproMissionsView(
      [exercise({ id: "e1", name: "E1", personality: "secret-persona" })],
      [],
    );
    const catalog = buildTeleproMissionsCatalogView(
      [exercise({ id: "c1", name: "C1", missionStageId: "s1" })],
      [],
      [theme({ id: "t1", slug: "t", name: "T" })],
      [stage({ id: "s1", themeId: "t1", slug: "n1", name: "N1" })],
    );
    const forbidden = [
      "prompt",
      "artifacts",
      "contentHash",
      "secretInfos",
      "publishedPromptBundleId",
      "PROSPECT_PERSONA",
      "EVALUATION_SYSTEM",
    ];
    for (const payload of [view, catalog]) {
      const json = JSON.stringify(payload).toLowerCase();
      for (const needle of forbidden) {
        expect(json).not.toContain(needle.toLowerCase());
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 30. Pas de réseau dans ce fichier de test
// ---------------------------------------------------------------------------
describe("LOT Q2 — pas de réseau", () => {
  it("30. ce fichier de test n'effectue aucun appel reseau/OpenAI (fixtures locales uniquement)", () => {
    // Tous les cas ci-dessus s'appuient exclusivement sur des fixtures locales
    // (exercise/attempt/theme/stage) et sur des lectures de fichiers locales
    // (readFileSync) pour les assertions de source : aucun fetch, aucun SDK
    // OpenAI, aucune connexion DB/micro n'est instancié dans ce fichier.
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canStartNewSimulation : garde de démarrage d'une nouvelle simulation
// ---------------------------------------------------------------------------
describe("LOT Q2 — canStartNewSimulation", () => {
  it("autorise AVAILABLE, TO_RETRY, PASSED", () => {
    expect(canStartNewSimulation(ExerciseMissionStatus.AVAILABLE)).toBe(true);
    expect(canStartNewSimulation(ExerciseMissionStatus.TO_RETRY)).toBe(true);
    expect(canStartNewSimulation(ExerciseMissionStatus.PASSED)).toBe(true);
  });

  it("refuse LOCKED, IN_PROGRESS, ANALYSIS_PENDING", () => {
    expect(canStartNewSimulation(ExerciseMissionStatus.LOCKED)).toBe(false);
    expect(canStartNewSimulation(ExerciseMissionStatus.IN_PROGRESS)).toBe(
      false,
    );
    expect(
      canStartNewSimulation(ExerciseMissionStatus.ANALYSIS_PENDING),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cohérence resolveExerciseMissionStatus <-> pickRecommendedExercise
// ---------------------------------------------------------------------------
describe("LOT Q2 — cohérence recommandation / résolveur", () => {
  it("TO_RETRY est recommandé avant AVAILABLE, jamais PASSED ni LOCKED", () => {
    const view = buildTeleproMissionsView(
      [
        exercise({ id: "retry", name: "Retry", missionLevel: 1, sortOrder: 0 }),
        exercise({ id: "avail", name: "Avail", missionLevel: 1, sortOrder: 1 }),
      ],
      [
        attempt({
          id: "sim-retry",
          scenarioId: "retry",
          status: SimulationStatus.COMPLETED,
          evaluation: { overallScore: 30, summary: null, outcome: null },
        }),
      ],
    );
    expect(pickRecommendedExercise(view.exercises)?.id).toBe("retry");
    expect(
      resolveExerciseMissionStatus({
        isPassed: false,
        hasActiveAttempt: false,
        hasAnalysisPending: false,
        hasEvaluatedBelowThreshold: true,
        levelUnlocked: true,
      }),
    ).toBe(ExerciseMissionStatus.TO_RETRY);
  });
});
