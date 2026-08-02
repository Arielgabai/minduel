import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  BADGE_THRESHOLDS,
  MAX_DETAILED_ATTEMPTS,
  MIN_DIAGNOSTIC_SAMPLES,
  PROGRESSION_TABS,
  averageFinite,
  buildBadgesView,
  buildComparatifView,
  buildDiagnosticView,
  buildProgressionView,
  buildTrendsView,
  isEvaluatedAttempt,
  skillPct,
  sortAttemptsChronological,
  type RawProgressionAttempt,
} from "@/lib/progressionView";

function attempt(
  partial: Partial<RawProgressionAttempt> & {
    id: string;
    overallScore?: number | null;
    skills?: Array<{
      key: string;
      label: string;
      score: number;
      maxScore: number;
    }>;
  },
): RawProgressionAttempt {
  const overallScore =
    "overallScore" in partial ? partial.overallScore : null;
  const skills = partial.skills ?? [];
  return {
    id: partial.id,
    scenarioId: partial.scenarioId ?? "sc-1",
    scenarioName: partial.scenarioName ?? "Scenario A",
    status: partial.status ?? "COMPLETED",
    createdAt: partial.createdAt ?? "2026-01-01T10:00:00.000Z",
    endedAt:
      partial.endedAt ??
      partial.createdAt ??
      "2026-01-01T10:00:00.000Z",
    durationSec: partial.durationSec ?? 60,
    evaluation:
      overallScore == null
        ? null
        : {
            overallScore,
            skillScores: skills,
          },
  };
}

describe("progressionView calculations", () => {
  it("zero attempts", () => {
    const view = buildProgressionView({
      attempts: [],
      finishedCount: 0,
      evaluatedCount: 0,
    });
    expect(view.trends.empty).toBe(true);
    expect(view.trends.averageScore).toBeNull();
    expect(view.comparatif.kind).toBe("empty");
    expect(view.diagnostic.kind).toBe("insufficient");
    expect(view.badges.badges.every((b) => !b.earned)).toBe(true);
  });

  it("finished attempt without evaluation", () => {
    const a = attempt({
      id: "a1",
      status: "COMPLETED",
      overallScore: null,
    });
    expect(isEvaluatedAttempt(a)).toBe(false);
    const trends = buildTrendsView({
      attempts: [a],
      finishedCount: 1,
      evaluatedCount: 0,
    });
    expect(trends.empty).toBe(true);
    expect(trends.finishedCount).toBe(1);
    expect(trends.evaluatedCount).toBe(0);
  });

  it("single evaluation: score without trend", () => {
    const trends = buildTrendsView({
      attempts: [
        attempt({
          id: "a1",
          overallScore: 70,
          endedAt: "2026-02-01T12:00:00.000Z",
        }),
      ],
      finishedCount: 1,
      evaluatedCount: 1,
    });
    expect(trends.empty).toBe(false);
    expect(trends.hasTrend).toBe(false);
    expect(trends.lastScore).toBe(70);
    expect(trends.averageScore).toBe(70);
    expect(trends.bestScore).toBe(70);
    expect(trends.chartPoints).toHaveLength(1);
  });

  it("unsorted evaluations become chronological", () => {
    const attempts = [
      attempt({
        id: "b",
        overallScore: 80,
        endedAt: "2026-02-03T12:00:00.000Z",
      }),
      attempt({
        id: "a",
        overallScore: 40,
        endedAt: "2026-02-01T12:00:00.000Z",
      }),
      attempt({
        id: "c",
        overallScore: 60,
        endedAt: "2026-02-02T12:00:00.000Z",
      }),
    ];
    const sorted = sortAttemptsChronological(attempts);
    expect(sorted.map((x) => x.id)).toEqual(["a", "c", "b"]);
    const trends = buildTrendsView({
      attempts,
      finishedCount: 3,
      evaluatedCount: 3,
    });
    expect(trends.hasTrend).toBe(true);
    expect(trends.chartPoints.map((p) => p.score)).toEqual([40, 60, 80]);
    expect(trends.averageScore).toBe(60);
    expect(trends.bestScore).toBe(80);
    expect(trends.lastScore).toBe(80);
  });

  it("invalid score/maxScore and averages stay finite", () => {
    expect(skillPct(5, 0)).toBeNull();
    expect(skillPct(Number.NaN, 10)).toBeNull();
    expect(skillPct(5, Number.POSITIVE_INFINITY)).toBeNull();
    expect(averageFinite([])).toBeNull();
    expect(averageFinite([10, 20])).toBe(15);
    const diag = buildDiagnosticView({
      attempts: [
        attempt({
          id: "a1",
          overallScore: 50,
          skills: [
            { key: "closing", label: "Closing", score: 5, maxScore: 0 },
            { key: "listening", label: "Listening", score: 8, maxScore: 10 },
          ],
        }),
        attempt({
          id: "a2",
          overallScore: 55,
          endedAt: "2026-02-02T12:00:00.000Z",
          skills: [
            { key: "listening", label: "Listening", score: 6, maxScore: 10 },
          ],
        }),
      ],
    });
    expect(diag.kind).toBe("ready");
    if (diag.kind === "ready") {
      expect(diag.skills.every((s) => Number.isFinite(s.averagePct))).toBe(
        true,
      );
      expect(diag.skills.some((s) => s.key === "closing")).toBe(false);
      expect(diag.skills.find((s) => s.key === "listening")?.sampleCount).toBe(
        2,
      );
    }
  });

  it("invalid skill keys never produce NaN/Infinity in view JSON", () => {
    const view = buildProgressionView({
      attempts: [
        attempt({
          id: "a1",
          overallScore: 50,
          skills: [
            { key: "bad key!!", label: "Bad", score: 1, maxScore: 10 },
            { key: "ok_skill", label: "OK", score: 7, maxScore: 10 },
          ],
        }),
      ],
      finishedCount: 1,
      evaluatedCount: 1,
    });
    const json = JSON.stringify(view);
    expect(json).not.toContain("NaN");
    expect(json).not.toContain("Infinity");
  });
});

