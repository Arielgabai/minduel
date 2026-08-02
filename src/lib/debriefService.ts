import "server-only";

import { prisma } from "@/lib/db";
import { SkillStatus } from "@/lib/skillsContent";
import {
  MAX_SKILL_LINKS_PER_KEY,
  buildDebriefView,
  normalizeSkillKey,
  sortSkillLinkCandidates,
  type DebriefSkillLink,
  type DebriefView,
  type RawPreviousAttempt,
} from "@/lib/debriefView";

/**
 * Charge le débrief d'une simulation pour un téléprospecteur.
 * Isolation stricte : organizationId + teleproId + simulation.id.
 * Retourne null → la page doit répondre 404.
 * Aucun OpenAI, aucun recalcul, aucun contenu fictif.
 */
export async function loadDebriefForTelepro(args: {
  simulationId: string;
  teleproId: string;
  organizationId: string;
}): Promise<DebriefView | null> {
  const { simulationId, teleproId, organizationId } = args;

  const sim = await prisma.simulation.findFirst({
    where: {
      id: simulationId,
      organizationId,
      teleproId,
    },
    select: {
      id: true,
      scenarioId: true,
      status: true,
      prospectName: true,
      durationSec: true,
      createdAt: true,
      endedAt: true,
      scenario: { select: { name: true } },
      evaluation: {
        select: {
          overallScore: true,
          summary: true,
          outcome: true,
          strengths: true,
          improvements: true,
          advice: true,
          betterExample: true,
          keyMoments: true,
          skillScores: {
            select: {
              key: true,
              label: true,
              score: true,
              maxScore: true,
              rationale: true,
              evidence: true,
              recommendation: true,
            },
          },
        },
      },
      turns: {
        orderBy: { atMs: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          atMs: true,
        },
      },
    },
  });

  if (!sim) return null;

  const skillKeys = (sim.evaluation?.skillScores ?? [])
    .map((s) => normalizeSkillKey(s.key))
    .filter((k): k is string => k != null);

  const skillLinksByKey = await loadPublishedSkillLinksByKeys({
    organizationId,
    skillKeys: [...new Set(skillKeys)],
  });

  const previousAttempt = await loadPreviousAttempt({
    simulationId: sim.id,
    scenarioId: sim.scenarioId,
    teleproId,
    organizationId,
    createdAt: sim.createdAt,
  });

  return buildDebriefView({
    simulationId: sim.id,
    scenarioId: sim.scenarioId,
    scenarioName: sim.scenario.name,
    prospectName: sim.prospectName,
    durationSec: sim.durationSec,
    status: sim.status,
    evaluation: sim.evaluation
      ? {
          overallScore: sim.evaluation.overallScore,
          summary: sim.evaluation.summary,
          outcome: sim.evaluation.outcome,
          strengths: sim.evaluation.strengths,
          improvements: sim.evaluation.improvements,
          advice: sim.evaluation.advice,
          betterExample: sim.evaluation.betterExample,
          keyMoments: sim.evaluation.keyMoments,
          skillScores: sim.evaluation.skillScores,
        }
      : null,
    turns: sim.turns,
    previousAttempt,
    skillLinksByKey,
  });
}

async function loadPreviousAttempt(args: {
  simulationId: string;
  scenarioId: string;
  teleproId: string;
  organizationId: string;
  createdAt: string;
}): Promise<RawPreviousAttempt | null> {
  const prev = await prisma.simulation.findFirst({
    where: {
      organizationId: args.organizationId,
      teleproId: args.teleproId,
      scenarioId: args.scenarioId,
      id: { not: args.simulationId },
      status: "COMPLETED",
      createdAt: { lt: args.createdAt },
      evaluation: { isNot: null },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      endedAt: true,
      createdAt: true,
      evaluation: {
        select: {
          overallScore: true,
          skillScores: {
            select: {
              key: true,
              label: true,
              score: true,
              maxScore: true,
            },
          },
        },
      },
    },
  });

  if (!prev?.evaluation) return null;

  return {
    simulationId: prev.id,
    dateIso: prev.endedAt ?? prev.createdAt,
    overallScore:
      typeof prev.evaluation.overallScore === "number"
        ? prev.evaluation.overallScore
        : null,
    skillScores: prev.evaluation.skillScores,
  };
}

/**
 * Articles publiés mappés aux clés de compétences.
 * Exige Article + Section + Catégorie tous PUBLISHED, même organisation.
 * Ne charge jamais le corps (content) de l'article.
 */
export async function loadPublishedSkillLinksByKeys(args: {
  organizationId: string;
  skillKeys: string[];
}): Promise<Record<string, DebriefSkillLink[]>> {
  const keys = args.skillKeys
    .map((k) => normalizeSkillKey(k))
    .filter((k): k is string => k != null);
  const uniqueKeys = [...new Set(keys)];
  if (uniqueKeys.length === 0) return {};

  const mappings = await prisma.skillArticleMapping.findMany({
    where: {
      organizationId: args.organizationId,
      skillKey: { in: uniqueKeys },
      article: {
        organizationId: args.organizationId,
        status: SkillStatus.PUBLISHED,
        category: {
          organizationId: args.organizationId,
          status: SkillStatus.PUBLISHED,
        },
        section: {
          organizationId: args.organizationId,
          status: SkillStatus.PUBLISHED,
        },
      },
    },
    select: {
      skillKey: true,
      article: {
        select: {
          title: true,
          slug: true,
          readingMinutes: true,
          sortOrder: true,
          category: { select: { name: true, slug: true } },
        },
      },
    },
  });

  type Cand = DebriefSkillLink & { sortOrder: number };
  const byKey = new Map<string, Cand[]>();

  for (const m of mappings) {
    const key = normalizeSkillKey(m.skillKey);
    if (!key) continue;
    const link: Cand = {
      title: m.article.title,
      href: `/app/skills/${m.article.category.slug}/${m.article.slug}`,
      categoryName: m.article.category.name,
      categorySlug: m.article.category.slug,
      articleSlug: m.article.slug,
      readingMinutes: m.article.readingMinutes,
      sortOrder: m.article.sortOrder,
    };
    const list = byKey.get(key) ?? [];
    // Dédupliquer par href
    if (!list.some((x) => x.href === link.href)) {
      list.push(link);
      byKey.set(key, list);
    }
  }

  const out: Record<string, DebriefSkillLink[]> = {};
  for (const [key, list] of byKey) {
    const sorted = sortSkillLinkCandidates(list).slice(0, MAX_SKILL_LINKS_PER_KEY);
    out[key] = sorted.map((item) => ({
      title: item.title,
      href: item.href,
      categoryName: item.categoryName,
      categorySlug: item.categorySlug,
      articleSlug: item.articleSlug,
      readingMinutes: item.readingMinutes,
    }));
  }
  return out;
}