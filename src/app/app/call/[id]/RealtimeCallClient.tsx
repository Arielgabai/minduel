"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Waveform } from "@/components/Waveform";
import { LEVEL_LABELS } from "@/lib/enums";
import { cx, formatDuration } from "@/lib/utils";
import { useRealtimeSession, type RealtimePhase } from "./useRealtimeSession";

type Turn = { role: string; content: string };

interface Props {
  simulationId: string;
  prospectName: string;
  scenarioName: string;
  level: string;
  demo: boolean;
  alreadyEvaluated: boolean;
  initialTurns: Turn[];
}

// Visible connection states (accents via \u escapes: ASCII-safe source).
const PHASE_LABEL: Record<RealtimePhase, string> = {
  idle: "Pr\u00eat \u00e0 d\u00e9marrer",
  requesting_mic: "Demande d'acc\u00e8s au micro\u2026",
  connecting: "Connexion \u00e0 l'IA\u2026",
  connected: "Connect\u00e9 \u2014 vous pouvez parler",
  listening: "Le prospect vous \u00e9coute",
  thinking: "Le prospect r\u00e9fl\u00e9chit\u2026",
  speaking: "Le prospect r\u00e9pond",
  reconnecting: "Reconnexion\u2026",
  error: "Erreur de connexion",
  ended: "Appel termin\u00e9",
};