describe("progressionView comparatif", () => {
  it("prefers previous attempt on same scenario", () => {
    const attempts = [
      attempt({
        id: "old-other",
        scenarioId: "sc-B",
        scenarioName: "B",
        overallScore: 90,
        endedAt: "2026-01-01T10:00:00.000Z",
        skills: [{ key: "closing", label: "Closing", score: 9, maxScore: 10 }],
      }),
      attempt({
        id: "prev-same",
        scenarioId: "sc-A",
        scenarioName: "A",
        overallScore: 40,
        endedAt: "2026-01-02T10:00:00.000Z",
        skills: [
          { key: "closing", label: "Closing", score: 4, maxScore: 10 },
          { key: "listening", label: "Listening", score: 5, maxScore: 10 },
        ],
      }),
      attempt({
        id: "current",
        scenarioId: "sc-A",
        scenarioName: "A",
        overallScore: 70,
        endedAt: "2026-01-03T10:00:00.000Z",
        skills: [
          { key: "closing", label: "Closing", score: 7, maxScore: 10 },
          { key: "discovery", label: "Discovery", score: 6, maxScore: 10 },
        ],
      }),
    ];
    const c = buildComparatifView(attempts);
    expect(c.kind).toBe("pair");
    if (c.kind === "pair") {
      expect(c.scope).toBe("same_scenario");
      expect(c.previous.simulationId).toBe("prev-same");
      expect(c.current.simulationId).toBe("current");
      expect(c.overallDelta).toBe(30);
      expect(c.overallDirection).toBe("up");
      expect(c.skillDeltas.map((s) => s.key)).toEqual(["closing"]);
      expect(c.skillDeltas[0]!.direction).toBe("up");
    }
  });

  it("falls back to labeled global comparison", () => {
    const c = buildComparatifView([
      attempt({
        id: "a",
        scenarioId: "sc-1",
        overallScore: 50,
        endedAt: "2026-01-01T10:00:00.000Z",
      }),
      attempt({
        id: "b",
        scenarioId: "sc-2",
        overallScore: 50,
        endedAt: "2026-01-02T10:00:00.000Z",
      }),
    ]);
    expect(c.kind).toBe("pair");
    if (c.kind === "pair") {
      expect(c.scope).toBe("global");
      expect(c.overallDirection).toBe("stable");
      expect(c.scopeLabel.toLowerCase()).toContain("globale");
    }
  });

  it("empty when no comparable pair", () => {
    const c = buildComparatifView([attempt({ id: "a", overallScore: 50 })]);
    expect(c).toEqual({
      kind: "empty",
      message: "Pas assez de tentatives comparables",
    });
  });

  it("model contains no team/benchmark fields", () => {
    const view = buildProgressionView({
      attempts: [
        attempt({
          id: "a",
          overallScore: 40,
          endedAt: "2026-01-01T10:00:00.000Z",
        }),
        attempt({
          id: "b",
          overallScore: 60,
          endedAt: "2026-01-02T10:00:00.000Z",
        }),
      ],
      finishedCount: 2,
      evaluatedCount: 2,
    });
    const json = JSON.stringify(view).toLowerCase();
    expect(json).not.toContain("equipe");
    expect(json).not.toContain("team");
    expect(json).not.toContain("percentile");
    expect(json).not.toContain("benchmark");
  });
});

