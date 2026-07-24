"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useRealtimeSession — real OpenAI Realtime (speech-to-speech) over WebRTC.
 *
 * Flow (see docs/openai-realtime.md):
 *  1) mint an ephemeral secret from our server route (never the long-lived key);
 *  2) getUserMedia -> add the mic track to an RTCPeerConnection;
 *  3) open the "oai-events" data channel;
 *  4) create an SDP offer, POST it to https://api.openai.com/v1/realtime/calls
 *     with the ephemeral secret, apply the SDP answer;
 *  5) configure the session (server_vad + input transcription) via session.update;
 *  6) play remote audio via a persistent <audio> element (pc.ontrack).
 *
 * Diagnostics are logged in development only and never contain the secret, the
 * SDP, or full transcripts.
 */

export type RealtimePhase =
  | "idle"
  | "requesting_mic"
  | "connecting"
  | "connected"
  | "listening"
  | "thinking"
  | "speaking"
  | "reconnecting"
  | "error"
  | "ended";

export interface RealtimeDiagnostics {
  micPermission: string;
  audioTracks: number;
  trackReadyState: string;
  trackEnabled: boolean;
  connectionState: string;
  iceConnectionState: string;
  dataChannel: string;
  lastEvents: string[];
}

interface Options {
  simulationId: string;
  onTurn?: (role: "AGENT" | "PROSPECT", content: string) => void;
}

const isDev = process.env.NODE_ENV !== "production";

const initialDiagnostics: RealtimeDiagnostics = {
  micPermission: "unknown",
  audioTracks: 0,
  trackReadyState: "none",
  trackEnabled: false,
  connectionState: "new",
  iceConnectionState: "new",
  dataChannel: "none",
  lastEvents: [],
};

