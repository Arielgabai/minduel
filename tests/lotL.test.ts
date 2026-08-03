import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildTeleproMissionsView,
  ExerciseMissionStatus,
  type MissionAttemptInput,
  type MissionExerciseInput,
} from "@/lib/teleproMissions";
import {
  isLaunchable,
  missionNodeVariant,
  missionProgressPct,
} from "@/lib/missionsPath";
import {
  buildExerciseCompleteView,
  generateInitials,
} from "@/lib/callUi";
import { shouldShowTeleproNav } from "@/lib/teleproNav";
import { ScenarioStatus, SimulationStatus } from "@/lib/enums";

function read(rel: string) {
  return readFileSync(path.resolve(rel), "utf8");
}

const ORG = "org-1";

function exercise(
  over: Partial<MissionExerciseInput> & Pick<MissionExerciseInput, "id" | "name">,
): MissionExerciseInput {
  return {
    missionLevel: 1,
    sortOrder: 0,
    level: "MOYEN",
    objective: "Obtenir un RDV",
    prospectProfile: "DRH",
    personality: "Direct",
    successConditions: "RDV",
    targetDurationSec: 300,
    status: ScenarioStatus.PUBLISHED,
    organizationId: ORG,
    ...over,
  };
}

function attempt(
  over: Partial<MissionAttemptInput> &
    Pick<MissionAttemptInput, "id" | "scenarioId" | "status">,
): MissionAttemptInput {
  return {
    outcome: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    evaluation: null,
    ...over,
  };
}

// ----------------------------------------------------------------------------
// Missions — parcours dynamique
// ----------------------------------------------------------------------------
describe("Lot L — Missions parcours (dynamique, lot I)", () => {
  it("missionProgressPct est borné et sans total codé en dur", () => {
    expect(missionProgressPct(0, 0)).toBe(0);
    expect(missionProgressPct(2, 4)).toBe(50);
    expect(missionProgressPct(3, 3)).toBe(100);
    expect(missionProgressPct(5, 3)).toBe(100);
    expect(missionProgressPct(-1, 4)).toBe(0);
  });

  it("missionNodeVariant reflète le statut calculé par le lot I", () => {
    expect(missionNodeVariant(ExerciseMissionStatus.COMPLETED)).toBe("completed");
    expect(missionNodeVariant(ExerciseMissionStatus.IN_PROGRESS)).toBe("current");
    expect(missionNodeVariant(ExerciseMissionStatus.AVAILABLE)).toBe("available");
    expect(missionNodeVariant(ExerciseMissionStatus.LOCKED)).toBe("locked");
  });

  it("rend plusieurs niveaux réels avec trous de niveaux, sans nombre fixe", () => {
    const exercises = [
      exercise({ id: "a", name: "A", missionLevel: 1, sortOrder: 0 }),
      exercise({ id: "b", name: "B", missionLevel: 1, sortOrder: 1 }),
      // trou : pas de niveau 2, on saute à 3
      exercise({ id: "c", name: "C", missionLevel: 3, sortOrder: 0 }),
    ];
    const attempts = [
      attempt({ id: "s1", scenarioId: "a", status: SimulationStatus.COMPLETED }),
      attempt({ id: "s2", scenarioId: "b", status: SimulationStatus.COMPLETED }),
    ];
    const view = buildTeleproMissionsView(exercises, attempts);

    // Niveaux réellement présents (1 et 3), aucun niveau 2 fabriqué.
    expect(view.groups.map((g) => g.missionLevel)).toEqual([1, 3]);
    expect(view.totalCount).toBe(3);
    expect(view.completedCount).toBe(2);
    expect(missionProgressPct(view.completedCount, view.totalCount)).toBe(67);
  });

  it("un exercice verrouillé n'est jamais lançable (pas de lien)", () => {
    const exercises = [
      exercise({ id: "a", name: "A", missionLevel: 1 }),
      exercise({ id: "z", name: "Z", missionLevel: 5 }),
    ];
    const view = buildTeleproMissionsView(exercises, []);
    const locked = view.exercises.find((e) => e.id === "z")!;
    expect(locked.status).toBe(ExerciseMissionStatus.LOCKED);
    expect(locked.ctaHref).toBeNull();
    expect(isLaunchable(locked)).toBe(false);

    const available = view.exercises.find((e) => e.id === "a")!;
    expect(available.status).toBe(ExerciseMissionStatus.AVAILABLE);
    expect(isLaunchable(available)).toBe(true);
  });

  it("état vide : page rend EmptyState et garde loadTeleproMissionsView", () => {
    const view = buildTeleproMissionsView([], []);
    expect(view.empty).toBe(true);

    const pageSrc = read("src/app/app/missions/page.tsx");
    expect(pageSrc).toContain("loadTeleproMissionsView");
    expect(pageSrc).toContain("EmptyState");
    expect(pageSrc).toMatch(/export\s+default\s+async\s+function/);
    const named = pageSrc.match(/^export\s+(?!default)/gm) ?? [];
    expect(named).toEqual([]);
  });

  it("MissionsPath : nœuds dynamiques, cadenas, cibles tactiles, pas de chiffres maquette", () => {
    const src = read("src/app/app/missions/MissionsPath.tsx");
    expect(src).toContain("view.groups.map");
    // N4 : progression sur la page thème ; le path affiche les portraits de niveaux.
    expect(src).toContain("Niveau");
    expect(src).toContain("prepareHref");
    const themePage = read("src/app/app/missions/[themeSlug]/page.tsx");
    expect(themePage).toContain("missionProgressPct");
    expect(themePage).toContain("MissionsPath");
    expect(src).toContain("missionNodeVariant");
    expect(src).toContain("isLaunchable");
    expect(src).toContain("🔒");
    expect(src).toContain("min-h-11");
    expect(src).toContain("focus-visible");
    // aucun total marketing figé (« 5 phases », « 35 exercices », etc.)
    expect(src).not.toMatch(/\b(5\s*phases|35\s*exercices|104)\b/i);
    expect(src).not.toContain("dangerouslySetInnerHTML");
    expect(src).not.toMatch(/openai/i);
  });
});

