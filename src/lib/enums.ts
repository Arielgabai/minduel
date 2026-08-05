// Enums applicatifs (SQLite ne supporte pas les enums natifs Prisma).

export const Role = {
  PLATFORM_ADMIN: "PLATFORM_ADMIN",
  MANAGER: "MANAGER",
  TELEPRO: "TELEPRO",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ScenarioLevel = {
  FACILE: "FACILE",
  MOYEN: "MOYEN",
  DIFFICILE: "DIFFICILE",
} as const;
export type ScenarioLevel = (typeof ScenarioLevel)[keyof typeof ScenarioLevel];

export const CallType = {
  // Valeurs héritées (compat) :
  VENTE: "VENTE",
  PITCH_INVESTISSEUR: "PITCH_INVESTISSEUR",
  ENTRETIEN_EMBAUCHE: "ENTRETIEN_EMBAUCHE",
  // Classification du pipeline appel -> exercice :
  COLD_PROSPECTING: "COLD_PROSPECTING",
  WARM_PROSPECTING: "WARM_PROSPECTING",
  FOLLOW_UP: "FOLLOW_UP",
  EXISTING_CUSTOMER: "EXISTING_CUSTOMER",
  UPSELL_CROSS_SELL: "UPSELL_CROSS_SELL",
  RENEWAL: "RENEWAL",
  RETENTION: "RETENTION",
  CUSTOMER_SUPPORT: "CUSTOMER_SUPPORT",
  OTHER: "OTHER",
} as const;
export type CallType = (typeof CallType)[keyof typeof CallType];

export const ScenarioStatus = {
  DRAFT: "DRAFT",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  PUBLISHED: "PUBLISHED",
  ARCHIVED: "ARCHIVED",
} as const;
export type ScenarioStatus = (typeof ScenarioStatus)[keyof typeof ScenarioStatus];

export const RecordingStatus = {
  // LOT Q3A : enregistrement créé, fichier audio pas encore finalisé.
  PENDING_UPLOAD: "PENDING_UPLOAD",
  UPLOADED: "UPLOADED",
  PREPROCESSING: "PREPROCESSING",
  TRANSCRIBING: "TRANSCRIBING",
  ANALYZING: "ANALYZING",
  WAITING_FOR_CLARIFICATION: "WAITING_FOR_CLARIFICATION",
  GENERATING_EXERCISE: "GENERATING_EXERCISE",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  READY: "READY",
  FAILED: "FAILED",
} as const;
export type RecordingStatus =
  (typeof RecordingStatus)[keyof typeof RecordingStatus];

/** Statuts pour lesquels le pipeline d'un appel est encore en cours (polling côté client). */
export const RECORDING_IN_PROGRESS_STATUSES: readonly string[] = [
  RecordingStatus.UPLOADED,
  RecordingStatus.PREPROCESSING,
  RecordingStatus.TRANSCRIBING,
  RecordingStatus.ANALYZING,
  RecordingStatus.GENERATING_EXERCISE,
];

/**
 * Source d'un CallRecording.
 * null / absent en base = historique (manager / legacy).
 * MANUAL_UPLOAD = appel réel télépro (LOT Q3A).
 */
export const RecordingSource = {
  MANUAL_UPLOAD: "MANUAL_UPLOAD",
} as const;
export type RecordingSource =
  (typeof RecordingSource)[keyof typeof RecordingSource];

export const KnowledgeType = {
  OBJECTION: "OBJECTION",
  GOOD_PRACTICE: "GOOD_PRACTICE",
  BAD_PRACTICE: "BAD_PRACTICE",
  DISCOVERY_QUESTION: "DISCOVERY_QUESTION",
  VOCABULARY: "VOCABULARY",
  SCRIPT_STEP: "SCRIPT_STEP",
  COMPLIANCE_RULE: "COMPLIANCE_RULE",
} as const;
export type KnowledgeType = (typeof KnowledgeType)[keyof typeof KnowledgeType];

export const ReviewStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];

export const SimulationStatus = {
  CREATED: "CREATED",
  IN_PROGRESS: "IN_PROGRESS",
  // Étapes de finalisation / évaluation asynchrone (file ProcessingJob + worker) :
  FINALIZING: "FINALIZING",
  EVALUATION_PENDING: "EVALUATION_PENDING",
  EVALUATING: "EVALUATING",
  COMPLETED: "COMPLETED",
  EVALUATION_FAILED: "EVALUATION_FAILED",
  ABANDONED: "ABANDONED",
  FAILED: "FAILED",
} as const;
export type SimulationStatus =
  (typeof SimulationStatus)[keyof typeof SimulationStatus];

