import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildDebriefView,
  clampDisplayPct,
  matchKeyMomentToTurn,
  normalizeSkillKey,
  parsePersistedKeyMoments,
  parsePersistedStringList,
  resolveEvaluationState,
  sortSkillLinkCandidates,
  type BuildDebriefViewInput,
  type DebriefKeyMomentView,
} from "@/lib/debriefView";

type SimRow = {
  id: string;
  organizationId: string;
  teleproId: string;
  scenarioId: string;
  status: string;
  prospectName: string | null;
  durationSec: number;
  createdAt: string;
  endedAt: string | null;
  scenarioName: string;
  evaluation: {
    overallScore: number;
    summary: string | null;
    outcome: string | null;
    strengths: string | null;
    improvements: string | null;
    advice: string | null;
    betterExample: string | null;
    keyMoments: string | null;
    skillScores: Array<{
      key: string;
      label: string;
      score: number;
      maxScore: number;
      rationale: string | null;
      evidence: string | null;
      recommendation: string | null;
    }>;
  } | null;
  turns: Array<{ id: string; role: string; content: string; atMs: number }>;
};

type CategoryRow = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: string;
};

type SectionRow = {
  id: string;
  organizationId: string;
  categoryId: string;
  status: string;
};

type ArticleRow = {
  id: string;
  organizationId: string;
  categoryId: string;
  sectionId: string;
  title: string;
  slug: string;
  readingMinutes: number;
  sortOrder: number;
  status: string;
  content: string;
};

type MappingRow = {
  id: string;
  organizationId: string;
  articleId: string;
  skillKey: string;
};

let simulations: SimRow[] = [];
let categories: CategoryRow[] = [];
let sections: SectionRow[] = [];
let articles: ArticleRow[] = [];
let mappings: MappingRow[] = [];
let lastMappingSelect: Record<string, unknown> | null = null;

function matchSimple(row: Record<string, unknown>, where: Record<string, unknown>) {
  for (const [key, cond] of Object.entries(where)) {
    if (cond == null) continue;
    if (typeof cond === "object" && !Array.isArray(cond)) {
      const c = cond as {
        in?: unknown[];
        not?: unknown;
        lt?: string;
        isNot?: unknown;
      };
      if ("in" in c) {
        if (!(c.in ?? []).includes(row[key])) return false;
        continue;
      }
      if ("not" in c) {
        if (row[key] === c.not) return false;
        continue;
      }
      if ("lt" in c) {
        if (!(String(row[key]) < String(c.lt))) return false;
        continue;
      }
      if ("isNot" in c) {
        if (c.isNot === null && row[key] == null) return false;
        continue;
      }
    }
    if (row[key] !== cond) return false;
  }
  return true;
}

function pickSelect(
  row: Record<string, unknown>,
  select?: Record<string, unknown>,
): Record<string, unknown> {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(select)) {
    if (!val) continue;
    if (key === "scenario") {
      out.scenario = { name: row.scenarioName };
      continue;
    }
    if (key === "evaluation") {
      const ev = row.evaluation as SimRow["evaluation"];
      if (!ev) {
        out.evaluation = null;
        continue;
      }
      const evSelect = (val as { select?: Record<string, unknown> }).select;
      if (!evSelect) {
        out.evaluation = ev;
        continue;
      }
      const evOut: Record<string, unknown> = {};
      for (const [ek, ev] of Object.entries(evSelect)) {
        if (!ev) continue;
        if (ek === "skillScores") {
          const ssSelect = (ev as { select?: Record<string, unknown> }).select;
          evOut.skillScores = (
            (row.evaluation as NonNullable<SimRow["evaluation"]>).skillScores
          ).map((s) => pickSelect(s as unknown as Record<string, unknown>, ssSelect));
          continue;
        }
        evOut[ek] = (row.evaluation as Record<string, unknown>)[ek];
      }
      out.evaluation = evOut;
      continue;
    }
    if (key === "turns") {
      const order = (val as { orderBy?: { atMs?: string } }).orderBy;
      let turns = [...(row.turns as SimRow["turns"])];
      if (order?.atMs === "asc") turns.sort((a, b) => a.atMs - b.atMs);
      const tSelect = (val as { select?: Record<string, unknown> }).select;
      out.turns = turns.map((t) =>
        pickSelect(t as unknown as Record<string, unknown>, tSelect),
      );
      continue;
    }
    if (key === "category") {
      const cat = categories.find(
        (c) => c.id === (row as { categoryId: string }).categoryId,
      );
      out.category = pickSelect(
        cat as unknown as Record<string, unknown>,
        (val as { select?: Record<string, unknown> }).select,
      );
      continue;
    }
    if (key === "article") {
      const art = articles.find(
        (a) => a.id === (row as { articleId: string }).articleId,
      );
      out.article = pickSelect(
        art as unknown as Record<string, unknown>,
        (val as { select?: Record<string, unknown> }).select,
      );
      continue;
    }
    out[key] = row[key];
  }
  return out;
}

