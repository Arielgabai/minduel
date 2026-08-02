/**
 * Moteur pur de la vue Progression téléprospecteur (lot M).
 * Calculs déterministes, sans Prisma ni réseau.
 */

import { isFinishedSimulationStatus } from "@/lib/teleproMissions";
import {
  clampDisplayPct,
  normalizeSkillKey,
  type DebriefSkillLink,
} from "@/lib/debriefView";

// ---------------------------------------------------------------------------
// Constantes documentées
// ---------------------------------------------------------------------------

/** Nombre max de tentatives détaillées chargées / utilisées pour graphiques. */
export const MAX_DETAILED_ATTEMPTS = 120;

/** Points max affichés sur le graphique chronologique. */
export const MAX_CHART_POINTS = 30;

/** Entrées max dans l'historique récent. */
export const MAX_RECENT_HISTORY = 20;

/** Observations min par compétence pour un diagnostic « suffisant ». */
export const MIN_DIAGNOSTIC_SAMPLES = 2;

/** Liens Skills max par compétence (aligné lot K). */
export const MAX_PROGRESSION_SKILL_LINKS = 3;

export const PROGRESSION_TABS = [
  { id: "tendances", label: "Tendances" },
  { id: "comparatif", label: "Comparatif" },
  { id: "diagnostic", label: "Diagnostic" },
  { id: "badges", label: "Badges" },
] as const;

export type ProgressionTabId = (typeof PROGRESSION_TABS)[number]["id"];

export type DeltaDirection = "up" | "stable" | "down";

export type ProgressionSkillLink = DebriefSkillLink;

/** Seuils badges — configuration pure, centralisée. */
export const BADGE_THRESHOLDS = {
  firstEvaluation: 1,
  evaluationsCount: 5,
  scoreAtLeast: 80,
  improvementStreak: 3,
  distinctDays: 3,
} as const;

export type BadgeDefinition = {
  id: string;
  label: string;
  description: string;
  threshold: number;
  kind:
    | "evaluated_count"
    | "max_score"
    | "improvement_streak"
    | "distinct_days";
};

export const BADGE_DEFINITIONS: readonly BadgeDefinition[] = [
  {
    id: "first_evaluation",
    label: "Première évaluation",
    description: "Obtenir une première tentative évaluée.",
    threshold: BADGE_THRESHOLDS.firstEvaluation,
    kind: "evaluated_count",
  },
  {
    id: "evaluations_5",
    label: "5 évaluations",
    description: `Atteindre ${BADGE_THRESHOLDS.evaluationsCount} tentatives évaluées.`,
    threshold: BADGE_THRESHOLDS.evaluationsCount,
    kind: "evaluated_count",
  },
  {
    id: "score_80",
    label: "Score 80+",
    description: `Atteindre un score global ≥ ${BADGE_THRESHOLDS.scoreAtLeast}.`,
    threshold: BADGE_THRESHOLDS.scoreAtLeast,
    kind: "max_score",
  },
  {
    id: "improvement_streak_3",
    label: "Série en hausse",
    description: `${BADGE_THRESHOLDS.improvementStreak} améliorations de score successives.`,
    threshold: BADGE_THRESHOLDS.improvementStreak,
    kind: "improvement_streak",
  },
  {
    id: "regular_3_days",
    label: "Régularité",
    description: `Évaluations sur ${BADGE_THRESHOLDS.distinctDays} jours distincts.`,
    threshold: BADGE_THRESHOLDS.distinctDays,
    kind: "distinct_days",
  },
] as const;

// ---------------------------------------------------------------------------
// Entrées / sorties sérialisables
// ---------------------------------------------------------------------------

export type RawProgressionSkillScore = {
  key: string;
  label: string;
  score: number;
  maxScore: number;
};

export type RawProgressionAttempt = {
  id: string;
  scenarioId: string;
  scenarioName: string;
  status: string;
  createdAt: string;
  endedAt: string | null;
  durationSec: number;
  evaluation: {
    overallScore: number;
    skillScores: RawProgressionSkillScore[];
  } | null;
};

