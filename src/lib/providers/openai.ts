import "server-only";
import { serverConfig } from "../config";
import { log, safeErrorMessage } from "../log";
import { EvaluationResultSchema } from "./schemas";
import type {
  EvaluationProvider,
  EvaluationInput,
  EvaluationResult,
  RealtimeSessionProvider,
  RealtimeClientSecret,
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
function buildEvaluationPrompt(input: EvaluationInput): {
  system: string;
  user: string;
} {
  const system = [
    "Tu es un coach expert en téléprospection et vente par téléphone.",
    "Tu évalues un appel simulé entre un TÉLÉPRO (l'agent en formation) et un PROSPECT (client simulé).",
    "Règles STRICTES :",
    "- Évalue UNIQUEMENT à partir du transcript fourni.",
    "- N'invente aucun comportement vocal non mesurable (ton, débit) qui ne ressort pas du texte.",
    "- Chaque critique doit s'appuyer sur une preuve (courte citation) quand elle existe.",
    "- Ne pénalise pas une information que le prospect n'a jamais permis de découvrir.",
    "- Produis des conseils concrets et actionnables, en français.",
    "- Respecte STRICTEMENT le schéma JSON demandé.",
    "- Pour chaque critère de la grille, renvoie un objet skillScores avec la MÊME clé 'key'.",
    "- score doit être compris entre 0 et maxScore (la pondération du critère).",
  ].join("\n");

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

  const user = [
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

  return { system, user };
}