export function RealtimeCallClient(props: Props) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>(props.initialTurns);
  const [seconds, setSeconds] = useState(0);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [ending, setEnding] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const persistTurn = useCallback(
    (role: "AGENT" | "PROSPECT", content: string) => {
      setTurns((t) => [...t, { role, content }]);
      // Archive the turn for the history (best-effort; never blocks the call).
      void fetch(`/api/simulations/${props.simulationId}/realtime-turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, content }),
      }).catch(() => {});
    },
    [props.simulationId],
  );

  const { phase, errorMessage, muted, diagnostics, start, stop, toggleMute } =
    useRealtimeSession({
      simulationId: props.simulationId,
      onTurn: persistTurn,
    });

  // Already evaluated -> go straight to the analysis.
  useEffect(() => {
    if (props.alreadyEvaluated) {
      router.replace(`/app/analysis/${props.simulationId}`);
    }
  }, [props.alreadyEvaluated, props.simulationId, router]);

  // Timer runs while the session is active.
  const active = phase !== "idle" && phase !== "ended" && phase !== "error";
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [active]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns]);

  const endCall = useCallback(
    async (abandoned: boolean) => {
      if (ending) return;
      setEnding(true);
      stop();
      try {
        const res = await fetch(`/api/simulations/${props.simulationId}/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ durationSec: seconds, abandoned }),
        });
        const json = await res.json().catch(() => null);
        router.replace(json?.data?.redirect ?? "/app");
      } catch {
        router.replace("/app");
      }
    },
    [ending, props.simulationId, router, seconds, stop],
  );

  const isDev = process.env.NODE_ENV !== "production";
  const waveActive = phase === "listening" || phase === "speaking";
  const connected =
    phase === "connected" ||
    phase === "listening" ||
    phase === "thinking" ||
    phase === "speaking";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-6">
        <button
          onClick={() => setConfirmQuit(true)}
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm text-red-300"
        >
          Quitter
        </button>
        <div className="text-center">
          <p className="text-xs font-semibold tracking-[0.2em] text-violet-300">
            DUEL EN COURS
          </p>
          <p className="text-sm text-white/60">&#9201; {formatDuration(seconds)}</p>
        </div>
        <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60">
          {LEVEL_LABELS[props.level]}
        </span>
      </div>

      {/* Prospect */}
      <div className="mt-6 flex flex-col items-center px-5">
        <div
          className={cx(
            "flex h-24 w-24 items-center justify-center rounded-full border-2 text-3xl transition",
            phase === "speaking"
              ? "border-flame-500/60 glow-flame animate-pulse-ring"
              : "border-violet-500/40",
          )}
          style={{
            background:
              "radial-gradient(circle at 50% 30%, rgba(124,58,237,0.35), rgba(10,11,26,0.6))",
          }}
        >
          &#128100;
        </div>
        <p className="mt-3 text-lg font-bold">{props.prospectName}</p>
        <p className="text-xs text-white/45">
          Simulation IA r&eacute;elle &mdash; voix OpenAI
        </p>
        <span
          className={cx(
            "mt-3 rounded-full px-3 py-1 text-xs font-medium",
            phase === "connected"
              ? "bg-emerald-500/15 text-emerald-300"
              : phase === "listening"
                ? "bg-electric-500/15 text-electric-300"
                : phase === "speaking"
                  ? "bg-flame-500/15 text-flame-400"
                  : phase === "error"
                    ? "bg-red-500/15 text-red-300"
                    : "bg-white/5 text-white/50",
          )}
        >
          {PHASE_LABEL[phase]}
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
            {phase === "listening" ? "Je vous \u00e9coute\u2026" : "Le prospect r\u00e9pond\u2026"}
          </p>
        )}
      </div>

      {/* Start / error zone */}
      <div className="mx-auto w-full max-w-md px-5">
        {phase === "idle" && (
          <button
            onClick={() => void start()}
            className="btn-gradient w-full rounded-xl px-4 py-3 text-sm font-semibold text-white"
          >
            D&eacute;marrer l&apos;appel
          </button>
        )}
        {(phase === "requesting_mic" || phase === "connecting") && (
          <p className="text-center text-sm text-white/60">
            {PHASE_LABEL[phase]}
          </p>
        )}
        {phase === "error" && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
            <p className="text-sm text-red-200">
              {errorMessage ?? "Erreur de connexion."}
            </p>
            <button
              onClick={() => void start()}
              className="btn-gradient mt-3 w-full rounded-xl px-4 py-2 text-sm font-semibold text-white"
            >
              R&eacute;essayer
            </button>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mx-auto grid w-full max-w-md grid-cols-3 gap-2 px-5 pb-8 pt-4">
        <button
          onClick={toggleMute}
          disabled={!connected}
          className="flex flex-col items-center gap-1 disabled:opacity-40"
        >
          <span
            className={cx(
              "flex h-14 w-14 items-center justify-center rounded-full border text-xl",
              muted
                ? "border-flame-500/60 bg-flame-500/20 text-flame-400"
                : "border-white/10 bg-white/5",
            )}
          >
            {muted ? "\u{1F507}" : "\u{1F399}\u{FE0F}"}
          </span>
          <span className="text-xs text-white/60">
            {muted ? "R\u00e9activer" : "Couper le micro"}
          </span>
        </button>
        <button
          onClick={() => setConfirmQuit(true)}
          className="flex flex-col items-center gap-1"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-2xl glow-flame">
            &#128222;
          </span>
          <span className="text-xs text-white/60">Terminer</span>
        </button>
        <div className="flex flex-col items-center gap-1">
          <span
            className={cx(
              "flex h-14 w-14 items-center justify-center rounded-full border text-xl",
              connected
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-white/10 bg-white/5 text-white/40",
            )}
          >
            {connected ? "\u{1F7E2}" : "\u26AA"}
          </span>
          <span className="text-xs text-white/60">
            {connected ? "En ligne" : "Hors ligne"}
          </span>
        </div>
      </div>

      {/* Dev-only diagnostics (no secret, no SDP, no full transcript). */}
      {isDev && (
        <div className="mx-auto w-full max-w-md px-5 pb-4">
          <details className="rounded-lg border border-white/10 bg-white/5 p-2 text-[0.65rem] text-white/50">
            <summary className="cursor-pointer">Diagnostics (dev)</summary>
            <ul className="mt-2 space-y-0.5">
              <li>mic: {diagnostics.micPermission} ({diagnostics.audioTracks} piste/s)</li>
              <li>
                track: {diagnostics.trackReadyState} / enabled=
                {String(diagnostics.trackEnabled)}
              </li>
              <li>pc: {diagnostics.connectionState}</li>
              <li>ice: {diagnostics.iceConnectionState}</li>
              <li>data channel: {diagnostics.dataChannel}</li>
              <li>events: {diagnostics.lastEvents.join(", ") || "-"}</li>
            </ul>
          </details>
        </div>
      )}

      {/* Confirm end */}
      {confirmQuit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-6">
          <div className="card w-full max-w-sm p-6 text-center">
            <p className="text-lg font-semibold">Terminer l&apos;appel ?</p>
            <p className="mt-1 text-sm text-white/55">
              Tu peux terminer et recevoir ton analyse, ou abandonner sans
              &ecirc;tre not&eacute;.
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
                Abandonner (non not&eacute;)
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