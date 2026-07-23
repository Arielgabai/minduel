"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";

type MicState = "idle" | "requesting" | "granted" | "denied";

export function PrepareClient({ scenarioId }: { scenarioId: string }) {
  const router = useRouter();
  const [mic, setMic] = useState<MicState>("idle");
  const [level, setLevel] = useState(0);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  async function testMic() {
    setMic("requesting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMic("granted");

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const loop = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(Math.min(100, (avg / 128) * 100));
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      setMic("denied");
    }
  }

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Impossible de démarrer.");
        return;
      }
      // Libère le micro de test avant de naviguer.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      router.push(`/app/call/${json.data.id}`);
    } catch {
      setError("Erreur réseau.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Microphone</p>
            <p className="text-xs text-white/45">
              {mic === "granted"
                ? "Micro actif — parle pour voir le niveau."
                : mic === "denied"
                  ? "Accès refusé. Autorise le micro dans le navigateur."
                  : "Teste ton micro avant de commencer."}
            </p>
          </div>
          <Button variant="ghost" onClick={testMic} disabled={mic === "requesting"}>
            {mic === "granted" ? "✓ OK" : mic === "requesting" ? "…" : "Tester"}
          </Button>
        </div>

        {/* Barre de niveau audio */}
        <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full transition-[width] duration-100"
            style={{
              width: `${level}%`,
              background: "linear-gradient(90deg,#3b82f6,#8b5cf6,#f97316)",
            }}
          />
        </div>
      </Card>

      <Card className="text-xs text-white/50">
        🔊 La sortie audio utilisera ton haut-parleur / casque par défaut. La
        voix du prospect est <span className="text-violet-300">générée par IA</span>.
      </Card>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <Button onClick={start} disabled={starting} className="w-full py-4 text-base">
        {starting ? "Démarrage…" : "Démarrer →"}
      </Button>
      {mic !== "granted" && (
        <p className="text-center text-xs text-white/40">
          Tu peux démarrer même sans tester le micro (mode démo textuel/vocal).
        </p>
      )}
    </div>
  );
}