describe("progressionView diagnostic", () => {
  it("aggregates by normalized key with sample counts", () => {
    const diag = buildDiagnosticView({
      attempts: [
        attempt({
          id: "a1",
          overallScore: 50,
          endedAt: "2026-01-01T10:00:00.000Z",
          skills: [
            { key: "closing", label: "Closing A", score: 4, maxScore: 10 },
          ],
        }),
        attempt({
          id: "a2",
          overallScore: 60,
          endedAt: "2026-01-02T10:00:00.000Z",
          skills: [
            { key: "closing", label: "Closing B", score: 8, maxScore: 10 },
          ],
        }),
      ],
      skillLinksByKey: {
        closing: [
          {
            title: "Article Closing",
            href: "/app/skills/cat/closing",
            categoryName: "Cat",
            categorySlug: "cat",
            articleSlug: "closing",
            readingMinutes: 3,
          },
        ],
      },
    });
    expect(diag.kind).toBe("ready");
    if (diag.kind === "ready") {
      expect(diag.skills).toHaveLength(1);
      expect(diag.skills[0]!.key).toBe("closing");
      expect(diag.skills[0]!.sampleCount).toBe(2);
      expect(diag.skills[0]!.averagePct).toBe(60);
      expect(diag.skills[0]!.skillLinks[0]!.title).toBe("Article Closing");
      expect(diag.strongest?.key).toBe("closing");
      expect(diag.priority?.key).toBe("closing");
    }
  });

  it("insufficient below MIN_DIAGNOSTIC_SAMPLES", () => {
    expect(MIN_DIAGNOSTIC_SAMPLES).toBe(2);
    const diag = buildDiagnosticView({
      attempts: [
        attempt({
          id: "a1",
          overallScore: 50,
          skills: [
            { key: "closing", label: "Closing", score: 9, maxScore: 10 },
          ],
        }),
      ],
    });
    expect(diag.kind).toBe("insufficient");
    if (diag.kind === "insufficient") {
      expect(diag.message).toContain("baseline absente");
    }
  });

  it("uses persisted labels and only provided skill links", () => {
    const diag = buildDiagnosticView({
      attempts: [
        attempt({
          id: "a1",
          overallScore: 40,
          endedAt: "2026-01-01T10:00:00.000Z",
          skills: [
            {
              key: "listening",
              label: "Ecoute active",
              score: 3,
              maxScore: 10,
            },
          ],
        }),
        attempt({
          id: "a2",
          overallScore: 70,
          endedAt: "2026-01-02T10:00:00.000Z",
          skills: [
            {
              key: "listening",
              label: "Ecoute active",
              score: 9,
              maxScore: 10,
            },
          ],
        }),
      ],
      skillLinksByKey: {},
    });
    expect(diag.kind).toBe("ready");
    if (diag.kind === "ready") {
      expect(diag.skills[0]!.label).toBe("Ecoute active");
      expect(diag.skills[0]!.skillLinks).toEqual([]);
      expect(diag.skills[0]!.delta).toBe(60);
      expect(diag.skills[0]!.direction).toBe("up");
    }
  });
});

