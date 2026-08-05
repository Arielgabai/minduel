import "server-only";
import { spawn } from "node:child_process";
import { prisma } from "./db";
import { nowIso } from "./utils";
import { serverConfig } from "./config";
import { log } from "./log";
import { RecordingStatus, ScenarioStatus, CallType, RecordingSource } from "./enums";
import { enqueueJob } from "./jobs";
import { JobType } from "./jobTypes";
import {
  getDiarizedTranscriptionProvider,
  getSpeakerAttributionProvider,
  getAnonymizationProvider,
  getCallAnalysisProvider,
  getRealCallAnalysisProvider,
  getScenarioGenerationProvider,
  getAudioStorage,
} from "./providers";
import type { CallAnalysisResult } from "./providers";

/**
 * Pipeline appel modèle -> exercice, découpé en 4 étapes idempotentes exécutées
 * par la file ProcessingJob (chaque étape enfile la suivante) :
 *   PREPROCESS -> TRANSCRIBE (+ attribution locuteurs) -> ANALYZE (anonymise +
 *   analyse) -> GENERATE (scénario + grille).
 *
 * LOT Q3A : pour un appel réel télépro (source=MANUAL_UPLOAD), le pipeline
 * s'arrête après l'analyse coaching (jamais GENERATE_SCENARIO_FROM_CALL).
 *
 * Chaque étape :
 * - écrit un statut métier clair (RecordingStatus) ;
 * - court-circuite si sa sortie existe déjà (rejouable après crash/retry) ;
 * - peut s'arrêter en WAITING_FOR_CLARIFICATION (question minimale au manager),
 *   sans échouer, jusqu'à ce que /clarify relance la suite.
 */

const PROMPT_VERSION = "call2exercise-v1";
const REAL_CALL_PROMPT_VERSION = "real-call-coaching-v1";

/** Appel réel télépro (LOT Q3A) — jamais traité comme référence pédagogique. */
export function isTeleproRealCall(rec: {
  source: string | null;
  teleproId: string | null;
}): boolean {
  return (
    rec.source === RecordingSource.MANUAL_UPLOAD && rec.teleproId != null
  );
}
async function setStatus(
  recordingId: string,
  organizationId: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await prisma.callRecording.updateMany({
    where: { id: recordingId, organizationId },
    data: { status, updatedAt: nowIso(), ...extra },
  });
}

// ---------------------------------------------------------------------------
// Étape 1 : préparation (validation format + métadonnées ffprobe best-effort).
// ---------------------------------------------------------------------------
export async function preprocessRecording(
  recordingId: string,
  organizationId: string,
): Promise<void> {
  const rec = await prisma.callRecording.findFirstOrThrow({
    where: { id: recordingId, organizationId },
  });
  if (rec.status === RecordingStatus.READY) return;

  log.info("recording.preprocessing_started", { organizationId, recordingId });
  await setStatus(recordingId, organizationId, RecordingStatus.PREPROCESSING);

  if (!rec.storageKey) {
    await markRecordingFailed(recordingId, organizationId, "Aucun fichier audio associé.");
    return;
  }

  const bytes = await getAudioStorage().get(rec.storageKey);
  if (!bytes || bytes.length === 0) {
    await markRecordingFailed(recordingId, organizationId, "Fichier audio introuvable dans le stockage.");
    return;
  }

  const format = detectAudioFormat(bytes);
  if (!format) {
    await markRecordingFailed(
      recordingId,
      organizationId,
      "Format audio non reconnu (signature invalide). Formats acceptés : MP3, WAV, M4A, WebM.",
    );
    return;
  }

  // Métadonnées optionnelles via ffprobe (dégradation gracieuse si absent).
  const meta = await probeAudio(bytes).catch(() => null);
  if (meta) {
    await prisma.callRecording.updateMany({
      where: { id: recordingId, organizationId },
      data: {
        audioChannels: meta.channels ?? null,
        audioSampleRate: meta.sampleRate ?? null,
        audioCodec: meta.codec ?? null,
        audioBitrate: meta.bitrate ?? null,
        durationSec: meta.durationSec ?? rec.durationSec,
        updatedAt: nowIso(),
      },
    });
  }

  // La transcription est coûteuse (audio complet renvoyé à chaque essai) :
  // on borne strictement à `transcribeMaxAttempts` (défaut : 2). Au-delà,
  // un retry manuel manager est plus approprié qu'une boucle automatique.
  await enqueueJob({
    organizationId,
    type: JobType.TRANSCRIBE_RECORDING,
    targetId: recordingId,
    maxAttempts: serverConfig.worker.transcribeMaxAttempts,
  });
  log.info("recording.preprocessing_completed", {
    organizationId,
    recordingId,
    format,
    ffprobe: meta ? true : false,
  });
}

