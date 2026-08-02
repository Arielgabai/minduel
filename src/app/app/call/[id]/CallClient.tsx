"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Waveform } from "@/components/Waveform";
import { LEVEL_LABELS } from "@/lib/enums";
import { cx, formatDuration } from "@/lib/utils";
import { generateInitials } from "@/lib/callUi";
import { RealtimeCallClient } from "./RealtimeCallClient";

type Turn = { role: string; content: string };
type CallState =
  | "connecting"
  | "prospect_speaking"
  | "your_turn"
  | "sending"
  | "ended";

interface Props {
  simulationId: string;
  prospectName: string;
  scenarioName: string;
  level: string;
  demo: boolean;
  alreadyEvaluated: boolean;
  initialTurns: Turn[];
}

const STATE_LABEL: Record<CallState, string> = {
  connecting: "Connexion…",
  prospect_speaking: "Le prospect parle",
  your_turn: "À vous",
  sending: "…",
  ended: "Terminé",
};

/**
 * Point d'entrée de la page d'appel.
 * - Mode démo (déterministe) : flux textuel + voix du navigateur (ci-dessous).
 * - Mode réel (AI_PROVIDER=openai) : délègue à RealtimeCallClient, qui établit
 *   une véritable session vocale OpenAI en speech-to-speech via WebRTC.
 */
export function CallClient(props: Props) {
  if (!props.demo) return <RealtimeCallClient {...props} />;
  return <DemoCallClient {...props} />;
}

