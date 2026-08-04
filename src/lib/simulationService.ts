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
import { SimulationStatus, PromptBundleStatus } from "./enums";
import { HttpError } from "./httpError";
import { log, safeErrorMessage } from "./log";
import { JobType } from "./jobTypes";
import { isFailedJobStatus } from "./jobStatus";
import {
  hashPromptArtifacts,
  parsePromptArtifacts,
  renderPromptTemplate,
  verifyPromptArtifactsHash,
  type SimulationPromptArtifacts,
} from "./promptArtifacts";
import type { EvaluationPromptOverrides } from "./providers";
import { resolvePlatformCatalogOrganizationId } from "./platformCatalog";

/** URL de la page d'analyse d'une simulation (jamais /app). */
export function analysisUrlFor(simulationId: string): string {
  return `/app/analysis/${simulationId}`;
}

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

type SimulationPromptSnapshot = {
  promptBundleId: string | null;
  promptBundleVersion: number | null;
  promptContentHash: string | null;
  scenarioId: string;
  organizationId: string;
};

type ResolvedPinnedPromptBundle =
  | { kind: "legacy" }
  | { kind: "pinned"; artifacts: SimulationPromptArtifacts };

/**
 * Résout et valide le PromptBundle épinglé sur une Simulation.
 * Ne consulte jamais Scenario.publishedPromptBundleId.
 */
async function resolvePinnedPromptBundle(
  sim: SimulationPromptSnapshot,
): Promise<ResolvedPinnedPromptBundle> {
  const hasBundleId = sim.promptBundleId != null;
  const hasVersion = sim.promptBundleVersion != null;
  const hasHash = sim.promptContentHash != null;

  if (!hasBundleId && !hasVersion && !hasHash) {
    return { kind: "legacy" };
  }

  if (!hasBundleId || !hasVersion || !hasHash) {
    throw new HttpError(
      500,
      "Snapshot de prompts incomplet pour la simulation.",
    );
  }

  const bundle = await prisma.promptBundle.findFirst({
    where: { id: sim.promptBundleId! },
  });
  if (!bundle) {
    throw new HttpError(500, "Bundle de prompts introuvable pour la simulation.");
  }
  if (bundle.id !== sim.promptBundleId) {
    throw new HttpError(500, "Bundle de prompts incohérent avec la simulation.");
  }
  if (
    bundle.scenarioId !== sim.scenarioId
  ) {
    throw new HttpError(500, "Bundle de prompts incohérent avec la simulation.");
  }
  // Bundle appartient au catalogue plateforme ; la simulation appartient à l'org du télépro.
  const catalogOrganizationId = await resolvePlatformCatalogOrganizationId();
  if (bundle.organizationId !== catalogOrganizationId) {
    throw new HttpError(500, "Bundle de prompts incohérent avec la simulation.");
  }
  if (bundle.version !== sim.promptBundleVersion) {
    throw new HttpError(500, "Version du bundle de prompts incohérente.");
  }
  if (bundle.contentHash !== sim.promptContentHash) {
    throw new HttpError(500, "Hash du bundle de prompts incohérent.");
  }
  if (
    bundle.status !== PromptBundleStatus.PUBLISHED &&
    bundle.status !== PromptBundleStatus.SUPERSEDED
  ) {
    throw new HttpError(500, "Bundle de prompts non utilisable pour la simulation.");
  }

  let artifacts: SimulationPromptArtifacts;
  try {
    artifacts = parsePromptArtifacts(bundle.artifacts);
  } catch {
    throw new HttpError(500, "Bundle de prompts incohérent.");
  }
  const computedHash = hashPromptArtifacts(artifacts);
  if (computedHash !== sim.promptContentHash) {
    throw new HttpError(500, "Artifacts du bundle de prompts incohérents.");
  }
  if (!verifyPromptArtifactsHash(artifacts, bundle.contentHash)) {
    throw new HttpError(500, "Bundle de prompts incohérent.");
  }

  return { kind: "pinned", artifacts };
}

function evaluationOverridesFromArtifacts(
  artifacts: SimulationPromptArtifacts,
): EvaluationPromptOverrides | undefined {
  const system = artifacts.EVALUATION_SYSTEM?.body;
  const user = artifacts.EVALUATION_USER?.body;
  if (!system && !user) return undefined;
  return {
    ...(system ? { system } : {}),
    ...(user ? { user } : {}),
  };
}

