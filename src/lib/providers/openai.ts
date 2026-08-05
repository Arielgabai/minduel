import "server-only";
import { Agent } from "undici";
import { serverConfig } from "../config";
import { DIARIZATION_TRANSCRIPTION_MODEL } from "../env";
import { PermanentJobError, httpFailureToError } from "../jobErrors";
import { log, safeErrorMessage } from "../log";
import { CallType } from "../enums";
import {
  EvaluationResultSchema,
  CallAnalysisResultSchema,
  RealCallAnalysisResultSchema,
  ScenarioGenerationResultSchema,
  SpeakerAttributionSchema,
  AnonymizationSchema,
} from "./schemas";
import { getAudioStorage } from "./storage";
import { renderPromptTemplate } from "../promptArtifacts";
import type {
  EvaluationProvider,
  EvaluationInput,
  EvaluationResult,
  RealtimeSessionProvider,
  RealtimeClientSecret,
  DiarizedTranscriptionProvider,
  DiarizedTranscription,
  DiarizedSegment,
  SpeakerAttributionProvider,
  SpeakerAttributionResult,
  AnonymizationProvider,
  AnonymizationResult,
  CallAnalysisProvider,
  CallAnalysisResult,
  RealCallAnalysisProvider,
  RealCallAnalysisResult,
  ScenarioGenerationProvider,
  ScenarioGenerationResult,
} from "./types";

/**
 * Session Realtime OpenAI réelle (WebRTC).
 *
 * Le serveur crée un secret client ÉPHÉMÈRE via l'endpoint GA
 * `POST /v1/realtime/client_secrets`. La clé API longue durée ne quitte JAMAIS
 * le serveur et n'est jamais envoyée au navigateur ; seul le secret éphémère
 * (`value`, préfixe `ek_…`, durée de vie courte) est transmis au client, qui
 * l'utilise ensuite pour négocier le SDP avec `POST /v1/realtime/calls`.
 *
 * La persona du prospect (`instructions`) est injectée ICI, côté serveur, dans
 * la configuration de session : elle est liée au secret éphémère et n'a donc pas
 * besoin d'être exposée au navigateur.
 *
 * Réf : https://developers.openai.com/api/docs/guides/realtime-webrtc
 */
export class OpenAIRealtimeSessionProvider implements RealtimeSessionProvider {
  async createEphemeralSession(input: {
    instructions: string;
  }): Promise<RealtimeClientSecret> {
    const model = serverConfig.models.realtime;
    const voice = serverConfig.models.realtimeVoice;

    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverConfig.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model,
          instructions: input.instructions,
          audio: {
            output: { voice },
          },
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // On journalise le statut + un détail tronqué (jamais la clé), et on
      // remonte une erreur générique : le message OpenAI peut contenir des infos
      // de configuration à ne pas exposer telles quelles au client.
      log.error("realtime.client_secret_failed", {
        status: res.status,
        detail: safeErrorMessage(detail),
      });
      throw new Error(`OpenAI Realtime client_secrets error ${res.status}`);
    }

    // Réponse GA : { value: "ek_…", expires_at: 1730000000, session: {...} }.
    // On reste tolérant à l'ancienne forme { client_secret: { value, expires_at } }.
    const data = (await res.json()) as {
      value?: string;
      expires_at?: number;
      client_secret?: { value?: string; expires_at?: number };
    };

    const value = data.value ?? data.client_secret?.value;
    const expiresAtUnix = data.expires_at ?? data.client_secret?.expires_at;

    if (!value) {
      log.error("realtime.client_secret_missing_value", { status: res.status });
      throw new Error("OpenAI Realtime : secret éphémère absent de la réponse.");
    }

    return {
      demo: false,
      model,
      voice,
      clientSecret: value,
      expiresAt: expiresAtUnix
        ? new Date(expiresAtUnix * 1000).toISOString()
        : undefined,
      instructions: input.instructions,
    };
  }
}

/**
 * Évaluation OpenAI RÉELLE (requête serveur séparée de Realtime).
 *
 * On appelle Chat Completions avec Structured Outputs (`response_format`
 * json_schema strict) pour obtenir une évaluation structurée du transcript, puis
 * on la revalide avec Zod côté serveur AVANT écriture. Le score global n'est pas
 * pris tel quel : il est RECALCULÉ comme la somme (plafonnée à 100) des scores par
 * critère, et chaque score est borné à la pondération du critère (la note ne peut
 * pas dépasser le poids défini dans la grille).
 *
 * Le modèle utilisé provient de OPENAI_EVALUATION_MODEL (jamais le modèle Realtime).
 * La clé API ne quitte pas le serveur ; le transcript complet n'est jamais journalisé.
 */
const OUTCOME_VALUES = ["VENTE", "REFUS", "RAPPEL", "RDV", "AUTRE"] as const;

/** Contraintes JSON non supprimables lors d'un override EVALUATION_SYSTEM. */
const EVALUATION_JSON_SERVER_BLOCK = [
  "- Respecte STRICTEMENT le schéma JSON demandé.",
  "- Pour chaque critère de la grille, renvoie un objet skillScores avec la MÊME clé 'key'.",
  "- score doit être compris entre 0 et maxScore (la pondération du critère).",
].join("\n");

const EVALUATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "overallScore",
    "summary",
    "strengths",
    "improvements",
    "advice",
    "betterExample",
    "keyMoments",
    "outcome",
    "skillScores",
  ],
  properties: {
    overallScore: { type: "integer" },
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    improvements: { type: "array", items: { type: "string" } },
    advice: { type: "array", items: { type: "string" } },
    betterExample: { type: "string" },
    keyMoments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "quote", "atMs"],
        properties: {
          role: { type: "string", enum: ["AGENT", "PROSPECT"] },
          quote: { type: "string" },
          atMs: { type: "integer" },
        },
      },
    },
    outcome: { type: "string", enum: [...OUTCOME_VALUES] },
    skillScores: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "key",
          "label",
          "score",
          "maxScore",
          "rationale",
          "evidence",
          "recommendation",
        ],
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          score: { type: "integer" },
          maxScore: { type: "integer" },
          rationale: { type: "string" },
          evidence: { type: "string" },
          recommendation: { type: "string" },
        },
      },
    },
  },
} as const;

interface RawSkillScore {
  key?: string;
  label?: string;
  score?: number;
  maxScore?: number;
  rationale?: string;
  evidence?: string;
  recommendation?: string;
}

interface RawEvaluation {
  overallScore?: number;
  summary?: string;
  strengths?: string[];
  improvements?: string[];
  advice?: string[];
  betterExample?: string;
  keyMoments?: Array<{ role?: string; quote?: string; atMs?: number }>;
  outcome?: string;
  skillScores?: RawSkillScore[];
}

function clampInt(value: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(min, Math.min(max, n));
}

export class OpenAIEvaluationProvider implements EvaluationProvider {
  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    const model = serverConfig.models.evaluation;
    const prompt = buildEvaluationPrompt(input);

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverConfig.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "simulation_evaluation",
            strict: true,
            schema: EVALUATION_JSON_SCHEMA,
          },
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      log.error("evaluation.openai_error", {
        status: res.status,
        detail: safeErrorMessage(detail),
      });
      throw new Error(`OpenAI evaluation error ${res.status}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string; refusal?: string } }>;
    };
    const message = data.choices?.[0]?.message;
    if (message?.refusal) {
      throw new Error("OpenAI a refusé de produire l'évaluation.");
    }
    const content = message?.content;
    if (!content) {
      throw new Error("Réponse d'évaluation OpenAI vide.");
    }

    let parsed: RawEvaluation;
    try {
      parsed = JSON.parse(content) as RawEvaluation;
    } catch {
      throw new Error("Réponse d'évaluation OpenAI illisible (JSON invalide).");
    }

    // On fait CONFIANCE à la grille (pas au modèle) pour les pondérations :
    // maxScore = poids du critère, score borné à [0, poids]. Les critères absents
    // de la réponse sont scorés 0 avec une justification explicite.
    const byKey = new Map<string, RawSkillScore>();
    for (const s of parsed.skillScores ?? []) {
      if (s.key) byKey.set(s.key, s);
    }
    const skillScores = input.rubric.map((c) => {
      const raw = byKey.get(c.key);
      const score = clampInt(raw?.score, 0, c.weight, 0);
      return {
        key: c.key,
        label: c.label,
        score,
        maxScore: c.weight,
        rationale: (raw?.rationale ?? "").toString().slice(0, 600) || "Critère non évalué.",
        evidence: (raw?.evidence ?? "").toString().slice(0, 600),
        recommendation: (raw?.recommendation ?? "").toString().slice(0, 600),
      };
    });

    // Score global RECALCULÉ (jamais celui du modèle) = somme plafonnée à 100.
    const overallScore = Math.min(
      100,
      skillScores.reduce((sum, s) => sum + s.score, 0),
    );

    const outcome =
      typeof parsed.outcome === "string" &&
      (OUTCOME_VALUES as readonly string[]).includes(parsed.outcome)
        ? parsed.outcome
        : "AUTRE";

    const keyMoments = (parsed.keyMoments ?? [])
      .filter((m) => m && typeof m.quote === "string" && m.quote.trim())
      .slice(0, 3)
      .map((m) => ({
        role: m.role === "AGENT" ? "AGENT" : "PROSPECT",
        quote: String(m.quote).slice(0, 400),
        atMs: clampInt(m.atMs, 0, Number.MAX_SAFE_INTEGER, 0),
      }));

    const result: EvaluationResult = {
      overallScore,
      summary: (parsed.summary ?? "").toString().slice(0, 800),
      strengths: (parsed.strengths ?? []).slice(0, 3).map((s) => String(s).slice(0, 300)),
      improvements: (parsed.improvements ?? []).slice(0, 3).map((s) => String(s).slice(0, 300)),
      advice: (parsed.advice ?? []).slice(0, 5).map((s) => String(s).slice(0, 300)),
      betterExample: (parsed.betterExample ?? "").toString().slice(0, 600),
      keyMoments,
      outcome,
      skillScores,
    };

    // Revalidation stricte AVANT écriture (contrat interne).
    return EvaluationResultSchema.parse(result);
  }
}

/** Construit le prompt d'évaluation (contexte scénario + grille + transcript). */
export function buildEvaluationPrompt(input: EvaluationInput): {
  system: string;
  user: string;
} {
  const rubricLines = input.rubric
    .map((c) => `- ${c.key} — ${c.label} (pondération / maxScore : ${c.weight})`)
    .join("\n");

  const transcriptLines = input.turns
    .map((t, i) => {
      const speaker = t.role === "AGENT" ? "TELEPRO" : t.role === "PROSPECT" ? "PROSPECT" : t.role;
      return `[${i}] ${speaker}: ${t.content}`;
    })
    .join("\n");

  const knowledgeLines =
    input.knowledge && input.knowledge.length > 0
      ? input.knowledge.map((k) => `- (${k.type}) ${k.title} : ${k.content}`).join("\n")
      : "(aucune)";

  const defaultSystem = [
    "Tu es un coach expert en téléprospection et vente par téléphone.",
    "Tu évalues un appel simulé entre un TÉLÉPRO (l'agent en formation) et un PROSPECT (client simulé).",
    "Règles STRICTES :",
    "- Évalue UNIQUEMENT à partir du transcript fourni.",
    "- N'invente aucun comportement vocal non mesurable (ton, débit) qui ne ressort pas du texte.",
    "- Chaque critique doit s'appuyer sur une preuve (courte citation) quand elle existe.",
    "- Ne pénalise pas une information que le prospect n'a jamais permis de découvrir.",
    "- Produis des conseils concrets et actionnables, en français.",
    EVALUATION_JSON_SERVER_BLOCK,
  ].join("\n");

  const defaultUser = [
    `Scénario : ${input.scenarioName ?? "(non précisé)"}`,
    `Type d'appel : ${input.callType ?? "(non précisé)"}`,
    `Niveau : ${input.scenarioLevel}`,
    `Objectif de l'agent : ${input.objective ?? "(non précisé)"}`,
    `Profil du prospect : ${input.prospectProfile ?? "(non précisé)"}`,
    `Conditions de réussite : ${input.successConditions ?? "(non précisées)"}`,
    `Conditions d'échec : ${input.failureConditions ?? "(non précisées)"}`,
    "",
    "Grille d'évaluation (critères pondérés, total 100) :",
    rubricLines,
    "",
    "Connaissances approuvées pertinentes :",
    knowledgeLines,
    "",
    "Transcript ordonné (index, locuteur, texte) :",
    transcriptLines,
    "",
    "Renvoie l'évaluation structurée conforme au schéma. Le champ outcome doit valoir l'un de : VENTE, REFUS, RAPPEL, RDV, AUTRE.",
  ].join("\n");

  const overrides = input.evaluationPromptOverrides;
  if (!overrides?.system && !overrides?.user) {
    return { system: defaultSystem, user: defaultUser };
  }

  const templateVars: Record<string, string> = {
    scenarioName: input.scenarioName ?? "(non précisé)",
    callType: input.callType ?? "(non précisé)",
    level: input.scenarioLevel,
    objective: input.objective ?? "(non précisé)",
    offer: input.offer ?? "(non précisé)",
    prospectName: input.prospectName ?? "(non précisé)",
    transcript: transcriptLines,
    rubric: rubricLines,
    knowledge: knowledgeLines,
  };

  const system = overrides.system
    ? `${renderPromptTemplate(overrides.system, templateVars)}\n${EVALUATION_JSON_SERVER_BLOCK}`
    : defaultSystem;

  const user = overrides.user
    ? renderPromptTemplate(overrides.user, templateVars)
    : defaultUser;

  return { system, user };
}