function articleMatchesNested(
  article: ArticleRow,
  where: Record<string, unknown>,
): boolean {
  if (!matchSimple(article as unknown as Record<string, unknown>, {
    organizationId: where.organizationId,
    status: where.status,
  })) {
    return false;
  }
  const catWhere = where.category as Record<string, unknown> | undefined;
  if (catWhere) {
    const cat = categories.find((c) => c.id === article.categoryId);
    if (!cat || !matchSimple(cat as unknown as Record<string, unknown>, catWhere)) {
      return false;
    }
  }
  const secWhere = where.section as Record<string, unknown> | undefined;
  if (secWhere) {
    const sec = sections.find((s) => s.id === article.sectionId);
    if (!sec || !matchSimple(sec as unknown as Record<string, unknown>, secWhere)) {
      return false;
    }
  }
  return true;
}

vi.mock("@/lib/platformCatalog", () => ({
  resolvePlatformCatalogOrganizationId: vi.fn(async () => "org1"),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    simulation: {
      findFirst: async ({
        where,
        orderBy,
        select,
      }: {
        where: Record<string, unknown>;
        orderBy?: { createdAt?: string };
        select?: Record<string, unknown>;
      }) => {
        let rows = simulations.filter((s) => {
          const base = {
            id: s.id,
            organizationId: s.organizationId,
            teleproId: s.teleproId,
            scenarioId: s.scenarioId,
            status: s.status,
            createdAt: s.createdAt,
            evaluation: s.evaluation,
          };
          const w = { ...where };
          const evFilter = w.evaluation as { isNot?: null } | undefined;
          delete w.evaluation;
          if (!matchSimple(base as unknown as Record<string, unknown>, w)) {
            return false;
          }
          if (evFilter && "isNot" in evFilter && evFilter.isNot === null) {
            if (s.evaluation == null) return false;
          }
          return true;
        });
        if (orderBy?.createdAt === "desc") {
          rows = [...rows].sort((a, b) =>
            a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
          );
        }
        const found = rows[0] ?? null;
        if (!found) return null;
        return pickSelect(found as unknown as Record<string, unknown>, select);
      },
    },
    skillArticleMapping: {
      findMany: async ({
        where,
        select,
      }: {
        where: Record<string, unknown>;
        select?: Record<string, unknown>;
      }) => {
        lastMappingSelect = select ?? null;
        const orgId = where.organizationId as string;
        const keys = (where.skillKey as { in?: string[] })?.in ?? [];
        const articleWhere = where.article as Record<string, unknown>;
        return mappings
          .filter((m) => m.organizationId === orgId && keys.includes(m.skillKey))
          .filter((m) => {
            const art = articles.find((a) => a.id === m.articleId);
            if (!art) return false;
            return articleMatchesNested(art, articleWhere);
          })
          .map((m) =>
            pickSelect(m as unknown as Record<string, unknown>, select),
          );
      },
    },
  },
}));

const ORG = "org1";
const OTHER_ORG = "org2";
const TELEPRO = "tel1";
const OTHER_TEL = "tel2";

let seq = 0;
function uid(p: string) {
  return `${p}-${++seq}`;
}

