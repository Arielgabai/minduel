/**
 * LOT Q3B — comparaisons personnelles et simulation/réel (fonctions pures).
 * Aucune moyenne d'équipe, aucun échantillon inventé.
 */
import { normalizeSkillKey } from "@/lib/debriefView";

export type ComparableScore = {
  key: string;
  label: string;
  score: number;
  maxScore: number;
};

export type PersonalHistoryCall = {
  id: string;
  overallScore: number | null;
  talkRatio: number | null;
};

export type PersonalComparativeView = {
  available: boolean;
  sampleSize: number;
  currentScore: number | null;
  personalAverage: number | null;
  trend: "up" | "down" | "stable" | "unavailable";
  message: string | null;
};

export type SimRealSkillRow = {
  key: string;
  label: string;
  realScore: number;
  realMax: number;
  simScore: number;
  simMax: number;
  deltaPct: number | null;
};

export type SimRealComparisonView = {
  available: boolean;
  rows: SimRealSkillRow[];
  message: string | null;
};

function pct(score: number, max: number): number | null {
  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return null;
  return Math.round((score / max) * 100);
}

/** Comparatif sur les appels READY du même télépro (appel courant exclu). */
export function buildPersonalComparative(input: {
  currentId: string;
  currentScore: number | null;
  history: readonly PersonalHistoryCall[];
}): PersonalComparativeView {
  const peers = input.history.filter((h) => h.id !== input.currentId);
  const scored = peers
    .map((h) => h.overallScore)
    .filter((s): s is number => s != null && Number.isFinite(s));

  if (scored.length === 0) {
    return {
      available: false,
      sampleSize: 0,
      currentScore: input.currentScore,
      personalAverage: null,
      trend: "unavailable",
      message:
        "Pas encore assez d'historique personnel pour déterminer une tendance.",
    };
  }

  const personalAverage = Math.round(
    scored.reduce((a, b) => a + b, 0) / scored.length,
  );
  let trend: PersonalComparativeView["trend"] = "unavailable";
  if (input.currentScore != null) {
    const delta = input.currentScore - personalAverage;
    if (Math.abs(delta) <= 2) trend = "stable";
    else if (delta > 0) trend = "up";
    else trend = "down";
  }

  return {
    available: true,
    sampleSize: scored.length,
    currentScore: input.currentScore,
    personalAverage,
    trend,
    message: null,
  };
}

/**
 * Comparaison sim/réel : uniquement clés normalisées présentes des deux côtés.
 * Les scores sim sont la moyenne des évaluations fournies par compétence.
 */
export function buildSimRealComparison(input: {
  realSkills: readonly ComparableScore[];
  simSkills: readonly ComparableScore[];
}): SimRealComparisonView {
  const realByKey = new Map<string, ComparableScore>();
  for (const s of input.realSkills) {
    const k = normalizeSkillKey(s.key)?.toLowerCase() ?? null;
    if (!k) continue;
    realByKey.set(k, { ...s, key: k });
  }

  const simAgg = new Map<
    string,
    { label: string; scoreSum: number; maxSum: number; n: number }
  >();
  for (const s of input.simSkills) {
    const k = normalizeSkillKey(s.key)?.toLowerCase() ?? null;
    if (!k) continue;
    const prev = simAgg.get(k) ?? {
      label: s.label,
      scoreSum: 0,
      maxSum: 0,
      n: 0,
    };
    prev.scoreSum += s.score;
    prev.maxSum += s.maxScore;
    prev.n += 1;
    if (!prev.label) prev.label = s.label;
    simAgg.set(k, prev);
  }

  const keys = [...realByKey.keys()].filter((k) => simAgg.has(k)).sort();
  if (keys.length === 0) {
    return {
      available: false,
      rows: [],
      message:
        "Aucune compétence comparable entre cet appel réel et tes simulations évaluées.",
    };
  }

  const rows: SimRealSkillRow[] = keys.map((key) => {
    const real = realByKey.get(key)!;
    const sim = simAgg.get(key)!;
    const simScore = Math.round(sim.scoreSum / sim.n);
    const simMax = Math.round(sim.maxSum / sim.n);
    const realPct = pct(real.score, real.maxScore);
    const simPct = pct(simScore, simMax);
    return {
      key,
      label: real.label || sim.label || key,
      realScore: real.score,
      realMax: real.maxScore,
      simScore,
      simMax,
      deltaPct:
        realPct != null && simPct != null ? realPct - simPct : null,
    };
  });

  return { available: true, rows, message: null };
}
