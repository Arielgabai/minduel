"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, SectionTitle } from "@/components/ui";

interface ClarificationOption {
  value: string;
  sample?: string;
}
interface ClarificationQuestion {
  id: string;
  kind?: string;
  question: string;
  importance?: string;
  options?: ClarificationOption[];
}
interface StatusResponse {
  status: string;
  step: string;
  scenarioId: string | null;
  clarification: { questions: ClarificationQuestion[] } | null;
  error: string | null;
}

// 6 étapes lisibles présentées au manager.
const STEPS: Array<{ key: string; label: string }> = [
  { key: "UPLOADED", label: "Import" },
  { key: "PREPROCESSING", label: "Préparation" },
  { key: "TRANSCRIBING", label: "Transcription" },
  { key: "ANALYZING", label: "Analyse" },
  { key: "GENERATING_EXERCISE", label: "Génération de l'exercice" },
  { key: "READY", label: "Prêt à valider" },
];

const IN_PROGRESS = new Set([
  "UPLOADED",
  "PREPROCESSING",
  "TRANSCRIBING",
  "ANALYZING",
  "GENERATING_EXERCISE",
]);

export function RecordingProcessing({
  recordingId,
  initialStatus,
}: {
  recordingId: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [questions, setQuestions] = useState<ClarificationQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/recordings/${recordingId}/status`);
      const json = await res.json();
      if (!res.ok) return;
      const data = json.data as StatusResponse;
      setStatus(data.status);
      setError(data.error);
      setQuestions(data.clarification?.questions ?? []);
      if (data.status === "READY") {
        // La fiche serveur affichera la page de validation.
        router.refresh();
      }
    } catch {
      // Erreur réseau transitoire : on retentera au prochain tick.
    }
  }, [recordingId, router]);

  useEffect(() => {
    if (!IN_PROGRESS.has(status)) return;
    void poll();
    timer.current = setInterval(() => void poll(), 2000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [status, poll]);

  async function submitClarification() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/recordings/${recordingId}/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message ?? "Impossible d'enregistrer la réponse.");
        setSubmitting(false);
        return;
      }
      setQuestions([]);
      setAnswers({});
      setStatus(json.data.status);
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSubmitting(false);
    }
  }

  async function retry() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/recordings/${recordingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retry: true }),
      });
      if (res.ok) {
        setStatus("UPLOADED");
        setError(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const currentIdx = STEPS.findIndex((s) => s.key === status);

  // --- État : en attente de clarification du manager ---
  if (status === "WAITING_FOR_CLARIFICATION" && questions.length > 0) {
    const allAnswered = questions.every((q) => (answers[q.id] ?? "").trim().length > 0);
    return (
      <Card className="border-amber-500/30 bg-amber-500/5">
        <SectionTitle className="mb-2">Une précision est nécessaire</SectionTitle>
        <p className="mb-4 text-sm text-white/60">
          Réponds pour laisser le pipeline continuer.
        </p>
        <div className="space-y-4">
          {questions.map((q) => (
            <div key={q.id}>
              <p className="mb-2 text-sm font-medium text-white/85">{q.question}</p>
              {q.kind === "speaker" && q.options ? (
                <div className="space-y-2">
                  {q.options.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm transition ${
                        answers[q.id] === opt.value
                          ? "border-violet-500/60 bg-violet-500/10"
                          : "border-white/10 bg-white/5"
                      }`}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        className="mt-1"
                        checked={answers[q.id] === opt.value}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt.value }))}
                      />
                      <span>
                        <span className="font-medium text-white/80">{opt.value}</span>
                        {opt.sample && (
                          <span className="block text-xs italic text-white/45">« {opt.sample} »</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  rows={2}
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-violet-500/50"
                  placeholder="Ta réponse…"
                />
              )}
            </div>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
        <Button
          className="mt-4 w-full"
          disabled={!allAnswered || submitting}
          onClick={submitClarification}
        >
          {submitting ? "Envoi…" : "Continuer"}
        </Button>
      </Card>
    );
  }

  // --- État : échec ---
  if (status === "FAILED") {
    return (
      <Card className="border-red-500/30 bg-red-500/5">
        <SectionTitle className="mb-2">Le traitement a échoué</SectionTitle>
        <p className="mb-4 text-sm text-red-300">
          {error ?? "Une erreur est survenue pendant le traitement de l'appel."}
        </p>
        <Button variant="ghost" disabled={submitting} onClick={retry}>
          {submitting ? "Relance…" : "Relancer le traitement"}
        </Button>
      </Card>
    );
  }

  // --- État : progression ---
  return (
    <Card>
      <SectionTitle className="mb-4">Traitement en cours</SectionTitle>
      <ol className="space-y-3">
        {STEPS.map((s, i) => {
          const done = currentIdx > i || status === "READY";
          const active = currentIdx === i && status !== "READY";
          return (
            <li key={s.key} className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs ${
                  done
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                    : active
                      ? "border-violet-500/50 bg-violet-500/15 text-violet-200 animate-pulse-ring"
                      : "border-white/10 bg-white/5 text-white/40"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={`text-sm ${active ? "text-white" : done ? "text-white/70" : "text-white/40"}`}
              >
                {s.label}
              </span>
              {active && <span className="text-xs text-violet-300">…</span>}
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-xs text-white/40">
        Tu peux fermer cette page : le traitement se poursuit en arrière-plan.
      </p>
    </Card>
  );
}