function baseInput(
  over: Partial<BuildDebriefViewInput> = {},
): BuildDebriefViewInput {
  return {
    simulationId: "sim-1",
    scenarioId: "sc-1",
    scenarioName: "Exercice démo",
    prospectName: "Alex",
    durationSec: 125,
    status: "COMPLETED",
    evaluation: {
      overallScore: 72,
      summary: " Bon résumé ",
      outcome: "RDV",
      strengths: JSON.stringify(["Écoute active"]),
      improvements: JSON.stringify(["Recadrage"]),
      advice: JSON.stringify(["Poser une question ouverte"]),
      betterExample: " Et si on prenait 10 minutes ? ",
      keyMoments: JSON.stringify([
        { role: "AGENT", quote: "Dix minutes suffisent", atMs: 4000 },
      ]),
      skillScores: [
        {
          key: "decouverte",
          label: "Découverte",
          score: 8,
          maxScore: 10,
          rationale: "Bonne exploration",
          evidence: "A demandé le contexte",
          recommendation: "Creuser le budget",
        },
      ],
    },
    turns: [
      {
        id: "t1",
        role: "AGENT",
        content: "Bonjour, Dix minutes suffisent vraiment.",
        atMs: 4000,
      },
      {
        id: "t0",
        role: "PROSPECT",
        content: "Je suis occupé.",
        atMs: 1000,
      },
    ],
    previousAttempt: null,
    skillLinksByKey: {},
    ...over,
  };
}

beforeEach(() => {
  simulations = [];
  categories = [];
  sections = [];
  articles = [];
  mappings = [];
  lastMappingSelect = null;
  seq = 0;
  vi.clearAllMocks();
});

describe("parsing défensif — aucune fabrication", () => {
  it("éval complète → available + scores bornés", () => {
    const view = buildDebriefView(baseInput());
    expect(view.evaluationState).toBe("ready");
    expect(view.overallScore).toBe(72);
    expect(view.summary).toBe("Bon résumé");
    expect(view.strengths).toEqual({
      status: "available",
      items: ["Écoute active"],
    });
    expect(view.skillScores[0]!.scorePct).toBe(80);
    expect(view.turnsAvailable).toBe(true);
    expect(view.lineAnnotationsAvailable).toBe(false);
    expect(view.turns.map((t) => t.id)).toEqual(["t0", "t1"]);
  });

  it("champs absents / null / invalides → unavailable, pas de faux items", () => {
    expect(parsePersistedStringList(null).status).toBe("unavailable");
    expect(parsePersistedStringList("").status).toBe("unavailable");
    expect(parsePersistedStringList("not-json").status).toBe("unavailable");
    expect(parsePersistedStringList('{"a":1}').status).toBe("unavailable");
    expect(parsePersistedStringList("[]")).toEqual({
      status: "empty",
      items: [],
    });
    expect(parsePersistedKeyMoments(undefined).status).toBe("unavailable");
    expect(parsePersistedKeyMoments("[]").status).toBe("empty");
    expect(
      parsePersistedKeyMoments(
        JSON.stringify([{ role: "AGENT", quote: "  ", atMs: 1 }]),
      ).status,
    ).toBe("empty");

    const view = buildDebriefView(
      baseInput({
        evaluation: {
          overallScore: null,
          summary: "   ",
          outcome: null,
          strengths: null,
          improvements: "broken",
          advice: "[]",
          betterExample: null,
          keyMoments: null,
          skillScores: [],
        },
      }),
    );
    expect(view.overallScore).toBeNull();
    expect(view.summary).toBeNull();
    expect(view.strengths.status).toBe("unavailable");
    expect(view.improvements.status).toBe("unavailable");
    expect(view.advice.status).toBe("empty");
    expect(view.keyMoments.status).toBe("unavailable");
    expect(view.skillScores).toEqual([]);
  });

  it("clampDisplayPct et resolveEvaluationState", () => {
    expect(clampDisplayPct(5, 10)).toBe(50);
    expect(clampDisplayPct(20, 10)).toBe(100);
    expect(clampDisplayPct(-1, 10)).toBe(0);
    expect(clampDisplayPct(1, 0)).toBe(0);
    expect(resolveEvaluationState("COMPLETED", true)).toBe("ready");
    expect(resolveEvaluationState("ABANDONED", false)).toBe("abandoned");
    expect(resolveEvaluationState("EVALUATION_FAILED", false)).toBe("failed");
    expect(resolveEvaluationState("EVALUATING", false)).toBe("pending");
    expect(resolveEvaluationState("COMPLETED", false)).toBe("missing");
  });
});