// ---------------------------------------------------------------------------
// Étape 2 : transcription diarisée + attribution des locuteurs.
// ---------------------------------------------------------------------------
export async function transcribeRecording(
  recordingId: string,
  organizationId: string,
): Promise<void> {
  const rec = await prisma.callRecording.findFirstOrThrow({
    where: { id: recordingId, organizationId },
    include: { transcript: { include: { turns: true } } },
  });
  if (rec.status === RecordingStatus.READY) return;

  // Court-circuit : transcript + attribution déjà faits -> passer à l'analyse.
  if (rec.transcript && rec.transcript.commercialSpeakerId) {
    await enqueueJob({ organizationId, type: JobType.ANALYZE_REFERENCE_CALL, targetId: recordingId });
    return;
  }

  await setStatus(recordingId, organizationId, RecordingStatus.TRANSCRIBING);
  log.info("recording.transcription_started", { organizationId, recordingId });

  // 2a) Transcription (idempotente : ne recrée pas un transcript existant).
  let transcript = rec.transcript;
  if (!transcript) {
    const result = await getDiarizedTranscriptionProvider().transcribeDiarized({
      storageKey: rec.storageKey,
      language: rec.language,
      mimeType: rec.mimeType,
      seed: rec.id,
    });
    transcript = await prisma.transcript.create({
      data: {
        recordingId: rec.id,
        language: result.language,
        provider: result.provider,
        model: result.model,
        // Copie de compat (source de vérité = TranscriptSegment).
        segments: JSON.stringify(
          result.segments.map((s) => ({
            speaker: s.speakerId,
            text: s.text,
            startMs: s.startMs,
            endMs: s.endMs,
          })),
        ),
        createdAt: nowIso(),
        turns: {
          create: result.segments.map((s, i) => ({
            idx: i,
            speakerId: s.speakerId,
            startMs: s.startMs,
            endMs: s.endMs,
            text: s.text,
            confidence: s.confidence ?? null,
          })),
        },
      },
      include: { turns: true },
    });
    log.info("recording.transcription_completed", {
      organizationId,
      recordingId,
      segmentCount: result.segments.length,
      provider: result.provider,
    });
  }

  const turns = [...transcript.turns].sort((a, b) => a.idx - b.idx);
  const diarized = turns.map((t) => ({
    speakerId: t.speakerId,
    startMs: t.startMs,
    endMs: t.endMs,
    text: t.text,
    confidence: t.confidence ?? undefined,
  }));

  // 2b) Attribution des locuteurs.
  const answers = parseJson<Record<string, string>>(rec.clarificationAnswers) ?? {};
  const managerCommercial = answers["commercialSpeakerId"];

  let commercialSpeakerId: string | null = null;
  let customerSpeakerId: string | null = null;
  let confidence = 1;
  let rationale = "Locuteur commercial choisi par le manager.";

  if (managerCommercial) {
    commercialSpeakerId = managerCommercial;
    customerSpeakerId =
      diarized.map((d) => d.speakerId).find((id) => id !== managerCommercial) ?? null;
  } else {
    const attribution = await getSpeakerAttributionProvider().attribute({
      segments: diarized,
      language: transcript.language,
      seed: rec.id,
    });
    commercialSpeakerId = attribution.commercialSpeakerId;
    customerSpeakerId = attribution.customerSpeakerId;
    confidence = attribution.confidence;
    rationale = attribution.rationale;

    const threshold = serverConfig.speakerAssignmentConfidenceThreshold;
    if (!commercialSpeakerId || confidence < threshold) {
      // Confiance insuffisante -> demander au manager quel locuteur est le commercial.
      const speakers = uniqueSpeakerSamples(diarized);
      await prisma.callRecording.updateMany({
        where: { id: recordingId, organizationId },
        data: {
          status: RecordingStatus.WAITING_FOR_CLARIFICATION,
          clarificationQuestions: JSON.stringify([
            {
              id: "commercialSpeakerId",
              kind: "speaker",
              question: "Quel interlocuteur est le commercial (celui qui vend) ?",
              importance: "HIGH",
              options: speakers.map((s) => ({ value: s.speakerId, sample: s.sample })),
            },
          ]),
          updatedAt: nowIso(),
        },
      });
      // Persiste l'attribution provisoire sur le transcript (best-effort).
      await prisma.transcript.update({
        where: { id: transcript.id },
        data: {
          commercialSpeakerId: null,
          customerSpeakerId: null,
          speakerAssignmentConfidence: confidence,
          speakerAssignmentRationale: rationale,
        },
      });
      log.info("recording.clarification_required", {
        organizationId,
        recordingId,
        stage: "speaker_attribution",
        confidence,
      });
      return;
    }
  }

  await applySpeakerRoles(transcript.id, commercialSpeakerId, customerSpeakerId, diarized);
  await prisma.transcript.update({
    where: { id: transcript.id },
    data: {
      commercialSpeakerId,
      customerSpeakerId,
      speakerAssignmentConfidence: confidence,
      speakerAssignmentRationale: rationale,
    },
  });
  log.info("recording.speakers_assigned", {
    organizationId,
    recordingId,
    confidence,
  });

  await enqueueJob({ organizationId, type: JobType.ANALYZE_REFERENCE_CALL, targetId: recordingId });
}