// ===========================================================================
// Pipeline appel -> exercice : providers OpenAI réels.
// ===========================================================================

const OPENAI_BASE = "https://api.openai.com/v1";

/** Ensemble de classification proposé au modèle d'analyse. */
const CALL_TYPE_ENUM: string[] = [
  CallType.COLD_PROSPECTING,
  CallType.WARM_PROSPECTING,
  CallType.FOLLOW_UP,
  CallType.EXISTING_CUSTOMER,
  CallType.UPSELL_CROSS_SELL,
  CallType.RENEWAL,
  CallType.RETENTION,
  CallType.CUSTOMER_SUPPORT,
  CallType.OTHER,
];

/**
 * Appel générique à la Responses API OpenAI avec Structured Outputs (json_schema
 * strict). Retourne l'objet JSON brut (le caller le revalide avec Zod). N'écrit
 * jamais la clé ; journalise l'usage de tokens et le request-id quand disponibles.
 */
async function callResponsesApi(input: {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  reasoningEffort?: string;
  logEvent: string;
  logContext?: Record<string, string | number | boolean | undefined>;
}): Promise<unknown> {
  const startedAt = Date.now();
  const body: Record<string, unknown> = {
    model: input.model,
    input: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
    text: {
      format: {
        type: "json_schema",
        name: input.schemaName,
        strict: true,
        schema: input.schema,
      },
    },
  };
  if (input.reasoningEffort) {
    body.reasoning = { effort: input.reasoningEffort };
  }

  const res = await fetch(`${OPENAI_BASE}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serverConfig.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    log.error(`${input.logEvent}_error`, {
      ...input.logContext,
      status: res.status,
      requestId: res.headers.get("x-request-id") ?? undefined,
      detail: safeErrorMessage(detail),
    });
    throw httpFailureToError(
      res.status,
      `OpenAI Responses error ${res.status} (${input.schemaName}, model=${input.model})`,
    );
  }

  const data = (await res.json()) as {
    output_text?: string;
    status?: string;
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string; refusal?: string }>;
    }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const refusal = data.output
    ?.flatMap((o) => o.content ?? [])
    .find((c) => c?.type === "refusal")?.refusal;
  if (refusal) {
    throw new Error(`OpenAI a refusé la génération (${input.schemaName}).`);
  }

  const text =
    data.output_text ??
    data.output
      ?.filter((o) => o.type === "message")
      .flatMap((o) => o.content ?? [])
      .filter((c) => c?.type === "output_text" && typeof c.text === "string")
      .map((c) => c.text as string)
      .join("") ??
    "";

  if (!text) {
    throw new Error(`Réponse OpenAI vide (${input.schemaName}).`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Réponse OpenAI illisible / JSON invalide (${input.schemaName}).`);
  }

  log.info(input.logEvent, {
    ...input.logContext,
    model: input.model,
    durationMs: Date.now() - startedAt,
    requestId: res.headers.get("x-request-id") ?? undefined,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
  });

  return parsed;
}

