"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Card, LinkButton } from "@/components/ui";

/**
 * Analysis page state while the evaluation is not finished yet.
 *
 * Polls /evaluation-status every 2s during PENDING/EVALUATING, stops on
 * COMPLETED (then refreshes the server page to render the result) or
 * EVALUATION_FAILED (shows the error + retry). Never silently redirects home.
 */

type Status =
  | "FINALIZING"
  | "EVALUATION_PENDING"
  | "EVALUATING"
  | "COMPLETED"
  | "EVALUATION_FAILED"
  | "ABANDONED"
  | string;

const IN_PROGRESS: Status[] = [
  "FINALIZING",
  "EVALUATION_PENDING",
  "EVALUATING",
];

export function AnalysisPending({
  simulationId,
  initialStatus,
}: {
  simulationId: string;
  initialStatus: Status;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/simulations/${simulationId}/evaluation-status`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) return;
      const data = json?.data as
        | { status: Status; ready: boolean; error: string | null }
        | undefined;
      if (!data) return;
      setStatus(data.status);
      setError(data.error ?? null);
      if (data.ready) {
        router.refresh();
      }
    } catch {
      // transient network error: retry on next tick
    }
  }, [router, simulationId]);

  useEffect(() => {
    if (!IN_PROGRESS.includes(status)) return;
    void poll();
    timerRef.current = setInterval(() => void poll(), 2000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status, poll]);

  const retry = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/simulations/${simulationId}/retry-evaluation`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error?.message ?? "La relance a \u00e9chou\u00e9.");
        setRetrying(false);
        return;
      }
      setStatus("EVALUATION_PENDING");
      setRetrying(false);
    } catch {
      setError("La relance a \u00e9chou\u00e9 (r\u00e9seau).");
      setRetrying(false);
    }
  }, [retrying, simulationId]);

  if (status === "ABANDONED") {
    return (
      <Centered>
        <Card className="max-w-sm text-center">
          <p className="text-lg font-semibold">Simulation abandonn&eacute;e</p>
          <p className="mt-2 text-sm text-white/60">
            Cette simulation a &eacute;t&eacute; abandonn&eacute;e : elle
            n&apos;a pas &eacute;t&eacute; not&eacute;e.
          </p>
          <LinkButton href="/app" variant="outline" className="mt-5 w-full">
            Retour aux entra&icirc;nements
          </LinkButton>
        </Card>
      </Centered>
    );
  }

  if (status === "EVALUATION_FAILED") {
    return (
      <Centered>
        <Card className="max-w-sm text-center">
          <div className="text-3xl">&#9888;&#65039;</div>
          <p className="mt-2 text-lg font-semibold">
            L&apos;analyse a &eacute;chou&eacute;
          </p>
          <p className="mt-2 text-sm text-white/60">
            {error ?? "Une erreur est survenue pendant l'\u00e9valuation."}
          </p>
          <button
            onClick={() => void retry()}
            disabled={retrying}
            className="btn-gradient mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {retrying ? "Relance\u2026" : "Relancer l'analyse"}
          </button>
          <LinkButton href="/app" variant="ghost" className="mt-2 w-full">
            Retour aux entra&icirc;nements
          </LinkButton>
        </Card>
      </Centered>
    );
  }

  const label =
    status === "EVALUATING"
      ? "Analyse de votre conversation\u2026"
      : "Analyse en attente\u2026";

  return (
    <Centered>
      <Card className="max-w-sm text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-white/15 border-t-violet-400" />
        <p className="text-lg font-semibold">{label}</p>
        <p className="mt-2 text-sm text-white/55">
          Nous &eacute;valuons votre appel. Cette page se met &agrave; jour
          automatiquement.
        </p>
      </Card>
    </Centered>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[60vh] animate-fade-up flex-col items-center justify-center px-5">
      {children}
    </div>
  );
}