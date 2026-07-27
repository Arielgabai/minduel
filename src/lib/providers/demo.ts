import "server-only";
import { seededRandom } from "../utils";
import { serverConfig } from "../config";
import { CallType } from "../enums";
import type {
  EvaluationProvider,
  EvaluationInput,
  EvaluationResult,
  KnowledgeExtractionProvider,
  KnowledgeDraft,
  RealtimeSessionProvider,
  RealtimeClientSecret,
  TranscriptionProvider,
  TranscriptSegment,
  DiarizedTranscriptionProvider,
  DiarizedTranscription,
  DiarizedSegment,
  SpeakerAttributionProvider,
  SpeakerAttributionResult,
  AnonymizationProvider,
  AnonymizationResult,
  CallAnalysisProvider,
  CallAnalysisResult,
  ScenarioGenerationProvider,
  ScenarioGenerationResult,
} from "./types";
import { normalizeScenarioWeights } from "./openai";

// ------------------------------------------------------------------
// Transcription démo : génère un transcript diarisé plausible et
// DÉTERMINISTE à partir d'un seed (l'id de l'enregistrement).
// ------------------------------------------------------------------
const DEMO_DIALOGUES: Array<[string, string]> = [
  ["Allô, oui ?", "Bonjour, Julie Martin de la société Novéo, je vous appelle au sujet de votre facture d'énergie."],
  ["Écoutez je n'ai pas trop le temps là.", "Je comprends, je serai brève. En deux minutes je vous montre comment réduire votre facture de 20%."],
  ["On m'a déjà appelé pour ça mille fois.", "C'est vrai que le secteur est saturé. La différence chez nous, c'est qu'on part de votre consommation réelle, pas d'une estimation."],
  ["Et c'est quoi le piège ?", "Aucun engagement la première année, vous pouvez arrêter quand vous voulez. Puis-je vous poser deux questions sur votre situation ?"],
  ["Bon, allez-y.", "Vous êtes plutôt propriétaire ou locataire, et vous chauffez au gaz ou à l'électrique ?"],
  ["Propriétaire, tout électrique.", "Parfait, c'est exactement le profil où on obtient les meilleurs résultats. Seriez-vous disponible jeudi pour un point de 15 minutes ?"],
  ["Peut-être, envoyez-moi d'abord un mail.", "Très bien, je vous envoie un récapitulatif et je vous rappelle jeudi en fin de matinée. Merci pour votre temps."],
];

class DemoTranscriptionProvider implements TranscriptionProvider {
  async transcribe(input: {
    storageKey: string | null;
    language: string;
    seed: string;
  }): Promise<{ language: string; segments: TranscriptSegment[] }> {
    const rnd = seededRandom(input.seed);
    const segments: TranscriptSegment[] = [];
    let t = 1500 + Math.floor(rnd() * 1000);
    for (const [prospect, agent] of DEMO_DIALOGUES) {
      const pDur = 1800 + Math.floor(rnd() * 1500);
      segments.push({ speaker: "PROSPECT", text: prospect, startMs: t, endMs: t + pDur });
      t += pDur + 400;
      const aDur = 2600 + Math.floor(rnd() * 2200);
      segments.push({ speaker: "AGENT", text: agent, startMs: t, endMs: t + aDur });
      t += aDur + 500;
    }
    return { language: input.language || "fr", segments };
  }
}