export type ProgressionHistoryItem = {
  simulationId: string;
  scenarioName: string;
  dateIso: string;
  dateLabel: string;
  overallScore: number | null;
  evaluated: boolean;
  analysisHref: string;
};

export type ProgressionChartPoint = {
  simulationId: string;
  dateIso: string;
  dateLabel: string;
  score: number;
  /** Hauteur visuelle bornée [0, 100] — n'altère pas score. */
  barPct: number;
};

export type ProgressionTrendsView = {
  finishedCount: number;
  evaluatedCount: number;
  averageScore: number | null;
  bestScore: number | null;
  lastScore: number | null;
  /** true si ≥ 2 scores évalués (tendance affichable). */
  hasTrend: boolean;
  chartPoints: ProgressionChartPoint[];
  recentHistory: ProgressionHistoryItem[];
  empty: boolean;
  emptyMessage: string;
  truncated: boolean;
};

export type ProgressionSkillDelta = {
  key: string;
  label: string;
  currentPct: number;
  previousPct: number;
  delta: number;
  direction: DeltaDirection;
};

export type ProgressionComparatifView =
  | {
      kind: "pair";
      scope: "same_scenario" | "global";
      scopeLabel: string;
      current: {
        simulationId: string;
        scenarioName: string;
        dateIso: string;
        dateLabel: string;
        overallScore: number;
        analysisHref: string;
      };
      previous: {
        simulationId: string;
        scenarioName: string;
        dateIso: string;
        dateLabel: string;
        overallScore: number;
        analysisHref: string;
      };
      overallDelta: number;
      overallDirection: DeltaDirection;
      skillDeltas: ProgressionSkillDelta[];
    }
  | {
      kind: "empty";
      message: string;
    };

export type ProgressionDiagnosticSkill = {
  key: string;
  label: string;
  averagePct: number;
  sampleCount: number;
  firstPct: number | null;
  lastPct: number | null;
  delta: number | null;
  direction: DeltaDirection | null;
  skillLinks: ProgressionSkillLink[];
};

export type ProgressionDiagnosticView =
  | {
      kind: "ready";
      skills: ProgressionDiagnosticSkill[];
      strongest: ProgressionDiagnosticSkill | null;
      priority: ProgressionDiagnosticSkill | null;
      recentDebriefHrefs: Array<{
        simulationId: string;
        scenarioName: string;
        href: string;
        dateLabel: string;
      }>;
    }
  | {
      kind: "insufficient";
      message: string;
      sampleHint: string;
    };

export type ProgressionBadgeView = {
  id: string;
  label: string;
  description: string;
  earned: boolean;
  progress: number;
  threshold: number;
  earnedAtIso: string | null;
  earnedAtLabel: string | null;
};

export type ProgressionBadgesView = {
  badges: ProgressionBadgeView[];
  evaluatedCount: number;
  averageScore: number | null;
  distinctDayCount: number;
  notice: string;
};

export type ProgressionView = {
  trends: ProgressionTrendsView;
  comparatif: ProgressionComparatifView;
  diagnostic: ProgressionDiagnosticView;
  badges: ProgressionBadgesView;
};

export type BuildProgressionViewInput = {
  attempts: RawProgressionAttempt[];
  finishedCount: number;
  evaluatedCount: number;
  skillLinksByKey?: Record<string, ProgressionSkillLink[]>;
};

// ---------------------------------------------------------------------------
// Helpers purs
// ---------------------------------------------------------------------------

export function attemptSortKey(a: RawProgressionAttempt): string {
  return a.endedAt ?? a.createdAt ?? "";
}

/** Tri chronologique croissant, puis id (déterministe). */
export function sortAttemptsChronological(
  attempts: readonly RawProgressionAttempt[],
): RawProgressionAttempt[] {
  return [...attempts].sort((a, b) => {
    const ka = attemptSortKey(a);
    const kb = attemptSortKey(b);
    if (ka !== kb) return ka.localeCompare(kb);
    return a.id.localeCompare(b.id);
  });
}

