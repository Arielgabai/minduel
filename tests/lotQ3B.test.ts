/**
 * LOT Q3B — UI télépro appels réels, débrief, mapping admin, reco.
 * Fixtures locales uniquement — aucun réseau, OpenAI, DB, upload, micro.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { recommendExercisesForWeakSkills } from "@/lib/realCallRecommend";
import {
  buildPersonalComparative,
  buildSimRealComparison,
} from "@/lib/realCallCompare";
import {
  realCallStatusLabel,
  parseCoachingPayload,
} from "@/lib/realCallView";
import { RecordingStatus, ScenarioStatus } from "@/lib/enums";
import { ExerciseMissionStatus } from "@/lib/teleproMissions";
import { shouldShowTeleproNav, TELEPRO_NAV_ITEMS } from "@/lib/teleproNav";
import {
  buildMetadataPatchPayload,
  metaFormFromExercise,
  parseSkillKeysInput,
  type AdminExerciseDetail,
} from "@/lib/adminExercisesUi";

function read(rel: string) {
  return readFileSync(path.resolve(rel), "utf8");
}

describe("Q3B — entrée accueil et navigation", () => {
  const home = read("src/app/app/page.tsx");
  const nav = read("src/lib/teleproNav.ts");

  it("carte Analyser un appel réel vers /app/real-calls", () => {
    expect(home).toContain("Analyser un appel réel");
    expect(home).toContain('href="/app/real-calls"');
    expect(home).not.toMatch(/Ringover/i);
  });

  it("tab-bar inchangée (5 items, pas de real-calls)", () => {
    expect(TELEPRO_NAV_ITEMS).toHaveLength(5);
    expect(teleproNavHrefsSafe()).not.toContain("/app/real-calls");
    expect(nav).not.toContain('id: "real-calls"');
  });

  it("détail masque la tab-bar ; liste la conserve", () => {
    expect(shouldShowTeleproNav("/app/real-calls")).toBe(true);
    expect(shouldShowTeleproNav("/app/real-calls/abc")).toBe(false);
  });
});

function teleproNavHrefsSafe() {
  return TELEPRO_NAV_ITEMS.map((i) => i.href);
}

describe("Q3B — pages et clients", () => {
  const listPage = read("src/app/app/real-calls/page.tsx");
  const listClient = read("src/app/app/real-calls/RealCallsClient.tsx");
  const detailPage = read("src/app/app/real-calls/[id]/page.tsx");
  const detailClient = read(
    "src/app/app/real-calls/[id]/RealCallDetailClient.tsx",
  );

  it("pages Next : export default uniquement (pages)", () => {
    expect(listPage).toContain("export default");
    expect(detailPage).toContain("export default");
    expect(listPage).toContain("requireTelepro");
    expect(detailPage).toContain("requireTelepro");
  });

  it("liste : statuts, import MP3, consentement, pas de Ringover", () => {
    expect(listClient).toContain("Mes appels réels");
    expect(listClient).toContain("Importer un appel MP3");
    expect(listClient).toContain(".mp3");
    expect(listClient).toContain(
      "Je confirme être autorisé à importer et analyser cet enregistrement.",
    );
    expect(listClient).toContain("rightsConfirmed: true");
    expect(listClient).toContain("!prepareRes.ok");
    expect(listClient).not.toMatch(/Ringover/i);
    expect(listClient).not.toContain("dangerouslySetInnerHTML");
    expect(listClient).not.toContain("storageKey");
  });

  it("upload : prepare puis finalize, pas de faux succès", () => {
    expect(listClient).toContain("/api/real-calls");
    expect(listClient).toContain("finalize");
    expect(listClient).toContain("uploadInFlightRef");
    expect(listClient).toContain("préparation");
    expect(listClient).toContain("finalisation");
  });

  it("détail : polling borné + cleanup + 4 onglets a11y", () => {
    expect(detailClient).toContain("MAX_POLLS");
    expect(detailClient).toContain("POLL_INTERVAL_MS");
    expect(detailClient).toContain("clearInterval");
    expect(detailClient).toContain('role="tablist"');
    expect(detailClient).toContain('role="tab"');
    expect(detailClient).toContain('role="tabpanel"');
    expect(detailClient).toContain("aria-selected");
    expect(detailClient).toContain("ArrowLeft");
    expect(detailClient).toContain("Aucun exercice associé pour le moment");
    expect(detailClient).not.toContain("NO_MAPPING");
    expect(detailClient).not.toContain("dangerouslySetInnerHTML");
    expect(detailClient).not.toMatch(/Ringover/i);
  });

  it("404 autre télépro via notFound", () => {
    expect(detailPage).toContain("notFound");
    expect(detailPage).toContain("404");
  });
});

describe("Q3B — statuts lisibles", () => {
  it("mappe les RecordingStatus utilisateur", () => {
    expect(realCallStatusLabel(RecordingStatus.PENDING_UPLOAD)).toBe(
      "Import incomplet",
    );
    expect(realCallStatusLabel(RecordingStatus.UPLOADED)).toBe("En attente");
    expect(realCallStatusLabel(RecordingStatus.PREPROCESSING)).toBe(
      "Préparation",
    );
    expect(realCallStatusLabel(RecordingStatus.TRANSCRIBING)).toBe(
      "Transcription",
    );
    expect(realCallStatusLabel(RecordingStatus.ANALYZING)).toBe("Analyse");
    expect(realCallStatusLabel(RecordingStatus.READY)).toBe("Analysé");
    expect(realCallStatusLabel(RecordingStatus.FAILED)).toBe("Échec");
  });
});

describe("Q3B — recommandation déterministe", () => {
  const base = {
    scenarioId: "s1",
    name: "Découverte",
    status: ScenarioStatus.PUBLISHED,
    themeStatus: "PUBLISHED",
    stageStatus: "PUBLISHED",
    themeName: "Accroche",
    level: "MOYEN",
    missionLevel: 1,
    sortOrder: 0,
    prospectAvatarKey: "lena",
    skillKeys: ["decouverte"],
    hasPublishedPrompt: true,
    missionStatus: ExerciseMissionStatus.AVAILABLE,
  };

  it("liste vide sans faiblesse ou sans mapping", () => {
    expect(
      recommendExercisesForWeakSkills({ weakSkillKeys: [] }).reason,
    ).toBe("NO_WEAK_SKILLS");
    expect(
      recommendExercisesForWeakSkills({
        weakSkillKeys: ["decouverte"],
        candidates: [],
      }).reason,
    ).toBe("NO_MAPPING");
  });

  it("max 3, tri déterministe, exclus non publiés / verrouillés sans CTA", () => {
    const candidates = [
      { ...base, scenarioId: "s3", name: "C", sortOrder: 2, skillKeys: ["decouverte", "ecoute"] },
      { ...base, scenarioId: "s2", name: "B", sortOrder: 1 },
      { ...base, scenarioId: "s1", name: "A", sortOrder: 0 },
      {
        ...base,
        scenarioId: "s4",
        name: "Archivé",
        status: ScenarioStatus.ARCHIVED,
      },
      {
        ...base,
        scenarioId: "s5",
        name: "Verrouillé",
        missionStatus: ExerciseMissionStatus.LOCKED,
      },
    ];
    const a = recommendExercisesForWeakSkills({
      weakSkillKeys: ["decouverte"],
      candidates,
    });
    const b = recommendExercisesForWeakSkills({
      weakSkillKeys: ["decouverte"],
      candidates: [...candidates].reverse(),
    });
    expect(a).toEqual(b);
    expect(a.items.length).toBeLessThanOrEqual(3);
    expect(a.items.map((i) => i.scenarioId)).not.toContain("s4");
    const locked = a.items.find((i) => i.scenarioId === "s5");
    if (locked) {
      expect(locked.playable).toBe(false);
      expect(locked.ctaHref).toBeNull();
    }
    expect(a.items[0]!.scenarioId).toBe("s1");
    // s5 verrouillé reste recommandé (sans CTA) ; s4 archivé exclu.
    expect(a.items.map((i) => i.scenarioId)).toEqual(["s1", "s5", "s2"]);
    expect(a.items.find((i) => i.scenarioId === "s5")!.ctaHref).toBeNull();
  });
});

describe("Q3B — comparatifs", () => {
  it("personnel : exclut l'appel courant, sampleSize réel", () => {
    const view = buildPersonalComparative({
      currentId: "cur",
      currentScore: 70,
      history: [
        { id: "cur", overallScore: 99, talkRatio: null },
        { id: "a", overallScore: 60, talkRatio: null },
        { id: "b", overallScore: 80, talkRatio: null },
      ],
    });
    expect(view.sampleSize).toBe(2);
    expect(view.personalAverage).toBe(70);
    expect(view.available).toBe(true);
  });

  it("personnel : historique insuffisant", () => {
    const view = buildPersonalComparative({
      currentId: "cur",
      currentScore: 50,
      history: [],
    });
    expect(view.available).toBe(false);
    expect(view.message).toMatch(/historique/i);
  });

  it("sim/réel : uniquement clés communes normalisées", () => {
    const view = buildSimRealComparison({
      realSkills: [
        { key: "Decouverte", label: "Découverte", score: 8, maxScore: 20 },
        { key: "autre", label: "Autre", score: 5, maxScore: 10 },
      ],
      simSkills: [
        { key: "decouverte", label: "Découverte", score: 16, maxScore: 20 },
      ],
    });
    expect(view.available).toBe(true);
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]!.key).toBe("decouverte");
  });
});

describe("Q3B — mapping admin compétences", () => {
  const service = read("src/lib/exerciseAdminService.ts");
  const adminPage = read("src/app/admin/exercises/[id]/page.tsx");
  const mig = read(
    "prisma/migrations/20260805160000_scenario_skill_mapping/migration.sql",
  );
  const schema = read("prisma/schema.prisma");

  it("modèle ScenarioSkillMapping + migration additive", () => {
    expect(schema).toContain("model ScenarioSkillMapping");
    expect(schema).toContain("@@unique([scenarioId, skillKey])");
    expect(schema).toContain("@@unique([id, organizationId])");
    expect(mig).toContain("CREATE TABLE \"ScenarioSkillMapping\"");
    expect(mig).not.toMatch(/(?:^|\n)\s*INSERT\s+INTO/i);
    expect(mig).toContain("ROLLBACK manuel");
  });

  it("service remplace les mappings y compris PATCH []", () => {
    expect(service).toContain("skillKeys");
    expect(service).toContain("scenarioSkillMapping.deleteMany");
    expect(service).toContain("createMany");
  });

  it("UI admin Compétences ciblées", () => {
    expect(adminPage).toContain("Compétences ciblées");
    expect(adminPage).toContain("skillKeysText");
  });

  it("parseSkillKeysInput normalise et déduplique", () => {
    expect(parseSkillKeysInput(" Decouverte\nECOUTE,decouverte")).toEqual([
      "decouverte",
      "ecoute",
    ]);
    expect(parseSkillKeysInput("")).toEqual([]);
  });

  it("buildMetadataPatchPayload envoie skillKeys", () => {
    const ex = {
      id: "e1",
      name: "Ex",
      slug: "ex",
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
      personality: null,
      allowedObjections: [],
      secretInfos: [],
      successConditions: null,
      failureConditions: null,
      targetDurationSec: 300,
      traineeBrief: null,
      expectedNextSteps: [],
      targetSkills: [],
      coachingReference: [],
      missionStageId: null,
      prospectAvatarKey: null,
      skillKeys: ["decouverte"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    } as unknown as AdminExerciseDetail;
    const meta = metaFormFromExercise(ex);
    meta.skillKeysText = "";
    const payload = buildMetadataPatchPayload(meta);
    expect(payload).toHaveProperty("skillKeys");
    expect((payload as { skillKeys: string[] }).skillKeys).toEqual([]);
  });
});

describe("Q3B — analyse partielle et isolation", () => {
  it("JSON partiel → analysis unavailable", () => {
    expect(parseCoachingPayload("{").available).toBe(false);
    expect(parseCoachingPayload(JSON.stringify({ summary: "x" })).available).toBe(
      false,
    );
  });

  it("Q2 non impacté : pas de unlock Q2 ni création de scénario", () => {
    const src = read("src/lib/realCallService.ts");
    expect(src).not.toContain("passingScore");
    expect(src).not.toContain("resolveUnlocked");
    expect(src).not.toContain("prisma.scenario.create");
    expect(src).not.toContain("enqueueJob({\n      organizationId,\n      type: JobType.GENERATE");
  });

  it("aucune fuite sensible dans les clients", () => {
    const list = read("src/app/app/real-calls/RealCallsClient.tsx");
    const detail = read(
      "src/app/app/real-calls/[id]/RealCallDetailClient.tsx",
    );
    for (const src of [list, detail]) {
      expect(src).not.toContain("processingHash");
      expect(src).not.toContain("promptVersion");
      expect(src).not.toContain("coachingPayload");
      expect(src).not.toContain("OPENAI");
    }
  });
});
