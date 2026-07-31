import "server-only";
import { parseJson, seededRandom } from "./utils";
import {
  buildProspectPersona,
  type ApprovedKnowledge,
  type ScenarioForSim,
} from "./prospectPersona";

export type { ApprovedKnowledge, ScenarioForSim };
export { buildProspectPersona };

// ------------------------------------------------------------------
// Moteur de réponse démo : produit une réplique de prospect déterministe
// selon le niveau et le contenu du message de l'appelant.
// ------------------------------------------------------------------
interface DemoState {
  turnIndex: number;
  receptivity: number; // 0..1
}

const OPENERS: Record<string, string> = {
  FACILE: "Allô, oui bonjour ?",
  MOYEN: "Oui allô ? Qui est-ce ?",
  DIFFICILE: "Oui ? Écoutez je suis en pleine réunion, faites vite.",
};

export function demoProspectOpener(level: string): string {
  return OPENERS[level] ?? OPENERS.MOYEN!;
}

export function demoProspectReply(
  scenario: ScenarioForSim,
  history: Array<{ role: string; content: string }>,
  agentMessage: string,
  seed: string,
): { content: string; shouldEnd: boolean; outcome: string | null } {
  const rnd = seededRandom(seed + ":" + history.length);
  const msg = agentMessage.toLowerCase();
  const agentTurns = history.filter((h) => h.role === "AGENT").length;

  const listens = /(je comprends|c'est vrai|effectivement|si je comprends)/.test(msg);
  const asksOpen = /(comment|pourquoi|qu'est-ce|quel|quelle|combien|est-ce que|seriez-vous|êtes-vous)/.test(msg) && msg.includes("?");
  const proposesMeeting = /(rendez-vous|jeudi|créneau|disponible|rappel|rappeler|mail|envoie)/.test(msg);

  // Réceptivité évolutive.
  const state: DemoState = { turnIndex: agentTurns, receptivity: 0.4 };
  state.receptivity += listens ? 0.2 : 0;
  state.receptivity += asksOpen ? 0.2 : -0.05;
  const levelPenalty = scenario.level === "DIFFICILE" ? -0.15 : scenario.level === "FACILE" ? 0.15 : 0;
  state.receptivity += levelPenalty + (rnd() - 0.5) * 0.1;

  // Conclusion possible après quelques tours.
  if (proposesMeeting && agentTurns >= 3) {
    if (state.receptivity > 0.5) {
      return {
        content:
          scenario.level === "DIFFICILE"
            ? "Bon… d'accord, rappelez-moi jeudi mais soyez bref."
            : "Écoutez, oui, ça peut m'intéresser. Envoyez-moi les infos et on cale un créneau.",
        shouldEnd: true,
        outcome: state.receptivity > 0.65 ? "RDV" : "RAPPEL",
      };
    }
    return {
      content: "Non, franchement ça ne m'intéresse pas. Merci, au revoir.",
      shouldEnd: true,
      outcome: "REFUS",
    };
  }

  // Objections selon l'avancement.
  const objections = parseJson<string[]>(scenario.allowedObjections, [
    "Je n'ai pas le temps.",
    "Ça ne m'intéresse pas.",
    "C'est trop cher.",
  ]);

  if (agentTurns <= 1) {
    return {
      content:
        scenario.level === "DIFFICILE"
          ? "Encore un démarchage… j'ai déjà tout ce qu'il me faut."
          : objections[0] ?? "Je n'ai pas trop le temps là.",
      shouldEnd: false,
      outcome: null,
    };
  }

  if (asksOpen) {
    const secrets = parseJson<Array<{ question: string; answer: string }>>(scenario.secretInfos, []);
    const revealed = secrets.find((s) =>
      msg.includes(s.question.toLowerCase().split(" ")[0] ?? "###"),
    );
    if (revealed && state.receptivity > 0.4) {
      return { content: revealed.answer, shouldEnd: false, outcome: null };
    }
    return {
      content: listens
        ? "Bonne question… disons que je regarde surtout le rapport qualité-prix."
        : "Ça dépend. Pourquoi vous me demandez ça ?",
      shouldEnd: false,
      outcome: null,
    };
  }

  if (state.receptivity < 0.35) {
    const idx = Math.min(objections.length - 1, agentTurns % objections.length);
    return { content: objections[idx] ?? "Ça ne m'intéresse pas.", shouldEnd: false, outcome: null };
  }

  // Réponse neutre / légèrement ouverte.
  const neutral = [
    "Mmh, je vous écoute, mais faites vite.",
    "D'accord… et concrètement, ça change quoi pour moi ?",
    "Admettons. Continuez.",
  ];
  return {
    content: neutral[Math.floor(rnd() * neutral.length)] ?? neutral[0]!,
    shouldEnd: false,
    outcome: null,
  };
}