/** Récupère la persona du prospect pour un scénario (preview manager, hors snapshot). */
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

/**
 * Résout la persona Realtime depuis le snapshot PromptBundle épinglé sur la Simulation.
 * Ne consulte jamais Scenario.publishedPromptBundleId pour une simulation existante.
 */
export async function getPersonaForSimulation(input: {
  simulationId: string;
  organizationId: string;
  teleproId: string;
}): Promise<string> {
  const sim = await prisma.simulation.findFirst({
    where: {
      id: input.simulationId,
      organizationId: input.organizationId,
      teleproId: input.teleproId,
    },
    include: { scenario: true },
  });
  if (!sim) throw new HttpError(404, "Simulation introuvable.");

  const prospectName = sim.prospectName ?? "le prospect";

  const resolved = await resolvePinnedPromptBundle(sim);
  if (resolved.kind === "legacy") {
    const knowledge = await loadApprovedKnowledge(sim.scenario);
    return buildProspectPersona(
      sim.scenario as ScenarioForSim,
      knowledge,
      prospectName,
    );
  }

  return renderPromptTemplate(resolved.artifacts.PROSPECT_PERSONA.body, {
    prospectName,
    offer: sim.scenario.offer ?? "",
    callType: sim.scenario.callType,
    level: sim.scenario.level,
    objective: sim.scenario.objective ?? "",
  });
}

/** Génère la réplique d'ouverture du prospect (mode démo). */
export function opener(level: string): string {
  return demoProspectOpener(level);
}

