/**
 * LOT Q3A — socle métier des appels réels télépro.
 * Isolation stricte teleproId + organizationId. Aucun accès manager ici.
 */
import "server-only";
import { randomUUID } from "crypto";
import path from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/httpError";
import { nowIso } from "@/lib/utils";
import { RecordingSource, RecordingStatus } from "@/lib/enums";
import { JobStatus } from "@/lib/jobStatus";
import { serverConfig } from "@/lib/config";
import {
  getAudioStorage,
  isPersistentStorageConfigured,
} from "@/lib/providers";
import { buildAudioStorageKey } from "@/lib/storageKey";
import { enqueueJob, resetJobsForTarget, JobType, ensureProcessingJobExists } from "@/lib/jobs";
import { REFERENCE_CALL_JOB_TYPES } from "@/lib/jobTypes";
import { logAudit } from "@/lib/audit";
import { log } from "@/lib/log";
import {
  toRealCallDetailView,
  toRealCallListItem,
  parseCoachingPayload,
  type RealCallDetailView,
  type RealCallListItem,
} from "@/lib/realCallView";
import {
  recommendExercisesForWeakSkills,
  type RecommendCandidate,
} from "@/lib/realCallRecommend";
import {
  buildPersonalComparative,
  buildSimRealComparison,
} from "@/lib/realCallCompare";
import { resolvePlatformCatalogOrganizationId } from "@/lib/platformCatalog";
import { loadTeleproMissionsCatalogView } from "@/lib/teleproMissionsService";
import { ScenarioStatus } from "@/lib/enums";

/** Confirmation attendue côté API (horodatage seul persisté, pas de signature juridique). */
export const REAL_CALL_RIGHTS_CONFIRMATION =
  "Je confirme disposer du droit d'analyser cet appel et informer les personnes concernées conformément aux règles applicables.";

const MP3_MIME = new Set(["audio/mpeg", "audio/mp3"]);
const MP3_EXT = ".mp3";

/** TTL d'une URL d'upload pré-signée / d'un PENDING_UPLOAD (évite faux « en cours »). */
const UPLOAD_PENDING_TTL_MS = 30 * 60 * 1000;

/** États déjà au-delà de PREPROCESS : retour idempotent, jamais de nouveau PREPROCESS. */
const IDEMPOTENT_PIPELINE_STATUSES = new Set<string>([
  RecordingStatus.PREPROCESSING,
  RecordingStatus.TRANSCRIBING,
  RecordingStatus.ANALYZING,
  RecordingStatus.WAITING_FOR_CLARIFICATION,
  RecordingStatus.READY,
]);

const ACTIVE_PIPELINE_STATUSES = new Set<string>([
  RecordingStatus.UPLOADED,
  RecordingStatus.PREPROCESSING,
  RecordingStatus.TRANSCRIBING,
  RecordingStatus.ANALYZING,
  RecordingStatus.WAITING_FOR_CLARIFICATION,
  RecordingStatus.GENERATING_EXERCISE,
]);

const DELETABLE_STATUSES = new Set<string>([
  RecordingStatus.PENDING_UPLOAD,
  RecordingStatus.READY,
  RecordingStatus.FAILED,
  RecordingStatus.CANCELLED,
]);

