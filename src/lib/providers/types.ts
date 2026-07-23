// Interfaces de fournisseurs — abstraction propre entre le mode démo et le mode réel.
// Chaque interface a une implémentation Demo (déterministe) et pourra avoir une
// implémentation OpenAI réelle. Le mode démo passe par les MÊMES interfaces.

export interface TranscriptSegment {
  speaker: "AGENT" | "PROSPECT";
  text: string;
  startMs: number;
  endMs: number;
}

export interface KnowledgeDraft {
  type: string;
  title: string;
  content: string;
  sourceExcerpt: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

// ---- AudioStorageProvider : stockage privé des enregistrements ----
export interface AudioStorageProvider {
  /** Écrit un buffer et retourne la clé de stockage privée. */
  put(key: string, data: Buffer, mimeType: string): Promise<void>;
  /** Retourne une URL signée temporaire pour lire le fichier. */
  getSignedUrl(key: string, expiresInSec?: number): Promise<string>;
  /** Lit le contenu (usage serveur uniquement). */
  get(key: string): Promise<Buffer | null>;
  /** Supprime réellement le fichier. */
  remove(key: string): Promise<void>;
}

// ---- TranscriptionProvider : audio -> transcript diarisé ----
export interface TranscriptionProvider {
  transcribe(input: {
    storageKey: string | null;
    language: string;
    seed: string;
  }): Promise<{ language: string; segments: TranscriptSegment[] }>;
}

// ---- KnowledgeExtractionProvider : transcript -> connaissances structurées ----
export interface KnowledgeExtractionProvider {
  extract(input: {
    segments: TranscriptSegment[];
    seed: string;
  }): Promise<KnowledgeDraft[]>;
}

// ---- RealtimeSessionProvider : négocie une session vocale ----
export interface RealtimeClientSecret {
  demo: boolean;
  model: string;
  voice: string;
  clientSecret?: string; // secret éphémère (mode réel)
  expiresAt?: string;
  instructions: string; // persona du prospect (jamais les infos secrètes brutes exposées côté client en réel)
}

export interface RealtimeSessionProvider {
  createEphemeralSession(input: {
    instructions: string;
  }): Promise<RealtimeClientSecret>;
}

// ---- EvaluationProvider : transcript -> évaluation structurée ----
export interface RubricScoreInput {
  key: string;
  label: string;
  weight: number;
}

export interface SkillScoreResult {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  rationale: string;
  evidence: string;
  recommendation: string;
}

export interface EvaluationResult {
  overallScore: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  advice: string[];
  betterExample: string;
  keyMoments: Array<{ role: string; quote: string; atMs: number }>;
  outcome: string;
  skillScores: SkillScoreResult[];
}

export interface EvaluationProvider {
  evaluate(input: {
    turns: Array<{ role: string; content: string; atMs: number }>;
    rubric: RubricScoreInput[];
    scenarioLevel: string;
    seed: string;
  }): Promise<EvaluationResult>;
}