/** Traite un tour : enregistre le message de l'agent puis la réponse du prospect. */
export async function processTurn(input: {
  simulationId: string;
  organizationId: string;
  teleproId: string;
  agentMessage: string;
}): Promise<{ prospect: string; shouldEnd: boolean; outcome: string | null }> {
  const sim = await prisma.simulation.findFirst({
    where: {
      id: input.simulationId,
      organizationId: input.organizationId,
      teleproId: input.teleproId,
    },
    include: { scenario: true, turns: { orderBy: { atMs: "asc" } } },
  });
  if (!sim) throw new HttpError(404, "Simulation introuvable.");

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

/**
 * Ajoute un tour issu d'une session Realtime (voix) SANS générer de réponse.
 *
 * En mode temps réel, la conversation se déroule entièrement via WebRTC entre le
 * navigateur et OpenAI : le prospect (modèle) répond directement en audio. On se
 * contente donc d'ARCHIVER les transcripts (agent via transcription du micro,
 * prospect via `response.output_audio_transcript`) pour l'historique et l'analyse.
 * Contrairement à `processTurn`, cette fonction n'appelle aucun provider et ne
 * fabrique aucune réplique.
 */
export async function appendRealtimeTurn(input: {
  simulationId: string;
  organizationId: string;
  teleproId: string;
  role: "AGENT" | "PROSPECT";
  content: string;
}): Promise<void> {
  const sim = await prisma.simulation.findFirst({
    where: {
      id: input.simulationId,
      organizationId: input.organizationId,
      teleproId: input.teleproId,
    },
    include: { turns: { orderBy: { atMs: "desc" }, take: 1 } },
  });
  if (!sim) throw new HttpError(404, "Simulation introuvable.");

  const lastMs = sim.turns[0]?.atMs ?? 0;
  await prisma.simulationTurn.create({
    data: {
      simulationId: sim.id,
      role: input.role,
      content: input.content,
      atMs: lastMs + 3000,
      createdAt: nowIso(),
    },
  });

  if (sim.status === SimulationStatus.CREATED) {
    await prisma.simulation.update({
      where: { id: sim.id },
      data: { status: SimulationStatus.IN_PROGRESS, updatedAt: nowIso() },
    });
  }
}

export type FinalizeResult =
  | { kind: "abandoned" }
  | { kind: "completed"; analysisUrl: string }
  | { kind: "pending"; analysisUrl: string };

/**
 * Finalise une simulation. L'évaluation n'est PLUS exécutée en ligne : elle est
 * confiée au worker via une tâche persistante (ProcessingJob EVALUATE_SIMULATION).
 * La route renvoie immédiatement (202) l'URL d'analyse ; la page d'analyse
 * interroge ensuite le statut jusqu'à COMPLETED/EVALUATION_FAILED.
 *
 * Idempotence :
 * - déjà évaluée → renvoie l'analyse existante (aucune 2e évaluation) ;
 * - un job existe déjà (non FAILED) → renvoie la même URL sans recréer de job ;
 * - abandon → aucune évaluation.
 *
 * Validation métier : refuse d'évaluer une conversation sans au moins un tour
 * agent ET un tour prospect (jamais l'IA seule).
 */
export async function finalizeSimulation(input: {
  simulationId: string;
  organizationId: string;
  teleproId: string;
  durationSec: number;
  outcome?: string | null;
  abandoned?: boolean;
}): Promise<FinalizeResult> {
  const sim = await prisma.simulation.findFirst({
    where: {
      id: input.simulationId,
      organizationId: input.organizationId,
      teleproId: input.teleproId,
    },
    include: {
      turns: { select: { role: true } },
      evaluation: { select: { id: true } },
    },
  });
  if (!sim) throw new HttpError(404, "Simulation introuvable.");

  const analysisUrl = analysisUrlFor(sim.id);

  // Abandon : non noté, aucune évaluation.
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
    return { kind: "abandoned" };
  }

  // Idempotence 1 : déjà évaluée.
  if (sim.evaluation) return { kind: "completed", analysisUrl };

  // Validation métier : il faut un échange réel (agent ET prospect).
  const hasAgent = sim.turns.some((t) => t.role === "AGENT");
  const hasProspect = sim.turns.some((t) => t.role === "PROSPECT");
  if (!hasAgent || !hasProspect) {
    throw new HttpError(
      422,
      "Conversation trop courte pour être évaluée : il faut au moins un échange entre vous et le prospect.",
    );
  }

  // Idempotence 2 : une tâche d'évaluation est déjà en file (et pas en échec définitif).
  const existingJob = await prisma.processingJob.findUnique({
    where: {
      type_targetId: {
        type: JobType.EVALUATE_SIMULATION,
        targetId: sim.id,
      },
    },
    select: { status: true },
  });
  // Seul un échec définitif autorise la recréation ; toute autre tâche
  // existante (en attente, en cours, terminée) est laissée telle quelle.
  if (existingJob && !isFailedJobStatus(existingJob.status)) {
    return { kind: "pending", analysisUrl };
  }

  // Transaction : passe en EVALUATION_PENDING + (ré)active la tâche. L'unicité
  // (type, targetId) garantit qu'une seule tâche d'évaluation existe par simulation.
  const now = nowIso();
  await prisma.$transaction(async (tx) => {
    await tx.simulation.update({
      where: { id: sim.id },
      data: {
        status: SimulationStatus.EVALUATION_PENDING,
        endedAt: now,
        durationSec: input.durationSec,
        outcome: input.outcome ?? undefined,
        updatedAt: now,
      },
    });
    await tx.processingJob.upsert({
      where: {
        type_targetId: {
          type: JobType.EVALUATE_SIMULATION,
          targetId: sim.id,
        },
      },
      create: {
        organizationId: sim.organizationId,
        type: JobType.EVALUATE_SIMULATION,
        targetId: sim.id,
        status: "PENDING",
        maxAttempts: 5,
      },
      // Relance explicite après échec définitif : compteur remis à zéro, sinon
      // la tâche resterait ignorée par claimJob (attempts >= maxAttempts).
      update: {
        status: "PENDING",
        attempts: 0,
        runAfter: new Date(),
        lastError: null,
        lockedAt: null,
        lockedBy: null,
      },
    });
  });

  log.info("evaluation.job_created", {
    organizationId: sim.organizationId,
    simulationId: sim.id,
  });

  return { kind: "pending", analysisUrl };
}

/**
 * Exécute l'évaluation d'une simulation (appelée par le worker via la file).
 * Idempotente : si l'évaluation existe déjà, se contente d'aligner le statut.
 * Valide la sortie du provider avec Zod AVANT écriture, puis persiste
 * l'évaluation + les scores par compétence dans une transaction.
 */
