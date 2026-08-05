/**
 * LOT Q3A — socle métier des appels réels télépro.
 * Isolation stricte teleproId + organizationId. Aucun accès manager ici.
 */
import "server-only";
import { randomUUID } from "crypto";
import path from "path";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/httpError";
import { nowIso } from "@/lib/utils";
import { RecordingSource, RecordingStatus } from "@/lib/enums";
import { serverConfig } from "@/lib/config";
import {
  getAudioStorage,
  isPersistentStorageConfigured,
} from "@/lib/providers";
import { buildAudioStorageKey } from "@/lib/storageKey";
import { enqueueJob, resetJobsForTarget, JobType } from "@/lib/jobs";
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
 * Étape 1 : initialise un upload contrôlé (PENDING_UPLOAD).
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
    /** Ignoré s'il est fourni (jamais de timestamp client). */
    consentConfirmedAt?: string;
  },
): Promise<{
  id: string;
  status: string;
  uploadMode: "presigned" | "direct";
  uploadUrl: string | null;
  expiresAt: string;
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

  const { ext, mimeType } = validateMp3Meta({
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });

  const storage = getAudioStorage();
  const storageKey = buildAudioStorageKey(organizationId, ext);
  const id = randomUUID();
  // Horodatage serveur uniquement — input.consentConfirmedAt est ignoré.
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

  await prisma.callRecording.create({
    data: {
      id,
      organizationId,
      uploaderId: user.id,
      teleproId: user.id,
      source: RecordingSource.MANUAL_UPLOAD,
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
  };
}

/**
 * Étape 2 : finalise l'upload (fichier présent) et enfile PREPROCESS une seule fois.
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
): Promise<{ id: string; status: string; jobEnqueued: boolean }> {
  const organizationId = assertOrg(user);
  await assertTeleproInOrganization(user.id, organizationId);
  const rec = await findOwnedRealCall({
    id,
    teleproId: user.id,
    organizationId,
  });
  if (!rec) throw new HttpError(404, "Appel introuvable.");

  if (rec.status === RecordingStatus.UPLOADED ||
      rec.status === RecordingStatus.PREPROCESSING ||
      rec.status === RecordingStatus.TRANSCRIBING ||
      rec.status === RecordingStatus.ANALYZING ||
      rec.status === RecordingStatus.READY) {
    // Idempotent : déjà finalisé / en cours / terminé.
    return { id: rec.id, status: rec.status, jobEnqueued: false };
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
      where: { id: rec.id, organizationId, teleproId: user.id },
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
    // Taille déclarée à la prepare : tolérance stricte (fichier d'un autre = refusé).
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
  await prisma.callRecording.updateMany({
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

  // Une seule entrée PREPROCESS (unique type+targetId).
  await enqueueJob({
    organizationId,
    type: JobType.PREPROCESS_RECORDING,
    targetId: rec.id,
  });

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
    jobEnqueued: true,
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