describe("progressionView badges", () => {
  it("handles below/exact thresholds with deterministic earned dates", () => {
    const low = buildBadgesView({
      attempts: [
        attempt({
          id: "a1",
          overallScore: 50,
          endedAt: "2026-01-01T10:00:00.000Z",
        }),
      ],
      evaluatedCount: 1,
    });
    const first = low.badges.find((b) => b.id === "first_evaluation")!;
    expect(first.earned).toBe(true);
    expect(first.earnedAtIso).toBe("2026-01-01T10:00:00.000Z");
    const five = low.badges.find((b) => b.id === "evaluations_5")!;
    expect(five.earned).toBe(false);
    expect(five.progress).toBe(1);
    expect(five.threshold).toBe(BADGE_THRESHOLDS.evaluationsCount);

    const scoreBadge = low.badges.find((b) => b.id === "score_80")!;
    expect(scoreBadge.earned).toBe(false);

    const exact = buildBadgesView({
      attempts: [
        attempt({
          id: "s1",
          overallScore: BADGE_THRESHOLDS.scoreAtLeast,
          endedAt: "2026-03-01T10:00:00.000Z",
        }),
      ],
      evaluatedCount: 1,
    });
    const scoreExact = exact.badges.find((b) => b.id === "score_80")!;
    expect(scoreExact.earned).toBe(true);
    expect(scoreExact.earnedAtIso).toBe("2026-03-01T10:00:00.000Z");
    expect(scoreExact.progress).toBe(BADGE_THRESHOLDS.scoreAtLeast);
  });

  it("improvement streak and distinct days", () => {
    const streak = buildBadgesView({
      attempts: [
        attempt({
          id: "1",
          overallScore: 40,
          endedAt: "2026-01-01T10:00:00.000Z",
        }),
        attempt({
          id: "2",
          overallScore: 50,
          endedAt: "2026-01-02T10:00:00.000Z",
        }),
        attempt({
          id: "3",
          overallScore: 60,
          endedAt: "2026-01-03T10:00:00.000Z",
        }),
        attempt({
          id: "4",
          overallScore: 70,
          endedAt: "2026-01-04T10:00:00.000Z",
        }),
      ],
      evaluatedCount: 4,
    });
    const imp = streak.badges.find((b) => b.id === "improvement_streak_3")!;
    expect(imp.progress).toBe(3);
    expect(imp.earned).toBe(true);
    expect(imp.earnedAtIso).toBe("2026-01-04T10:00:00.000Z");

    const days = streak.badges.find((b) => b.id === "regular_3_days")!;
    expect(days.earned).toBe(true);
    expect(days.progress).toBeGreaterThanOrEqual(3);
  });

  it("never earns badges without proof", () => {
    const empty = buildBadgesView({ attempts: [], evaluatedCount: 0 });
    expect(
      empty.badges.every((b) => !b.earned && b.earnedAtIso == null),
    ).toBe(true);
  });
});

type SimRow = {
  id: string;
  organizationId: string;
  teleproId: string;
  scenarioId: string;
  status: string;
  createdAt: string;
  endedAt: string | null;
  durationSec: number;
  scenarioName: string;
  overallScore: number | null;
  skillScores: Array<{
    key: string;
    label: string;
    score: number;
    maxScore: number;
  }>;
};

let simulations: SimRow[] = [];
let lastFindManyArgs: Record<string, unknown> | null = null;
let mappingCalls: Array<{ organizationId: string; skillKeys: string[] }> = [];

