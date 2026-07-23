import "server-only";
import { prisma } from "./db";
import { nowIso, parseJson } from "./utils";
import {
  buildProspectPersona,
  demoProspectOpener,
  demoProspectReply,
  type ScenarioForSim,
} from "./simulation";
import { getEvaluationProvider, EvaluationResultSchema } from "./providers";
import { DEFAULT_RUBRIC, type RubricCriterion } from "./rubric";
import { SimulationStatus } from "./enums";

const DEMO_PROSPECT_NAMES = ["Malik", "Sophie", "Karim", "Nadia", "Thomas"];

export function prospectNameFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return DEMO_PROSPECT_NAMES[h % DEMO_PROSPECT_NAMES.length]!;
}

async function loadApprovedKnowledge(scenario: {
  organizationId: string;
  knowledgeRefs: string | null;
}) {
  const refs = parseJson<string[]>(scenario.knowledgeRefs, []);
  if (refs.length === 0) return [];
  const items = await prisma.knowledgeItem.findMany({
    where: {
      id: { in: refs },
      organizationId: scenario.organizationId,
      reviewStatus: "APPROVED", // jamais un élément rejeté ou désactivé
      enabled: true,
    },
  });
  return items.map((k) => ({ type: k.type, title: k.title, content: k.content }));
}

/** Récupère la persona du prospect pour une simulation (mode réel : instructions Realtime). */
export async function getPersonaForScenario(
  scenarioId: string,
  organizationId: string,
  prospectName: string,
): Promise<string> {
  const scenario = await prisma.scenario.findFirstOrThrow({
    where: { id: scenarioId, organizationId },
  });
  const knowledge = await loadApprovedKnowledge(scenario);
  return buildProspectPersona(scenario as ScenarioForSim, knowledge, prospectName);
}

/** Génère la réplique d'ouverture du prospect (mode démo). */
export function opener(level: string): string {
  return demoProspectOpener(level);
}

/** Traite un tour : enregistre le message de l'agent puis la réponse du prospect. */
export async function processTurn(input: {
  simulationId: string;
  organizationId: string;
  agentMessage: string;
}): Promise<{ prospect: string; shouldEnd: boolean; outcome: string | null }> {
  const sim = await prisma.simulation.findFirstOrThrow({
    where: { id: input.simulationId, organizationId: input.organizationId },
    include: { scenario: true, turns: { orderBy: { atMs: "asc" } } },
  });

  const history = sim.turns.map((t) => ({ role: t.role, content: t.content }));
  const lastMs = sim.turns.at(-1)?.atMs ?? 0;

  // Tour agent.
  await prisma.simulationTurn.create({
    data: {
      simulationId: sim.id,
      role: "AGENT",
      content: input.agentMessage,
      atMs: lastMs + 3000,
      createdAt: nowIso(),
    },
  });

  const reply = demoProspectReply(
    sim.scenario as ScenarioForSim,
    history,
    input.agentMessage,
    sim.id,
  );

  await prisma.simulationTurn.create({
    data: {
      simulationId: sim.id,
      role: "PROSPECT",
      content: reply.content,
      atMs: lastMs + 6000,
      createdAt: nowIso(),
    },
  });

  if (sim.status === SimulationStatus.CREATED) {
    await prisma.simulation.update({
      where: { id: sim.id },
      data: { status: SimulationStatus.IN_PROGRESS, updatedAt: nowIso() },
    });
  }

  return { prospect: reply.content, shouldEnd: reply.shouldEnd, outcome: reply.outcome };
}

/** Finalise la simulation et lance l'évaluation serveur structurée. */
export async function finalizeSimulation(input: {
  simulationId: string;
  organizationId: string;
  durationSec: number;
  outcome?: string | null;
  abandoned?: boolean;
}): Promise<{ evaluationId: string | null }> {
  const sim = await prisma.simulation.findFirstOrThrow({
    where: { id: input.simulationId, organizationId: input.organizationId },
    include: {
      scenario: { include: { rubric: true } },
      turns: { orderBy: { atMs: "asc" } },
      evaluation: true,
    },
  });

  // Idempotence : si déjà évaluée, ne pas recalculer.
  if (sim.evaluation) {
    return { evaluationId: sim.evaluation.id };
  }

  if (input.abandoned) {
    await prisma.simulation.update({
      where: { id: sim.id },
      data: {
        status: SimulationStatus.ABANDONED,
        endedAt: nowIso(),
        durationSec: input.durationSec,
        updatedAt: nowIso(),
      },
    });
    return { evaluationId: null };
  }

  const rubric: RubricCriterion[] = sim.scenario.rubric
    ? parseJson<RubricCriterion[]>(sim.scenario.rubric.criteria, DEFAULT_RUBRIC)
    : DEFAULT_RUBRIC;

  const turns = sim.turns.map((t) => ({ role: t.role, content: t.content, atMs: t.atMs }));

  // Validation Zod de la sortie AVANT toute écriture : un échec ou une réponse
  // malformée ne peut pas enregistrer une évaluation partielle comme réussie.
  const result = EvaluationResultSchema.parse(
    await getEvaluationProvider().evaluate({
      turns,
      rubric: rubric.map((c) => ({ key: c.key, label: c.label, weight: c.weight })),
      scenarioLevel: sim.scenario.level,
      seed: sim.id,
    }),
  );

  const now = nowIso();
  const evaluation = await prisma.simulationEvaluation.create({
    data: {
      simulationId: sim.id,
      overallScore: result.overallScore,
      summary: result.summary,
      strengths: JSON.stringify(result.strengths),
      improvements: JSON.stringify(result.improvements),
      advice: JSON.stringify(result.advice),
      betterExample: result.betterExample,
      keyMoments: JSON.stringify(result.keyMoments),
      outcome: input.outcome ?? result.outcome,
      createdAt: now,
      skillScores: {
        create: result.skillScores.map((s) => ({
          key: s.key,
          label: s.label,
          score: s.score,
          maxScore: s.maxScore,
          rationale: s.rationale,
          evidence: s.evidence,
          recommendation: s.recommendation,
        })),
      },
    },
  });

  await prisma.simulation.update({
    where: { id: sim.id },
    data: {
      status: SimulationStatus.COMPLETED,
      endedAt: now,
      durationSec: input.durationSec,
      outcome: input.outcome ?? result.outcome,
      updatedAt: now,
    },
  });

  // Marque l'assignation comme complétée.
  await prisma.scenarioAssignment.updateMany({
    where: { scenarioId: sim.scenarioId, teleproId: sim.teleproId },
    data: { status: "COMPLETED" },
  });

  return { evaluationId: evaluation.id };
}