describe("quatre onglets — données via buildDebriefView", () => {
  it("alimente résumé, ligne, pourquoi et comparatif sans invention", () => {
    const view = buildDebriefView(
      baseInput({
        skillLinksByKey: {
          decouverte: [
            {
              title: "Questions ouvertes",
              href: "/app/skills/decouverte/questions",
              categoryName: "Découverte",
              categorySlug: "decouverte",
              articleSlug: "questions",
              readingMinutes: 4,
            },
          ],
        },
        previousAttempt: {
          simulationId: "sim-prev",
          dateIso: "2026-07-01T10:00:00.000Z",
          overallScore: 60,
          skillScores: [
            { key: "decouverte", label: "Découverte", score: 6, maxScore: 10 },
          ],
        },
      }),
    );

    expect(view.strengths.items.length).toBeGreaterThan(0);
    expect(view.turns[1]!.isKeyMoment).toBe(true);
    expect(view.skillScores[0]!.skillLinks).toHaveLength(1);
    expect(view.skillScores[0]!.hasRationale).toBe(true);
    expect(view.comparative.kind).toBe("previous_attempt");
    if (view.comparative.kind === "previous_attempt") {
      expect(view.comparative.title).toBe("Tentative précédente");
      expect(view.comparative.skillComparisons[0]!.previousScore).toBe(6);
      expect(JSON.stringify(view.comparative)).not.toMatch(/équipe|expert|appel réel/i);
    }
  });
});

describe("moments clés — correspondance exacte uniquement", () => {
  const moments: DebriefKeyMomentView[] = [
    {
      role: "AGENT",
      quote: "phrase exacte longue",
      atMs: 5000,
      timeLabel: "0:05",
    },
  ];

  it("matche par atMs exact ou extrait inclus", () => {
    expect(
      matchKeyMomentToTurn(
        { content: "autre", atMs: 5000 },
        moments,
      )?.quote,
    ).toBe("phrase exacte longue");
    expect(
      matchKeyMomentToTurn(
        { content: "Voici phrase exacte longue ici", atMs: 999 },
        moments,
      )?.quote,
    ).toBe("phrase exacte longue");
  });

  it("refuse le rapprochement approximatif", () => {
    expect(
      matchKeyMomentToTurn(
        { content: "phrase exacte", atMs: 100 },
        moments,
      ),
    ).toBeNull();
  });
});

describe("comparatif", () => {
  it("état vide sans tentative précédente", () => {
    const view = buildDebriefView(baseInput({ previousAttempt: null }));
    expect(view.comparative).toEqual({
      kind: "unavailable",
      title: "Comparatif",
      message: "Pas assez de tentatives pour comparer",
    });
  });
});

describe("normalizeSkillKey (lot J)", () => {
  it("trim + schéma, rejette invalide", () => {
    expect(normalizeSkillKey("  decouverte  ")).toBe("decouverte");
    expect(normalizeSkillKey("")).toBeNull();
    expect(normalizeSkillKey(" bad key ")).toBeNull();
    expect(normalizeSkillKey(null)).toBeNull();
  });
});

describe("sortSkillLinkCandidates", () => {
  it("tri déterministe sortOrder → titre → slug", () => {
    const sorted = sortSkillLinkCandidates([
      { sortOrder: 2, title: "B", articleSlug: "b" },
      { sortOrder: 1, title: "Z", articleSlug: "z" },
      { sortOrder: 1, title: "A", articleSlug: "a2" },
      { sortOrder: 1, title: "A", articleSlug: "a1" },
    ]);
    expect(sorted.map((x) => x.articleSlug)).toEqual(["a1", "a2", "z", "b"]);
  });
});