// ---- Transcription diarisée réelle ----------------------------------------

/**
 * Erreur de timeout de la transcription, marquée rejouable.
 * Un timeout au niveau des en-têtes/corps HTTP est un incident transitoire :
 * réseau ou latence OpenAI. On le distingue explicitement pour l'observabilité
 * (log `transcription.request_timeout`) tout en le laissant retryable par la
 * file, contrairement à un 400 de configuration.
 */
export class TranscriptionTimeoutError extends Error {
  readonly transient = true;
  constructor(
    message: string,
    readonly timeoutMs: number,
    readonly elapsedMs: number,
  ) {
    super(message);
    this.name = "TranscriptionTimeoutError";
  }
}

function isAbortLikeError(err: unknown): boolean {
  if (err instanceof Error) {
    // AbortSignal.timeout -> TimeoutError, AbortController.abort -> AbortError,
    // undici header/body timeout -> HeadersTimeoutError / BodyTimeoutError,
    // socket disconnect -> SocketError.
    return (
      err.name === "TimeoutError" ||
      err.name === "AbortError" ||
      err.name === "HeadersTimeoutError" ||
      err.name === "BodyTimeoutError" ||
      err.name === "SocketError" ||
      /\btimeout\b/i.test(err.message)
    );
  }
  return false;
}

