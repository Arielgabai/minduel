/**
 * Modèle de vue pur du débrief téléprospecteur (lot K).
 * Parsing défensif des JSON persistés — aucune fabrication, aucun Prisma brut.
 */

import { SkillKeySchema } from "@/lib/skillsContent";
import { formatDuration } from "@/lib/utils";

export const DEBRIEF_TABS = [
  { id: "resume", label: "Résumé" },
  { id: "ligne", label: "Ligne par ligne" },
  { id: "pourquoi", label: "Pourquoi" },
  { id: "comparatif", label: "Comparatif" },
] as const;

export type DebriefTabId = (typeof DEBRIEF_TABS)[number]["id"];

export type ListFieldStatus = "available" | "empty" | "unavailable";

export type DebriefSkillLink = {
  title: string;
  href: string;
  categoryName: string;
  categorySlug: string;
  articleSlug: string;
  readingMinutes: number;
};

export type DebriefSkillScoreView = {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  /** Pourcentage borné [0, 100] — affichage uniquement. */
  scorePct: number;
  rationale: string | null;
  evidence: string | null;
  recommendation: string | null;
  hasRationale: boolean;
  hasEvidence: boolean;
  hasRecommendation: boolean;
  skillLinks: DebriefSkillLink[];
};

export type DebriefTurnView = {
  id: string;
  role: string;
  content: string;
  atMs: number;
  timeLabel: string;
  isKeyMoment: boolean;
  keyMomentQuote: string | null;
};

export type DebriefKeyMomentView = {
  role: string;
  quote: string;
  atMs: number;
  timeLabel: string;
};

export type DebriefComparativeSkill = {
  key: string;
  label: string;
  currentScore: number;
  previousScore: number;
  maxScore: number;
};

export type DebriefComparativeView =
  | {
      kind: "previous_attempt";
      title: "Tentative précédente";
      previousSimulationId: string;
      previousDateLabel: string;
      currentOverallScore: number | null;
      previousOverallScore: number | null;
      skillComparisons: DebriefComparativeSkill[];
    }
  | {
      kind: "unavailable";
      title: string;
      message: string;
    };

export type DebriefEvaluationState =
  | "ready"
  | "pending"
  | "failed"
  | "missing"
  | "abandoned";

export type DebriefView = {
  simulationId: string;
  scenarioId: string;
  scenarioName: string;
  prospectName: string | null;
  durationSec: number;
  status: string;
  evaluationState: DebriefEvaluationState;
  overallScore: number | null;
  summary: string | null;
  outcome: string | null;
  strengths: { status: ListFieldStatus; items: string[] };
  improvements: { status: ListFieldStatus; items: string[] };
  advice: { status: ListFieldStatus; items: string[] };
  betterExample: string | null;
  skillScores: DebriefSkillScoreView[];
  turns: DebriefTurnView[];
  turnsAvailable: boolean;
  /** Annotations ligne-par-ligne structurées : absentes du schéma actuel. */
  lineAnnotationsAvailable: boolean;
  keyMoments: { status: ListFieldStatus; items: DebriefKeyMomentView[] };
  comparative: DebriefComparativeView;
};

export const MAX_SKILL_LINKS_PER_KEY = 3;

/** Normalisation identique au lot J : trim + SkillKeySchema. */
export function normalizeSkillKey(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = SkillKeySchema.safeParse(trimmed);
  return parsed.success ? parsed.data : null;
}

export function clampDisplayPct(score: number, maxScore: number): number {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((score / maxScore) * 100)));
}

export function formatAtMs(atMs: number): string {
  if (!Number.isFinite(atMs) || atMs < 0) return "—";
  return formatDuration(Math.floor(atMs / 1000));
}

/**
 * Parse une liste JSON persistée.
 * - absent / null / "" → unavailable
 * - JSON invalide ou non-tableau → unavailable
 * - tableau (éventuellement vide) → available | empty
 */
export function parsePersistedStringList(
  raw: string | null | undefined,
): { status: ListFieldStatus; items: string[] } {
  if (raw == null || raw === "") {
    return { status: "unavailable", items: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "unavailable", items: [] };
  }
  if (!Array.isArray(parsed)) {
    return { status: "unavailable", items: [] };
  }
  const items = parsed
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
  return { status: items.length === 0 ? "empty" : "available", items };
}