export function useRealtimeSession({ simulationId, onTurn }: Options) {
  const [phase, setPhase] = useState<RealtimePhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [diagnostics, setDiagnostics] =
    useState<RealtimeDiagnostics>(initialDiagnostics);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef(false);
  const greetedRef = useRef(false);
  const prospectBufRef = useRef("");
  const eventsRef = useRef<string[]>([]);
  const onTurnRef = useRef(onTurn);
  onTurnRef.current = onTurn;

  const dlog = useCallback((...args: unknown[]) => {
    if (isDev) console.log("[realtime]", ...args);
  }, []);

  const pushEvent = useCallback((name: string) => {
    eventsRef.current = [...eventsRef.current.slice(-14), name];
    const snapshot = eventsRef.current;
    setDiagnostics((d) => ({ ...d, lastEvents: snapshot }));
  }, []);

  const cleanup = useCallback(() => {
    try {
      dcRef.current?.close();
    } catch {}
    dcRef.current = null;
    try {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}
    micStreamRef.current = null;
    micTrackRef.current = null;
    if (pcRef.current) {
      try {
        pcRef.current.getSenders().forEach((s) => s.track?.stop());
      } catch {}
      try {
        pcRef.current.close();
      } catch {}
    }
    pcRef.current = null;
    if (audioElRef.current) {
      try {
        audioElRef.current.srcObject = null;
        audioElRef.current.remove();
      } catch {}
    }
    audioElRef.current = null;
    greetedRef.current = false;
  }, []);

  const send = useCallback((event: Record<string, unknown>) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === "open") dc.send(JSON.stringify(event));
  }, []);

  const configureSession = useCallback(() => {
    // Speech-to-speech with server-side VAD: OpenAI detects turns and answers
    // automatically (create_response), and lets the user barge in
    // (interrupt_response). We also enable input transcription so we can archive
    // the agent turns for the history.
    send({
      type: "session.update",
      session: {
        type: "realtime",
        audio: {
          input: {
            transcription: { model: "whisper-1" },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 700,
              create_response: true,
              interrupt_response: true,
            },
          },
        },
      },
    });
  }, [send]);

  const handleEvent = useCallback(
    (evt: { type?: string; [k: string]: unknown }) => {
      const type = evt.type ?? "";
      pushEvent(type);
      if (!type.endsWith("audio_transcript.delta")) dlog("event", type);

      if (type === "session.created") {
        configureSession();
      } else if (type === "session.updated") {
        if (!greetedRef.current) {
          // The prospect picks up the phone and greets first.
          greetedRef.current = true;
          send({ type: "response.create" });
        }
      } else if (type === "input_audio_buffer.speech_started") {
        setPhase("listening");
      } else if (type === "input_audio_buffer.speech_stopped") {
        setPhase("thinking");
      } else if (
        type === "conversation.item.input_audio_transcription.completed"
      ) {
        const text = String((evt.transcript as string) ?? "").trim();
        if (text) onTurnRef.current?.("AGENT", text);
      } else if (type === "response.created") {
        setPhase("thinking");
      } else if (type.endsWith("audio_transcript.delta")) {
        prospectBufRef.current += String((evt.delta as string) ?? "");
        setPhase("speaking");
      } else if (type.endsWith("audio_transcript.done")) {
        const text = String(
          (evt.transcript as string) ?? prospectBufRef.current,
        ).trim();
        prospectBufRef.current = "";
        if (text) onTurnRef.current?.("PROSPECT", text);
      } else if (type === "response.done") {
        setPhase((p) => (p === "ended" ? p : "connected"));
      } else if (type === "error") {
        const err = evt.error as
          | { message?: string; code?: string }
          | undefined;
        dlog("server error", err?.code, err?.message);
        setErrorMessage(cleanMessage(err?.message) ?? "Erreur temps r\u00e9el.");
      }
    },
    [configureSession, dlog, pushEvent, send],
  );

  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setErrorMessage(null);
    try {
      setPhase("requesting_mic");

      // 1) Ephemeral secret from our server (long-lived key stays server-side).
      const tokenRes = await fetch(
        `/api/simulations/${simulationId}/realtime`,
        { method: "POST" },
      );
      const tokenJson = await tokenRes.json().catch(() => null);
      if (!tokenRes.ok) {
        throw new Error(
          tokenJson?.error?.message ??
            "\u00c9chec de la n\u00e9gociation de session.",
        );
      }
      const secret: string | undefined =
        tokenJson?.data?.clientSecret ?? undefined;
      const demo: boolean = Boolean(tokenJson?.data?.demo);
      if (demo || !secret) {
        throw new Error(
          "Session temps r\u00e9el indisponible (configuration OpenAI manquante).",
        );
      }

      // 2) Microphone.
      const ms = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = ms;
      const track = ms.getAudioTracks()[0];
      if (!track) throw new Error("Aucune piste audio disponible.");
      micTrackRef.current = track;
      track.enabled = !muted;
      setDiagnostics((d) => ({
        ...d,
        micPermission: "granted",
        audioTracks: ms.getAudioTracks().length,
        trackReadyState: track.readyState,
        trackEnabled: track.enabled,
      }));
      dlog("mic", ms.getAudioTracks().length, track.readyState, track.enabled);

      // 3) Peer connection + persistent remote <audio> element.
      setPhase("connecting");
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.setAttribute("playsinline", "true");
      audioEl.style.display = "none";
      document.body.appendChild(audioEl);
      audioElRef.current = audioEl;

      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0] ?? null;
        void audioEl.play().catch(() => {});
      };
      pc.addTrack(track, ms);

      pc.onconnectionstatechange = () => {
        dlog("connectionState", pc.connectionState);
        setDiagnostics((d) => ({ ...d, connectionState: pc.connectionState }));
        if (pc.connectionState === "connected") {
          setPhase((p) => (p === "connecting" ? "connected" : p));
        } else if (pc.connectionState === "failed") {
          setPhase("reconnecting");
          setErrorMessage("Connexion perdue. Terminez puis r\u00e9essayez.");
        }
      };
      pc.oniceconnectionstatechange = () => {
        dlog("iceConnectionState", pc.iceConnectionState);
        setDiagnostics((d) => ({
          ...d,
          iceConnectionState: pc.iceConnectionState,
        }));
      };

      // 4) Data channel for realtime events.
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onopen = () => {
        dlog("dc open");
        setDiagnostics((d) => ({ ...d, dataChannel: "open" }));
        setPhase((p) => (p === "connecting" ? "connected" : p));
      };
      dc.onclose = () =>
        setDiagnostics((d) => ({ ...d, dataChannel: "closed" }));
      dc.onerror = () => dlog("dc error");
      dc.onmessage = (e) => {
        try {
          handleEvent(JSON.parse(e.data));
        } catch {}
      };

      // 5) SDP offer.
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 6) POST the SDP to OpenAI with the ephemeral secret.
      const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpRes.ok) {
        throw new Error(
          `N\u00e9gociation SDP refus\u00e9e (statut ${sdpRes.status}).`,
        );
      }
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      dlog("remote description set");
    } catch (err) {
      dlog("start error", err);
      setErrorMessage(
        cleanMessage(err instanceof Error ? err.message : String(err)) ??
          "Erreur de connexion.",
      );
      setPhase("error");
      cleanup();
      startedRef.current = false;
    }
  }, [cleanup, dlog, handleEvent, muted, simulationId]);

  const stop = useCallback(() => {
    cleanup();
    startedRef.current = false;
    setPhase("ended");
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (micTrackRef.current) micTrackRef.current.enabled = !next;
      setDiagnostics((d) => ({ ...d, trackEnabled: !next }));
      return next;
    });
  }, []);

  useEffect(() => cleanup, [cleanup]);

  return { phase, errorMessage, muted, diagnostics, start, stop, toggleMute };
}

function cleanMessage(msg?: string): string | undefined {
  if (!msg) return undefined;
  return msg.replace(/\s+/g, " ").trim().slice(0, 200);
}