vi.mock("@/lib/db", () => ({
  prisma: {
    simulation: {
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return simulations.filter((s) => matchSim(s, where)).length;
      }),
      findMany: vi.fn(
        async (args: {
          where: Record<string, unknown>;
          take?: number;
          select?: Record<string, unknown>;
        }) => {
          lastFindManyArgs = args as unknown as Record<string, unknown>;
          let rows = simulations.filter((s) => matchSim(s, args.where));
          rows = [...rows].sort((a, b) => {
            const ka = a.endedAt ?? a.createdAt;
            const kb = b.endedAt ?? b.createdAt;
            return kb.localeCompare(ka);
          });
          if (args.take != null) rows = rows.slice(0, args.take);
          return rows.map((s) => ({
            id: s.id,
            scenarioId: s.scenarioId,
            status: s.status,
            createdAt: s.createdAt,
            endedAt: s.endedAt,
            durationSec: s.durationSec,
            scenario: { name: s.scenarioName },
            evaluation:
              s.overallScore == null
                ? null
                : {
                    overallScore: s.overallScore,
                    skillScores: s.skillScores,
                  },
          }));
        },
      ),
    },
  },
}));

vi.mock("@/lib/debriefService", () => ({
  loadPublishedSkillLinksByKeys: vi.fn(
    async (args: { organizationId: string; skillKeys: string[] }) => {
      mappingCalls.push(args);
      if (args.organizationId !== "org-1") return {};
      const out: Record<string, unknown[]> = {};
      for (const key of args.skillKeys) {
        if (key === "closing") {
          out[key] = [
            {
              title: "Closing publie",
              href: "/app/skills/cat/closing",
              categoryName: "Cat",
              categorySlug: "cat",
              articleSlug: "closing",
              readingMinutes: 2,
            },
          ];
        }
      }
      return out;
    },
  ),
}));

function matchSim(s: SimRow, where: Record<string, unknown>): boolean {
  if (where.teleproId && s.teleproId !== where.teleproId) return false;
  if (where.organizationId && s.organizationId !== where.organizationId) {
    return false;
  }
  const status = where.status as { in?: string[] } | string | undefined;
  if (status && typeof status === "object" && Array.isArray(status.in)) {
    if (!status.in.includes(s.status)) return false;
  }
  const evaluation = where.evaluation as { isNot?: null } | undefined;
  if (evaluation && "isNot" in evaluation) {
    if (s.overallScore == null) return false;
  }
  return true;
}