/** Statuts pour lesquels l'évaluation est encore en cours (polling côté client). */
export const EVALUATION_IN_PROGRESS_STATUSES: readonly string[] = [
  SimulationStatus.FINALIZING,
  SimulationStatus.EVALUATION_PENDING,
  SimulationStatus.EVALUATING,
];

export const SimulationMode = {
  DEMO: "DEMO",
  REALTIME: "REALTIME",
} as const;
export type SimulationMode = (typeof SimulationMode)[keyof typeof SimulationMode];

export const CallOutcome = {
  VENTE: "VENTE",
  REFUS: "REFUS",
  RAPPEL: "RAPPEL",
  RDV: "RDV",
  AUTRE: "AUTRE",
} as const;
export type CallOutcome = (typeof CallOutcome)[keyof typeof CallOutcome];

// Libellés FR pour l'UI
export const LEVEL_LABELS: Record<string, string> = {
  FACILE: "Facile",
  MOYEN: "Moyen",
  DIFFICILE: "Difficile",
};

export const CALL_TYPE_LABELS: Record<string, string> = {
  VENTE: "Vente",
  PITCH_INVESTISSEUR: "Pitch investisseur",
  ENTRETIEN_EMBAUCHE: "Entretien d'embauche",
  COLD_PROSPECTING: "Prospection à froid",
  WARM_PROSPECTING: "Prospection à chaud",
  FOLLOW_UP: "Relance / suivi",
  EXISTING_CUSTOMER: "Client existant",
  UPSELL_CROSS_SELL: "Montée en gamme / vente additionnelle",
  RENEWAL: "Renouvellement",
  RETENTION: "Rétention",
  CUSTOMER_SUPPORT: "Support client",
  OTHER: "Autre",
};

export const SCENARIO_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  REVIEW_REQUIRED: "À valider",
  PUBLISHED: "Publié",
  ARCHIVED: "Archivé",
};

export const KNOWLEDGE_TYPE_LABELS: Record<string, string> = {
  OBJECTION: "Objection",
  GOOD_PRACTICE: "Formulation efficace",
  BAD_PRACTICE: "À éviter",
  DISCOVERY_QUESTION: "Question de découverte",
  VOCABULARY: "Vocabulaire",
  SCRIPT_STEP: "Étape du script",
  COMPLIANCE_RULE: "Règle métier",
};

export const RECORDING_STATUS_LABELS: Record<string, string> = {
  UPLOADED: "Importé",
  PREPROCESSING: "Préparation",
  TRANSCRIBING: "Transcription",
  ANALYZING: "Analyse",
  WAITING_FOR_CLARIFICATION: "En attente de précision",
  GENERATING_EXERCISE: "Génération de l'exercice",
  REVIEW_REQUIRED: "À valider",
  READY: "Prêt",
  FAILED: "Échec",
};

export const OUTCOME_LABELS: Record<string, string> = {
  VENTE: "Vente conclue",
  REFUS: "Refus",
  RAPPEL: "Rappel programmé",
  RDV: "Rendez-vous obtenu",
  AUTRE: "Autre",
};

/** Types de prompts versionnés dans un PromptBundle (exercice). */
export const PromptKind = {
  PROSPECT_PERSONA: "PROSPECT_PERSONA",
  EVALUATION_SYSTEM: "EVALUATION_SYSTEM",
  EVALUATION_USER: "EVALUATION_USER",
  SPEAKER_ATTRIBUTION: "SPEAKER_ATTRIBUTION",
  ANONYMIZATION: "ANONYMIZATION",
  CALL_ANALYSIS: "CALL_ANALYSIS",
  SCENARIO_GENERATION: "SCENARIO_GENERATION",
} as const;
export type PromptKind = (typeof PromptKind)[keyof typeof PromptKind];

export const PromptBundleStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  SUPERSEDED: "SUPERSEDED",
} as const;
export type PromptBundleStatus =
  (typeof PromptBundleStatus)[keyof typeof PromptBundleStatus];