// ------------------------------------------------------------------
// Extraction de connaissances démo : dérive des KnowledgeItem traçables
// (avec extrait source + timestamps) à partir du transcript.
// ------------------------------------------------------------------
class DemoKnowledgeExtractionProvider implements KnowledgeExtractionProvider {
  async extract(input: {
    segments: TranscriptSegment[];
    seed: string;
  }): Promise<KnowledgeDraft[]> {
    const rnd = seededRandom(input.seed + "-kn");
    const drafts: KnowledgeDraft[] = [];
    const find = (needle: string) =>
      input.segments.find((s) => s.text.toLowerCase().includes(needle));

    const objection = find("mille fois") ?? input.segments[2];
    if (objection) {
      drafts.push({
        type: "OBJECTION",
        title: "« On m'a déjà appelé pour ça »",
        content:
          "Objection de saturation fréquente. Le prospect a déjà été sollicité par des concurrents.",
        sourceExcerpt: objection.text,
        startMs: objection.startMs,
        endMs: objection.endMs,
        confidence: 0.82 + rnd() * 0.1,
      });
    }
    const rebond = find("secteur est saturé");
    if (rebond) {
      drafts.push({
        type: "GOOD_PRACTICE",
        title: "Rebond sur l'objection de saturation",
        content:
          "Reconnaître la saturation du marché puis différencier par la donnée réelle de consommation.",
        sourceExcerpt: rebond.text,
        startMs: rebond.startMs,
        endMs: rebond.endMs,
        confidence: 0.88,
      });
    }
    const decouverte = find("propriétaire ou locataire");
    if (decouverte) {
      drafts.push({
        type: "DISCOVERY_QUESTION",
        title: "Questions de qualification propriétaire / énergie",
        content:
          "Deux questions ouvertes clés pour qualifier : statut d'occupation et type de chauffage.",
        sourceExcerpt: decouverte.text,
        startMs: decouverte.startMs,
        endMs: decouverte.endMs,
        confidence: 0.9,
      });
    }
    const piege = find("c'est quoi le piège");
    if (piege) {
      drafts.push({
        type: "OBJECTION",
        title: "« C'est quoi le piège ? »",
        content:
          "Méfiance sur l'engagement. Rassurer sur l'absence d'engagement la première année.",
        sourceExcerpt: piege.text,
        startMs: piege.startMs,
        endMs: piege.endMs,
        confidence: 0.79,
      });
    }
    const cloture = find("jeudi");
    if (cloture) {
      drafts.push({
        type: "SCRIPT_STEP",
        title: "Proposer un créneau précis pour conclure",
        content:
          "Étape de conclusion : proposer un rendez-vous daté plutôt qu'une relance vague.",
        sourceExcerpt: cloture.text,
        startMs: cloture.startMs,
        endMs: cloture.endMs,
        confidence: 0.86,
      });
    }
    drafts.push({
      type: "VOCABULARY",
      title: "Vocabulaire : « consommation réelle »",
      content:
        "Expression maison à privilégier pour se différencier des estimations concurrentes.",
      sourceExcerpt: rebond?.text ?? "on part de votre consommation réelle",
      startMs: rebond?.startMs ?? 0,
      endMs: rebond?.endMs ?? 0,
      confidence: 0.75,
    });
    drafts.push({
      type: "COMPLIANCE_RULE",
      title: "Annoncer clairement l'identité et l'objet de l'appel",
      content:
        "Se présenter (nom + société) et indiquer l'objet dès l'ouverture, conformément aux bonnes pratiques.",
      sourceExcerpt: input.segments[1]?.text ?? "",
      startMs: input.segments[1]?.startMs ?? 0,
      endMs: input.segments[1]?.endMs ?? 0,
      confidence: 0.83,
    });
    return drafts;
  }
}

// ------------------------------------------------------------------
// Session Realtime démo : aucun secret réel. Indique clairement au client
// que la voix est simulée (mode démo).
// ------------------------------------------------------------------
class DemoRealtimeSessionProvider implements RealtimeSessionProvider {
  async createEphemeralSession(input: {
    instructions: string;
  }): Promise<RealtimeClientSecret> {
    return {
      demo: true,
      model: serverConfig.models.realtime,
      voice: serverConfig.models.realtimeVoice,
      instructions: input.instructions,
    };
  }
}

// ------------------------------------------------------------------
// Évaluation démo : produit un JSON structuré, cohérent et déterministe,
// fondé sur le contenu réel des tours (aucune métrique inventée non calculable).
// ------------------------------------------------------------------
class DemoEvaluationProvider implements EvaluationProvider {
  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    const rnd = seededRandom(input.seed);
    const agentTurns = input.turns.filter((t) => t.role === "AGENT");
    const prospectTurns = input.turns.filter((t) => t.role === "PROSPECT");
    const agentText = agentTurns.map((t) => t.content).join(" ").toLowerCase();