describe("loadDebriefForTelepro — isolation et mappings", () => {
  async function svc() {
    return import("@/lib/debriefService");
  }

  function seedPublishedMapping(opts?: {
    orgId?: string;
    skillKey?: string;
    articleStatus?: string;
    categoryStatus?: string;
    sectionStatus?: string;
    title?: string;
    slug?: string;
    sortOrder?: number;
  }) {
    const orgId = opts?.orgId ?? ORG;
    const cat: CategoryRow = {
      id: uid("cat"),
      organizationId: orgId,
      name: "Découverte",
      slug: "decouverte",
      status: opts?.categoryStatus ?? "PUBLISHED",
    };
    categories.push(cat);
    const sec: SectionRow = {
      id: uid("sec"),
      organizationId: orgId,
      categoryId: cat.id,
      status: opts?.sectionStatus ?? "PUBLISHED",
    };
    sections.push(sec);
    const art: ArticleRow = {
      id: uid("art"),
      organizationId: orgId,
      categoryId: cat.id,
      sectionId: sec.id,
      title: opts?.title ?? "Questions",
      slug: opts?.slug ?? `art-${seq}`,
      readingMinutes: 3,
      sortOrder: opts?.sortOrder ?? 0,
      status: opts?.articleStatus ?? "PUBLISHED",
      content: JSON.stringify([{ type: "paragraph", text: "SECRET_BODY" }]),
    };
    articles.push(art);
    mappings.push({
      id: uid("map"),
      organizationId: orgId,
      articleId: art.id,
      skillKey: opts?.skillKey ?? "decouverte",
    });
    return art;
  }

  function addSim(over: Partial<SimRow> = {}): SimRow {
    const row: SimRow = {
      id: uid("sim"),
      organizationId: ORG,
      teleproId: TELEPRO,
      scenarioId: "sc-1",
      status: "COMPLETED",
      prospectName: "Alex",
      durationSec: 90,
      createdAt: "2026-08-02T10:00:00.000Z",
      endedAt: "2026-08-02T10:05:00.000Z",
      scenarioName: "Mission test",
      evaluation: {
        overallScore: 70,
        summary: "Ok",
        outcome: "RDV",
        strengths: JSON.stringify(["A"]),
        improvements: JSON.stringify(["B"]),
        advice: JSON.stringify(["C"]),
        betterExample: null,
        keyMoments: JSON.stringify([]),
        skillScores: [
          {
            key: "decouverte",
            label: "Découverte",
            score: 7,
            maxScore: 10,
            rationale: null,
            evidence: null,
            recommendation: null,
          },
        ],
      },
      turns: [
        { id: "t1", role: "AGENT", content: "Hello", atMs: 0 },
      ],
      ...over,
    };
    simulations.push(row);
    return row;
  }

  it("retourne null pour un autre télépro ou une autre org", async () => {
    const { loadDebriefForTelepro } = await svc();
    const sim = addSim();
    expect(
      await loadDebriefForTelepro({
        simulationId: sim.id,
        teleproId: OTHER_TEL,
        organizationId: ORG,
      }),
    ).toBeNull();
    expect(
      await loadDebriefForTelepro({
        simulationId: sim.id,
        teleproId: TELEPRO,
        organizationId: OTHER_ORG,
      }),
    ).toBeNull();
  });

  it("expose le mapping publié et masque DRAFT / parent non publié / autre org", async () => {
    const { loadDebriefForTelepro, loadPublishedSkillLinksByKeys } = await svc();
    seedPublishedMapping({ title: "Visible", slug: "visible", sortOrder: 1 });
    seedPublishedMapping({
      title: "Brouillon",
      slug: "draft",
      articleStatus: "DRAFT",
    });
    seedPublishedMapping({
      title: "Cat draft",
      slug: "cat-draft",
      categoryStatus: "DRAFT",
    });
    seedPublishedMapping({
      title: "Sec archive",
      slug: "sec-arch",
      sectionStatus: "ARCHIVED",
    });
    seedPublishedMapping({
      orgId: OTHER_ORG,
      title: "Autre org",
      slug: "other",
    });

    const links = await loadPublishedSkillLinksByKeys({
      organizationId: ORG,
      skillKeys: ["decouverte"],
    });
    expect(links.decouverte?.map((l) => l.articleSlug)).toEqual(["visible"]);
    expect(JSON.stringify(links)).not.toContain("SECRET_BODY");
    expect(JSON.stringify(lastMappingSelect)).not.toContain("content");

    const sim = addSim();
    const view = await loadDebriefForTelepro({
      simulationId: sim.id,
      teleproId: TELEPRO,
      organizationId: ORG,
    });
    expect(view).not.toBeNull();
    expect(view!.skillScores[0]!.skillLinks[0]!.href).toBe(
      "/app/skills/decouverte/visible",
    );
  });

  it("charge la tentative précédente COMPLETED du même scénario", async () => {
    const { loadDebriefForTelepro } = await svc();
    addSim({
      id: "sim-prev",
      createdAt: "2026-08-01T10:00:00.000Z",
      endedAt: "2026-08-01T10:10:00.000Z",
      evaluation: {
        overallScore: 55,
        summary: "Avant",
        outcome: null,
        strengths: null,
        improvements: null,
        advice: null,
        betterExample: null,
        keyMoments: null,
        skillScores: [
          {
            key: "decouverte",
            label: "Découverte",
            score: 5,
            maxScore: 10,
            rationale: null,
            evidence: null,
            recommendation: null,
          },
        ],
      },
    });
    const current = addSim({
      id: "sim-cur",
      createdAt: "2026-08-02T10:00:00.000Z",
    });
    const view = await loadDebriefForTelepro({
      simulationId: current.id,
      teleproId: TELEPRO,
      organizationId: ORG,
    });
    expect(view!.comparative.kind).toBe("previous_attempt");
    if (view!.comparative.kind === "previous_attempt") {
      expect(view!.comparative.previousSimulationId).toBe("sim-prev");
      expect(view!.comparative.previousOverallScore).toBe(55);
    }
  });
});

