/**
 * LOT Q3B — recommandation d'exercices associés à un appel réel.
 * Correspondance uniquement via ScenarioSkillMapping explicite (jamais titre/LLM).
 */
import { ScenarioStatus } from "@/lib/enums";
import {
  ExerciseMissionStatus,
  canStartNewSimulation,
} from "@/lib/teleproMissions";

export type AssociatedExerciseItem = {
  scenarioId: string;
  name: string;
  themeName: string | null;
  levelLabel: string;
  prospectAvatarKey: string | null;
  matchedSkillKeys: string[];
  playable: boolean;
  /** Libellé d'accès Q2 (ex. Disponible, Verrouillé). */
  accessLabel: string;
  /** Lien prepare si jouable ; null si verrouillé. */
  ctaHref: string | null;
};

export type AssociatedExerciseRecommendation = {
  items: AssociatedExerciseItem[];
  weakSkillKeys: string[];
  reason: "NO_WEAK_SKILLS" | "NO_MAPPING" | "MATCHED";
};

export type RecommendCandidate = {
  scenarioId: string;
  name: string;
  status: string;
  themeStatus: string | null;
  stageStatus: string | null;
  themeName: string | null;
  level: string;
  missionLevel: number;
  sortOrder: number;
  prospectAvatarKey: string | null;
  /** Clés déjà normalisées (minuscules). */
  skillKeys: string[];
  hasPublishedPrompt: boolean;
  missionStatus: string;
};

const MAX_ITEMS = 3;

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase();
}

function accessLabelFor(status: string, playable: boolean): string {
  if (playable) return "Accessible";
  if (status === ExerciseMissionStatus.LOCKED) {
    return "À débloquer dans Missions";
  }
  if (status === ExerciseMissionStatus.IN_PROGRESS) {
    return "En cours";
  }
  if (status === ExerciseMissionStatus.ANALYSIS_PENDING) {
    return "Analyse en cours";
  }
  return "Non accessible";
}

/**
 * Service pur et déterministe. Sans mapping fiable → liste vide.
 */
export function recommendExercisesForWeakSkills(input: {
  weakSkillKeys: readonly string[];
  candidates?: readonly RecommendCandidate[];
}): AssociatedExerciseRecommendation {
  const weakSkillKeys = [
    ...new Set(
      input.weakSkillKeys.map(normalizeKey).filter((k) => k.length > 0),
    ),
  ].sort();

  if (weakSkillKeys.length === 0) {
    return { items: [], weakSkillKeys, reason: "NO_WEAK_SKILLS" };
  }

  const weakSet = new Set(weakSkillKeys);
  const candidates = input.candidates ?? [];

  const ranked = candidates
    .filter((c) => c.status === ScenarioStatus.PUBLISHED)
    .filter((c) => c.hasPublishedPrompt)
    .filter((c) => {
      // Thème/niveau publiés si classés ; non classé autorisé.
      if (c.themeStatus != null && c.themeStatus !== "PUBLISHED") return false;
      if (c.stageStatus != null && c.stageStatus !== "PUBLISHED") return false;
      return true;
    })
    .map((c) => {
      const matchedSkillKeys = [
        ...new Set(c.skillKeys.map(normalizeKey).filter((k) => weakSet.has(k))),
      ].sort();
      return { c, matchedSkillKeys, matchCount: matchedSkillKeys.length };
    })
    .filter((r) => r.matchCount > 0)
    .sort((a, b) => {
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      if (a.c.missionLevel !== b.c.missionLevel) {
        return a.c.missionLevel - b.c.missionLevel;
      }
      if (a.c.sortOrder !== b.c.sortOrder) return a.c.sortOrder - b.c.sortOrder;
      const byName = a.c.name.localeCompare(b.c.name, "fr");
      if (byName !== 0) return byName;
      return a.c.scenarioId.localeCompare(b.c.scenarioId);
    })
    .slice(0, MAX_ITEMS);

  if (ranked.length === 0) {
    return { items: [], weakSkillKeys, reason: "NO_MAPPING" };
  }

  const items: AssociatedExerciseItem[] = ranked.map(({ c, matchedSkillKeys }) => {
    const missionStatus = Object.values(ExerciseMissionStatus).includes(
      c.missionStatus as ExerciseMissionStatus,
    )
      ? (c.missionStatus as ExerciseMissionStatus)
      : ExerciseMissionStatus.LOCKED;
    const playable =
      c.hasPublishedPrompt && canStartNewSimulation(missionStatus);
    return {
      scenarioId: c.scenarioId,
      name: c.name,
      themeName: c.themeName,
      levelLabel: c.level,
      prospectAvatarKey: c.prospectAvatarKey,
      matchedSkillKeys,
      playable,
      accessLabel: accessLabelFor(missionStatus, playable),
      ctaHref: playable ? `/app/prepare/${c.scenarioId}` : null,
    };
  });

  return { items, weakSkillKeys, reason: "MATCHED" };
}