// ----------------------------------------------------------------------------
// Appel immersif — invariants du flux préservés
// ----------------------------------------------------------------------------
describe("Lot L — Appel immersif (invariants préservés)", () => {
  const demoSrc = read("src/app/app/call/[id]/CallClient.tsx");
  const rtSrc = read("src/app/app/call/[id]/RealtimeCallClient.tsx");

  it("un seul appel /end par client (pas de double finalisation)", () => {
    const countEnd = (src: string) =>
      (src.match(/\/api\/simulations\/\$\{[^}]+\}\/end/g) ?? []).length;
    expect(countEnd(demoSrc)).toBe(1);
    expect(countEnd(rtSrc)).toBe(1);
    // garde anti double-envoi conservée
    expect(demoSrc).toContain("if (ending) return");
    expect(rtSrc).toContain("if (ending) return");
  });

  it("redirige vers l'écran de fin (jamais /end au retour)", () => {
    expect(demoSrc).toContain("/app/call/${props.simulationId}/done");
    expect(rtSrc).toContain("/app/call/${props.simulationId}/done");
  });

  it("cleanup Realtime/micro et confirmation conservés", () => {
    expect(rtSrc).toContain("stop();");
    expect(rtSrc).toContain("useRealtimeSession");
    expect(demoSrc).toContain("speechSynthesis?.cancel()");
    expect(demoSrc).toContain("confirmQuit");
    expect(rtSrc).toContain("confirmQuit");
  });

  it("états connexion/écoute/parole/erreur accessibles et focus visible", () => {
    expect(rtSrc).toContain("PHASE_LABEL");
    expect(demoSrc).toContain("STATE_LABEL");
    expect(rtSrc).toContain("focus-visible");
    expect(demoSrc).toContain("focus-visible");
    expect(rtSrc).toContain("aria-label");
    expect(demoSrc).toContain("aria-label");
  });

  it("aucun secret/prompt ni Ringover ajouté côté client d'appel", () => {
    for (const src of [demoSrc, rtSrc]) {
      expect(src).not.toMatch(/ringover/i);
      expect(src).not.toContain("PROSPECT_PERSONA");
      expect(src).not.toContain("EVALUATION_SYSTEM");
      expect(src).not.toContain("promptBundle");
      expect(src).not.toContain("dangerouslySetInnerHTML");
    }
  });

  it("initiales générées localement, sans réseau", () => {
    expect(generateInitials("Alex Martin")).toBe("AM");
    expect(generateInitials("Sophie")).toBe("SO");
    expect(generateInitials("  ")).toBe("?");
    expect(generateInitials(null)).toBe("?");
    expect(demoSrc).toContain("generateInitials");
    expect(rtSrc).toContain("generateInitials");
  });
});

