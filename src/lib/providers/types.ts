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
export interface StoredObjectInfo {
  exists: boolean;
  size?: number;
  contentType?: string;
}

export interface AudioStorageProvider {
  /** Écrit un objet côté serveur (dev local + passerelle S3 pour fichiers ≤ limite). */
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** URL de TÉLÉCHARGEMENT temporaire (locale signée ou pré-signée S3). */
  createDownloadUrl(key: string, ttlSec?: number): Promise<string>;
  /** Métadonnées / existence d'un objet (jamais son contenu). */
  headObject(key: string): Promise<StoredObjectInfo>;
  /** Supprime réellement l'objet. */
  deleteObject(key: string): Promise<void>;
  /** Lecture serveur du contenu (utilisé par la route de lecture en mode local). */
  get(key: string): Promise<Buffer | null>;
  /**
   * URL d'UPLOAD direct pré-signée (optionnelle : implémentée par S3).
   * Permet, à terme, d'uploader sans faire transiter le fichier par Next.js.
   */
  createUploadUrl?(
    key: string,
    contentType: string,
    ttlSec?: number,
  ): Promise<string>;
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
