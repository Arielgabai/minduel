import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  PROSPECT_AVATAR_KEYS,
  PROSPECT_AVATARS,
  getProspectAvatar,
  getProspectAvatarSrc,
  isProspectAvatarKey,
  listSelectableProspectAvatars,
} from "@/lib/prospectAvatars";
import {
  ExerciseMissionStatus,
  LEGACY_THEME_NAME,
  LEGACY_THEME_SLUG,
  buildTeleproMissionsCatalogView,
  findStageInCatalog,
  findThemeInCatalog,
  legacyStageSlug,
  type MissionAttemptInput,
  type MissionExerciseInput,
  type MissionStageInput,
  type MissionThemeInput,
} from "@/lib/teleproMissions";
import { ScenarioStatus, SimulationStatus } from "@/lib/enums";
import { buildProspectPersona } from "@/lib/prospectPersona";
import { buildMetadataPatchPayload, metaFormFromExercise } from "@/lib/adminExercisesUi";
import { shouldShowTeleproNav } from "@/lib/teleproNav";

function read(rel: string) {
  return readFileSync(path.resolve(rel), "utf8");
}

function webpDims(rel: string): { w: number; h: number } {
  const b = readFileSync(path.resolve(rel));
  const t = b.slice(12, 16).toString("ascii");
  if (t === "VP8X") {
    return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  }
  throw new Error("unexpected webp " + t);
}

const ORG = "org-1";

