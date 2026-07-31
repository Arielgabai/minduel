import "server-only";
import { isDemoMode } from "../config";
import {
  demoTranscription,
  demoKnowledgeExtraction,
  demoRealtime,
  demoEvaluation,
  demoDiarizedTranscription,
  demoSpeakerAttribution,
  demoAnonymization,
  demoCallAnalysis,
  demoScenarioGeneration,
} from "./demo";
import {
  OpenAIRealtimeSessionProvider,
  OpenAIEvaluationProvider,
  OpenAITranscriptionProvider,
  OpenAISpeakerAttributionProvider,
  OpenAIAnonymizationProvider,
  OpenAICallAnalysisProvider,
  OpenAIScenarioGenerationProvider,
} from "./openai";
import type {
  EvaluationProvider,
  KnowledgeExtractionProvider,
  RealtimeSessionProvider,
  TranscriptionProvider,
  DiarizedTranscriptionProvider,
  SpeakerAttributionProvider,
  AnonymizationProvider,
  CallAnalysisProvider,
  ScenarioGenerationProvider,
} from "./types";

export {
  getAudioStorage,
  verifyStorageSignature,
  isPersistentStorageConfigured,
} from "./storage";
export * from "./types";
export {
  EvaluationResultSchema,
  CallAnalysisResultSchema,
  ScenarioGenerationResultSchema,
  SpeakerAttributionSchema,
  AnonymizationSchema,
} from "./schemas";
export { normalizeScenarioWeights, buildEvaluationPrompt } from "./openai";

/**
 * Sélecteurs de providers — séparation EXPLICITE démo / réel (aucune bascule
 * silencieuse).
 *
 * État réel des intégrations (audité, sans se fier aux commentaires historiques) :
 * - Realtime (voix) : implémentation OpenAI RÉELLE via secret éphémère.
 * - Évaluation : implémentation OpenAI RÉELLE (Structured Outputs + revalidation Zod),
 *   exécutée de façon asynchrone par le worker (file ProcessingJob).
 * - Transcription / Extraction : implémentations DÉMO déterministes. Les versions
 *   OpenAI réelles NE SONT PAS encore implémentées. En mode AI_PROVIDER=openai, ces
 *   providers lèvent une erreur claire plutôt que de retomber silencieusement sur la
 *   démo (ce qui masquerait l'état réel).
 */

class NotImplementedProviderError extends Error {
  constructor(what: string) {
    super(
      `${what} n'est pas encore implémenté pour AI_PROVIDER=openai. ` +
        `Utilisez AI_PROVIDER=demo, ou implémentez le provider OpenAI correspondant.`,
    );
  }
}

export function getTranscriptionProvider(): TranscriptionProvider {
  if (isDemoMode()) return demoTranscription;
  throw new NotImplementedProviderError("La transcription (héritée) OpenAI");
}

export function getKnowledgeExtractionProvider(): KnowledgeExtractionProvider {
  if (isDemoMode()) return demoKnowledgeExtraction;
  throw new NotImplementedProviderError("L'extraction de connaissances OpenAI");
}

// --- Pipeline appel -> exercice : providers réels en mode openai, fixtures en démo. ---
export function getDiarizedTranscriptionProvider(): DiarizedTranscriptionProvider {
  if (isDemoMode()) return demoDiarizedTranscription;
  return new OpenAITranscriptionProvider();
}

export function getSpeakerAttributionProvider(): SpeakerAttributionProvider {
  if (isDemoMode()) return demoSpeakerAttribution;
  return new OpenAISpeakerAttributionProvider();
}

export function getAnonymizationProvider(): AnonymizationProvider {
  if (isDemoMode()) return demoAnonymization;
  return new OpenAIAnonymizationProvider();
}

export function getCallAnalysisProvider(): CallAnalysisProvider {
  if (isDemoMode()) return demoCallAnalysis;
  return new OpenAICallAnalysisProvider();
}

export function getScenarioGenerationProvider(): ScenarioGenerationProvider {
  if (isDemoMode()) return demoScenarioGeneration;
  return new OpenAIScenarioGenerationProvider();
}

export function getEvaluationProvider(): EvaluationProvider {
  if (isDemoMode()) return demoEvaluation;
  return new OpenAIEvaluationProvider();
}

export function getRealtimeSessionProvider(): RealtimeSessionProvider {
  if (isDemoMode()) return demoRealtime;
  return new OpenAIRealtimeSessionProvider();
}
