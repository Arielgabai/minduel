import "server-only";

import { prisma } from "@/lib/db";
import { FINISHED_SIMULATION_STATUSES } from "@/lib/teleproMissions";
import { loadPublishedSkillLinksByKeys } from "@/lib/debriefService";
import { normalizeSkillKey } from "@/lib/debriefView";
import {
  MAX_DETAILED_ATTEMPTS,
  buildProgressionView,
  type ProgressionView,
  type RawProgressionAttempt,
} from "@/lib/progressionView";

/**
 * Charge la vue Progression pour un telepro.
 * Isolation stricte: teleproId + organizationId.
 * Select minimal: pas de prompts, artifacts, hashes, secrets, ni corps Skills.
 */
export async function loadProgressionForTelepro(args: {
  teleproId: string;
  organizationId: string;
}): Promise<ProgressionView> {
  const { teleproId, organizationId } = args;

  const finishedWhere = {
    teleproId,
    organizationId,
    status: { in: [...FINISHED_SIMULATION_STATUSES] },
  };

  const [finishedCount, evaluatedCount, rows] = await Promise.all([
    prisma.simulation.count({ where: finishedWhere }),
    prisma.simulation.count({
      where: {
        ...finishedWhere,
        evaluation: { isNot: null },
      },
    }),
    prisma.simulation.findMany({
      where: finishedWhere,
      orderBy: [{ endedAt: "desc" }, { createdAt: "desc" }],
      take: MAX_DETAILED_ATTEMPTS,
      select: {
        id: true,
        scenarioId: true,
        status: true,
        createdAt: true,
        endedAt: true,
        durationSec: true,
        scenario: { select: { name: true } },
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
    }),
  ]);

  const attempts: RawProgressionAttempt[] = rows.map((row) => ({
    id: row.id,
    scenarioId: row.scenarioId,
    scenarioName: row.scenario.name,
    status: row.status,
    createdAt: row.createdAt,
    endedAt: row.endedAt,
    durationSec: row.durationSec,
    evaluation: row.evaluation
      ? {
          overallScore: row.evaluation.overallScore,
          skillScores: row.evaluation.skillScores,
        }
      : null,
  }));

  const skillKeys = new Set<string>();
  for (const a of attempts) {
    for (const s of a.evaluation?.skillScores ?? []) {
      const key = normalizeSkillKey(s.key);
      if (key) skillKeys.add(key);
    }
  }

  const skillLinksByKey = await loadPublishedSkillLinksByKeys({
    organizationId,
    skillKeys: [...skillKeys],
  });

  return buildProgressionView({
    attempts,
    finishedCount,
    evaluatedCount,
    skillLinksByKey,
  });
}