function exercise(
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

describe("lot N2 — catalogue Thème → Niveau → Exercice", () => {
  it("1-2. regroupe thème → niveau → exercice (au plus un exercice par niveau)", () => {
    const themes = [
      theme({ id: "t2", slug: "b", name: "Bravo", sortOrder: 2 }),
      theme({ id: "t1", slug: "a", name: "Alpha", sortOrder: 1 }),
    ];
    const stages = [
      stage({
        id: "s2",
        themeId: "t1",
        slug: "n2",
        name: "Niveau 2",
        levelNumber: 2,
        sortOrder: 1,
      }),
      stage({
        id: "s1",
        themeId: "t1",
        slug: "n1",
        name: "Niveau 1",
        levelNumber: 1,
        sortOrder: 0,
      }),
      stage({
        id: "s1b",
        themeId: "t1",
        slug: "n1b",
        name: "Niveau 1b",
        levelNumber: 1,
        sortOrder: 1,
      }),
      stage({
        id: "s3",
        themeId: "t2",
        slug: "n1",
        name: "Intro",
        levelNumber: 1,
      }),
    ];
    const exercises = [
      exercise({
        id: "e2",
        name: "B",
        missionStageId: "s1b",
        sortOrder: 0,
      }),
      exercise({
        id: "e1",
        name: "A",
        missionStageId: "s1",
        sortOrder: 0,
      }),
      exercise({
        id: "e3",
        name: "C",
        missionStageId: "s2",
        sortOrder: 0,
      }),
      exercise({
        id: "e4",
        name: "D",
        missionStageId: "s3",
        sortOrder: 0,
      }),
    ];
    const catalog = buildTeleproMissionsCatalogView(
      exercises,
      [],
      themes,
      stages,
    );
    expect(catalog.themes.map((t) => t.slug)).toEqual(["a", "b"]);
    expect(catalog.themes[0]!.stages.map((s) => s.slug)).toEqual([
      "n1",
      "n1b",
      "n2",
    ]);
    expect(catalog.themes[0]!.stages[0]!.exercises.map((e) => e.id)).toEqual([
      "e1",
    ]);
    expect(catalog.themes[0]!.stages[1]!.exercises.map((e) => e.id)).toEqual([
      "e2",
    ]);
    for (const st of catalog.themes[0]!.stages) {
      expect(st.exercises.length).toBeLessThanOrEqual(1);
    }
  });

  it("5-8. exclut thèmes/niveaux DRAFT et ARCHIVED", () => {
    const catalog = buildTeleproMissionsCatalogView(
      [
        exercise({ id: "e1", name: "A", missionStageId: "s-pub" }),
        exercise({ id: "e2", name: "B", missionStageId: "s-draft" }),
        exercise({ id: "e3", name: "C", missionStageId: "s-arch" }),
      ],
      [],
      [
        theme({ id: "t-pub", slug: "pub", name: "Pub", status: "PUBLISHED" }),
        theme({ id: "t-draft", slug: "draft", name: "Draft", status: "DRAFT" }),
        theme({
          id: "t-arch",
          slug: "arch",
          name: "Arch",
          status: "ARCHIVED",
        }),
      ],
      [
        stage({
          id: "s-pub",
          themeId: "t-pub",
          slug: "n1",
          name: "N1",
          status: "PUBLISHED",
        }),
        stage({
          id: "s-draft",
          themeId: "t-pub",
          slug: "nd",
          name: "Draft stage",
          status: "DRAFT",
        }),
        stage({
          id: "s-arch",
          themeId: "t-pub",
          slug: "na",
          name: "Arch stage",
          status: "ARCHIVED",
        }),
        stage({
          id: "s-on-draft-theme",
          themeId: "t-draft",
          slug: "n1",
          name: "Hidden",
          status: "PUBLISHED",
        }),
      ],
    );
    expect(catalog.themes.map((t) => t.slug)).toEqual(["pub"]);
    expect(catalog.themes[0]!.stages).toHaveLength(1);
    expect(catalog.themes[0]!.exerciseCount).toBe(1);
    expect(catalog.totalCount).toBe(1);
  });

  it("9-10. compatibilité non classée + un niveau synthétique par exercice", () => {
    const catalog = buildTeleproMissionsCatalogView(
      [
        exercise({ id: "u1", name: "U1", missionLevel: 1, missionStageId: null }),
        exercise({ id: "u3", name: "U3", missionLevel: 3, missionStageId: null }),
        exercise({
          id: "c1",
          name: "C1",
          missionStageId: "s1",
          prospectAvatarKey: "lena",
        }),
      ],
      [],
      [theme({ id: "t1", slug: "cold", name: "Cold" })],
      [stage({ id: "s1", themeId: "t1", slug: "n1", name: "N1" })],
    );
    const legacy = catalog.themes.find((t) => t.isLegacy)!;
    expect(legacy.name).toBe(LEGACY_THEME_NAME);
    expect(legacy.slug).toBe(LEGACY_THEME_SLUG);
    expect(legacy.stages.map((s) => s.levelNumber)).toEqual([1, 2]);
    expect(legacy.stages[0]!.slug).toBe(legacyStageSlug("u1"));
    expect(legacy.stages[1]!.slug).toBe(legacyStageSlug("u3"));
    expect(legacy.stages[1]!.exercises[0]!.id).toBe("u3");
    expect(legacy.stages.every((s) => s.exercises.length === 1)).toBe(true);
    expect(findThemeInCatalog(catalog, "cold")).not.toBeNull();
  });

  it("11-12. deux thèmes indépendants + trous de numérotation non bloquants", () => {
    const catalog = buildTeleproMissionsCatalogView(
      [
        exercise({ id: "a1", name: "A1", missionStageId: "sa1" }),
        exercise({ id: "b1", name: "B1", missionStageId: "sb1" }),
        exercise({ id: "b3", name: "B3", missionStageId: "sb3" }),
      ],
      [attempt({ id: "sim", scenarioId: "a1", status: SimulationStatus.COMPLETED })],
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
          id: "sb3",
          themeId: "tb",
          slug: "n3",
          name: "B3",
          levelNumber: 3,
        }),
      ],
    );
    const themeA = findThemeInCatalog(catalog, "a")!;
    const themeB = findThemeInCatalog(catalog, "b")!;
    expect(themeA.stages[0]!.state).toBe("COMPLETED");
    expect(themeB.stages[0]!.state).toBe("OPEN");
    expect(themeB.stages[1]!.state).toBe("LOCKED");
    expect(themeB.stages[1]!.exercises[0]!.status).toBe(
      ExerciseMissionStatus.LOCKED,
    );
  });

  it("13-16. priorité COMPLETED/IN_PROGRESS, recommandation, verrouillé sans lien", () => {
    const catalog = buildTeleproMissionsCatalogView(
      [
        exercise({ id: "e1", name: "E1", missionStageId: "s1", sortOrder: 1 }),
        exercise({ id: "e2", name: "E2", missionStageId: "s2", sortOrder: 1 }),
      ],
      [
        attempt({
          id: "sim-done",
          scenarioId: "e2",
          status: SimulationStatus.COMPLETED,
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
    const e1 = catalog.themes[0]!.stages[0]!.exercises[0]!;
    const e2 = catalog.themes[0]!.stages[1]!.exercises[0]!;
    expect(e1.status).toBe(ExerciseMissionStatus.IN_PROGRESS);
    expect(e2.status).toBe(ExerciseMissionStatus.COMPLETED);
    expect(catalog.recommended?.id).toBe("e1");
    expect(e1.recommended).toBe(true);
    expect(e1.ctaHref).toContain("/app/call/");
    // Verrou théorique : un exercice LOCKED sans tentative
    const lockedCatalog = buildTeleproMissionsCatalogView(
      [
        exercise({ id: "x1", name: "X1", missionStageId: "s1" }),
        exercise({ id: "x2", name: "X2", missionStageId: "s2" }),
      ],
      [],
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
    const locked = lockedCatalog.themes[0]!.stages[1]!.exercises[0]!;
    expect(locked.status).toBe(ExerciseMissionStatus.LOCKED);
    expect(locked.ctaHref).toBeNull();
    expect(locked.prepareHref).toBeNull();
  });

  it("17-19. findTheme/Stage absents → null (404 côté page)", () => {
    const catalog = buildTeleproMissionsCatalogView(
      [exercise({ id: "e1", name: "E1", missionStageId: "s1" })],
      [],
      [theme({ id: "t1", slug: "visible", name: "V" })],
      [stage({ id: "s1", themeId: "t1", slug: "n1", name: "N1" })],
    );
    expect(findThemeInCatalog(catalog, "autre-org")).toBeNull();
    expect(findThemeInCatalog(catalog, "invisible")).toBeNull();
    expect(findStageInCatalog(catalog, "visible", "missing")).toBeNull();
  });

  it("38. aucun prompt/artifact/hash/secret dans le modèle télépro", () => {
    const catalog = buildTeleproMissionsCatalogView(
      [
        exercise({
          id: "e1",
          name: "E1",
          missionStageId: "s1",
          personality: "secret-persona",
        }),
      ],
      [],
      [theme({ id: "t1", slug: "t", name: "T" })],
      [stage({ id: "s1", themeId: "t1", slug: "n1", name: "N1" })],
    );
    const json = JSON.stringify(catalog);
    expect(json).not.toMatch(/PROSPECT_PERSONA|artifacts|contentHash|secretInfos|openai/i);
    expect(catalog.themes[0]!.stages[0]!.exercises[0]!).not.toHaveProperty(
      "personality",
    );
  });
});

describe("lot N2 — dix avatars locaux", () => {
  it("20-22. dix portraits locaux disponibles et fichiers présents en 512×512", () => {
    expect(PROSPECT_AVATAR_KEYS).toHaveLength(10);
    expect(PROSPECT_AVATARS).toHaveLength(10);
    expect(listSelectableProspectAvatars()).toHaveLength(10);
    for (const avatar of PROSPECT_AVATARS) {
      expect(avatar.src.startsWith("/avatars/prospects/")).toBe(true);
      expect(avatar.src).not.toMatch(/^https?:/i);
      const rel = path.join("public", avatar.src.replace(/^\//, ""));
      expect(existsSync(path.resolve(rel))).toBe(true);
      const dims = webpDims(rel);
      expect(dims).toEqual({ w: 512, h: 512 });
    }
  });

  it("23-24. fallback clé inconnue + anciennes clés N1 résolues", () => {
    expect(getProspectAvatar("inconnu")).toBeNull();
    expect(getProspectAvatarSrc("inconnu")).toBeNull();
    expect(isProspectAvatarKey("lena")).toBe(true);
    expect(getProspectAvatar("lena")?.src).toBe(
      "/avatars/prospects/prospect-04.webp",
    );
    expect(getProspectAvatar("alex")?.src).toContain("prospect-01");
  });

  it("40. aucune URL distante dans le catalogue", () => {
    const src = read("src/lib/prospectAvatars.ts");
    expect(src).not.toMatch(/https?:\/\//);
    expect(src).not.toMatch(/data:image/);
  });
});

describe("lot N2 — admin photo / personnalité", () => {
  it("25. grille admin des dix portraits", () => {
    const src = read("src/app/admin/exercises/[id]/page.tsx");
    expect(src).toContain("Prospect simulé");
    expect(src).toContain("PROSPECT_AVATARS.map");
    expect(src).toContain("size={44}");
    expect(src).toContain("Personnalité et consignes de jeu");
    expect(src).toContain("PromptBundle");
    expect(src).toContain("buildProspectPersona");
  });

  it("26-28. avatar et personnalité enregistrés séparément, vide normalisé", () => {
    const meta = metaFormFromExercise({
      id: "ex",
      name: "Demo",
      slug: "demo",
      status: "DRAFT",
      level: "MOYEN",
      missionLevel: 1,
      sortOrder: 0,
      callType: "VENTE",
      campaign: null,
      offer: null,
      prospectProfile: null,
      initialSituation: null,
      objective: null,
      personality: "Méfiant",
      allowedObjections: [],
      secretInfos: [],
      successConditions: null,
      failureConditions: null,
      targetDurationSec: 300,
      traineeBrief: null,
      currentBundle: null,
      versions: [],
      prospectAvatarKey: "mathis",
    });
    expect(meta.prospectAvatarKey).toBe("mathis");
    expect(meta.personality).toBe("Méfiant");
    meta.personality = "Autre ton";
    meta.prospectAvatarKey = "mathis";
    const p1 = buildMetadataPatchPayload(meta);
    expect(p1.prospectAvatarKey).toBe("mathis");
    expect(p1.personality).toBe("Autre ton");
    meta.personality = "";
    meta.prospectAvatarKey = "";
    const p2 = buildMetadataPatchPayload(meta);
    expect(p2.personality).toBe("");
    expect(p2.prospectAvatarKey).toBeNull();
  });

  it("27. une photo peut avoir deux personnalités", () => {
    const a = buildMetadataPatchPayload({
      ...metaFormFromExercise({
        id: "1",
        name: "A",
        slug: "a",
        status: "DRAFT",
        level: "MOYEN",
        missionLevel: 1,
        sortOrder: 0,
        callType: "VENTE",
        campaign: null,
        offer: null,
        prospectProfile: null,
        initialSituation: null,
        objective: null,
        personality: "Calme",
        allowedObjections: [],
        secretInfos: [],
        successConditions: null,
        failureConditions: null,
        targetDurationSec: 300,
        traineeBrief: null,
        currentBundle: null,
        versions: [],
        prospectAvatarKey: "tony" as unknown as string,
      }),
      prospectAvatarKey: "lena",
      personality: "Calme",
    });
    const b = buildMetadataPatchPayload({
      ...metaFormFromExercise({
        id: "2",
        name: "B",
        slug: "b",
        status: "DRAFT",
        level: "MOYEN",
        missionLevel: 1,
        sortOrder: 0,
        callType: "VENTE",
        campaign: null,
        offer: null,
        prospectProfile: null,
        initialSituation: null,
        objective: null,
        personality: "Tranchant",
        allowedObjections: [],
        secretInfos: [],
        successConditions: null,
        failureConditions: null,
        targetDurationSec: 300,
        traineeBrief: null,
        currentBundle: null,
        versions: [],
        prospectAvatarKey: "lena",
      }),
      prospectAvatarKey: "lena",
      personality: "Tranchant",
    });
    expect(a.prospectAvatarKey).toBe("lena");
    expect(b.prospectAvatarKey).toBe("lena");
    expect(a.personality).not.toBe(b.personality);
  });

  it("29-30. buildProspectPersona reçoit la personnalité ; update metadata ne touche pas le bundle", () => {
    const persona = buildProspectPersona(
      {
        id: "s1",
        name: "Ex",
        callType: "VENTE",
        offer: null,
        prospectProfile: null,
        initialSituation: null,
        objective: null,
        level: "MOYEN",
        personality: "Très méfiant, budget serré",
        allowedObjections: null,
        secretInfos: null,
        successConditions: null,
        failureConditions: null,
        targetDurationSec: 300,
      },
      [],
      "Léna",
    );
    expect(persona).toContain("Très méfiant, budget serré");
    const updateSrc = read("src/lib/exerciseAdminService.ts");
    expect(updateSrc).toContain("Le bundle de prompts n'est jamais touché");
    expect(updateSrc).toContain("prospectAvatarKey");
    // La mise à jour métadonnées ne republie/regénère pas de PromptBundle.
    expect(updateSrc).toContain(
      "// Le bundle de prompts n'est jamais touché par cette mise à jour.",
    );
    const updateFn = updateSrc.slice(
      updateSrc.indexOf("export async function updateExerciseMetadata"),
      updateSrc.indexOf("async function nextVersionNumber"),
    );
    expect(updateFn).not.toContain("createDraftBundle");
    expect(updateFn).not.toContain("buildProspectPersona");
    expect(updateFn).not.toContain("artifacts");
  });
});

describe("lot N2 — préparation, appel, shell", () => {
  it("31-32. avatar présent sur préparation et clients d'appel", () => {
    expect(read("src/app/app/prepare/[scenarioId]/page.tsx")).toContain(
      "ProspectAvatar",
    );
    expect(read("src/app/app/prepare/[scenarioId]/page.tsx")).toContain(
      "prospectAvatarKey",
    );
    expect(read("src/app/app/call/[id]/page.tsx")).toContain(
      "prospectAvatarKey",
    );
    expect(read("src/app/app/call/[id]/CallClient.tsx")).toContain(
      "ProspectAvatar",
    );
    expect(read("src/app/app/call/[id]/RealtimeCallClient.tsx")).toContain(
      "ProspectAvatar",
    );
  });

  it("33-34. unique /end et cleanup Realtime préservés", () => {
    const demo = read("src/app/app/call/[id]/CallClient.tsx");
    const rt = read("src/app/app/call/[id]/RealtimeCallClient.tsx");
    const countEnd = (src: string) =>
      (src.match(/\/api\/simulations\/\$\{[^}]+\}\/end/g) ?? []).length;
    expect(countEnd(demo)).toBe(1);
    expect(countEnd(rt)).toBe(1);
    expect(demo).toContain("if (ending) return");
    expect(rt).toContain("if (ending) return");
    expect(rt).toContain("stop();");
    expect(rt).toContain("useRealtimeSession");
  });

  it("35-37. navigation hors scroll, visible/masquée selon routes", () => {
    const shell = read("src/components/TeleproShell.tsx");
    const nav = read("src/components/TeleproNav.tsx");
    expect(shell).toContain("h-[100dvh]");
    expect(shell).toContain("overflow-y-auto");
    expect(nav).toContain("flex-shrink-0");
    expect(nav).not.toContain("sticky bottom-0");
    expect(shouldShowTeleproNav("/app")).toBe(true);
    expect(shouldShowTeleproNav("/app/missions")).toBe(true);
    expect(shouldShowTeleproNav("/app/skills")).toBe(true);
    expect(shouldShowTeleproNav("/app/progression")).toBe(true);
    expect(shouldShowTeleproNav("/app/profile")).toBe(true);
    expect(shouldShowTeleproNav("/app/prepare/x")).toBe(false);
    expect(shouldShowTeleproNav("/app/call/x")).toBe(false);
    expect(shouldShowTeleproNav("/app/call/x/done")).toBe(false);
    expect(shouldShowTeleproNav("/app/analysis/x")).toBe(false);
  });

  it("39. pages Next sans export nommé interdit", () => {
    for (const rel of [
      "src/app/app/missions/page.tsx",
      "src/app/app/missions/[themeSlug]/page.tsx",
      "src/app/app/missions/[themeSlug]/[stageSlug]/page.tsx",
      "src/app/app/page.tsx",
    ]) {
      const src = read(rel);
      expect(src).toMatch(/export\s+default\s+/);
      const named = src.match(/^export\s+(?!default)/gm) ?? [];
      expect(named).toEqual([]);
    }
  });
});

describe("lot N2 — service et pages", () => {
  it("service catalogue + isolation select minimal", () => {
    const src = read("src/lib/teleproMissionsService.ts");
    expect(src).toContain("loadTeleproMissionsCatalogView");
    expect(src).toContain("missionStageId: true");
    expect(src).toContain("prospectAvatarKey: true");
    expect(src).toContain('status: "PUBLISHED"');
    expect(src).not.toContain("secretInfos");
    expect(src).not.toMatch(/artifacts\s*:/);
    expect(src).not.toMatch(/contentHash\s*:/);
    expect(src).toContain("jamais artifacts");
  });

  it("pages missions catalogue / niveaux / parcours", () => {
    expect(read("src/app/app/missions/page.tsx")).toContain("Voir les niveaux");
    const themePage = read("src/app/app/missions/[themeSlug]/page.tsx");
    expect(themePage).toContain("loadTeleproMissionThemeView");
    expect(themePage).toContain("MissionsPath");
    expect(themePage).not.toContain("theme.stages.map");
    const stagePage = read(
      "src/app/app/missions/[themeSlug]/[stageSlug]/page.tsx",
    );
    expect(stagePage).toContain("loadTeleproMissionStageView");
    expect(stagePage).toContain("redirect");
    expect(stagePage).toContain("/app/prepare/");
    expect(stagePage).toContain("notFound");
    const pathSrc = read("src/app/app/missions/MissionsPath.tsx");
    expect(pathSrc).toContain("ProspectAvatar");
    expect(pathSrc).toContain("prepareHref");
    expect(pathSrc).toMatch(/\/prepare\//);
  });
});