describe("assertions source — page, onglets, modules", () => {
  const pageSrc = readFileSync(
    path.resolve("src/app/app/analysis/[id]/page.tsx"),
    "utf8",
  );
  const tabsSrc = readFileSync(
    path.resolve("src/app/app/analysis/[id]/DebriefTabs.tsx"),
    "utf8",
  );
  const viewSrc = readFileSync(path.resolve("src/lib/debriefView.ts"), "utf8");
  const serviceSrc = readFileSync(
    path.resolve("src/lib/debriefService.ts"),
    "utf8",
  );

  it("page : requireTelepro + export default uniquement", () => {
    expect(pageSrc).toContain("requireTelepro");
    expect(pageSrc).toContain("loadDebriefForTelepro");
    expect(pageSrc).toMatch(/export\s+default\s+async\s+function/);
    const named = pageSrc.match(/^export\s+(?!default)/gm) ?? [];
    expect(named).toEqual([]);
  });

  it("DebriefTabs : a11y tabs, pas de fetch ni HTML brut", () => {
    expect(tabsSrc).toContain('role="tablist"');
    expect(tabsSrc).toContain("aria-selected");
    expect(tabsSrc).toContain("aria-controls");
    expect(tabsSrc).toContain('role="tabpanel"');
    expect(tabsSrc).not.toContain("dangerouslySetInnerHTML");
    expect(tabsSrc).not.toMatch(/\bfetch\s*\(/);
  });

  it("nouveaux modules : pas d'import openai / ringover", () => {
    const forbiddenImport = (src: string, name: string) => {
      expect(src).not.toMatch(new RegExp("from\\s+['\"]" + name + "['\"]"));
      expect(src).not.toMatch(
        new RegExp("require\\s*\\(\\s*['\"]" + name + "['\"]\\s*\\)"),
      );
    };
    for (const src of [viewSrc, serviceSrc, tabsSrc, pageSrc]) {
      forbiddenImport(src, "openai");
      forbiddenImport(src, "ringover");
      expect(src).not.toContain("dangerouslySetInnerHTML");
    }
    expect(serviceSrc).toContain("organizationId");
    expect(serviceSrc).toContain("teleproId");
    expect(serviceSrc).not.toMatch(/\bfetch\s*\(/);
  });
});