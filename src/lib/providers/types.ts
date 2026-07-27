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

// ---- TranscriptionProvider : audio -> transcript diarisé (héritée) ----
// Utilisée par l'ancien pipeline de connaissances (runRecordingPipeline).
export interface TranscriptionProvider {
  transcribe(input: {
    storageKey: string | null;
    language: string;
    seed: string;
  }): Promise<{ language: string; segments: TranscriptSegment[] }>;
}

// ---- Pipeline appel -> exercice ----------------------------------------
// Segment diarisé BRUT : le locuteur est un identifiant opaque du fournisseur
// (ex : "speaker_0"), l'attribution commercial/client vient d'une étape dédiée.
export interface DiarizedSegment {
  speakerId: string;
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
}

export interface DiarizedTranscription {
  language: string;
  segments: DiarizedSegment[];
  provider: string;
  model: string;
}

export interface DiarizedTranscriptionProvider {
  transcribeDiarized(input: {
    storageKey: string | null;
    language: string;
    mimeType?: string | null;
    seed: string;
  }): Promise<DiarizedTranscription>;
}

// ---- Attribution des locuteurs (commercial vs client) ----
export interface SpeakerAttributionResult {
  commercialSpeakerId: string | null;
  customerSpeakerId: string | null;
  confidence: number; // 0..1
  rationale: string;
}

export interface SpeakerAttributionProvider {
  attribute(input: {
    segments: DiarizedSegment[];
    language: string;
    seed: string;
  }): Promise<SpeakerAttributionResult>;
}

// ---- Anonymisation (PII -> variables) ----
export interface AnonymizationEntity {
  original: string;
  placeholder: string; // ex : [CLIENTE], [ENTREPRISE]
  type: string; // NAME | COMPANY | PHONE | EMAIL | ADDRESS | CITY | REFERENCE | OTHER
}

export interface AnonymizationResult {
  segments: Array<{ idx: number; anonymizedText: string }>;
  entities: AnonymizationEntity[]; // table de correspondance CÔTÉ SERVEUR uniquement
}

export interface AnonymizationProvider {
  anonymize(input: {
    segments: Array<{ idx: number; speakerId: string; role: string; text: string }>;
    language: string;
    seed: string;
  }): Promise<AnonymizationResult>;
}

// ---- Analyse structurée d'appel ----
export type ImportanceLevel = "LOW" | "MEDIUM" | "HIGH";

export interface RetainedPractice {
  id: string;
  label: string;
  description: string;
  evidenceSegmentIds: string[]; // idx (en chaîne) des segments-preuves
  importance: ImportanceLevel;
}

export interface CallAnalysisResult {
  callType: string;
  callTypeConfidence: number; // 0..1
  relationshipStage: string; // NEW | EXISTING | RENEWAL | UNKNOWN
  language: string;
  summary: string;
  customerProfile: {
    role: string;
    context: string;
    needs: string[];
    objections: string[];
    signals: string[];
  };
  commercialStrategy: {
    objective: string;
    outcome: string;
    retainedPractices: RetainedPractice[];
    missedOpportunities: string[];
  };
  facts: string[];
  inferences: string[];
  ambiguities: Array<{ id: string; question: string; importance: ImportanceLevel }>;
  referenceSuitability: {
    score: number; // 0..100
    usable: boolean;
    rationale: string;
  };
}

export interface CallAnalysisProvider {
  analyze(input: {
    segments: Array<{ idx: number; role: string; text: string }>;
    language: string;
    seed: string;
    clarifications?: Record<string, string>;
  }): Promise<CallAnalysisResult>;
}

// ---- Génération de scénario (exercice équivalent, anonymisé) ----
export interface GeneratedRubricCriterion {
  key: string;
  label: string;
  weight: number;
  description: string;
  observableSignals: string[];
  sourcePracticeIds: string[];
}

export interface ScenarioGenerationResult {
  name: string;
  callType: string;
  level: string; // FACILE | MOYEN | DIFFICILE
  offer: string;
  objective: string;
  prospectProfile: string;
  initialSituation: string;
  personality: string;
  traineeBrief: string;
  relationshipHistory: string;
  aiProspect: {
    persona: string;
    behaviorRules: string[];
    prohibitedRevelations: string[];
    openingLine: string;
  };
  allowedObjections: string[];
  secretInfos: Array<{ question: string; answer: string }>;
  successConditions: string;
  failureConditions: string;
  expectedNextSteps: string[];
  targetSkills: string[];
  coachingReference: string[];
  rubric: GeneratedRubricCriterion[]; // pondérations normalisées à 100 côté serveur
  targetDurationSec: number;
}

export interface ScenarioGenerationProvider {
  generate(input: {
    analysis: CallAnalysisResult;
    language: string;
    seed: string;
  }): Promise<ScenarioGenerationResult>;
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

export interface EvaluationContextKnowledge {
  type: string;
  title: string;
  content: string;
}

export interface EvaluationInput {
  turns: Array<{ role: string; content: string; atMs: number }>;
  rubric: RubricScoreInput[];
  scenarioLevel: string;
  seed: string;
  // Contexte optionnel (utilisé par le provider OpenAI ; ignoré par la démo).
  scenarioName?: string;
  callType?: string;
  objective?: string;
  prospectProfile?: string;
  successConditions?: string;
  failureConditions?: string;
  knowledge?: EvaluationContextKnowledge[];
}

export interface EvaluationProvider {
  evaluate(input: EvaluationInput): Promise<EvaluationResult>;
}
