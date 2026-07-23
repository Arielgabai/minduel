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

export { getAudioStorage, verifyStorageSignature } from "./storage";
export * from "./types";

// Sélecteurs de providers : le mode démo passe par les mêmes interfaces que le réel.
// Pour le MVP, transcription / extraction / évaluation utilisent l'implémentation
// déterministe (démo). La session Realtime bascule sur OpenAI dès qu'une clé existe.

export function getTranscriptionProvider(): TranscriptionProvider {
  // Un provider OpenAI (whisper) pourra être branché ici en mode réel.
  return demoTranscription;
}

export function getKnowledgeExtractionProvider(): KnowledgeExtractionProvider {
  return demoKnowledgeExtraction;
}

export function getEvaluationProvider(): EvaluationProvider {
  // Une évaluation OpenAI structurée (JSON validé) pourra être branchée ici.
  return demoEvaluation;
}

export function getRealtimeSessionProvider(): RealtimeSessionProvider {
  if (isDemoMode()) return demoRealtime;
  return new OpenAIRealtimeSessionProvider();
}