describe("progressionService isolation and select", () => {
  beforeEach(() => {
    simulations = [];
    lastFindManyArgs = null;
    mappingCalls = [];
    vi.clearAllMocks();
  });

  it("filters by organizationId + teleproId without sensitive fields", async () => {
    simulations = [
      {
        id: "mine",
        organizationId: "org-1",
        teleproId: "tp-1",
        scenarioId: "sc-1",
        status: "COMPLETED",
        createdAt: "2026-01-02T10:00:00.000Z",
        endedAt: "2026-01-02T10:00:00.000Z",
        durationSec: 90,
        scenarioName: "Mine",
        overallScore: 70,
        skillScores: [
          { key: "closing", label: "Closing", score: 7, maxScore: 10 },
        ],
      },
      {
        id: "other-tp",
        organizationId: "org-1",
        teleproId: "tp-2",
        scenarioId: "sc-1",
        status: "COMPLETED",
        createdAt: "2026-01-02T11:00:00.000Z",
        endedAt: "2026-01-02T11:00:00.000Z",
        durationSec: 90,
        scenarioName: "Other TP",
        overallScore: 99,
        skillScores: [],
      },
      {
        id: "other-org",
        organizationId: "org-2",
        teleproId: "tp-1",
        scenarioId: "sc-1",
        status: "COMPLETED",
        createdAt: "2026-01-02T12:00:00.000Z",
        endedAt: "2026-01-02T12:00:00.000Z",
        durationSec: 90,
        scenarioName: "Other Org",
        overallScore: 99,
        skillScores: [
          { key: "closing", label: "Closing", score: 9, maxScore: 10 },
        ],
      },
    ];

    const { loadProgressionForTelepro } = await import(
      "@/lib/progressionService"
    );
    const view = await loadProgressionForTelepro({
      teleproId: "tp-1",
      organizationId: "org-1",
    });

    expect(view.trends.evaluatedCount).toBe(1);
    expect(view.trends.lastScore).toBe(70);
    expect(JSON.stringify(view)).not.toContain("Other TP");
    expect(JSON.stringify(view)).not.toContain("Other Org");

    const selectJson = JSON.stringify(lastFindManyArgs?.select ?? {});
    expect(selectJson).not.toContain("prompt");
    expect(selectJson).not.toContain("artifact");
    expect(selectJson).not.toContain("hash");
    expect(selectJson).not.toContain("secretInfos");
    expect(selectJson).not.toContain("aiProspect");
    expect(selectJson).not.toContain("content");
    expect(lastFindManyArgs?.take).toBe(MAX_DETAILED_ATTEMPTS);
    expect(mappingCalls[0]?.organizationId).toBe("org-1");
  });

  it("hides skill links for another organization", async () => {
    simulations = [
      {
        id: "a1",
        organizationId: "org-2",
        teleproId: "tp-1",
        scenarioId: "sc-1",
        status: "COMPLETED",
        createdAt: "2026-01-01T10:00:00.000Z",
        endedAt: "2026-01-01T10:00:00.000Z",
        durationSec: 60,
        scenarioName: "A",
        overallScore: 50,
        skillScores: [
          { key: "closing", label: "Closing", score: 5, maxScore: 10 },
        ],
      },
      {
        id: "a2",
        organizationId: "org-2",
        teleproId: "tp-1",
        scenarioId: "sc-1",
        status: "COMPLETED",
        createdAt: "2026-01-02T10:00:00.000Z",
        endedAt: "2026-01-02T10:00:00.000Z",
        durationSec: 60,
        scenarioName: "A",
        overallScore: 60,
        skillScores: [
          { key: "closing", label: "Closing", score: 6, maxScore: 10 },
        ],
      },
    ];
    const { loadProgressionForTelepro } = await import(
      "@/lib/progressionService"
    );
    const view = await loadProgressionForTelepro({
      teleproId: "tp-1",
      organizationId: "org-2",
    });
    expect(mappingCalls[0]?.organizationId).toBe("org-2");
    if (view.diagnostic.kind === "ready") {
      expect(view.diagnostic.skills[0]!.skillLinks).toEqual([]);
    }
  });
});

describe("progression UI source assertions", () => {
  it("tabs ARIA, no dangerouslySetInnerHTML, page default export only", () => {
    const tabs = readFileSync(
      path.join(process.cwd(), "src/app/app/progression/ProgressionTabs.tsx"),
      "utf8",
    );
    const page = readFileSync(
      path.join(process.cwd(), "src/app/app/progression/page.tsx"),
      "utf8",
    );
    const service = readFileSync(
      path.join(process.cwd(), "src/lib/progressionService.ts"),
      "utf8",
    );
    const viewSrc = readFileSync(
      path.join(process.cwd(), "src/lib/progressionView.ts"),
      "utf8",
    );

    expect(PROGRESSION_TABS.map((t) => t.id)).toEqual([
      "tendances",
      "comparatif",
      "diagnostic",
      "badges",
    ]);
    expect(tabs).toContain('role="tablist"');
    expect(tabs).toContain('role="tab"');
    expect(tabs).toContain("aria-selected");
    expect(tabs).toContain('role="tabpanel"');
    expect(tabs).toContain("ArrowRight");
    expect(tabs).toContain("ArrowLeft");
    expect(tabs).not.toContain("dangerouslySetInnerHTML");
    expect(page).not.toContain("dangerouslySetInnerHTML");
    expect(page).toMatch(/export default async function ProgressionPage/);
    expect(page).not.toMatch(/export\s+const\s+/);
    expect(page).not.toMatch(/export\s+(async\s+)?function\s+(?!ProgressionPage)/);
    expect(service).not.toMatch(/openai|ringover/i);
    expect(viewSrc).not.toMatch(/openai|ringover/i);
    expect(tabs).not.toMatch(/openai|ringover/i);
    expect(service).toContain("teleproId");
    expect(service).toContain("organizationId");
    expect(service).toContain("take: MAX_DETAILED_ATTEMPTS");
  });
});