export async function runSimulationEvaluation(
  simulationId: string,
  organizationId: string,
): Promise<void> {
  const sim = await prisma.simulation.findFirstOrThrow({
    where: { id: simulationId, organizationId },
    include: {
      scenario: { include: { rubric: true } },
      turns: { orderBy: { atMs: "asc" } },
      evaluation: { select: { id: true } },
    },
  });

  // Idempotence : déjà évaluée → assure COMPLETED et sort.
  if (sim.evaluation) {
    if (sim.status !== SimulationStatus.COMPLETED) {
      await prisma.simulation.update({
        where: { id: sim.id },
        data: { status: SimulationStatus.COMPLETED, updatedAt: nowIso() },
      });
    }
    return;
  }

  // Défense en profondeur : ne jamais évaluer l'IA seule.
  const hasAgent = sim.turns.some((t) => t.role === "AGENT");
  const hasProspect = sim.turns.some((t) => t.role === "PROSPECT");
  if (!hasAgent || !hasProspect) {
    throw new Error("Transcript incomplet : au moins un tour agent et un tour prospect sont requis.");
  }

  await prisma.simulation.update({
    where: { id: sim.id },
    data: { status: SimulationStatus.EVALUATING, updatedAt: nowIso() },
  });
  log.info("evaluation.started", {
    organizationId,
    simulationId: sim.id,
    turns: sim.turns.length,
  });

  const rubric: RubricCriterion[] = sim.scenario.rubric
    ? parseJson<RubricCriterion[]>(sim.scenario.rubric.criteria, DEFAULT_RUBRIC)
    : DEFAULT_RUBRIC;

  const knowledge = await loadApprovedKnowledge(sim.scenario);
  const turns = sim.turns.map((t) => ({
    role: t.role,
    content: t.content,
    atMs: t.atMs,
  }));

  const pinnedBundle = await resolvePinnedPromptBundle(sim);
  const evaluationPromptOverrides =
    pinnedBundle.kind === "pinned"
      ? evaluationOverridesFromArtifacts(pinnedBundle.artifacts)
      : undefined;

  // Validation Zod AVANT écriture : une réponse malformée ne peut pas être
  // enregistrée comme une évaluation réussie.
  const result = EvaluationResultSchema.parse(
    await getEvaluationProvider().evaluate({
      turns,
      rubric: rubric.map((c) => ({ key: c.key, label: c.label, weight: c.weight })),
      scenarioLevel: sim.scenario.level,
      seed: sim.id,
      scenarioName: sim.scenario.name,
      callType: sim.scenario.callType,
      objective: sim.scenario.objective ?? undefined,
      offer: sim.scenario.offer ?? undefined,
      prospectName: sim.prospectName ?? undefined,
      prospectProfile: sim.scenario.prospectProfile ?? undefined,
      successConditions: sim.scenario.successConditions ?? undefined,
      failureConditions: sim.scenario.failureConditions ?? undefined,
      knowledge,
      evaluationPromptOverrides,
    }),
  );
  log.info("evaluation.openai_completed", {
    organizationId,
    simulationId: sim.id,
    overallScore: result.overallScore,
  });

  const now = nowIso();
  await prisma.$transaction(async (tx) => {
    await tx.simulationEvaluation.create({
      data: {
        simulationId: sim.id,
        overallScore: result.overallScore,
        summary: result.summary,
        strengths: JSON.stringify(result.strengths),
        improvements: JSON.stringify(result.improvements),
        advice: JSON.stringify(result.advice),
        betterExample: result.betterExample,
        keyMoments: JSON.stringify(result.keyMoments),
        outcome: sim.outcome ?? result.outcome,
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
    await tx.simulation.update({
      where: { id: sim.id },
      data: {
        status: SimulationStatus.COMPLETED,
        outcome: sim.outcome ?? result.outcome,
        updatedAt: now,
      },
    });
    await tx.scenarioAssignment.updateMany({
      where: { scenarioId: sim.scenarioId, teleproId: sim.teleproId },
      data: { status: "COMPLETED" },
    });
  });

  log.info("evaluation.persisted", {
    organizationId,
    simulationId: sim.id,
  });
}

/** Marque une simulation comme échec d'évaluation (après échec définitif de la tâche). */
export async function markSimulationEvaluationFailed(
  simulationId: string,
  organizationId: string,
  error: unknown,
): Promise<void> {
  await prisma.simulation.updateMany({
    where: { id: simulationId, organizationId },
    data: { status: SimulationStatus.EVALUATION_FAILED, updatedAt: nowIso() },
  });
  log.error("evaluation.failed", {
    organizationId,
    simulationId,
    error: safeErrorMessage(error),
  });
}