// ---------------------------------------------------------------------------
// Étape 3 : anonymisation + analyse structurée.
// ---------------------------------------------------------------------------
export async function analyzeReferenceCall(
  recordingId: string,
  organizationId: string,
): Promise<void> {
  const rec = await prisma.callRecording.findFirstOrThrow({
    where: { id: recordingId, organizationId },
    include: { transcript: { include: { turns: true } }, analysis: true },
  });
  if (rec.status === RecordingStatus.READY) return;
  if (!rec.transcript) {
    await enqueueJob({ organizationId, type: JobType.TRANSCRIBE_RECORDING, targetId: recordingId, maxAttempts: serverConfig.worker.transcribeMaxAttempts });
    return;
  }

  const realCall = isTeleproRealCall(rec);

  // Court-circuit : analyse déjà faite.
  // - appel modèle exploitable -> génération d'exercice ;
  // - appel réel -> READY (jamais GENERATE).
  if (rec.analysis && rec.status !== RecordingStatus.WAITING_FOR_CLARIFICATION) {
    if (realCall) {
      if (rec.analysis.coachingPayload) {
        await setStatus(recordingId, organizationId, RecordingStatus.READY);
      }
      return;
    }
    if (rec.analysis.usable) {
      await enqueueJob({ organizationId, type: JobType.GENERATE_SCENARIO_FROM_CALL, targetId: recordingId });
    }
    return;
  }

  await setStatus(recordingId, organizationId, RecordingStatus.ANALYZING);
  log.info("recording.analysis_started", { organizationId, recordingId, realCall });

  const turns = [...rec.transcript.turns].sort((a, b) => a.idx - b.idx);

  // 3a) Anonymisation (idempotente : ne réanonymise pas si déjà fait).
  const needsAnon = turns.some((t) => t.anonymizedText == null);
  if (needsAnon) {
    const anon = await getAnonymizationProvider().anonymize({
      segments: turns.map((t) => ({
        idx: t.idx,
        speakerId: t.speakerId,
        role: t.role ?? "PROSPECT",
        text: t.text,
      })),
      language: rec.transcript.language,
      seed: rec.id,
    });
    const byIdx = new Map(anon.segments.map((s) => [s.idx, s.anonymizedText]));
    for (const t of turns) {
      const at = byIdx.get(t.idx);
      if (at != null) {
        await prisma.transcriptSegment.update({
          where: { id: t.id },
          data: { anonymizedText: at },
        });
        t.anonymizedText = at;
      }
    }
  }

  // LOT Q3A : branche coaching télépro (pas d'analyse de référence, pas GENERATE).
  if (realCall) {
    const coaching = await getRealCallAnalysisProvider().analyze({
      segments: turns.map((t) => ({
        idx: t.idx,
        role: t.role ?? "PROSPECT",
        text: t.anonymizedText ?? t.text,
        startMs: t.startMs,
        endMs: t.endMs,
      })),
      language: rec.transcript.language,
      seed: rec.id,
    });

    await prisma.callAnalysis.upsert({
      where: { recordingId: rec.id },
      create: {
        organizationId,
        recordingId: rec.id,
        usable: true,
        language: rec.transcript.language,
        model: serverConfig.models.analysis,
        promptVersion: REAL_CALL_PROMPT_VERSION,
        summary: coaching.summary,
        overallScore: coaching.overallScore,
        coachingPayload: JSON.stringify(coaching),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      update: {
        summary: coaching.summary,
        overallScore: coaching.overallScore,
        coachingPayload: JSON.stringify(coaching),
        promptVersion: REAL_CALL_PROMPT_VERSION,
        updatedAt: nowIso(),
      },
    });

    await setStatus(recordingId, organizationId, RecordingStatus.READY);
    log.info("recording.real_call_analysis_completed", {
      organizationId,
      recordingId,
      overallScore: coaching.overallScore,
    });
    return;
  }

  // 3b) Analyse structurée sur le texte anonymisé (appel modèle).
  const clarifications = parseJson<Record<string, string>>(rec.clarificationAnswers) ?? {};
  const analysis = await getCallAnalysisProvider().analyze({
    segments: turns.map((t) => ({
      idx: t.idx,
      role: t.role ?? "PROSPECT",
      text: t.anonymizedText ?? t.text,
    })),
    language: rec.transcript.language,
    seed: rec.id,
    clarifications,
  });

  await prisma.callAnalysis.upsert({
    where: { recordingId: rec.id },
    create: {
      organizationId,
      recordingId: rec.id,
      callType: analysis.callType,
      callTypeConfidence: analysis.callTypeConfidence,
      relationshipStage: analysis.relationshipStage,
      referenceSuitabilityScore: analysis.referenceSuitability.score,
      usable: analysis.referenceSuitability.usable,
      language: analysis.language,
      model: serverConfig.models.analysis,
      promptVersion: PROMPT_VERSION,
      summary: analysis.summary,
      customerProfile: JSON.stringify(analysis.customerProfile),
      commercialStrategy: JSON.stringify(analysis.commercialStrategy),
      ambiguities: JSON.stringify(analysis.ambiguities),
      referenceSuitability: JSON.stringify({
        ...analysis.referenceSuitability,
        facts: analysis.facts,
        inferences: analysis.inferences,
      }),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    update: {
      callType: analysis.callType,
      callTypeConfidence: analysis.callTypeConfidence,
      relationshipStage: analysis.relationshipStage,
      referenceSuitabilityScore: analysis.referenceSuitability.score,
      usable: analysis.referenceSuitability.usable,
      summary: analysis.summary,
      customerProfile: JSON.stringify(analysis.customerProfile),
      commercialStrategy: JSON.stringify(analysis.commercialStrategy),
      ambiguities: JSON.stringify(analysis.ambiguities),
      referenceSuitability: JSON.stringify({
        ...analysis.referenceSuitability,
        facts: analysis.facts,
        inferences: analysis.inferences,
      }),
      updatedAt: nowIso(),
    },
  });

  await prisma.callRecording.updateMany({
    where: { id: recordingId, organizationId },
    data: {
      detectedCallType: analysis.callType,
      callTypeConfidence: analysis.callTypeConfidence,
      referenceSuitabilityScore: analysis.referenceSuitability.score,
      usableAsReference: analysis.referenceSuitability.usable,
      updatedAt: nowIso(),
    },
  });

  log.info("recording.analysis_completed", {
    organizationId,
    recordingId,
    callType: analysis.callType,
    suitability: analysis.referenceSuitability.score,
  });

  // 3c) Ambiguïtés bloquantes (HIGH) non encore clarifiées -> demander (max 3).
  const highAmbiguities = analysis.ambiguities.filter((a) => a.importance === "HIGH");
  const alreadyAnswered = highAmbiguities.every((a) => clarifications[a.id] != null);
  if (highAmbiguities.length > 0 && !alreadyAnswered) {
    await prisma.callRecording.updateMany({
      where: { id: recordingId, organizationId },
      data: {
        status: RecordingStatus.WAITING_FOR_CLARIFICATION,
        clarificationQuestions: JSON.stringify(
          highAmbiguities.slice(0, 3).map((a) => ({
            id: a.id,
            kind: "text",
            question: a.question,
            importance: a.importance,
          })),
        ),
        updatedAt: nowIso(),
      },
    });
    log.info("recording.clarification_required", {
      organizationId,
      recordingId,
      stage: "analysis",
      count: Math.min(3, highAmbiguities.length),
    });
    return;
  }

  if (!analysis.referenceSuitability.usable) {
    await markRecordingFailed(
      recordingId,
      organizationId,
      "Cet appel n'est pas exploitable comme référence pédagogique : " +
        analysis.referenceSuitability.rationale.slice(0, 200),
    );
    return;
  }

  await enqueueJob({ organizationId, type: JobType.GENERATE_SCENARIO_FROM_CALL, targetId: recordingId });
}

// ---------------------------------------------------------------------------
// Étape 4 : génération du scénario + grille (idempotent via sourceRecordingId).
// ---------------------------------------------------------------------------
export async function generateScenarioFromCall(
  recordingId: string,
  organizationId: string,
): Promise<void> {
  const rec = await prisma.callRecording.findFirstOrThrow({
    where: { id: recordingId, organizationId },
    include: { analysis: true },
  });

  // LOT Q3A : un appel réel ne génère JAMAIS de scénario.
  if (isTeleproRealCall(rec)) {
    await setStatus(recordingId, organizationId, RecordingStatus.READY);
    log.info("scenario.generation_skipped_real_call", {
      organizationId,
      recordingId,
    });
    return;
  }

  // Idempotence : un exercice existe déjà pour cet appel -> READY.
  const existing = await prisma.scenario.findUnique({
    where: { sourceRecordingId: recordingId },
  });
  if (existing) {
    await setStatus(recordingId, organizationId, RecordingStatus.READY);
    return;
  }
  if (!rec.analysis) {
    await enqueueJob({ organizationId, type: JobType.ANALYZE_REFERENCE_CALL, targetId: recordingId });
    return;
  }

  await setStatus(recordingId, organizationId, RecordingStatus.GENERATING_EXERCISE);
  log.info("scenario.generation_started", { organizationId, recordingId });

  const analysis = reconstructAnalysis(rec.analysis);
  const generated = await getScenarioGenerationProvider().generate({
    analysis,
    language: rec.analysis.language,
    seed: rec.id,
  });

  const now = nowIso();
  const scenario = await prisma.scenario.create({
    data: {
      organizationId,
      name: generated.name,
      campaign: rec.campaign ?? null,
      callType: generated.callType,
      offer: generated.offer,
      prospectProfile: generated.prospectProfile,
      initialSituation: generated.initialSituation,
      objective: generated.objective,
      level: generated.level,
      personality: generated.personality,
      allowedObjections: JSON.stringify(generated.allowedObjections),
      secretInfos: JSON.stringify(generated.secretInfos),
      successConditions: generated.successConditions,
      failureConditions: generated.failureConditions,
      targetDurationSec: generated.targetDurationSec,
      status: ScenarioStatus.REVIEW_REQUIRED,
      knowledgeRefs: JSON.stringify([]),
      // Provenance + champs générés.
      sourceRecordingId: recordingId,
      sourceAnalysisId: rec.analysis.id,
      generatedByModel: serverConfig.models.scenario,
      promptVersion: PROMPT_VERSION,
      traineeBrief: generated.traineeBrief,
      aiProspect: JSON.stringify(generated.aiProspect),
      relationshipHistory: generated.relationshipHistory,
      expectedNextSteps: JSON.stringify(generated.expectedNextSteps),
      targetSkills: JSON.stringify(generated.targetSkills),
      coachingReference: JSON.stringify(generated.coachingReference),
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.evaluationRubric.create({
    data: {
      organizationId,
      scenarioId: scenario.id,
      name: `Grille — ${generated.name}`.slice(0, 120),
      criteria: JSON.stringify(generated.rubric),
      createdAt: now,
      updatedAt: now,
    },
  });

  await setStatus(recordingId, organizationId, RecordingStatus.READY);
  log.info("scenario.generated", {
    organizationId,
    recordingId,
    scenarioId: scenario.id,
    callType: generated.callType,
    criteriaCount: generated.rubric.length,
  });
}

/** Marque explicitement un enregistrement en échec (après épuisement des retries ou erreur bloquante). */
export async function markRecordingFailed(
  recordingId: string,
  organizationId: string,
  message: string,
): Promise<void> {
  await prisma.callRecording.updateMany({
    where: { id: recordingId, organizationId },
    data: {
      status: RecordingStatus.FAILED,
      errorMessage: message.slice(0, 300),
      updatedAt: nowIso(),
    },
  });
  log.error("recording.pipeline_failed", {
    organizationId,
    recordingId,
    detail: message.slice(0, 200),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function applySpeakerRoles(
  transcriptId: string,
  commercialSpeakerId: string | null,
  customerSpeakerId: string | null,
  diarized: Array<{ speakerId: string }>,
): Promise<void> {
  const seen = new Set(diarized.map((d) => d.speakerId));
  for (const speakerId of seen) {
    const role = speakerId === commercialSpeakerId ? "AGENT" : "PROSPECT";
    await prisma.transcriptSegment.updateMany({
      where: { transcriptId, speakerId },
      data: { role },
    });
  }
  // Copie de compat : Transcript.segments avec speaker AGENT/PROSPECT.
  const turns = await prisma.transcriptSegment.findMany({
    where: { transcriptId },
    orderBy: { idx: "asc" },
  });
  await prisma.transcript.update({
    where: { id: transcriptId },
    data: {
      segments: JSON.stringify(
        turns.map((t) => ({
          speaker: t.role ?? "PROSPECT",
          text: t.text,
          startMs: t.startMs,
          endMs: t.endMs,
        })),
      ),
    },
  });
}

function uniqueSpeakerSamples(
  diarized: Array<{ speakerId: string; text: string }>,
): Array<{ speakerId: string; sample: string }> {
  const map = new Map<string, string>();
  for (const d of diarized) {
    if (!map.has(d.speakerId)) map.set(d.speakerId, d.text.slice(0, 120));
  }
  return Array.from(map.entries()).map(([speakerId, sample]) => ({ speakerId, sample }));
}

/** Reconstruit un CallAnalysisResult depuis la ligne persistée (pour la génération). */
function reconstructAnalysis(row: {
  callType: string | null;
  callTypeConfidence: number | null;
  relationshipStage: string | null;
  language: string;
  summary: string | null;
  customerProfile: string | null;
  commercialStrategy: string | null;
  ambiguities: string | null;
  referenceSuitability: string | null;
  referenceSuitabilityScore: number | null;
  usable: boolean;
}): CallAnalysisResult {
  const suitability = parseJson<{
    score?: number;
    usable?: boolean;
    rationale?: string;
    facts?: string[];
    inferences?: string[];
  }>(row.referenceSuitability) ?? {};
  return {
    callType: row.callType ?? CallType.OTHER,
    callTypeConfidence: row.callTypeConfidence ?? 0.5,
    relationshipStage: row.relationshipStage ?? "UNKNOWN",
    language: row.language,
    summary: row.summary ?? "",
    customerProfile:
      parseJson<CallAnalysisResult["customerProfile"]>(row.customerProfile) ?? {
        role: "",
        context: "",
        needs: [],
        objections: [],
        signals: [],
      },
    commercialStrategy:
      parseJson<CallAnalysisResult["commercialStrategy"]>(row.commercialStrategy) ?? {
        objective: "",
        outcome: "",
        retainedPractices: [],
        missedOpportunities: [],
      },
    facts: suitability.facts ?? [],
    inferences: suitability.inferences ?? [],
    ambiguities: parseJson<CallAnalysisResult["ambiguities"]>(row.ambiguities) ?? [],
    referenceSuitability: {
      score: suitability.score ?? row.referenceSuitabilityScore ?? 0,
      usable: suitability.usable ?? row.usable,
      rationale: suitability.rationale ?? "",
    },
  };
}

/** Détecte le format audio à partir des octets de signature (magic bytes). */
function detectAudioFormat(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // MP3 : "ID3" ou frame sync 0xFFEx/0xFFFx.
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return "mp3";
  if (buf[0] === 0xff && ((buf[1] ?? 0) & 0xe0) === 0xe0) return "mp3";
  // WAV : "RIFF"...."WAVE".
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45
  ) {
    return "wav";
  }
  // MP4/M4A : "ftyp" à l'offset 4.
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return "m4a";
  // WebM/Matroska : EBML header 0x1A45DFA3.
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "webm";
  return null;
}

interface AudioMeta {
  channels?: number;
  sampleRate?: number;
  codec?: string;
  bitrate?: number;
  durationSec?: number;
}

/**
 * Sonde les métadonnées audio via ffprobe (lecture sur stdin). Best-effort :
 * si ffprobe est absent (ENOENT) ou échoue, retourne null sans bloquer.
 */
function probeAudio(buf: Buffer): Promise<AudioMeta | null> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(
        "ffprobe",
        [
          "-v", "error",
          "-print_format", "json",
          "-show_format",
          "-show_streams",
          "-i", "pipe:0",
        ],
        { stdio: ["pipe", "pipe", "ignore"] },
      );
    } catch {
      resolve(null);
      return;
    }
    let out = "";
    let settled = false;
    const done = (v: AudioMeta | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    child.on("error", () => done(null)); // ex : ENOENT (ffprobe non installé)
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.on("close", () => {
      try {
        const json = JSON.parse(out) as {
          format?: { duration?: string; bit_rate?: string };
          streams?: Array<{
            codec_type?: string;
            codec_name?: string;
            channels?: number;
            sample_rate?: string;
            bit_rate?: string;
          }>;
        };
        const audio = json.streams?.find((s) => s.codec_type === "audio");
        done({
          channels: audio?.channels,
          sampleRate: audio?.sample_rate ? Number(audio.sample_rate) : undefined,
          codec: audio?.codec_name,
          bitrate: audio?.bit_rate
            ? Number(audio.bit_rate)
            : json.format?.bit_rate
              ? Number(json.format.bit_rate)
              : undefined,
          durationSec: json.format?.duration ? Math.round(Number(json.format.duration)) : undefined,
        });
      } catch {
        done(null);
      }
    });
    // Écrit les octets sur stdin puis ferme.
    child.stdin.on("error", () => done(null));
    child.stdin.end(buf);
    // Filet de sécurité : ne jamais rester bloqué.
    setTimeout(() => {
      try {
        child?.kill();
      } catch {
        /* noop */
      }
      done(null);
    }, 15000);
  });
}