export function isEvaluatedAttempt(a: RawProgressionAttempt): boolean {
  if (!isFinishedSimulationStatus(a.status)) return false;
  if (!a.evaluation) return false;
  return Number.isFinite(a.evaluation.overallScore);
}

export function safeOverallScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export function formatProgressionDate(iso: string | null | undefined): string {
  if (!iso) return "Date non disponible";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Date non disponible";
    return d.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Date non disponible";
  }
}

export function dayKeyFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

export function deltaDirection(delta: number): DeltaDirection {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "stable";
}

export function averageFinite(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) return null;
    sum += v;
  }
  return Math.round(sum / values.length);
}

export function skillPct(score: number, maxScore: number): number | null {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
    return null;
  }
  return clampDisplayPct(score, maxScore);
}

export function visualBarPct(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

type SkillAgg = {
  key: string;
  label: string;
  pcts: number[];
  labelCounts: Map<string, number>;
};

function pickLabel(counts: Map<string, number>, fallback: string): string {
  let best = fallback;
  let bestN = -1;
  for (const [label, n] of [...counts.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "fr"),
  )) {
    if (n > bestN) {
      best = label;
      bestN = n;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Tendances
// ---------------------------------------------------------------------------

export function buildTrendsView(args: {
  attempts: RawProgressionAttempt[];
  finishedCount: number;
  evaluatedCount: number;
}): ProgressionTrendsView {
  const chronological = sortAttemptsChronological(args.attempts);
  const evaluated = chronological.filter(isEvaluatedAttempt);
  const scores = evaluated
    .map((a) => safeOverallScore(a.evaluation!.overallScore))
    .filter((s): s is number => s != null);

  const empty = scores.length === 0;
  const hasTrend = scores.length >= 2;

  const chartSource = evaluated.slice(-MAX_CHART_POINTS);
  const chartPoints: ProgressionChartPoint[] = chartSource.map((a) => {
    const score = safeOverallScore(a.evaluation!.overallScore) ?? 0;
    const dateIso = attemptSortKey(a);
    return {
      simulationId: a.id,
      dateIso,
      dateLabel: formatProgressionDate(dateIso),
      score,
      barPct: visualBarPct(score),
    };
  });

  const recentDesc = [...chronological].reverse().slice(0, MAX_RECENT_HISTORY);
  const recentHistory: ProgressionHistoryItem[] = recentDesc.map((a) => {
    const dateIso = attemptSortKey(a);
    const evaluatedFlag = isEvaluatedAttempt(a);
    return {
      simulationId: a.id,
      scenarioName: a.scenarioName,
      dateIso,
      dateLabel: formatProgressionDate(dateIso),
      overallScore: evaluatedFlag
        ? safeOverallScore(a.evaluation!.overallScore)
        : null,
      evaluated: evaluatedFlag,
      analysisHref: `/app/analysis/${a.id}`,
    };
  });

  const last = evaluated.length > 0 ? evaluated[evaluated.length - 1]! : null;

  return {
    finishedCount: Math.max(0, args.finishedCount),
    evaluatedCount: Math.max(0, args.evaluatedCount),
    averageScore: averageFinite(scores),
    bestScore: scores.length > 0 ? Math.max(...scores) : null,
    lastScore: last
      ? safeOverallScore(last.evaluation!.overallScore)
      : null,
    hasTrend,
    chartPoints,
    recentHistory,
    empty,
    emptyMessage:
      "Pas encore assez de tentatives pour calculer des tendances",
    truncated: args.finishedCount > args.attempts.length,
  };
}

// ---------------------------------------------------------------------------
// Comparatif (personnel uniquement)
// ---------------------------------------------------------------------------

function skillMapFromAttempt(
  a: RawProgressionAttempt,
): Map<string, { label: string; pct: number }> {
  const map = new Map<string, { label: string; pct: number }>();
  for (const s of a.evaluation?.skillScores ?? []) {
    const key = normalizeSkillKey(s.key);
    if (!key) continue;
    const pct = skillPct(s.score, s.maxScore);
    if (pct == null) continue;
    const label =
      typeof s.label === "string" && s.label.trim()
        ? s.label.trim()
        : key;
    map.set(key, { label, pct });
  }
  return map;
}

export function buildComparatifView(
  attempts: readonly RawProgressionAttempt[],
): ProgressionComparatifView {
  const chronological = sortAttemptsChronological(attempts).filter(
    isEvaluatedAttempt,
  );
  if (chronological.length < 2) {
    return {
      kind: "empty",
      message: "Pas assez de tentatives comparables",
    };
  }

  const current = chronological[chronological.length - 1]!;
  const sameScenarioPrev = [...chronological]
    .slice(0, -1)
    .reverse()
    .find((a) => a.scenarioId === current.scenarioId);
  const previous =
    sameScenarioPrev ?? chronological[chronological.length - 2]!;
  const scope: "same_scenario" | "global" = sameScenarioPrev
    ? "same_scenario"
    : "global";

  const curScore = safeOverallScore(current.evaluation!.overallScore);
  const prevScore = safeOverallScore(previous.evaluation!.overallScore);
  if (curScore == null || prevScore == null) {
    return {
      kind: "empty",
      message: "Pas assez de tentatives comparables",
    };
  }

  const curSkills = skillMapFromAttempt(current);
  const prevSkills = skillMapFromAttempt(previous);
  const commonKeys = [...curSkills.keys()]
    .filter((k) => prevSkills.has(k))
    .sort((a, b) => a.localeCompare(b, "fr"));

  const skillDeltas: ProgressionSkillDelta[] = commonKeys.map((key) => {
    const cur = curSkills.get(key)!;
    const prev = prevSkills.get(key)!;
    const delta = cur.pct - prev.pct;
    return {
      key,
      label: cur.label,
      currentPct: cur.pct,
      previousPct: prev.pct,
      delta,
      direction: deltaDirection(delta),
    };
  });

  const overallDelta = curScore - prevScore;
  const curDate = attemptSortKey(current);
  const prevDate = attemptSortKey(previous);

  return {
    kind: "pair",
    scope,
    scopeLabel:
      scope === "same_scenario"
        ? "Même scénario"
        : "Comparaison globale (scénarios différents)",
    current: {
      simulationId: current.id,
      scenarioName: current.scenarioName,
      dateIso: curDate,
      dateLabel: formatProgressionDate(curDate),
      overallScore: curScore,
      analysisHref: `/app/analysis/${current.id}`,
    },
    previous: {
      simulationId: previous.id,
      scenarioName: previous.scenarioName,
      dateIso: prevDate,
      dateLabel: formatProgressionDate(prevDate),
      overallScore: prevScore,
      analysisHref: `/app/analysis/${previous.id}`,
    },
    overallDelta,
    overallDirection: deltaDirection(overallDelta),
    skillDeltas,
  };
}

// ---------------------------------------------------------------------------
// Diagnostic
// ---------------------------------------------------------------------------

export function buildDiagnosticView(args: {
  attempts: readonly RawProgressionAttempt[];
  skillLinksByKey?: Record<string, ProgressionSkillLink[]>;
}): ProgressionDiagnosticView {
  const chronological = sortAttemptsChronological(args.attempts).filter(
    isEvaluatedAttempt,
  );
  const byKey = new Map<string, SkillAgg>();

  for (const attempt of chronological) {
    for (const s of attempt.evaluation?.skillScores ?? []) {
      const key = normalizeSkillKey(s.key);
      if (!key) continue;
      const pct = skillPct(s.score, s.maxScore);
      if (pct == null) continue;
      const label =
        typeof s.label === "string" && s.label.trim()
          ? s.label.trim()
          : key;
      const agg = byKey.get(key) ?? {
        key,
        label,
        pcts: [],
        labelCounts: new Map<string, number>(),
      };
      agg.pcts.push(pct);
      agg.labelCounts.set(label, (agg.labelCounts.get(label) ?? 0) + 1);
      byKey.set(key, agg);
    }
  }

  const skills: ProgressionDiagnosticSkill[] = [...byKey.values()]
    .map((agg) => {
      const averagePct = averageFinite(agg.pcts) ?? 0;
      const firstPct = agg.pcts.length > 0 ? agg.pcts[0]! : null;
      const lastPct =
        agg.pcts.length > 0 ? agg.pcts[agg.pcts.length - 1]! : null;
      const delta =
        firstPct != null && lastPct != null && agg.pcts.length >= 2
          ? lastPct - firstPct
          : null;
      const links = (args.skillLinksByKey?.[agg.key] ?? []).slice(
        0,
        MAX_PROGRESSION_SKILL_LINKS,
      );
      return {
        key: agg.key,
        label: pickLabel(agg.labelCounts, agg.label),
        averagePct,
        sampleCount: agg.pcts.length,
        firstPct,
        lastPct,
        delta,
        direction: delta != null ? deltaDirection(delta) : null,
        skillLinks: links,
      };
    })
    .sort((a, b) => {
      if (b.averagePct !== a.averagePct) return b.averagePct - a.averagePct;
      if (b.sampleCount !== a.sampleCount) return b.sampleCount - a.sampleCount;
      return a.key.localeCompare(b.key, "fr");
    });

  const eligible = skills.filter(
    (s) => s.sampleCount >= MIN_DIAGNOSTIC_SAMPLES,
  );

  if (eligible.length === 0) {
    return {
      kind: "insufficient",
      message: "Diagnostic non disponible — baseline absente",
      sampleHint: `Au moins ${MIN_DIAGNOSTIC_SAMPLES} observations par compétence sont nécessaires.`,
    };
  }

  const byAvgAsc = [...eligible].sort((a, b) => {
    if (a.averagePct !== b.averagePct) return a.averagePct - b.averagePct;
    return a.key.localeCompare(b.key, "fr");
  });
  const byAvgDesc = [...eligible].sort((a, b) => {
    if (b.averagePct !== a.averagePct) return b.averagePct - a.averagePct;
    return a.key.localeCompare(b.key, "fr");
  });

  const recentDebriefHrefs = [...chronological]
    .reverse()
    .slice(0, 5)
    .map((a) => {
      const dateIso = attemptSortKey(a);
      return {
        simulationId: a.id,
        scenarioName: a.scenarioName,
        href: `/app/analysis/${a.id}`,
        dateLabel: formatProgressionDate(dateIso),
      };
    });

  return {
    kind: "ready",
    skills,
    strongest: byAvgDesc[0] ?? null,
    priority: byAvgAsc[0] ?? null,
    recentDebriefHrefs,
  };
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export function maxImprovementStreak(
  chronologicalEvaluated: readonly RawProgressionAttempt[],
): { streak: number; earnedAtIso: string | null } {
  let best = 0;
  let current = 0;
  let earnedAt: string | null = null;
  let bestEarnedAt: string | null = null;

  for (let i = 1; i < chronologicalEvaluated.length; i++) {
    const prev = safeOverallScore(
      chronologicalEvaluated[i - 1]!.evaluation!.overallScore,
    );
    const cur = safeOverallScore(
      chronologicalEvaluated[i]!.evaluation!.overallScore,
    );
    if (prev == null || cur == null) {
      current = 0;
      earnedAt = null;
      continue;
    }
    if (cur > prev) {
      current += 1;
      earnedAt = attemptSortKey(chronologicalEvaluated[i]!);
      if (current > best) {
        best = current;
        bestEarnedAt = earnedAt;
      }
    } else {
      current = 0;
      earnedAt = null;
    }
  }
  return { streak: best, earnedAtIso: bestEarnedAt };
}

function firstDateMeetingCount(
  chronologicalEvaluated: readonly RawProgressionAttempt[],
  threshold: number,
): string | null {
  if (chronologicalEvaluated.length < threshold) return null;
  return attemptSortKey(chronologicalEvaluated[threshold - 1]!);
}

function firstDateMeetingScore(
  chronologicalEvaluated: readonly RawProgressionAttempt[],
  threshold: number,
): string | null {
  for (const a of chronologicalEvaluated) {
    const score = safeOverallScore(a.evaluation!.overallScore);
    if (score != null && score >= threshold) return attemptSortKey(a);
  }
  return null;
}

function firstDateMeetingDistinctDays(
  chronologicalEvaluated: readonly RawProgressionAttempt[],
  threshold: number,
): { count: number; earnedAtIso: string | null } {
  const seen = new Set<string>();
  let earnedAt: string | null = null;
  for (const a of chronologicalEvaluated) {
    const day = dayKeyFromIso(attemptSortKey(a));
    if (!day) continue;
    if (!seen.has(day)) {
      seen.add(day);
      if (seen.size === threshold) {
        earnedAt = attemptSortKey(a);
      }
    }
  }
  return { count: seen.size, earnedAtIso: earnedAt };
}

export function buildBadgesView(args: {
  attempts: readonly RawProgressionAttempt[];
  evaluatedCount: number;
}): ProgressionBadgesView {
  const chronological = sortAttemptsChronological(args.attempts).filter(
    isEvaluatedAttempt,
  );
  const scores = chronological
    .map((a) => safeOverallScore(a.evaluation!.overallScore))
    .filter((s): s is number => s != null);
  const evaluatedInView = chronological.length;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
  const streakInfo = maxImprovementStreak(chronological);
  const daysInfo = firstDateMeetingDistinctDays(
    chronological,
    BADGE_THRESHOLDS.distinctDays,
  );

  const badges: ProgressionBadgeView[] = BADGE_DEFINITIONS.map((def) => {
    let progress = 0;
    let earnedAtIso: string | null = null;

    switch (def.kind) {
      case "evaluated_count": {
        progress = evaluatedInView;
        earnedAtIso = firstDateMeetingCount(chronological, def.threshold);
        break;
      }
      case "max_score": {
        progress = maxScore;
        earnedAtIso = firstDateMeetingScore(chronological, def.threshold);
        break;
      }
      case "improvement_streak": {
        progress = streakInfo.streak;
        earnedAtIso =
          streakInfo.streak >= def.threshold ? streakInfo.earnedAtIso : null;
        break;
      }
      case "distinct_days": {
        progress = daysInfo.count;
        earnedAtIso =
          daysInfo.count >= def.threshold ? daysInfo.earnedAtIso : null;
        break;
      }
      default:
        progress = 0;
    }

    // Gagné seulement si le seuil est atteint ET une date déterministe existe.
    const earned = progress >= def.threshold && earnedAtIso != null;

    return {
      id: def.id,
      label: def.label,
      description: def.description,
      earned,
      progress: Math.max(0, progress),
      threshold: def.threshold,
      earnedAtIso: earned ? earnedAtIso : null,
      earnedAtLabel:
        earned && earnedAtIso ? formatProgressionDate(earnedAtIso) : null,
    };
  });

  return {
    badges,
    evaluatedCount: Math.max(0, args.evaluatedCount),
    averageScore: averageFinite(scores),
    distinctDayCount: daysInfo.count,
    notice:
      "Badges calculés depuis ton historique d'évaluations — non persistés.",
  };
}

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------

export function buildProgressionView(
  input: BuildProgressionViewInput,
): ProgressionView {
  const attempts = input.attempts.filter((a) =>
    isFinishedSimulationStatus(a.status),
  );

  return {
    trends: buildTrendsView({
      attempts,
      finishedCount: input.finishedCount,
      evaluatedCount: input.evaluatedCount,
    }),
    comparatif: buildComparatifView(attempts),
    diagnostic: buildDiagnosticView({
      attempts,
      skillLinksByKey: input.skillLinksByKey,
    }),
    badges: buildBadgesView({
      attempts,
      evaluatedCount: input.evaluatedCount,
    }),
  };
}