function DemoCallClient(props: Props) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>(props.initialTurns);
  const [state, setState] = useState<CallState>("connecting");
  const [seconds, setSeconds] = useState(0);
  const [input, setInput] = useState("");
  const [muted, setMuted] = useState(false);
  const [listening, setListening] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [ending, setEnding] = useState(false);
  // Initialisé à false pour que le HTML serveur et le premier rendu client
  // soient strictement identiques (pas de mismatch d'hydratation). La vraie
  // détection est faite après le montage dans un useEffect ci-dessous.
  const [speechRecognitionSupported, setSpeechRecognitionSupported] =
    useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<unknown>(null);

  // Détection de la reconnaissance vocale après le montage uniquement.
  useEffect(() => {
    if (
      "SpeechRecognition" in window ||
      "webkitSpeechRecognition" in window
    ) {
      setSpeechRecognitionSupported(true);
    }
  }, []);

  // Redirection vers l'écran de fin si déjà évaluée (jamais un nouvel /end).
  useEffect(() => {
    if (props.alreadyEvaluated) {
      router.replace(`/app/call/${props.simulationId}/done`);
    }
  }, [props.alreadyEvaluated, props.simulationId, router]);

  // Chronomètre.
  useEffect(() => {
    if (state === "ended") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  // Parole du prospect (SpeechSynthesis) — voix clairement générée par IA.
  const speak = useCallback(
    (text: string) => {
      if (muted) return;
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = "fr-FR";
        u.rate = 1.03;
        u.pitch = 1;
        const frVoice = window.speechSynthesis
          .getVoices()
          .find((v) => v.lang.startsWith("fr"));
        if (frVoice) u.voice = frVoice;
        window.speechSynthesis.speak(u);
      } catch {
        /* voix indisponible */
      }
    },
    [muted],
  );

  // Connexion initiale : jouer la réplique d'ouverture.
  useEffect(() => {
    const opener = props.initialTurns.at(-1);
    const timer = setTimeout(() => {
      setState("prospect_speaking");
      if (opener?.role === "PROSPECT") speak(opener.content);
      setTimeout(() => setState("your_turn"), 1600);
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll transcript.
  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns]);

  async function sendMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed || state === "sending") return;
    setInput("");
    setTurns((t) => [...t, { role: "AGENT", content: trimmed }]);
    setState("sending");
    try {
      const res = await fetch(`/api/simulations/${props.simulationId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        setState("your_turn");
        return;
      }
      const { prospect, shouldEnd } = json.data as {
        prospect: string;
        shouldEnd: boolean;
      };
      setState("prospect_speaking");
      setTurns((t) => [...t, { role: "PROSPECT", content: prospect }]);
      speak(prospect);
      if (shouldEnd) {
        setTimeout(() => endCall(false), 2600);
      } else {
        setTimeout(() => setState("your_turn"), 1800);
      }
    } catch {
      setState("your_turn");
    }
  }

  // Reconnaissance vocale (si dispo) — sinon, saisie texte.
  function toggleListen() {
    const SR =
      (window as unknown as { webkitSpeechRecognition?: unknown; SpeechRecognition?: unknown })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    if (!SR) {
      return;
    }
    if (listening) {
      (recognitionRef.current as { stop: () => void } | null)?.stop();
      setListening(false);
      return;
    }
    // @ts-expect-error constructeur dynamique
    const rec = new SR();
    rec.lang = "fr-FR";
    rec.interimResults = false;
    rec.onresult = (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => {
      const text = e.results[0]?.[0]?.transcript ?? "";
      setListening(false);
      if (text) sendMessage(text);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  async function endCall(abandoned: boolean) {
    if (ending) return;
    setEnding(true);
    setState("ended");
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    try {
      const res = await fetch(`/api/simulations/${props.simulationId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationSec: seconds, abandoned }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        // Ne pas rediriger vers /app en cas d'échec : réactiver pour réessayer.
        setEnding(false);
        setState("your_turn");
        return;
      }
      const data = json?.data ?? {};
      if (data.abandoned) {
        router.replace(data.redirect ?? "/app");
        return;
      }
      // Vers l'écran de fin d'exercice (page 17) : il relit des données
      // persistées et ne rappelle jamais /end.
      router.replace(`/app/call/${props.simulationId}/done`);
    } catch {
      setEnding(false);
      setState("your_turn");
    }
  }

  const waveActive = state === "prospect_speaking" || listening;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-6">
        <button
          onClick={() => setConfirmQuit(true)}
          aria-label="Terminer l'appel"
          className="min-h-11 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          Quitter
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-semibold text-white">
            {props.prospectName}
          </p>
          <p className="truncate text-xs text-white/45">{props.scenarioName}</p>
          <p className="mt-0.5 text-sm text-white/60">⏱ {formatDuration(seconds)}</p>
        </div>
        <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60">
          {LEVEL_LABELS[props.level]}
        </span>
      </div>

      {/* Prospect */}
      <div className="mt-6 flex flex-col items-center px-5">
        <div
          aria-hidden="true"
          className={cx(
            "flex h-24 w-24 items-center justify-center rounded-full border-2 text-2xl font-bold tracking-wide text-white transition",
            state === "prospect_speaking"
              ? "border-flame-500/60 glow-flame animate-pulse-ring"
              : "border-violet-500/40",
          )}
          style={{
            background:
              "radial-gradient(circle at 50% 30%, rgba(124,58,237,0.35), rgba(10,11,26,0.6))",
          }}
        >
          {generateInitials(props.prospectName)}
        </div>
        <p className="mt-3 text-lg font-bold">{props.prospectName}</p>
        <p className="text-xs text-white/45">Prospect fictif — voix générée par IA</p>
        <span
          className={cx(
            "mt-3 rounded-full px-3 py-1 text-xs font-medium",
            state === "your_turn"
              ? "bg-emerald-500/15 text-emerald-300"
              : state === "prospect_speaking"
                ? "bg-flame-500/15 text-flame-400"
                : "bg-white/5 text-white/50",
          )}
        >
          {STATE_LABEL[state]}
        </span>
      </div>

      {/* Transcript */}
      <div
        ref={transcriptRef}
        className="mx-auto mt-4 w-full max-w-md flex-1 space-y-3 overflow-y-auto px-5"
      >
        {turns.map((t, i) => (
          <div
            key={i}
            className={cx(
              "max-w-[85%] rounded-2xl px-4 py-2 text-sm",
              t.role === "AGENT"
                ? "ml-auto bg-violet-500/20 text-white"
                : "mr-auto bg-white/5 text-white/85",
            )}
          >
            <p className="mb-0.5 text-[0.6rem] uppercase tracking-wide text-white/40">
              {t.role === "AGENT" ? "Toi" : props.prospectName}
            </p>
            {t.content}
          </div>
        ))}
      </div>

      {/* Waveform */}
      <div className="px-5 py-2">
        <Waveform bars={44} active={waveActive} className="h-10" />
        {waveActive && (
          <p className="text-center text-xs text-electric-400">
            {listening ? "Je t'écoute…" : "Simulation en cours…"}
          </p>
        )}
      </div>

      {/* Zone de saisie / parole */}
      <div className="mx-auto w-full max-w-md px-5">
        {props.demo && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={state === "sending" || state === "ended"}
              placeholder={
                speechRecognitionSupported
                  ? "Parle ou écris ta réponse…"
                  : "Écris ta réponse…"
              }
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30"
            />
            {speechRecognitionSupported && (
              <button
                type="button"
                onClick={toggleListen}
                className={cx(
                  "flex h-11 w-11 items-center justify-center rounded-full border",
                  listening
                    ? "border-flame-500/60 bg-flame-500/20 text-flame-400"
                    : "border-white/10 bg-white/5 text-white/70",
                )}
                aria-label="Parler"
              >
                🎤
              </button>
            )}
            <button
              type="submit"
              disabled={!input.trim() || state === "sending"}
              className="btn-gradient flex h-11 w-11 items-center justify-center rounded-full text-white disabled:opacity-40"
              aria-label="Envoyer"
            >
              →
            </button>
          </form>
        )}
      </div>

      {/* Contrôles d'appel */}
      <div className="mx-auto grid w-full max-w-md grid-cols-3 gap-2 px-5 pb-8 pt-4">
        <ControlButton
          label={muted ? "Réactiver" : "Couper micro"}
          icon={muted ? "🔇" : "🎙️"}
          onClick={() => setMuted((m) => !m)}
        />
        <button
          onClick={() => setConfirmQuit(true)}
          aria-label="Terminer l'appel"
          className="flex flex-col items-center gap-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-2xl glow-flame">
            📞
          </span>
          <span className="text-xs text-white/60">Terminer</span>
        </button>
        <ControlButton
          label="Haut-parleur"
          icon="🔊"
          onClick={() => {}}
        />
      </div>

      {/* Confirmation d'abandon */}
      {confirmQuit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-6">
          <div className="card w-full max-w-sm p-6 text-center">
            <p className="text-lg font-semibold">Terminer l&apos;appel ?</p>
            <p className="mt-1 text-sm text-white/55">
              Tu peux terminer et recevoir ton analyse, ou abandonner sans être
              noté.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                onClick={() => endCall(false)}
                disabled={ending}
                className="btn-gradient rounded-xl px-4 py-3 text-sm font-semibold text-white"
              >
                Terminer et voir l&apos;analyse
              </button>
              <button
                onClick={() => endCall(true)}
                disabled={ending}
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
              >
                Abandonner (non noté)
              </button>
              <button
                onClick={() => setConfirmQuit(false)}
                className="rounded-xl px-4 py-2 text-sm text-white/50"
              >
                Continuer l&apos;appel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ControlButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex flex-col items-center gap-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl">
        {icon}
      </span>
      <span className="text-xs text-white/60">{label}</span>
    </button>
  );
}