export type RawKeyMoment = {
  role?: unknown;
  quote?: unknown;
  atMs?: unknown;
};

export function parsePersistedKeyMoments(
  raw: string | null | undefined,
): { status: ListFieldStatus; items: DebriefKeyMomentView[] } {
  if (raw == null || raw === "") {
    return { status: "unavailable", items: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "unavailable", items: [] };
  }
  if (!Array.isArray(parsed)) {
    return { status: "unavailable", items: [] };
  }
  const items: DebriefKeyMomentView[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const m = entry as RawKeyMoment;
    const quote = typeof m.quote === "string" ? m.quote.trim() : "";
    if (!quote) continue;
    const role =
      typeof m.role === "string" && m.role.trim() ? m.role.trim() : "UNKNOWN";
    const atMs =
      typeof m.atMs === "number" && Number.isFinite(m.atMs) && m.atMs >= 0
        ? Math.floor(m.atMs)
        : 0;
    items.push({ role, quote, atMs, timeLabel: formatAtMs(atMs) });
  }
  return { status: items.length === 0 ? "empty" : "available", items };
}

/**
 * Correspondance fiable turn ↔ moment clé :
 * 1) même atMs exact, ou
 * 2) extrait exact (quote non vide) contenu dans le tour.
 * Pas de rapprochement sémantique approximatif.
 */
export function matchKeyMomentToTurn(
  turn: { content: string; atMs: number },
  moments: readonly DebriefKeyMomentView[],
): DebriefKeyMomentView | null {
  const byTime = moments.filter((m) => m.atMs === turn.atMs);
  if (byTime.length === 1) return byTime[0]!;
  if (byTime.length > 1) {
    const exactQuote = byTime.find((m) => turn.content.includes(m.quote));
    return exactQuote ?? null;
  }
  const byQuote = moments.filter(
    (m) => m.quote.length >= 8 && turn.content.includes(m.quote),
  );
  return byQuote.length === 1 ? byQuote[0]! : null;
}

export type RawSkillScoreInput = {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  rationale?: string | null;
  evidence?: string | null;
  recommendation?: string | null;
};

export type RawTurnInput = {
  id: string;
  role: string;
  content: string;
  atMs: number;
};

export type RawPreviousAttempt = {
  simulationId: string;
  dateIso: string | null;
  overallScore: number | null;
  skillScores: Array<{
    key: string;
    label: string;
    score: number;
    maxScore: number;
  }>;
};

export type BuildDebriefViewInput = {
  simulationId: string;
  scenarioId: string;
  scenarioName: string;
  prospectName: string | null;
  durationSec: number;
  status: string;
  evaluation: {
    overallScore: number | null | undefined;
    summary: string | null;
    outcome: string | null;
    strengths: string | null;
    improvements: string | null;
    advice: string | null;
    betterExample: string | null;
    keyMoments: string | null;
    skillScores: RawSkillScoreInput[];
  } | null;
  turns: RawTurnInput[];
  previousAttempt: RawPreviousAttempt | null;
  skillLinksByKey: Record<string, DebriefSkillLink[]>;
};

export function resolveEvaluationState(
  status: string,
  hasEvaluation: boolean,
): DebriefEvaluationState {
  if (hasEvaluation) return "ready";
  if (status === "ABANDONED") return "abandoned";
  if (status === "EVALUATION_FAILED") return "failed";
  if (
    status === "FINALIZING" ||
    status === "EVALUATION_PENDING" ||
    status === "EVALUATING"
  ) {
    return "pending";
  }
  return "missing";
}

function optionalText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t ? t : null;
}

function buildSkillScoreViews(
  scores: RawSkillScoreInput[],
  skillLinksByKey: Record<string, DebriefSkillLink[]>,
): DebriefSkillScoreView[] {
  return scores.map((s) => {
    const key = typeof s.key === "string" ? s.key : "";
    const normalized = normalizeSkillKey(key);
    const links =
      normalized && skillLinksByKey[normalized]
        ? skillLinksByKey[normalized]!.slice(0, MAX_SKILL_LINKS_PER_KEY)
        : [];
    const score = Number.isFinite(s.score) ? s.score : 0;
    const maxScore = Number.isFinite(s.maxScore) ? s.maxScore : 0;
    const rationale = optionalText(s.rationale);
    const evidence = optionalText(s.evidence);
    const recommendation = optionalText(s.recommendation);
    return {
      key,
      label:
        typeof s.label === "string" && s.label.trim()
          ? s.label
          : key || "Compétence",
      score,
      maxScore,
      scorePct: clampDisplayPct(score, maxScore),
      rationale,
      evidence,
      recommendation,
      hasRationale: rationale != null,
      hasEvidence: evidence != null,
      hasRecommendation: recommendation != null,
      skillLinks: links,
    };
  });
}

