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
  VENTE: "VENTE",
  PITCH_INVESTISSEUR: "PITCH_INVESTISSEUR",
  ENTRETIEN_EMBAUCHE: "ENTRETIEN_EMBAUCHE",
} as const;
export type CallType = (typeof CallType)[keyof typeof CallType];

export const ScenarioStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
} as const;
export type ScenarioStatus = (typeof ScenarioStatus)[keyof typeof ScenarioStatus];

export const RecordingStatus = {
  UPLOADED: "UPLOADED",
  TRANSCRIBING: "TRANSCRIBING",
  ANALYZING: "ANALYZING",
  READY: "READY",
  FAILED: "FAILED",
} as const;
export type RecordingStatus =
  (typeof RecordingStatus)[keyof typeof RecordingStatus];

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
  COMPLETED: "COMPLETED",
  ABANDONED: "ABANDONED",
  FAILED: "FAILED",
} as const;
export type SimulationStatus =
  (typeof SimulationStatus)[keyof typeof SimulationStatus];

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
  TRANSCRIBING: "Transcription",
  ANALYZING: "Analyse",
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
