/**
 * Helpers purs pour l'UI admin exercices.
 * Aucun React / Next / Prisma / DB / auth / réseau.
 */

export const LIST_SENSITIVE_KEYS = [
  "artifacts",
  "contentHash",
  "prompt",
  "promptBundle",
  "promptBundles",
  "PROSPECT_PERSONA",
  "EVALUATION_SYSTEM",
  "EVALUATION_USER",
] as const;

export type AdminExerciseListItem = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  level: string;
  missionLevel: number;
  sortOrder: number;
  callType?: string;
  updatedAt: string;
  createdAt: string;
};

export function listItemLooksSafe(item: Record<string, unknown>): boolean {
  for (const key of LIST_SENSITIVE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(item, key)) return false;
  }
  return true;
}

export type PromptEditorState = {
  prospectPersona: string;
  includeEvalSystem: boolean;
  evalSystem: string;
  includeEvalUser: boolean;
  evalUser: string;
  changeNote: string;
};

export type AdminExerciseDetail = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  level: string;
  missionLevel: number;
  sortOrder: number;
  callType: string;
  campaign: string | null;
  offer: string | null;
  prospectProfile: string | null;
  initialSituation: string | null;
  objective: string | null;
  personality: string | null;
  allowedObjections: string[];
  secretInfos: Array<{ question: string; answer: string }>;
  successConditions: string | null;
  failureConditions: string | null;
  targetDurationSec: number;
  traineeBrief: string | null;
  referenceCounts?: { simulations: number; assignments: number };
  currentBundle: null | {
    id: string;
    version: number;
    status: string;
    changeNote: string | null;
    createdById: string | null;
    createdAt: string;
    publishedAt: string | null;
    artifacts: {
      PROSPECT_PERSONA: { body: string; contentType: string };
      EVALUATION_SYSTEM?: { body: string; contentType: string };
      EVALUATION_USER?: { body: string; contentType: string };
    };
  };
  versions: Array<{
    id: string;
    version: number;
    status: string;
    changeNote: string | null;
    createdById: string | null;
    createdAt: string;
    publishedAt: string | null;
  }>;
};

export function isArchivedReadOnly(status: string): boolean {
  return status === "ARCHIVED";
}

export function resolvePromptSaveAction(
  hasDraft: boolean,
): "updateDraftPrompts" | "createVersion" {
  return hasDraft ? "updateDraftPrompts" : "createVersion";
}

export function editorStateFromBundle(
  bundle: AdminExerciseDetail["currentBundle"],
): PromptEditorState {
  const arts = bundle?.artifacts;
  return {
    prospectPersona:
      arts?.PROSPECT_PERSONA?.body ??
      "Tu incarnes {{prospectName}}, un prospect au téléphone. Parle en français.",
    includeEvalSystem: Boolean(arts?.EVALUATION_SYSTEM?.body),
    evalSystem: arts?.EVALUATION_SYSTEM?.body ?? "",
    includeEvalUser: Boolean(arts?.EVALUATION_USER?.body),
    evalUser: arts?.EVALUATION_USER?.body ?? "",
    changeNote: "",
  };
}

/** Construit les artifacts API : PROSPECT_PERSONA obligatoire ; optionnels omis si désactivés. */
export function buildArtifactsFromEditor(state: PromptEditorState) {
  const artifacts: Record<string, { body: string; contentType: string }> = {
    PROSPECT_PERSONA: {
      body: state.prospectPersona,
      contentType: "text/plain",
    },
  };
  if (state.includeEvalSystem && state.evalSystem.trim()) {
    artifacts.EVALUATION_SYSTEM = {
      body: state.evalSystem,
      contentType: "text/plain",
    };
  }
  if (state.includeEvalUser && state.evalUser.trim()) {
    artifacts.EVALUATION_USER = {
      body: state.evalUser,
      contentType: "text/plain",
    };
  }
  return artifacts;
}

export type SecretInfoRow = { question: string; answer: string };

export type MetaFormState = {
  name: string;
  slug: string;
  level: string;
  missionLevel: number;
  sortOrder: number;
  callType: string;
  campaign: string;
  offer: string;
  prospectProfile: string;
  initialSituation: string;
  objective: string;
  personality: string;
  allowedObjections: string;
  secretInfos: SecretInfoRow[];
  successConditions: string;
  failureConditions: string;
  targetDurationSec: number;
  traineeBrief: string;
};

export type ApplyExerciseSync = {
  syncMeta?: boolean;
  syncEditor?: boolean;
};

/** Quelle partie du formulaire resynchroniser après une réponse API. */
export function resolveApplySync(
  kind: "load" | "saveMetadata" | "savePrompts" | "lifecycle" | "restore",
): Required<ApplyExerciseSync> {
  switch (kind) {
    case "load":
      return { syncMeta: true, syncEditor: true };
    case "saveMetadata":
      return { syncMeta: true, syncEditor: false };
    case "savePrompts":
      return { syncMeta: false, syncEditor: true };
    case "restore":
      return { syncMeta: false, syncEditor: true };
    case "lifecycle":
      return { syncMeta: false, syncEditor: false };
  }
}

export function metaFormFromExercise(ex: AdminExerciseDetail): MetaFormState {
  return {
    name: ex.name,
    slug: ex.slug ?? "",
    level: ex.level,
    missionLevel: ex.missionLevel,
    sortOrder: ex.sortOrder,
    callType: ex.callType,
    campaign: ex.campaign ?? "",
    offer: ex.offer ?? "",
    prospectProfile: ex.prospectProfile ?? "",
    initialSituation: ex.initialSituation ?? "",
    objective: ex.objective ?? "",
    personality: ex.personality ?? "",
    allowedObjections: (ex.allowedObjections ?? []).join("\n"),
    secretInfos: (ex.secretInfos ?? []).map((s) => ({
      question: s.question ?? "",
      answer: s.answer ?? "",
    })),
    successConditions: ex.successConditions ?? "",
    failureConditions: ex.failureConditions ?? "",
    targetDurationSec: ex.targetDurationSec,
    traineeBrief: ex.traineeBrief ?? "",
  };
}

/**
 * Payload PATCH métadonnées.
 * Chaînes optionnelles : "" conservé (effacement).
 * slug vide omis (contrat backend).
 * allowedObjections / secretInfos : toujours des tableaux (y compris []).
 */
export function buildMetadataPatchPayload(meta: MetaFormState) {
  const payload: Record<string, unknown> = {
    name: meta.name,
    level: meta.level,
    missionLevel: Number(meta.missionLevel),
    sortOrder: Number(meta.sortOrder),
    callType: meta.callType,
    campaign: meta.campaign,
    offer: meta.offer,
    prospectProfile: meta.prospectProfile,
    initialSituation: meta.initialSituation,
    objective: meta.objective,
    personality: meta.personality,
    allowedObjections: meta.allowedObjections
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    secretInfos: meta.secretInfos.map((s) => ({
      question: s.question,
      answer: s.answer,
    })),
    successConditions: meta.successConditions,
    failureConditions: meta.failureConditions,
    targetDurationSec: Number(meta.targetDurationSec),
    traineeBrief: meta.traineeBrief,
  };
  if (meta.slug.trim()) payload.slug = meta.slug.trim();
  return payload;
}

/** Ne pas effacer la confirmation restore après un échec API. */
export function shouldClearConfirmOnFailure(action: unknown): boolean {
  return action !== "restoreVersion";
}

/** Fermer/vider le panneau restore uniquement si l'action a renvoyé des données. */
export function shouldDismissRestoreUi(actionResult: unknown): boolean {
  return Boolean(actionResult);
}