    // Signaux mesurables réellement à partir du transcript.
    const questionCount = (agentText.match(/\?/g) ?? []).length;
    const openQuestions = (
      agentText.match(/\b(comment|pourquoi|qu'est-ce|quel|quelle|combien|où|quand)\b/g) ?? []
    ).length;
    const mentionsBenefit = /(économi|réduire|gagner|avantage|bénéfice)/.test(agentText);
    const handlesObjection = /(je comprends|c'est vrai|effectivement|tout à fait)/.test(agentText);
    const proposesNextStep = /(rendez-vous|rappel|jeudi|créneau|disponible|envoie|mail)/.test(agentText);
    const introducesSelf = /(bonjour|je m'appelle|je suis|de la société|au sujet)/.test(agentText);

    const levelFactor = input.scenarioLevel === "DIFFICILE" ? 0.85 : input.scenarioLevel === "FACILE" ? 1.1 : 1;

    const scoreFor = (key: string, weight: number): number => {
      let ratio: number;
      switch (key) {
        case "accroche":
          ratio = introducesSelf ? 0.85 : 0.5;
          break;
        case "clarte":
          ratio = agentTurns.length >= 3 ? 0.8 : 0.6;
          break;
        case "decouverte":
          ratio = Math.min(1, 0.35 + openQuestions * 0.2);
          break;
        case "ecoute":
          ratio = handlesObjection ? 0.8 : 0.55;
          break;
        case "qualification":
          ratio = questionCount >= 2 ? 0.8 : 0.5;
          break;
        case "argumentation":
          ratio = mentionsBenefit ? 0.82 : 0.55;
          break;
        case "objections":
          ratio = handlesObjection && prospectTurns.length > 1 ? 0.78 : 0.5;
          break;
        case "conclusion":
          ratio = proposesNextStep ? 0.9 : 0.4;
          break;
        default:
          ratio = 0.6;
      }
      ratio = Math.max(0.2, Math.min(1, ratio * levelFactor + (rnd() - 0.5) * 0.08));
      return Math.round(weight * ratio);
    };

    const skillScores = input.rubric.map((c) => {
      const score = scoreFor(c.key, c.weight);
      return {
        key: c.key,
        label: c.label,
        score,
        maxScore: c.weight,
        rationale: rationaleFor(c.key, score, c.weight),
        evidence: evidenceFor(c.key, agentTurns),
        recommendation: recommendationFor(c.key),
      };
    });

    const overallScore = Math.min(
      100,
      skillScores.reduce((s, x) => s + x.score, 0),
    );

    const strengths: string[] = [];
    if (introducesSelf) strengths.push("Présentation claire de l'identité et de l'objet de l'appel.");
    if (mentionsBenefit) strengths.push("Bénéfice client mis en avant concrètement.");
    if (proposesNextStep) strengths.push("Proposition d'une prochaine étape précise.");

    const improvements: string[] = [];
    if (openQuestions < 2) improvements.push("Poser davantage de questions ouvertes en découverte.");
    if (!handlesObjection) improvements.push("Reformuler et reconnaître l'objection avant d'y répondre.");
    if (!proposesNextStep) improvements.push("Toujours conclure sur une prochaine étape datée.");

    return {
      overallScore,
      summary:
        overallScore >= 75
          ? "Très bon échange, structuré et orienté prochaine étape."
          : overallScore >= 55
            ? "Échange correct ; la découverte et le traitement des objections peuvent progresser."
            : "Les fondamentaux sont à renforcer, notamment la découverte et la conclusion.",
      strengths: strengths.slice(0, 3),
      improvements: improvements.slice(0, 3),
      advice: [
        "Pose au moins deux questions ouvertes avant d'argumenter.",
        "Reformule l'objection du prospect avant d'y répondre.",
      ],
      betterExample:
        "« Je comprends que vous soyez souvent sollicité. Justement, pour ne pas vous faire perdre de temps : aujourd'hui, votre facture est plutôt au-dessus ou en dessous de 100 € par mois ? »",
      keyMoments: pickKeyMoments(input.turns),
      outcome: proposesNextStep ? (rnd() > 0.5 ? "RDV" : "RAPPEL") : "REFUS",
      skillScores,
    };
  }
}

function rationaleFor(key: string, score: number, max: number): string {
  const ok = score / max >= 0.7;
  const map: Record<string, [string, string]> = {
    accroche: ["Ouverture professionnelle et cadrée.", "Ouverture à clarifier (identité/objet)."],
    clarte: ["Discours clair et fluide.", "Quelques formulations à resserrer."],
    decouverte: ["Bonne exploration du besoin.", "Découverte insuffisante avant l'argumentaire."],
    ecoute: ["Bon rebond sur les propos du prospect.", "Écoute active à renforcer."],
    qualification: ["Prospect correctement qualifié.", "Qualification incomplète."],
    argumentation: ["Argument personnalisé et pertinent.", "Argumentaire trop générique."],
    objections: ["Objections traitées avec méthode.", "Traitement des objections à structurer."],
    conclusion: ["Conclusion nette avec prochaine étape.", "Conclusion floue, pas d'engagement obtenu."],
  };
  return (map[key] ?? ["Correct.", "À améliorer."])[ok ? 0 : 1];
}

function evidenceFor(
  key: string,
  agentTurns: Array<{ content: string }>,
): string {
  const first = agentTurns[0]?.content ?? "";
  const last = agentTurns[agentTurns.length - 1]?.content ?? "";
  if (key === "accroche") return first ? `« ${first.slice(0, 90)} »` : "Aucune ouverture détectée.";
  if (key === "conclusion") return last ? `« ${last.slice(0, 90)} »` : "Aucune conclusion détectée.";
  const withQ = agentTurns.find((t) => t.content.includes("?"));
  if ((key === "decouverte" || key === "qualification") && withQ)
    return `« ${withQ.content.slice(0, 90)} »`;
  return first ? `« ${first.slice(0, 80)} »` : "—";
}

function recommendationFor(key: string): string {
  const map: Record<string, string> = {
    accroche: "Annonce ton nom, ta société et l'objet en une phrase.",
    clarte: "Fais des phrases courtes et marque des pauses.",
    decouverte: "Enchaîne 2-3 questions ouvertes avant de proposer.",
    ecoute: "Reformule ce que dit le prospect (« si je comprends bien… »).",
    qualification: "Valide budget, besoin et décideur.",
    argumentation: "Relie chaque bénéfice à un élément découvert.",
    objections: "Accueille, isole, puis réponds à l'objection.",
    conclusion: "Propose un créneau précis et confirme la suite.",
  };
  return map[key] ?? "Continue à t'entraîner sur ce point.";
}

function pickKeyMoments(
  turns: Array<{ role: string; content: string; atMs: number }>,
): Array<{ role: string; quote: string; atMs: number }> {
  const moments: Array<{ role: string; quote: string; atMs: number }> = [];
  const objection = turns.find(
    (t) => t.role === "PROSPECT" && /(pas le temps|piège|déjà|cher|non)/i.test(t.content),
  );
  if (objection) moments.push({ role: "PROSPECT", quote: objection.content, atMs: objection.atMs });
  const bestAgent = turns.find((t) => t.role === "AGENT" && t.content.includes("?"));
  if (bestAgent) moments.push({ role: "AGENT", quote: bestAgent.content, atMs: bestAgent.atMs });
  const last = [...turns].reverse().find((t) => t.role === "AGENT");
  if (last && last !== bestAgent) moments.push({ role: "AGENT", quote: last.content, atMs: last.atMs });
  return moments.slice(0, 3);
}

// ===========================================================================
// Pipeline appel -> exercice : providers DÉMO déterministes (aucun appel réseau).
// ===========================================================================

// Dialogue "client existant / relance" : sert de fixture pour tester la
// classification (EXISTING/FOLLOW_UP, jamais COLD), l'anonymisation et l'analyse.
const DEMO_MODEL_DIALOGUE: Array<{ speaker: string; text: string }> = [
  { speaker: "speaker_1", text: "Bonjour Monsieur Durand, c'est Julie Martin de la société Novéo, je vous rappelle comme convenu la semaine dernière au sujet de votre contrat." },
  { speaker: "speaker_0", text: "Ah oui bonjour Julie, oui on avait parlé du renouvellement." },
  { speaker: "speaker_1", text: "Exactement. Depuis notre installation l'an dernier vous êtes chez nous, et votre contrat arrive à échéance le mois prochain. Est-ce que tout se passe bien de votre côté ?" },
  { speaker: "speaker_0", text: "Globalement oui, mais j'ai trouvé la dernière facture un peu élevée." },
  { speaker: "speaker_1", text: "Je comprends, regardons ça ensemble. Sur votre offre actuelle on peut basculer sur le nouveau tarif fidélité qui réduirait votre mensualité d'environ 15%." },
  { speaker: "speaker_0", text: "Et je garde les mêmes services ?" },
  { speaker: "speaker_1", text: "Oui, exactement les mêmes services, avec en plus l'assistance prioritaire offerte pour les clients qui renouvellent. On se cale sur un rendez-vous jeudi pour signer ?" },
  { speaker: "speaker_0", text: "Jeudi ça me va, envoyez-moi le récapitulatif par mail à durand.marc@example.com." },
];

class DemoDiarizedTranscriptionProvider implements DiarizedTranscriptionProvider {
  async transcribeDiarized(input: {
    storageKey: string | null;
    language: string;
    mimeType?: string | null;
    seed: string;
  }): Promise<DiarizedTranscription> {
    const rnd = seededRandom(input.seed + "-diar");
    const segments: DiarizedSegment[] = [];
    let t = 1200 + Math.floor(rnd() * 800);
    for (const line of DEMO_MODEL_DIALOGUE) {
      const dur = 1800 + Math.floor(rnd() * 2200);
      segments.push({
        speakerId: line.speaker,
        startMs: t,
        endMs: t + dur,
        text: line.text,
        confidence: 0.9,
      });
      t += dur + 350;
    }
    return {
      language: input.language || "fr",
      segments,
      provider: "demo",
      model: "demo-diarize",
    };
  }
}

class DemoSpeakerAttributionProvider implements SpeakerAttributionProvider {
  async attribute(input: {
    segments: DiarizedSegment[];
    language: string;
    seed: string;
  }): Promise<SpeakerAttributionResult> {
    // Le commercial est le locuteur qui se présente ("de la société", "je vous rappelle").
    const commercialSeg = input.segments.find((s) =>
      /(de la société|je vous rappelle|je vous appelle|au sujet de votre)/i.test(s.text),
    );
    const commercialSpeakerId = commercialSeg?.speakerId ?? input.segments[0]?.speakerId ?? null;
    const customerSpeakerId =
      input.segments.map((s) => s.speakerId).find((id) => id !== commercialSpeakerId) ?? null;
    return {
      commercialSpeakerId,
      customerSpeakerId,
      confidence: 0.92,
      rationale:
        "Le locuteur qui se présente (nom + société) et mène l'appel est identifié comme commercial ; l'autre comme client.",
    };
  }
}

class DemoAnonymizationProvider implements AnonymizationProvider {
  async anonymize(input: {
    segments: Array<{ idx: number; speakerId: string; role: string; text: string }>;
    language: string;
    seed: string;
  }): Promise<AnonymizationResult> {
    const replacements: Array<[RegExp, string, string]> = [
      [/Julie Martin/gi, "[COMMERCIAL]", "NAME"],
      [/Monsieur Durand|M\. Durand|Durand Marc|Marc Durand|Durand/gi, "[CLIENTE]", "NAME"],
      [/Nov[ée]o/gi, "[ENTREPRISE]", "COMPANY"],
      [/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[EMAIL]", "EMAIL"],
      [/\b(?:0|\+33)\s?[1-9](?:[\s.-]?\d{2}){4}\b/g, "[TELEPHONE]", "PHONE"],
    ];
    const entities: AnonymizationResult["entities"] = [];
    const seen = new Set<string>();
    const segments = input.segments.map((s) => {
      let text = s.text;
      for (const [re, placeholder, type] of replacements) {
        const matches = text.match(re);
        if (matches) {
          for (const m of matches) {
            const key = m.toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              entities.push({ original: m, placeholder, type });
            }
          }
          text = text.replace(re, placeholder);
        }
      }
      return { idx: s.idx, anonymizedText: text };
    });
    return { segments, entities };
  }
}

class DemoCallAnalysisProvider implements CallAnalysisProvider {
  async analyze(input: {
    segments: Array<{ idx: number; role: string; text: string }>;
    language: string;
    seed: string;
    clarifications?: Record<string, string>;
  }): Promise<CallAnalysisResult> {
    const joined = input.segments.map((s) => s.text).join(" ").toLowerCase();
    const isExisting = /(renouvellement|renouvel|votre contrat|déjà client|installation l'an|fidélité|depuis notre)/.test(
      joined,
    );
    const callType = isExisting ? CallType.RENEWAL : CallType.COLD_PROSPECTING;
    const relationshipStage = isExisting ? "EXISTING" : "NEW";

    const findIdx = (needle: string): string[] => {
      const seg = input.segments.find((s) => s.text.toLowerCase().includes(needle));
      return seg ? [String(seg.idx)] : [];
    };

    return {
      callType,
      callTypeConfidence: isExisting ? 0.88 : 0.7,
      relationshipStage,
      language: input.language || "fr",
      summary: isExisting
        ? "Appel de relance d'un client existant en vue du renouvellement de son contrat, avec traitement d'une objection sur le tarif."
        : "Appel de prospection à froid visant à décrocher un rendez-vous.",
      customerProfile: {
        role: "Client titulaire d'un contrat arrivant à échéance",
        context:
          "Client existant globalement satisfait mais sensible au prix de sa dernière facture.",
        needs: ["Maîtriser sa mensualité", "Conserver ses services actuels"],
        objections: ["Facture jugée un peu élevée"],
        signals: ["Ouvert au renouvellement", "Demande un récapitulatif écrit"],
      },
      commercialStrategy: {
        objective: "Sécuriser le renouvellement du contrat au nouveau tarif fidélité.",
        outcome: "RDV",
        retainedPractices: [
          {
            id: "p1",
            label: "Rappel du contexte de la relation",
            description:
              "Réactive la relation existante en rappelant l'historique et l'échéance du contrat.",
            evidenceSegmentIds: findIdx("comme convenu"),
            importance: "HIGH",
          },
          {
            id: "p2",
            label: "Traitement de l'objection prix",
            description:
              "Reconnaît l'objection tarifaire puis propose une offre fidélité chiffrée.",
            evidenceSegmentIds: findIdx("je comprends"),
            importance: "HIGH",
          },
          {
            id: "p3",
            label: "Conclusion sur une prochaine étape datée",
            description: "Propose un créneau précis pour signer.",
            evidenceSegmentIds: findIdx("jeudi"),
            importance: "MEDIUM",
          },
        ],
        missedOpportunities: ["Aucune revalorisation additionnelle proposée."],
      },
      facts: [
        "Le contrat du client arrive à échéance le mois prochain.",
        "Le client trouve sa dernière facture élevée.",
        "Un rendez-vous est fixé pour signer.",
      ],
      inferences: [
        "Le client est probablement enclin à renouveler si le prix baisse.",
      ],
      ambiguities: [],
      referenceSuitability: {
        score: 82,
        usable: true,
        rationale:
          "Appel structuré illustrant plusieurs bonnes pratiques de rétention ; adapté comme exercice.",
      },
    };
  }
}

class DemoScenarioGenerationProvider implements ScenarioGenerationProvider {
  async generate(input: {
    analysis: CallAnalysisResult;
    language: string;
    seed: string;
  }): Promise<ScenarioGenerationResult> {
    const a = input.analysis;
    const existing = a.relationshipStage === "EXISTING" || a.relationshipStage === "RENEWAL";
    const result: ScenarioGenerationResult = {
      name: existing
        ? "Renouvellement client — objection tarifaire"
        : "Prospection à froid — prise de rendez-vous",
      callType: a.callType,
      level: "MOYEN",
      offer: "Contrat de services [ENTREPRISE] avec offre fidélité",
      objective: a.commercialStrategy.objective || "Sécuriser le renouvellement du contrat.",
      prospectProfile: a.customerProfile.role,
      initialSituation: existing
        ? "Vous rappelez un client existant dont le contrat arrive à échéance. Il vous connaît déjà."
        : "Vous appelez un prospect qui ne vous connaît pas encore.",
      personality: "Cordial mais attentif au budget.",
      traineeBrief: existing
        ? "Vous êtes commercial chez [ENTREPRISE]. Vous rappelez un client fidèle pour renouveler son contrat. Il a trouvé sa dernière facture élevée : rassurez-le et proposez l'offre fidélité, puis fixez un rendez-vous de signature."
        : "Vous devez décrocher un rendez-vous auprès d'un nouveau prospect.",
      relationshipHistory: existing
        ? "Client depuis un an, installation réalisée l'an dernier, relation cordiale, une relance déjà convenue la semaine passée."
        : "Aucun historique : premier contact.",
      aiProspect: {
        persona: existing
          ? "Client existant satisfait mais vigilant sur le prix ; connaît déjà le commercial et l'entreprise."
          : "Prospect pressé, sollicité par de nombreux concurrents.",
        behaviorRules: existing
          ? [
              "Se comporter en client qui connaît déjà l'entreprise (pas de re-présentation formelle).",
              "Mentionner spontanément que la dernière facture semblait élevée.",
              "Accepter un rendez-vous si une baisse de tarif crédible est proposée.",
            ]
          : [
              "Rester méfiant tant que la valeur n'est pas démontrée.",
              "Objecter le manque de temps.",
            ],
        prohibitedRevelations: [
          "Ne jamais révéler de vraies données personnelles.",
          "Ne pas donner immédiatement son accord sans objection sur le prix.",
        ],
        openingLine: existing ? "Ah oui bonjour, on avait parlé du renouvellement." : "Allô, oui ?",
      },
      allowedObjections: a.customerProfile.objections.length
        ? a.customerProfile.objections
        : ["C'est un peu cher.", "Je n'ai pas le temps."],
      secretInfos: [
        {
          question: "Quel est le budget mensuel cible du client ?",
          answer: "Il souhaite rester sous sa mensualité actuelle, idéalement 15% de moins.",
        },
      ],
      successConditions: "Obtenir un rendez-vous de signature au tarif fidélité.",
      failureConditions: "Le client raccroche sans engagement ou reporte sans date.",
      expectedNextSteps: ["Envoyer un récapitulatif écrit", "Fixer un rendez-vous daté"],
      targetSkills: ["Rétention", "Traitement de l'objection prix", "Conclusion"],
      coachingReference: a.commercialStrategy.retainedPractices.map((p) => p.label),
      rubric: [
        {
          key: "reactivation",
          label: "Réactivation de la relation",
          weight: 20,
          description: "Rappelle l'historique et le contexte du client existant.",
          observableSignals: ["Cite l'échéance du contrat", "Rappelle la relation"],
          sourcePracticeIds: ["p1"],
        },
        {
          key: "decouverte",
          label: "Découverte des besoins actuels",
          weight: 20,
          description: "Vérifie la satisfaction et fait émerger l'objection.",
          observableSignals: ["Pose une question ouverte sur la satisfaction"],
          sourcePracticeIds: [],
        },
        {
          key: "objections",
          label: "Traitement de l'objection prix",
          weight: 25,
          description: "Reconnaît puis répond avec une offre chiffrée.",
          observableSignals: ["Reformule l'objection", "Propose un tarif fidélité"],
          sourcePracticeIds: ["p2"],
        },
        {
          key: "argumentation",
          label: "Valorisation de l'offre fidélité",
          weight: 15,
          description: "Met en avant les bénéfices du renouvellement.",
          observableSignals: ["Mentionne l'assistance prioritaire offerte"],
          sourcePracticeIds: [],
        },
        {
          key: "conclusion",
          label: "Conclusion et prochaine étape",
          weight: 20,
          description: "Propose un rendez-vous daté pour signer.",
          observableSignals: ["Propose un créneau précis"],
          sourcePracticeIds: ["p3"],
        },
      ],
      targetDurationSec: 420,
    };
    return normalizeScenarioWeights(result);
  }
}

export const demoTranscription = new DemoTranscriptionProvider();
export const demoKnowledgeExtraction = new DemoKnowledgeExtractionProvider();
export const demoRealtime = new DemoRealtimeSessionProvider();
export const demoEvaluation = new DemoEvaluationProvider();
export const demoDiarizedTranscription = new DemoDiarizedTranscriptionProvider();
export const demoSpeakerAttribution = new DemoSpeakerAttributionProvider();
export const demoAnonymization = new DemoAnonymizationProvider();
export const demoCallAnalysis = new DemoCallAnalysisProvider();
export const demoScenarioGeneration = new DemoScenarioGenerationProvider();
