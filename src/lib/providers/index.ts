import "server-only";
import { isDemoMode } from "../config";
import {
  demoTranscription,
  demoKnowledgeExtraction,
  demoRealtime,
  demoEvaluation,
} from "./demo";
import { OpenAIRealtimeSessionProvider } from "./openai";
import type {
  EvaluationProvider,
  KnowledgeExtractionProvider,
  RealtimeSessionProvider,
  TranscriptionProvider,
} from "./types";

export {
  getAudioStorage,
  verifyStorageSignature,
  isPersistentStorageConfigured,
} from "./storage";
export * from "./types";
export { EvaluationResultSchema } from "./schemas";

/**
 * Sélecteurs de providers — séparation EXPLICITE démo / réel (aucune bascule
 * silencieuse).
 *
 * État réel des intégrations (audité, sans se fier aux commentaires historiques) :
 * - Realtime (voix) : implémentation OpenAI RÉELLE via secret éphémère.
 * - Transcription / Extraction / Évaluation : implémentations DÉMO déterministes.
 *   Les versions OpenAI réelles NE SONT PAS encore implémentées. En mode
 *   AI_PROVIDER=openai, ces providers lèvent une erreur claire plutôt que de
 *   retomber silencieusement sur la démo (ce qui masquerait l'état réel).
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
  throw new NotImplementedProviderError("La transcription OpenAI");
}

export function getKnowledgeExtractionProvider(): KnowledgeExtractionProvider {
  if (isDemoMode()) return demoKnowledgeExtraction;
  throw new NotImplementedProviderError("L'extraction de connaissances OpenAI");
}

export function getEvaluationProvider(): EvaluationProvider {
  if (isDemoMode()) return demoEvaluation;
  throw new NotImplementedProviderError("L'évaluation OpenAI");
}

export function getRealtimeSessionProvider(): RealtimeSessionProvider {
  if (isDemoMode()) return demoRealtime;
  return new OpenAIRealtimeSessionProvider();
}