function isP2002(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

export type TeleproActor = {
  id: string;
  organizationId: string;
  role: string;
};

function assertOrg(user: TeleproActor): string {
  if (!user.organizationId) {
    throw new HttpError(403, "Organisation requise.");
  }
  return user.organizationId;
}

/**
 * Garantit multi-tenant applicatif : le télépro appartient à l'organisation.
 * Complète la FK composite DB (teleproId, organizationId) → User(id, organizationId).
 */
export async function assertTeleproInOrganization(
  teleproId: string,
  organizationId: string,
): Promise<void> {
  const row = await prisma.user.findFirst({
    where: { id: teleproId, organizationId },
    select: { id: true },
  });
  if (!row) {
    throw new HttpError(404, "Appel introuvable.");
  }
}

function maxUploadBytes(): number {
  return serverConfig.storage.maxUploadMb * 1024 * 1024;
}

function validateMp3Meta(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): { ext: string; mimeType: string } {
  const ext = path.extname(input.fileName).toLowerCase();
  if (ext !== MP3_EXT) {
    throw new HttpError(415, "Format non supporté. Seul le MP3 est accepté.");
  }
  const mime = (input.mimeType || "").toLowerCase().trim();
  if (mime && !MP3_MIME.has(mime)) {
    throw new HttpError(415, "MIME non supporté. Seul audio/mpeg est accepté.");
  }
  if (input.sizeBytes <= 0) {
    throw new HttpError(422, "Taille de fichier invalide.");
  }
  if (input.sizeBytes > maxUploadBytes()) {
    throw new HttpError(
      413,
      `Fichier trop volumineux (max ${serverConfig.storage.maxUploadMb} Mo).`,
    );
  }
  return { ext: MP3_EXT, mimeType: mime || "audio/mpeg" };
}

/** Charge un appel réel du télépro courant ; sinon 404 (pas de 403 distinct). */
export async function findOwnedRealCall(input: {
  id: string;
  teleproId: string;
  organizationId: string;
}) {
  return prisma.callRecording.findFirst({
    where: {
      id: input.id,
      teleproId: input.teleproId,
      organizationId: input.organizationId,
      source: RecordingSource.MANUAL_UPLOAD,
    },
  });
}

export async function listRealCallsForTelepro(
  user: TeleproActor,
): Promise<RealCallListItem[]> {
  const organizationId = assertOrg(user);
  const rows = await prisma.callRecording.findMany({
    where: {
      organizationId,
      teleproId: user.id,
      source: RecordingSource.MANUAL_UPLOAD,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      source: true,
      createdAt: true,
      updatedAt: true,
      durationSec: true,
      language: true,
      errorMessage: true,
      analysis: { select: { overallScore: true } },
    },
  });
  return rows.map(toRealCallListItem);
}

export async function getRealCallDetailForTelepro(
  user: TeleproActor,
  id: string,
): Promise<RealCallDetailView> {
  const organizationId = assertOrg(user);
  const rec = await prisma.callRecording.findFirst({
    where: {
      id,
      organizationId,
      teleproId: user.id,
      source: RecordingSource.MANUAL_UPLOAD,
    },
    include: {
      analysis: {
        select: {
          summary: true,
          overallScore: true,
          coachingPayload: true,
        },
      },
      transcript: {
        include: {
          turns: {
            select: {
              idx: true,
              role: true,
              startMs: true,
              endMs: true,
              text: true,
              anonymizedText: true,
            },
          },
        },
      },
    },
  });
  if (!rec) throw new HttpError(404, "Appel introuvable.");

  const coaching = parseCoachingPayload(rec.analysis?.coachingPayload);
  const weakSkillKeys = coaching.data?.weakSkillKeys ?? [];

  const [historyRows, simScores, associatedExercises] = await Promise.all([
    prisma.callRecording.findMany({
      where: {
        organizationId,
        teleproId: user.id,
        source: RecordingSource.MANUAL_UPLOAD,
        status: RecordingStatus.READY,
        NOT: { id: rec.id },
      },
      select: {
        id: true,
        analysis: { select: { overallScore: true } },
      },
    }),
    prisma.skillScore.findMany({
      where: {
        evaluation: {
          simulation: {
            organizationId,
            teleproId: user.id,
          },
        },
      },
      select: { key: true, label: true, score: true, maxScore: true },
    }),
    buildAssociatedExercisesForTelepro(user, weakSkillKeys),
  ]);

  const personalComparative = buildPersonalComparative({
    currentId: rec.id,
    currentScore:
      rec.analysis?.overallScore ?? coaching.data?.overallScore ?? null,
    history: historyRows.map((h) => ({
      id: h.id,
      overallScore: h.analysis?.overallScore ?? null,
      talkRatio: null,
    })),
  });

  const simRealComparison = buildSimRealComparison({
    realSkills: (coaching.data?.skillScores ?? []).map((s) => ({
      key: s.key,
      label: s.label,
      score: s.score,
      maxScore: s.maxScore,
    })),
    simSkills: simScores.map((s) => ({
      key: s.key,
      label: s.label,
      score: s.score,
      maxScore: s.maxScore,
    })),
  });

  return toRealCallDetailView({
    recording: rec,
    analysis: rec.analysis,
    transcript: rec.transcript,
    associatedExercises,
    personalComparative,
    simRealComparison,
  });
}

async function buildAssociatedExercisesForTelepro(
  user: TeleproActor,
  weakSkillKeys: string[],
) {
  if (weakSkillKeys.length === 0) {
    return recommendExercisesForWeakSkills({ weakSkillKeys });
  }

  let catalogOrganizationId: string;
  try {
    catalogOrganizationId = await resolvePlatformCatalogOrganizationId();
  } catch {
    return recommendExercisesForWeakSkills({ weakSkillKeys });
  }

  const [mappings, catalog] = await Promise.all([
    prisma.scenarioSkillMapping.findMany({
      where: {
        organizationId: catalogOrganizationId,
        skillKey: { in: weakSkillKeys.map((k) => k.trim().toLowerCase()) },
      },
      select: { scenarioId: true, skillKey: true },
    }),
    loadTeleproMissionsCatalogView(user.id, user.organizationId),
  ]);

  if (mappings.length === 0) {
    return recommendExercisesForWeakSkills({ weakSkillKeys });
  }

  const keysByScenario = new Map<string, string[]>();
  for (const m of mappings) {
    const list = keysByScenario.get(m.scenarioId) ?? [];
    list.push(m.skillKey);
    keysByScenario.set(m.scenarioId, list);
  }

  const candidates: RecommendCandidate[] = [];
  for (const theme of catalog.themes) {
    for (const stage of theme.stages) {
      for (const ex of stage.exercises) {
        const skillKeys = keysByScenario.get(ex.id);
        if (!skillKeys || skillKeys.length === 0) continue;
        candidates.push({
          scenarioId: ex.id,
          name: ex.name,
          status: ScenarioStatus.PUBLISHED,
          themeStatus: "PUBLISHED",
          stageStatus: "PUBLISHED",
          themeName: theme.name,
          level: ex.difficulty,
          missionLevel: ex.missionLevel,
          sortOrder: ex.sortOrder,
          prospectAvatarKey: ex.prospectAvatarKey,
          skillKeys,
          hasPublishedPrompt: true,
          missionStatus: ex.status,
        });
      }
    }
  }

  return recommendExercisesForWeakSkills({ weakSkillKeys, candidates });
}

/**
 * Étape 1 : initialise un upload contrôlé (PENDING_UPLOAD), idempotent via uploadAttemptId.
 * Persiste consentConfirmedAt + consentAt côté serveur (nowIso).
 * Tout horodatage client éventuel est ignoré (non accepté en paramètre).
 */
export async function prepareRealCallUpload(
  user: TeleproActor,
  input: {
    rightsConfirmed: boolean;
    confirmationText?: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    title?: string;
    /** UUID d'intention d'upload (généré client, réutilisé au retry). */
    uploadAttemptId: string;
    /** Ignoré s'il est fourni (jamais de timestamp client). */
    consentConfirmedAt?: string;
  },
): Promise<{
  id: string;
  status: string;
  uploadMode: "presigned" | "direct";
  uploadUrl: string | null;
  expiresAt: string;
  alreadyAccepted: boolean;
}> {
  const organizationId = assertOrg(user);
  await assertTeleproInOrganization(user.id, organizationId);

  if (!input.rightsConfirmed) {
    throw new HttpError(
      400,
      "La confirmation du droit d'analyser cet appel est obligatoire.",
    );
  }
  if (
    input.confirmationText != null &&
    input.confirmationText.trim() !== "" &&
    input.confirmationText.trim() !== REAL_CALL_RIGHTS_CONFIRMATION
  ) {
    throw new HttpError(400, "Texte de confirmation invalide.");
  }

  if (
    serverConfig.nodeEnv === "production" &&
    !isPersistentStorageConfigured()
  ) {
    throw new HttpError(
      503,
      "Stockage objet non configuré (STORAGE_DRIVER=s3 requis en production).",
    );
  }

  const uploadAttemptId = input.uploadAttemptId.trim().toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      uploadAttemptId,
    )
  ) {
    throw new HttpError(422, "Identifiant de tentative d'upload invalide.");
  }

  const existing = await prisma.callRecording.findFirst({
    where: {
      organizationId,
      teleproId: user.id,
      uploadAttemptId,
      source: RecordingSource.MANUAL_UPLOAD,
    },
  });

  if (existing) {
    return respondPrepareExisting(existing, user);
  }

  const { ext, mimeType } = validateMp3Meta({
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });

  const storage = getAudioStorage();
  const storageKey = buildAudioStorageKey(organizationId, ext);
  const id = randomUUID();
  const now = nowIso();
  const title =
    (input.title ?? "").trim().slice(0, 120) ||
    path.basename(input.fileName, ext).slice(0, 120) ||
    "Appel réel";

  const expiresAt = new Date(Date.now() + UPLOAD_PENDING_TTL_MS).toISOString();

  let uploadUrl: string | null = null;
  let uploadMode: "presigned" | "direct" = "direct";
  if (typeof storage.createUploadUrl === "function") {
    uploadUrl = await storage.createUploadUrl(storageKey, mimeType);
    uploadMode = "presigned";
  }

  try {
    await prisma.callRecording.create({
      data: {
        id,
        organizationId,
        uploaderId: user.id,
        teleproId: user.id,
        source: RecordingSource.MANUAL_UPLOAD,
        uploadAttemptId,
        title,
        language: "fr",
        consent: true,
        consentAt: now,
        consentConfirmedAt: now,
        useAsModel: false,
        storageKey,
        mimeType,
        sizeBytes: input.sizeBytes,
        durationSec: 0,
        status: RecordingStatus.PENDING_UPLOAD,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (err) {
    if (!isP2002(err)) throw err;
    const raced = await prisma.callRecording.findFirst({
      where: {
        organizationId,
        teleproId: user.id,
        uploadAttemptId,
        source: RecordingSource.MANUAL_UPLOAD,
      },
    });
    if (!raced) throw err;
    return respondPrepareExisting(raced, user);
  }

  await logAudit({
    organizationId,
    actorId: user.id,
    action: "REAL_CALL_PREPARE",
    targetType: "CallRecording",
    targetId: id,
    metadata: {
      sizeBytes: input.sizeBytes,
      mimeType,
      uploadMode,
      rightsConfirmedAt: now,
    },
  });

  log.info("real_call.prepare", {
    organizationId,
    recordingId: id,
    uploadMode,
  });

  return {
    id,
    status: RecordingStatus.PENDING_UPLOAD,
    uploadMode,
    uploadUrl,
    expiresAt,
    alreadyAccepted: false,
  };
}

async function respondPrepareExisting(
  existing: {
    id: string;
    status: string;
    storageKey: string | null;
    mimeType: string | null;
    createdAt: string;
  },
  user: TeleproActor,
): Promise<{
  id: string;
  status: string;
  uploadMode: "presigned" | "direct";
  uploadUrl: string | null;
  expiresAt: string;
  alreadyAccepted: boolean;
}> {
  const expiresAt = new Date(Date.now() + UPLOAD_PENDING_TTL_MS).toISOString();

  if (existing.status !== RecordingStatus.PENDING_UPLOAD) {
    return {
      id: existing.id,
      status: existing.status,
      uploadMode: "direct",
      uploadUrl: null,
      expiresAt,
      alreadyAccepted: true,
    };
  }

  const storage = getAudioStorage();
  let uploadUrl: string | null = null;
  let uploadMode: "presigned" | "direct" = "direct";
  if (
    existing.storageKey &&
    typeof storage.createUploadUrl === "function"
  ) {
    uploadUrl = await storage.createUploadUrl(
      existing.storageKey,
      existing.mimeType || "audio/mpeg",
    );
    uploadMode = "presigned";
  }

  log.info("real_call.prepare_idempotent", {
    organizationId: user.organizationId,
    recordingId: existing.id,
    status: existing.status,
  });

  return {
    id: existing.id,
    status: existing.status,
    uploadMode,
    uploadUrl,
    expiresAt,
    alreadyAccepted: false,
  };
}

/**
 * Étape 2 : finalise l'upload (fichier présent) et enfile PREPROCESS au plus une fois.
 * LOT Q3C-FIX : transition PENDING_UPLOAD→UPLOADED + création du job dans la même
 * transaction. UPLOADED sans job est réparé ; UPLOADED n'est plus un court-circuit
 * « accepté » sans contrôle du job.
 */
export async function finalizeRealCallUpload(
  user: TeleproActor,
  id: string,
  input: {
    /** Contenu binaire (mode direct local). */
    fileBuffer?: Buffer;
    fileMimeType?: string;
    fileName?: string;
  },
): Promise<{
  id: string;
  status: string;
  jobEnqueued: boolean;
  alreadyAccepted: boolean;
}> {
  const organizationId = assertOrg(user);
  await assertTeleproInOrganization(user.id, organizationId);
  const rec = await findOwnedRealCall({
    id,
    teleproId: user.id,
    organizationId,
  });
  if (!rec) throw new HttpError(404, "Appel introuvable.");

  if (
    rec.status === RecordingStatus.CANCEL_REQUESTED ||
    rec.status === RecordingStatus.CANCELLED
  ) {
    return {
      id: rec.id,
      status: rec.status,
      jobEnqueued: false,
      alreadyAccepted: true,
    };
  }

  if (IDEMPOTENT_PIPELINE_STATUSES.has(rec.status)) {
    return {
      id: rec.id,
      status: rec.status,
      jobEnqueued: false,
      alreadyAccepted: true,
    };
  }

  if (rec.status === RecordingStatus.UPLOADED) {
    return ensurePreprocessForUploaded(user, rec.id, organizationId);
  }

  if (rec.status !== RecordingStatus.PENDING_UPLOAD) {
    throw new HttpError(400, "Cet appel ne peut pas être finalisé dans cet état.");
  }

  const createdMs = Date.parse(rec.createdAt);
  if (
    Number.isFinite(createdMs) &&
    Date.now() - createdMs > UPLOAD_PENDING_TTL_MS
  ) {
    await prisma.callRecording.updateMany({
      where: {
        id: rec.id,
        organizationId,
        teleproId: user.id,
        status: RecordingStatus.PENDING_UPLOAD,
      },
      data: {
        status: RecordingStatus.FAILED,
        errorMessage: "Upload expiré. Relancez une nouvelle initialisation.",
        updatedAt: nowIso(),
      },
    });
    throw new HttpError(410, "Upload expiré. Relancez une nouvelle initialisation.");
  }

  if (!rec.storageKey) {
    throw new HttpError(409, "Clé de stockage absente.");
  }

  const storage = getAudioStorage();

  if (input.fileBuffer) {
    const meta = validateMp3Meta({
      fileName: input.fileName || "call.mp3",
      mimeType: input.fileMimeType || rec.mimeType || "audio/mpeg",
      sizeBytes: input.fileBuffer.length,
    });
    if (
      rec.sizeBytes > 0 &&
      Math.abs(input.fileBuffer.length - rec.sizeBytes) > 1024
    ) {
      throw new HttpError(
        409,
        "Le fichier finalisé ne correspond pas à l'initialisation.",
      );
    }
    await storage.put(rec.storageKey, input.fileBuffer, meta.mimeType);
  } else {
    const head = await storage.headObject(rec.storageKey);
    if (!head.exists) {
      throw new HttpError(
        409,
        "Fichier absent ou upload incomplet. Réessayez la finalisation.",
      );
    }
    if (
      head.size != null &&
      rec.sizeBytes > 0 &&
      Math.abs(head.size - rec.sizeBytes) > 1024
    ) {
      throw new HttpError(
        409,
        "Le fichier finalisé ne correspond pas à l'initialisation.",
      );
    }
  }

  const now = nowIso();

  // Atomique : statut UPLOADED + job PREPROCESS dans la même transaction.
  // Échec de création du job → rollback du statut vers PENDING_UPLOAD.
  type TxOutcome =
    | { kind: "committed"; created: boolean }
    | { kind: "lost_race" };

  let outcome: TxOutcome;
  try {
    outcome = await prisma.$transaction(async (tx) => {
      const updated = await tx.callRecording.updateMany({
        where: {
          id: rec.id,
          organizationId,
          teleproId: user.id,
          status: RecordingStatus.PENDING_UPLOAD,
        },
        data: {
          status: RecordingStatus.UPLOADED,
          errorMessage: null,
          updatedAt: now,
        },
      });

      if (updated.count === 0) {
        return { kind: "lost_race" as const };
      }

      const { created } = await ensureProcessingJobExists(
        {
          organizationId,
          type: JobType.PREPROCESS_RECORDING,
          targetId: rec.id,
        },
        tx,
      );
      return { kind: "committed" as const, created };
    });
  } catch (err) {
    // Transaction annulée : le statut reste PENDING_UPLOAD.
    log.error("real_call.finalize_tx_failed", {
      organizationId,
      recordingId: rec.id,
      detail: err instanceof Error ? err.message.slice(0, 200) : "unknown",
    });
    throw err;
  }

  if (outcome.kind === "lost_race") {
    const again = await findOwnedRealCall({
      id: rec.id,
      teleproId: user.id,
      organizationId,
    });
    if (!again) throw new HttpError(404, "Appel introuvable.");

    if (
      again.status === RecordingStatus.CANCEL_REQUESTED ||
      again.status === RecordingStatus.CANCELLED
    ) {
      return {
        id: again.id,
        status: again.status,
        jobEnqueued: false,
        alreadyAccepted: true,
      };
    }

    if (IDEMPOTENT_PIPELINE_STATUSES.has(again.status)) {
      return {
        id: again.id,
        status: again.status,
        jobEnqueued: false,
        alreadyAccepted: true,
      };
    }

    if (again.status === RecordingStatus.UPLOADED) {
      return ensurePreprocessForUploaded(user, again.id, organizationId);
    }

    throw new HttpError(409, "Finalisation concurrente : état inattendu.");
  }

  await logAudit({
    organizationId,
    actorId: user.id,
    action: "REAL_CALL_FINALIZE",
    targetType: "CallRecording",
    targetId: rec.id,
    metadata: { sizeBytes: rec.sizeBytes },
  });

  return {
    id: rec.id,
    status: RecordingStatus.UPLOADED,
    jobEnqueued: outcome.created,
    alreadyAccepted: false,
  };
}

/**
 * Répare un appel déjà UPLOADED sans ProcessingJob PREPROCESS (panne entre
 * statut et enqueue). N'envoie aucun job si l'appel a été annulé entre-temps.
 */
async function ensurePreprocessForUploaded(
  user: TeleproActor,
  id: string,
  organizationId: string,
): Promise<{
  id: string;
  status: string;
  jobEnqueued: boolean;
  alreadyAccepted: boolean;
}> {
  const latest = await findOwnedRealCall({
    id,
    teleproId: user.id,
    organizationId,
  });
  if (!latest) throw new HttpError(404, "Appel introuvable.");

  if (
    latest.status === RecordingStatus.CANCEL_REQUESTED ||
    latest.status === RecordingStatus.CANCELLED
  ) {
    return {
      id: latest.id,
      status: latest.status,
      jobEnqueued: false,
      alreadyAccepted: true,
    };
  }

  if (IDEMPOTENT_PIPELINE_STATUSES.has(latest.status)) {
    return {
      id: latest.id,
      status: latest.status,
      jobEnqueued: false,
      alreadyAccepted: true,
    };
  }

  if (latest.status !== RecordingStatus.UPLOADED) {
    throw new HttpError(400, "Cet appel ne peut pas être finalisé dans cet état.");
  }

  const { created } = await ensureProcessingJobExists({
    organizationId,
    type: JobType.PREPROCESS_RECORDING,
    targetId: latest.id,
  });

  // Course cancel après création : ne laisse pas un job PENDING survivre.
  const after = await findOwnedRealCall({
    id: latest.id,
    teleproId: user.id,
    organizationId,
  });
  if (
    after &&
    (after.status === RecordingStatus.CANCEL_REQUESTED ||
      after.status === RecordingStatus.CANCELLED)
  ) {
    await prisma.processingJob.updateMany({
      where: {
        organizationId,
        targetId: latest.id,
        type: JobType.PREPROCESS_RECORDING,
        status: JobStatus.PENDING,
      },
      data: {
        status: JobStatus.FAILED_PERMANENT,
        lastError: "cancelled_by_user",
        lockedAt: null,
        lockedBy: null,
      },
    });
    return {
      id: after.id,
      status: after.status,
      jobEnqueued: false,
      alreadyAccepted: true,
    };
  }

  if (created) {
    log.info("real_call.finalize_repaired_missing_job", {
      organizationId,
      recordingId: latest.id,
    });
  }

  return {
    id: latest.id,
    status: RecordingStatus.UPLOADED,
    jobEnqueued: created,
    alreadyAccepted: true,
  };
}

/**
 * Relance idempotente d'un traitement échoué (pipeline référence sans GENERATE).
 */
export async function retryRealCallProcessing(
  user: TeleproActor,
  id: string,
): Promise<{ id: string; status: string }> {
  const organizationId = assertOrg(user);
  await assertTeleproInOrganization(user.id, organizationId);
  const rec = await findOwnedRealCall({
    id,
    teleproId: user.id,
    organizationId,
  });
  if (!rec) throw new HttpError(404, "Appel introuvable.");

  if (rec.status !== RecordingStatus.FAILED) {
    throw new HttpError(400, "Seul un traitement en échec peut être relancé.");
  }
  if (!rec.storageKey) {
    throw new HttpError(409, "Impossible de relancer : fichier absent.");
  }

  const head = await getAudioStorage().headObject(rec.storageKey);
  if (!head.exists) {
    throw new HttpError(409, "Impossible de relancer : fichier absent.");
  }

  await prisma.callRecording.updateMany({
    where: { id: rec.id, organizationId, teleproId: user.id },
    data: {
      status: RecordingStatus.UPLOADED,
      errorMessage: null,
      updatedAt: nowIso(),
    },
  });

  // Reset des jobs du pipeline référence (GENERATE inclus pour nettoyage)
  // mais on n'enfile QUE PREPROCESS — analyze ne lancera pas GENERATE.
  const typesToReset = REFERENCE_CALL_JOB_TYPES.filter(
    (t) => t !== JobType.GENERATE_SCENARIO_FROM_CALL,
  );
  await resetJobsForTarget({
    organizationId,
    targetId: rec.id,
    types: typesToReset,
  });
  // Nettoie aussi un éventuel job GENERATE orphelin sans le ré-enfiler.
  await resetJobsForTarget({
    organizationId,
    targetId: rec.id,
    types: [JobType.GENERATE_SCENARIO_FROM_CALL],
  });

  await enqueueJob({
    organizationId,
    type: JobType.PREPROCESS_RECORDING,
    targetId: rec.id,
  });

  await logAudit({
    organizationId,
    actorId: user.id,
    action: "REAL_CALL_RETRY",
    targetType: "CallRecording",
    targetId: rec.id,
    metadata: { entryPoint: JobType.PREPROCESS_RECORDING },
  });

  return { id: rec.id, status: RecordingStatus.UPLOADED };
}

async function cancelPendingJobsForRecording(
  organizationId: string,
  targetId: string,
): Promise<void> {
  await prisma.processingJob.updateMany({
    where: {
      organizationId,
      targetId,
      status: JobStatus.PENDING,
    },
    data: {
      status: JobStatus.FAILED_PERMANENT,
      lastError: "cancelled_by_user",
      lockedAt: null,
      lockedBy: null,
    },
  });
}

/**
 * LOT Q3C — demande d'arrêt propriétaire et idempotente.
 */
export async function cancelRealCallProcessing(
  user: TeleproActor,
  id: string,
): Promise<{ id: string; status: string }> {
  const organizationId = assertOrg(user);
  await assertTeleproInOrganization(user.id, organizationId);
  const rec = await findOwnedRealCall({
    id,
    teleproId: user.id,
    organizationId,
  });
  if (!rec) throw new HttpError(404, "Appel introuvable.");

  const now = nowIso();

  if (
    rec.status === RecordingStatus.READY ||
    rec.status === RecordingStatus.FAILED ||
    rec.status === RecordingStatus.CANCELLED
  ) {
    return { id: rec.id, status: rec.status };
  }

  if (rec.status === RecordingStatus.CANCEL_REQUESTED) {
    return { id: rec.id, status: rec.status };
  }

  if (
    rec.status === RecordingStatus.PENDING_UPLOAD ||
    rec.status === RecordingStatus.UPLOADED
  ) {
    await cancelPendingJobsForRecording(organizationId, rec.id);
    await prisma.callRecording.updateMany({
      where: {
        id: rec.id,
        organizationId,
        teleproId: user.id,
        status: { in: [RecordingStatus.PENDING_UPLOAD, RecordingStatus.UPLOADED] },
      },
      data: {
        status: RecordingStatus.CANCELLED,
        cancelRequestedAt: now,
        cancelledAt: now,
        errorMessage: null,
        updatedAt: now,
      },
    });
    await logAudit({
      organizationId,
      actorId: user.id,
      action: "REAL_CALL_CANCEL",
      targetType: "CallRecording",
      targetId: rec.id,
      metadata: { immediate: true, previousStatus: rec.status },
    });
    return { id: rec.id, status: RecordingStatus.CANCELLED };
  }

  if (ACTIVE_PIPELINE_STATUSES.has(rec.status)) {
    await cancelPendingJobsForRecording(organizationId, rec.id);
    await prisma.callRecording.updateMany({
      where: {
        id: rec.id,
        organizationId,
        teleproId: user.id,
        status: { in: [...ACTIVE_PIPELINE_STATUSES] },
      },
      data: {
        status: RecordingStatus.CANCEL_REQUESTED,
        cancelRequestedAt: now,
        errorMessage: null,
        updatedAt: now,
      },
    });
    await logAudit({
      organizationId,
      actorId: user.id,
      action: "REAL_CALL_CANCEL",
      targetType: "CallRecording",
      targetId: rec.id,
      metadata: { immediate: false, previousStatus: rec.status },
    });
    return { id: rec.id, status: RecordingStatus.CANCEL_REQUESTED };
  }

  throw new HttpError(400, "Cet appel ne peut pas être arrêté dans cet état.");
}

/**
 * LOT Q3C — suppression propriétaire d'un appel réel terminal (ou import incomplet).
 */
export async function deleteRealCall(
  user: TeleproActor,
  id: string,
): Promise<{ deleted: true }> {
  const organizationId = assertOrg(user);
  await assertTeleproInOrganization(user.id, organizationId);
  const rec = await findOwnedRealCall({
    id,
    teleproId: user.id,
    organizationId,
  });
  if (!rec) throw new HttpError(404, "Appel introuvable.");

  if (
    ACTIVE_PIPELINE_STATUSES.has(rec.status) ||
    rec.status === RecordingStatus.CANCEL_REQUESTED
  ) {
    throw new HttpError(
      409,
      "Arrêtez d'abord l'analyse avant de supprimer cet appel.",
    );
  }

  if (!DELETABLE_STATUSES.has(rec.status)) {
    throw new HttpError(409, "Cet appel ne peut pas être supprimé dans cet état.");
  }

  const storageKey = rec.storageKey;

  // Ne jamais supprimer un exercice catalogue : détache seulement une éventuelle FK.
  await prisma.scenario.updateMany({
    where: { sourceRecordingId: rec.id },
    data: { sourceRecordingId: null },
  });

  await prisma.processingJob.deleteMany({
    where: { organizationId, targetId: rec.id },
  });
  await prisma.knowledgeItem.deleteMany({ where: { recordingId: rec.id } });

  const removed = await prisma.callRecording.deleteMany({
    where: {
      id: rec.id,
      organizationId,
      teleproId: user.id,
      source: RecordingSource.MANUAL_UPLOAD,
    },
  });
  if (removed.count === 0) {
    throw new HttpError(404, "Appel introuvable.");
  }

  if (storageKey) {
    await getAudioStorage().deleteObject(storageKey);
  }

  await logAudit({
    organizationId,
    actorId: user.id,
    action: "REAL_CALL_DELETE",
    targetType: "CallRecording",
    targetId: rec.id,
    metadata: { title: rec.title, previousStatus: rec.status },
  });

  return { deleted: true };
}