// ----------------------------------------------------------------------------
// Fin d'exercice — états et données persistées uniquement
// ----------------------------------------------------------------------------
describe("Lot L — Fin d'exercice", () => {
  const strengths = { status: "available" as const, items: ["Bonne écoute"] };
  const improvements = { status: "available" as const, items: ["Recadrer"] };
  const empty = { status: "unavailable" as const, items: [] as string[] };

  it("évaluation prête : score persisté + points forts/axe + CTA débrief", () => {
    const v = buildExerciseCompleteView({
      simulationId: "sim-1",
      evaluationState: "ready",
      durationSec: 120,
      overallScore: 72,
      strengths,
      improvements,
      outcome: "RDV",
    });
    expect(v.state).toBe("ready");
    expect(v.overallScore).toBe(72);
    expect(v.firstStrength).toBe("Bonne écoute");
    expect(v.firstImprovement).toBe("Recadrer");
    expect(v.outcomeLabel).toBe("Rendez-vous obtenu");
    expect(v.analysisHref).toBe("/app/analysis/sim-1");
    expect(v.missionsHref).toBe("/app/missions");
    expect(v.canRetry).toBe(false);
  });

  it("en attente : aucun score, aucun point fort inventé", () => {
    const v = buildExerciseCompleteView({
      simulationId: "sim-2",
      evaluationState: "pending",
      durationSec: 90,
      overallScore: null,
      strengths: empty,
      improvements: empty,
      outcome: null,
    });
    expect(v.state).toBe("pending");
    expect(v.overallScore).toBeNull();
    expect(v.firstStrength).toBeNull();
    expect(v.canRetry).toBe(false);
  });

  it("échec : score non disponible, retry autorisé, rien d'inventé", () => {
    const v = buildExerciseCompleteView({
      simulationId: "sim-3",
      evaluationState: "failed",
      durationSec: 60,
      overallScore: 40,
      strengths,
      improvements,
      outcome: "RDV",
    });
    expect(v.state).toBe("failed");
    expect(v.overallScore).toBeNull();
    expect(v.firstStrength).toBeNull();
    expect(v.outcomeLabel).toBeNull();
    expect(v.canRetry).toBe(true);
  });

  it("données partielles : point fort présent, axe absent", () => {
    const v = buildExerciseCompleteView({
      simulationId: "sim-4",
      evaluationState: "ready",
      durationSec: 80,
      overallScore: 55,
      strengths,
      improvements: empty,
      outcome: null,
    });
    expect(v.firstStrength).toBe("Bonne écoute");
    expect(v.firstImprovement).toBeNull();
    expect(v.outcomeLabel).toBeNull();
  });

  it("missing → unavailable (terminé, score non disponible)", () => {
    const v = buildExerciseCompleteView({
      simulationId: "sim-5",
      evaluationState: "missing",
      durationSec: 10,
      overallScore: null,
      strengths: empty,
      improvements: empty,
      outcome: null,
    });
    expect(v.state).toBe("unavailable");
  });

  it("page fin : ownership + 404, jamais /end, export default seul", () => {
    const src = read("src/app/app/call/[id]/done/page.tsx");
    expect(src).toContain("requireTelepro");
    expect(src).toContain("loadDebriefForTelepro");
    expect(src).toContain("if (!view) notFound();");
    // Écran serveur : aucune finalisation ni appel réseau (donc jamais /end).
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toContain("/api/simulations");
    expect(src).toMatch(/export\s+default\s+async\s+function/);
    const named = src.match(/^export\s+(?!default)/gm) ?? [];
    expect(named).toEqual([]);
  });

  it("client fin : polling borné/nettoyé, retry existant, jamais /end", () => {
    const src = read("src/app/app/call/[id]/done/ExerciseComplete.tsx");
    expect(src).toContain("Exercice terminé");
    expect(src).toContain("analysisHref");
    expect(src).toContain("missionsHref");
    expect(src).toContain("evaluation-status");
    expect(src).toContain("retry-evaluation");
    expect(src).toContain("MAX_POLLS");
    expect(src).toContain("clearInterval");
    // Jamais de finalisation depuis l'écran de fin.
    expect(src).not.toContain("/api/simulations/${simulationId}/end");
    expect(src).not.toMatch(/ringover/i);
    expect(src).not.toContain("dangerouslySetInnerHTML");
    expect(src).toContain("focus-visible");
  });
});

// ----------------------------------------------------------------------------
// UI / a11y / navigation
// ----------------------------------------------------------------------------
describe("Lot L — UI / a11y", () => {
  it("tab-bar masquée sur l'appel et l'écran de fin", () => {
    expect(shouldShowTeleproNav("/app/call/xyz")).toBe(false);
    expect(shouldShowTeleproNav("/app/call/xyz/done")).toBe(false);
    expect(shouldShowTeleproNav("/app/missions")).toBe(true);
  });

  it("nouveaux modules purs sans import openai/ringover", () => {
    for (const rel of ["src/lib/callUi.ts", "src/lib/missionsPath.ts"]) {
      const src = read(rel);
      expect(src).not.toMatch(/from\s+["']openai["']/);
      expect(src).not.toMatch(/ringover/i);
    }
  });
});