export class OpenAITranscriptionProvider implements DiarizedTranscriptionProvider {
  async transcribeDiarized(input: {
    storageKey: string | null;
    language: string;
    mimeType?: string | null;
    seed: string;
  }): Promise<DiarizedTranscription> {
    if (!input.storageKey) {
      throw new Error("Transcription impossible : aucun fichier stocké (storageKey manquant).");
    }
    const bytes = await getAudioStorage().get(input.storageKey);
    if (!bytes) {
      throw new Error("Transcription impossible : fichier audio introuvable dans le stockage.");
    }
    const model = serverConfig.models.transcribe;
    // Garde-fou d'exécution : l'environnement est déjà validé au démarrage, mais
    // le pipeline ne doit jamais partir sur un modèle non diarisant (aucun
    // locuteur en sortie, et chunking_strategy rejeté en 400).
    if (model !== DIARIZATION_TRANSCRIPTION_MODEL) {
      throw new PermanentJobError(
        `Configuration invalide : OPENAI_TRANSCRIPTION_MODEL="${model}" ne supporte pas la ` +
          `diarisation. Le pipeline appel -> exercice exige "${DIARIZATION_TRANSCRIPTION_MODEL}".`,
      );
    }
    const startedAt = Date.now();

    const form = new FormData();
    const blob = new Blob([new Uint8Array(bytes)], {
      type: input.mimeType || "application/octet-stream",
    });
    const language = input.language || "fr";
    form.append("file", blob, filenameFromKey(input.storageKey));
    form.append("model", model);
    form.append("response_format", "diarized_json");
    // Uniquement supporté par le modèle diarisant (400 sur les autres).
    form.append("chunking_strategy", "auto");
    form.append("language", language);

    // Timeout dédié à la transcription. La valeur par défaut d'undici pour
    // headersTimeout / bodyTimeout est de 300 s : trop court pour un fichier
    // audio de plusieurs Mo (OpenAI met plusieurs minutes à répondre). Sans
    // override, le worker voyait en prod un `retry_scheduled` toutes les
    // ~5 min sur AUCUN statut HTTP -- c'était undici qui coupait.
    const timeoutMs = serverConfig.worker.transcriptionTimeoutMs;
    // Dispatcher local (jamais installé globalement) : les autres appels
    // OpenAI et le provider Realtime gardent le comportement par défaut.
    // maxRetries / RetryHandler d'undici NE sont PAS activés : la file
    // ProcessingJob est la seule autorité de rejeu (pas de retries nichés).
    const dispatcher = new Agent({
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
      connectTimeout: 10_000,
    });
    const outerSignal = AbortSignal.timeout(timeoutMs);

    // Modèle effectif et paramètres tracés juste avant l'appel : rend
    // immédiatement lisible, sur un timeout ou un 400, ce qui a été envoyé.
    log.info("transcription.request_started", {
      model,
      responseFormat: "diarized_json",
      chunkingStrategy: "auto",
      language,
      bytes: bytes.length,
      timeoutMs,
    });

    let data: {
      language?: string;
      duration?: number;
      text?: string;
      segments?: Array<{
        id?: number | string;
        speaker?: string;
        start?: number;
        end?: number;
        text?: string;
        confidence?: number;
        avg_logprob?: number;
      }>;
    };
    let requestId: string | undefined;
    try {
      let res: Response;
      try {
        res = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${serverConfig.openaiApiKey}` },
          body: form,
          signal: outerSignal,
          // `dispatcher` n'est pas dans le lib.dom.d.ts standard mais Node le
          // reconnaît (undici sous-jacent). Cast local pour éviter un any global.
          ...({ dispatcher } as { dispatcher: Agent }),
        });
      } catch (err) {
        const elapsedMs = Date.now() - startedAt;
        if (isAbortLikeError(err)) {
          log.warn("transcription.request_timeout", {
            model,
            timeoutMs,
            elapsedMs,
            errorName: err instanceof Error ? err.name : "Unknown",
            errorMessage: safeErrorMessage(err),
          });
          throw new TranscriptionTimeoutError(
            `Transcription OpenAI interrompue avant réponse (timeout=${timeoutMs} ms, ` +
              `elapsed=${elapsedMs} ms). Aucune réponse HTTP reçue.`,
            timeoutMs,
            elapsedMs,
          );
        }
        log.error("transcription.request_failed", {
          model,
          timeoutMs,
          elapsedMs,
          errorName: err instanceof Error ? err.name : "Unknown",
          errorMessage: safeErrorMessage(err),
        });
        throw err;
      }

      requestId = res.headers.get("x-request-id") ?? undefined;

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        log.error("transcription.openai_error", {
          status: res.status,
          model,
          elapsedMs: Date.now() - startedAt,
          requestId,
          detail: safeErrorMessage(detail),
        });
        // 400/401/403/422 = requête invalide (modèle, paramètre, clé) : inutile
        // de rejouer. 429/5xx restent rejouables avec backoff.
        throw httpFailureToError(
          res.status,
          `OpenAI transcription error ${res.status} (model=${model})`,
        );
      }

      data = (await res.json()) as typeof data;
    } finally {
      // Toujours libérer les connexions, même en cas d'erreur au parsing JSON,
      // pour ne pas laisser fuir de sockets au fil des retries.
      await dispatcher.close().catch(() => undefined);
    }

    const rawSegments = data.segments ?? [];
    const segments: DiarizedSegment[] = rawSegments
      .filter((s) => typeof s.text === "string" && s.text.trim().length > 0)
      .map((s) => ({
        speakerId: (s.speaker ?? "speaker_0").toString(),
        startMs: Math.max(0, Math.round((s.start ?? 0) * 1000)),
        endMs: Math.max(0, Math.round((s.end ?? s.start ?? 0) * 1000)),
        text: String(s.text).trim(),
        confidence:
          typeof s.confidence === "number"
            ? s.confidence
            : typeof s.avg_logprob === "number"
              ? Math.max(0, Math.min(1, Math.exp(s.avg_logprob)))
              : undefined,
      }));

    if (segments.length === 0) {
      throw new Error("Transcription vide : aucun segment exploitable renvoyé par OpenAI.");
    }

    const durationMs = Date.now() - startedAt;
    log.info("transcription.request_completed", {
      model,
      durationMs,
      requestId,
      segmentCount: segments.length,
    });

    return {
      language: data.language || input.language || "fr",
      segments,
      provider: "openai",
      model,
    };
  }
}

function filenameFromKey(key: string): string {
  const base = key.split("/").pop() || "audio";
  return /\.[a-z0-9]{2,4}$/i.test(base) ? base : `${base}.mp3`;
}

// ---- Attribution des locuteurs --------------------------------------------
const SPEAKER_ATTRIBUTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["commercialSpeakerId", "customerSpeakerId", "confidence", "rationale"],
  properties: {
    commercialSpeakerId: { type: ["string", "null"] },
    customerSpeakerId: { type: ["string", "null"] },
    confidence: { type: "number" },
    rationale: { type: "string" },
  },
} as const;

export class OpenAISpeakerAttributionProvider implements SpeakerAttributionProvider {
  async attribute(input: {
    segments: DiarizedSegment[];
    language: string;
    seed: string;
  }): Promise<SpeakerAttributionResult> {
    const speakers = Array.from(new Set(input.segments.map((s) => s.speakerId)));
    const transcript = input.segments
      .slice(0, 60)
      .map((s) => `[${s.speakerId}] ${s.text}`)
      .join("\n");

    const system = [
      "Tu analyses un transcript d'appel commercial DIARISÉ (chaque ligne préfixée par l'identifiant du locuteur).",
      "Objectif : identifier lequel des locuteurs est le COMMERCIAL (celui qui vend / mène l'appel) et lequel est le CLIENT/PROSPECT.",
      "Fonde-toi uniquement sur le texte (présentation, argumentaire, questions de qualification côté commercial ; réponses, objections côté client).",
      "Si tu n'es pas certain, baisse la confiance. commercialSpeakerId et customerSpeakerId doivent être des identifiants présents dans le transcript, ou null si indéterminable.",
      "Respecte STRICTEMENT le schéma JSON.",
    ].join("\n");
    const user = [
      `Langue : ${input.language}`,
      `Identifiants de locuteurs présents : ${speakers.join(", ")}`,
      "",
      "Transcript :",
      transcript,
    ].join("\n");

    const parsed = await callResponsesApi({
      model: serverConfig.models.analysis,
      system,
      user,
      schemaName: "speaker_attribution",
      schema: SPEAKER_ATTRIBUTION_SCHEMA as unknown as Record<string, unknown>,
      logEvent: "speaker_attribution.completed",
    });
    return SpeakerAttributionSchema.parse(parsed);
  }
}

// ---- Anonymisation ---------------------------------------------------------
const ANONYMIZATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["segments", "entities"],
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["idx", "anonymizedText"],
        properties: {
          idx: { type: "integer" },
          anonymizedText: { type: "string" },
        },
      },
    },
    entities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["original", "placeholder", "type"],
        properties: {
          original: { type: "string" },
          placeholder: { type: "string" },
          type: { type: "string" },
        },
      },
    },
  },
} as const;

export class OpenAIAnonymizationProvider implements AnonymizationProvider {
  async anonymize(input: {
    segments: Array<{ idx: number; speakerId: string; role: string; text: string }>;
    language: string;
    seed: string;
  }): Promise<AnonymizationResult> {
    const system = [
      "Tu es un moteur d'anonymisation RGPD pour des transcripts d'appels commerciaux.",
      "Remplace toute donnée personnelle ou identifiante par une variable générique entre crochets :",
      "- Noms de personnes -> [CLIENTE] (client/prospect) ou [COMMERCIAL] (vendeur).",
      "- Entreprises -> [ENTREPRISE]. Villes/adresses -> [VILLE] / [ADRESSE].",
      "- Téléphones -> [TELEPHONE]. Emails -> [EMAIL]. Numéros de contrat/référence -> [REFERENCE].",
      "- Montants précis restant utiles pédagogiquement peuvent être conservés ou arrondis.",
      "Ne change RIEN d'autre au texte (garde le sens, les objections, les arguments).",
      "Renvoie un objet par segment (même idx) et la table des entités remplacées.",
      "Respecte STRICTEMENT le schéma JSON.",
    ].join("\n");
    const user = [
      `Langue : ${input.language}`,
      "Segments (idx | rôle | texte) :",
      ...input.segments.map((s) => `${s.idx} | ${s.role} | ${s.text}`),
    ].join("\n");

    const parsed = await callResponsesApi({
      model: serverConfig.models.analysis,
      system,
      user,
      schemaName: "anonymization",
      schema: ANONYMIZATION_SCHEMA as unknown as Record<string, unknown>,
      logEvent: "anonymization.completed",
    });
    return AnonymizationSchema.parse(parsed);
  }
}

// ---- Analyse structurée d'appel -------------------------------------------
const STR_ARRAY = { type: "array", items: { type: "string" } } as const;
const IMPORTANCE_ENUM = { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] } as const;

const CALL_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "callType",
    "callTypeConfidence",
    "relationshipStage",
    "language",
    "summary",
    "customerProfile",
    "commercialStrategy",
    "facts",
    "inferences",
    "ambiguities",
    "referenceSuitability",
  ],
  properties: {
    callType: { type: "string", enum: CALL_TYPE_ENUM },
    callTypeConfidence: { type: "number" },
    relationshipStage: {
      type: "string",
      enum: ["NEW", "EXISTING", "RENEWAL", "UNKNOWN"],
    },
    language: { type: "string" },
    summary: { type: "string" },
    customerProfile: {
      type: "object",
      additionalProperties: false,
      required: ["role", "context", "needs", "objections", "signals"],
      properties: {
        role: { type: "string" },
        context: { type: "string" },
        needs: STR_ARRAY,
        objections: STR_ARRAY,
        signals: STR_ARRAY,
      },
    },
    commercialStrategy: {
      type: "object",
      additionalProperties: false,
      required: ["objective", "outcome", "retainedPractices", "missedOpportunities"],
      properties: {
        objective: { type: "string" },
        outcome: { type: "string" },
        retainedPractices: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label", "description", "evidenceSegmentIds", "importance"],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              description: { type: "string" },
              evidenceSegmentIds: STR_ARRAY,
              importance: IMPORTANCE_ENUM,
            },
          },
        },
        missedOpportunities: STR_ARRAY,
      },
    },
    facts: STR_ARRAY,
    inferences: STR_ARRAY,
    ambiguities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "question", "importance"],
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          importance: IMPORTANCE_ENUM,
        },
      },
    },
    referenceSuitability: {
      type: "object",
      additionalProperties: false,
      required: ["score", "usable", "rationale"],
      properties: {
        score: { type: "integer" },
        usable: { type: "boolean" },
        rationale: { type: "string" },
      },
    },
  },
} as const;

export class OpenAICallAnalysisProvider implements CallAnalysisProvider {
  async analyze(input: {
    segments: Array<{ idx: number; role: string; text: string }>;
    language: string;
    seed: string;
    clarifications?: Record<string, string>;
  }): Promise<CallAnalysisResult> {
    const system = [
      "Tu es un analyste expert de la vente par téléphone.",
      "Tu analyses un transcript d'appel ANONYMISÉ (les PII sont déjà remplacées par des variables).",
      "Règles STRICTES :",
      "- N'invente AUCUNE information absente du transcript.",
      "- Sépare clairement les FAITS (facts, présents littéralement) des INFÉRENCES (inferences, déduites).",
      "- Chaque bonne pratique retenue (retainedPractices) doit citer les idx de segments-preuves (evidenceSegmentIds).",
      "- N'infère JAMAIS d'attributs sensibles (origine, religion, santé, opinions, orientation).",
      "- Classe le type d'appel et estime la confiance. Précise le stade de relation (NEW/EXISTING/RENEWAL/UNKNOWN).",
      "- Note l'aptitude à servir de référence pédagogique (referenceSuitability, score 0-100).",
      "- Liste les ambiguïtés bloquantes en importance HIGH uniquement si une clarification humaine est indispensable.",
      "- Réponds en " + (input.language === "fr" ? "français" : input.language) + ".",
      "- Respecte STRICTEMENT le schéma JSON.",
    ].join("\n");

    const clar = input.clarifications
      ? Object.entries(input.clarifications)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join("\n")
      : "(aucune)";

    const user = [
      `Langue : ${input.language}`,
      "Clarifications déjà fournies par le manager :",
      clar,
      "",
      "Transcript anonymisé (idx | rôle | texte) :",
      ...input.segments.map((s) => `${s.idx} | ${s.role} | ${s.text}`),
    ].join("\n");

    const parsed = await callResponsesApi({
      model: serverConfig.models.analysis,
      system,
      user,
      schemaName: "call_analysis",
      schema: CALL_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
      reasoningEffort: serverConfig.models.analysisReasoningEffort,
      logEvent: "analysis.completed",
    });
    return CallAnalysisResultSchema.parse(parsed);
  }
}

// ---- LOT Q3A : analyse coaching d'un appel réel ----------------------------
const REAL_CALL_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "overallScore",
    "skillScores",
    "keyMoments",
    "dialoguePassages",
    "why",
    "metrics",
    "weakSkillKeys",
  ],
  properties: {
    summary: { type: "string" },
    overallScore: { type: ["integer", "null"] },
    skillScores: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "key",
          "label",
          "score",
          "maxScore",
          "rationale",
          "evidence",
          "recommendation",
        ],
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          score: { type: "integer" },
          maxScore: { type: "integer" },
          rationale: { type: "string" },
          evidence: { type: "string" },
          recommendation: { type: "string" },
        },
      },
    },
    keyMoments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "quote", "atMs", "explanation"],
        properties: {
          role: { type: "string" },
          quote: { type: "string" },
          atMs: { type: "integer" },
          explanation: { type: "string" },
        },
      },
    },
    dialoguePassages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "role",
          "atMs",
          "content",
          "explanation",
          "suggestedReformulation",
        ],
        properties: {
          role: { type: "string" },
          atMs: { type: "integer" },
          content: { type: "string" },
          explanation: { type: "string" },
          suggestedReformulation: { type: ["string", "null"] },
        },
      },
    },
    why: { type: "array", items: { type: "string" } },
    metrics: {
      type: "object",
      additionalProperties: false,
      required: ["talkRatio", "openQuestionsCount", "firstClosingAttemptMs"],
      properties: {
        talkRatio: { type: ["number", "null"] },
        openQuestionsCount: { type: ["integer", "null"] },
        firstClosingAttemptMs: { type: ["integer", "null"] },
      },
    },
    weakSkillKeys: { type: "array", items: { type: "string" } },
  },
} as const;

export class OpenAIRealCallAnalysisProvider implements RealCallAnalysisProvider {
  async analyze(input: {
    segments: Array<{
      idx: number;
      role: string;
      text: string;
      startMs: number;
      endMs: number;
    }>;
    language: string;
    seed: string;
  }): Promise<RealCallAnalysisResult> {
    const system = [
      "Tu es un coach expert de la vente par téléphone.",
      "Tu analyses un transcript d'appel RÉEL ANONYMISÉ.",
      "Règles STRICTES :",
      "- N'invente AUCUNE information absente du transcript.",
      "- Si une métrique n'est pas mesurable, renvoie null (jamais 0 inventé).",
      "- overallScore peut être null si tu ne peux pas le calculer fiablement.",
      "- skillScores : clés stables snake/kebab-free (ex: decouverte, ecoute).",
      "- weakSkillKeys : sous-ensemble des skillScores.key réellement faibles.",
      "- dialoguePassages : contenu anonymisé uniquement.",
      "- Réponds en " + (input.language === "fr" ? "français" : input.language) + ".",
      "- Respecte STRICTEMENT le schéma JSON.",
    ].join("\n");

    const user = [
      `Langue : ${input.language}`,
      "Transcript anonymisé (idx | rôle | startMs | texte) :",
      ...input.segments.map(
        (s) => `${s.idx} | ${s.role} | ${s.startMs} | ${s.text}`,
      ),
    ].join("\n");

    const parsed = await callResponsesApi({
      model: serverConfig.models.analysis,
      system,
      user,
      schemaName: "real_call_analysis",
      schema: REAL_CALL_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
      reasoningEffort: serverConfig.models.analysisReasoningEffort,
      logEvent: "real_call_analysis.completed",
    });
    return RealCallAnalysisResultSchema.parse(parsed);
  }
}

// ---- Génération de scénario ------------------------------------------------
const SCENARIO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "callType",
    "level",
    "offer",
    "objective",
    "prospectProfile",
    "initialSituation",
    "personality",
    "traineeBrief",
    "relationshipHistory",
    "aiProspect",
    "allowedObjections",
    "secretInfos",
    "successConditions",
    "failureConditions",
    "expectedNextSteps",
    "targetSkills",
    "coachingReference",
    "rubric",
    "targetDurationSec",
  ],
  properties: {
    name: { type: "string" },
    callType: { type: "string", enum: CALL_TYPE_ENUM },
    level: { type: "string", enum: ["FACILE", "MOYEN", "DIFFICILE"] },
    offer: { type: "string" },
    objective: { type: "string" },
    prospectProfile: { type: "string" },
    initialSituation: { type: "string" },
    personality: { type: "string" },
    traineeBrief: { type: "string" },
    relationshipHistory: { type: "string" },
    aiProspect: {
      type: "object",
      additionalProperties: false,
      required: ["persona", "behaviorRules", "prohibitedRevelations", "openingLine"],
      properties: {
        persona: { type: "string" },
        behaviorRules: STR_ARRAY,
        prohibitedRevelations: STR_ARRAY,
        openingLine: { type: "string" },
      },
    },
    allowedObjections: STR_ARRAY,
    secretInfos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "answer"],
        properties: { question: { type: "string" }, answer: { type: "string" } },
      },
    },
    successConditions: { type: "string" },
    failureConditions: { type: "string" },
    expectedNextSteps: STR_ARRAY,
    targetSkills: STR_ARRAY,
    coachingReference: STR_ARRAY,
    rubric: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "label", "weight", "description", "observableSignals", "sourcePracticeIds"],
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          weight: { type: "integer" },
          description: { type: "string" },
          observableSignals: STR_ARRAY,
          sourcePracticeIds: STR_ARRAY,
        },
      },
    },
    targetDurationSec: { type: "integer" },
  },
} as const;

export class OpenAIScenarioGenerationProvider implements ScenarioGenerationProvider {
  async generate(input: {
    analysis: CallAnalysisResult;
    language: string;
    seed: string;
  }): Promise<ScenarioGenerationResult> {
    const system = [
      "Tu conçois un EXERCICE de simulation d'appel commercial à partir de l'analyse d'un appel réel (déjà anonymisée).",
      "Objectif : produire un scénario FICTIF mais ÉQUIVALENT, travaillant les mêmes compétences, SANS reproduire littéralement l'appel modèle.",
      "Règles STRICTES :",
      "- Aucune donnée personnelle réelle ne doit apparaître (invente des noms/contexte fictifs cohérents).",
      "- Respecte le TYPE d'appel et le STADE de relation : si le client est EXISTANT, le prospect IA doit se comporter comme un client connu (historique, familiarité), pas comme un prospect froid.",
      "- aiProspect.behaviorRules et prohibitedRevelations pilotent l'IA prospect en simulation temps réel.",
      "- La grille (rubric) doit refléter les compétences ciblées ; chaque critère relie des sourcePracticeIds issus de l'analyse quand c'est pertinent.",
      "- Les pondérations de la grille DOIVENT totaliser 100 (sinon elles seront renormalisées).",
      "- Réponds en " + (input.language === "fr" ? "français" : input.language) + ".",
      "- Respecte STRICTEMENT le schéma JSON.",
    ].join("\n");

    const a = input.analysis;
    const practices = a.commercialStrategy.retainedPractices
      .map((p) => `- [${p.id}] (${p.importance}) ${p.label}: ${p.description}`)
      .join("\n");
    const user = [
      `Langue : ${input.language}`,
      `Type d'appel détecté : ${a.callType} (confiance ${a.callTypeConfidence})`,
      `Stade de relation : ${a.relationshipStage}`,
      `Synthèse : ${a.summary}`,
      `Objectif commercial : ${a.commercialStrategy.objective}`,
      `Issue : ${a.commercialStrategy.outcome}`,
      "",
      "Profil client :",
      `- Rôle : ${a.customerProfile.role}`,
      `- Contexte : ${a.customerProfile.context}`,
      `- Besoins : ${a.customerProfile.needs.join("; ")}`,
      `- Objections : ${a.customerProfile.objections.join("; ")}`,
      "",
      "Bonnes pratiques retenues (à faire travailler) :",
      practices || "(aucune)",
      "",
      "Construis l'exercice équivalent conforme au schéma. targetDurationSec entre 180 et 900.",
    ].join("\n");

    const parsed = await callResponsesApi({
      model: serverConfig.models.scenario,
      system,
      user,
      schemaName: "scenario_generation",
      schema: SCENARIO_SCHEMA as unknown as Record<string, unknown>,
      logEvent: "scenario.generated",
    });
    const result = ScenarioGenerationResultSchema.parse(parsed);
    return normalizeScenarioWeights(result);
  }
}

/** Normalise les pondérations de la grille pour totaliser exactement 100. */
export function normalizeScenarioWeights(
  result: ScenarioGenerationResult,
): ScenarioGenerationResult {
  const total = result.rubric.reduce((s, c) => s + (c.weight || 0), 0);
  if (result.rubric.length === 0) return result;
  if (total === 100) return result;

  let rubric: ScenarioGenerationResult["rubric"];
  if (total <= 0) {
    const base = Math.floor(100 / result.rubric.length);
    rubric = result.rubric.map((c) => ({ ...c, weight: base }));
  } else {
    rubric = result.rubric.map((c) => ({
      ...c,
      weight: Math.max(0, Math.round((c.weight / total) * 100)),
    }));
  }
  // Ajuste le reliquat d'arrondi sur le critère de plus fort poids.
  const sum = rubric.reduce((s, c) => s + c.weight, 0);
  const diff = 100 - sum;
  if (diff !== 0) {
    let maxIdx = 0;
    for (let i = 1; i < rubric.length; i++) {
      const cur = rubric[i];
      const best = rubric[maxIdx];
      if (cur && best && cur.weight > best.weight) maxIdx = i;
    }
    const target = rubric[maxIdx];
    if (target) {
      rubric[maxIdx] = { ...target, weight: Math.max(0, target.weight + diff) };
    }
  }
  return { ...result, rubric };
}