function buildComparative(
  currentOverall: number | null,
  currentSkills: DebriefSkillScoreView[],
  previous: RawPreviousAttempt | null,
): DebriefComparativeView {
  if (!previous) {
    return {
      kind: "unavailable",
      title: "Comparatif",
      message: "Pas assez de tentatives pour comparer",
    };
  }

  const prevByKey = new Map(
    previous.skillScores.map((s) => [s.key, s] as const),
  );
  const skillComparisons: DebriefComparativeSkill[] = [];
  for (const cur of currentSkills) {
    const prev = prevByKey.get(cur.key);
    if (!prev) continue;
    skillComparisons.push({
      key: cur.key,
      label: cur.label,
      currentScore: cur.score,
      previousScore: prev.score,
      maxScore: cur.maxScore > 0 ? cur.maxScore : prev.maxScore,
    });
  }

  return {
    kind: "previous_attempt",
    title: "Tentative précédente",
    previousSimulationId: previous.simulationId,
    previousDateLabel: previous.dateIso
      ? formatDateShort(previous.dateIso)
      : "Date non disponible",
    currentOverallScore: currentOverall,
    previousOverallScore:
      typeof previous.overallScore === "number" &&
      Number.isFinite(previous.overallScore)
        ? previous.overallScore
        : null,
    skillComparisons,
  };
}

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Date non disponible";
  }
}

/**
 * Construit le modèle de vue sérialisable du débrief.
 * Ne lit aucune base ; n'appelle aucun réseau.
 */
export function buildDebriefView(input: BuildDebriefViewInput): DebriefView {
  const hasEvaluation = input.evaluation != null;
  const evaluationState = resolveEvaluationState(input.status, hasEvaluation);
  const ev = input.evaluation;

  const overallScore =
    ev && typeof ev.overallScore === "number" && Number.isFinite(ev.overallScore)
      ? ev.overallScore
      : null;

  const strengths = parsePersistedStringList(ev?.strengths);
  const improvements = parsePersistedStringList(ev?.improvements);
  const advice = parsePersistedStringList(ev?.advice);
  const keyMoments = parsePersistedKeyMoments(ev?.keyMoments);

  const skillScores = ev
    ? buildSkillScoreViews(ev.skillScores ?? [], input.skillLinksByKey)
    : [];

  const sortedTurns = [...input.turns].sort((a, b) => a.atMs - b.atMs);
  const turns: DebriefTurnView[] = sortedTurns.map((t) => {
    const matched = matchKeyMomentToTurn(t, keyMoments.items);
    return {
      id: t.id,
      role: t.role,
      content: t.content,
      atMs: t.atMs,
      timeLabel: formatAtMs(t.atMs),
      isKeyMoment: matched != null,
      keyMomentQuote: matched?.quote ?? null,
    };
  });

  return {
    simulationId: input.simulationId,
    scenarioId: input.scenarioId,
    scenarioName: input.scenarioName,
    prospectName: input.prospectName,
    durationSec: Number.isFinite(input.durationSec) ? input.durationSec : 0,
    status: input.status,
    evaluationState,
    overallScore,
    summary: optionalText(ev?.summary),
    outcome: optionalText(ev?.outcome),
    strengths,
    improvements,
    advice,
    betterExample: optionalText(ev?.betterExample),
    skillScores,
    turns,
    turnsAvailable: turns.length > 0,
    lineAnnotationsAvailable: false,
    keyMoments,
    comparative: buildComparative(
      overallScore,
      skillScores,
      input.previousAttempt,
    ),
  };
}

/** Trie déterministe des liens Skills (sortOrder, titre, slug). */
export function sortSkillLinkCandidates<
  T extends {
    sortOrder: number;
    title: string;
    articleSlug: string;
  },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    const byTitle = a.title.localeCompare(b.title, "fr");
    if (byTitle !== 0) return byTitle;
    return a.articleSlug.localeCompare(b.articleSlug, "fr");
  });
}