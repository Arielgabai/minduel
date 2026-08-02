"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LinkButton } from "@/components/ui";
import { formatDuration } from "@/lib/utils";
import type { ExerciseCompleteState, ExerciseCompleteView } from "@/lib/callUi";

/**
 * Rendu de l'écran de fin d'exercice (page 17).
 * - Ne rappelle jamais /end (aucune finalisation ici).
 * - Évaluation prête : score persisté + premier point fort / axe + CTA débrief.
 * - En attente : « Analyse en cours », polling BORNÉ et nettoyé du statut existant,
 *   jamais de relance automatique de l'évaluation.
 * - Échec : score non disponible + action retry existante uniquement.
 */

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 40; // polling borné (~100 s) puis arrêt propre

export function ExerciseComplete({
  view,
  simulationId,
  scenarioName,
}: {
  view: ExerciseCompleteView;
  simulationId: string;
  scenarioName: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<ExerciseCompleteState>(view.state);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [pollExhausted, setPollExhausted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollsRef = useRef(0);

  const poll = useCallback(async () => {
    if (pollsRef.current >= MAX_POLLS) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setPollExhausted(true);
      return;
    }
    pollsRef.current += 1;
    try {
      const res = await fetch(
        `/api/simulations/${simulationId}/evaluation-status`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) return;
      const data = json?.data as
        | { ready: boolean; status: string; error: string | null }
        | undefined;
      if (!data) return;
      if (data.ready) {
        // Données prêtes : on relit la page serveur (état ready persisté).
        router.refresh();
      } else if (data.status === "EVALUATION_FAILED") {
        setPhase("failed");
      }
    } catch {
      // Erreur réseau transitoire : nouvelle tentative au prochain tick.
    }
  }, [router, simulationId]);

  // Polling borné et nettoyé — uniquement en attente d'évaluation.
  useEffect(() => {
    if (phase !== "pending") return;
    pollsRef.current = 0;
    setPollExhausted(false);
    void poll();
    timerRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [phase, poll]);

  const retry = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(
        `/api/simulations/${simulationId}/retry-evaluation`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setRetryError(json?.error?.message ?? "La relance a échoué.");
        setRetrying(false);
        return;
      }
      setRetrying(false);
      setPhase("pending");
    } catch {
      setRetryError("La relance a échoué (réseau).");
      setRetrying(false);
    }
  }, [retrying, simulationId]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink-950 px-5">
      <div className="w-full max-w-sm animate-fade-up text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-300">
          {phase === "abandoned" ? "Appel terminé" : "Exercice terminé"}
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white">
          {phase === "abandoned" ? "Exercice abandonné" : "Bien joué !"}
        </h1>
        <p className="mt-1 text-sm text-white/50">{scenarioName}</p>
        <p className="mt-1 text-sm text-white/45">
          Durée : {formatDuration(view.durationSec)}
        </p>

        {phase === "ready" ? (
          <ReadyBody view={view} />
        ) : phase === "pending" ? (
          <PendingBody exhausted={pollExhausted} />
        ) : phase === "failed" ? (
          <FailedBody
            onRetry={view.canRetry ? () => void retry() : null}
            retrying={retrying}
            error={retryError}
          />
        ) : phase === "abandoned" ? (
          <AbandonedBody />
        ) : (
          <UnavailableBody analysisHref={view.analysisHref} />
        )}

        <div className="mt-6">
          <LinkButton
            href={view.missionsHref}
            variant={phase === "ready" ? "outline" : "primary"}
            className="min-h-11 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
          >
            Retour aux niveaux
          </LinkButton>
        </div>
      </div>
    </div>
  );
}

function ReadyBody({ view }: { view: ExerciseCompleteView }) {
  return (
    <>
      <div className="mt-6 flex flex-col items-center">
        <div
          className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-electric-500/40 bg-white/[0.03]"
          role="img"
          aria-label={
            view.overallScore != null
              ? `Score global ${view.overallScore} sur 100`
              : "Score non disponible"
          }
        >
          <span className="text-4xl font-bold text-white">
            {view.overallScore ?? "—"}
          </span>
        </div>
        <p className="mt-2 text-xs uppercase tracking-wider text-white/40">
          Score global
        </p>
        {view.outcomeLabel ? (
          <span className="mt-2 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
            {view.outcomeLabel}
          </span>
        ) : null}
      </div>

      <div className="mt-5 space-y-3 text-left">
        {view.firstStrength ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
              Point fort
            </p>
            <p className="mt-1 text-sm text-white/80">{view.firstStrength}</p>
          </div>
        ) : null}
        {view.firstImprovement ? (
          <div className="rounded-xl border border-flame-500/30 bg-flame-500/[0.06] p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-flame-300">
              Axe d&apos;amélioration
            </p>
            <p className="mt-1 text-sm text-white/80">{view.firstImprovement}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-6">
        <LinkButton
          href={view.analysisHref}
          variant="primary"
          className="min-h-11 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
        >
          Voir le débrief détaillé
        </LinkButton>
      </div>
    </>
  );
}

function PendingBody({ exhausted }: { exhausted: boolean }) {
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      {exhausted ? (
        <p className="text-sm text-white/70">
          L&apos;analyse prend plus de temps que prévu. Ton exercice est bien
          terminé — reviens un peu plus tard pour consulter le débrief.
        </p>
      ) : (
        <>
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-violet-400" />
          <p className="text-sm font-semibold text-white">Analyse en cours</p>
          <p className="mt-1 text-sm text-white/55">
            Ton appel est enregistré. Cette page se met à jour automatiquement.
          </p>
        </>
      )}
    </div>
  );
}

function FailedBody({
  onRetry,
  retrying,
  error,
}: {
  onRetry: (() => void) | null;
  retrying: boolean;
  error: string | null;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
      <p className="text-sm font-semibold text-white">Score non disponible</p>
      <p className="mt-1 text-sm text-white/60">
        L&apos;exercice est bien terminé, mais l&apos;analyse n&apos;a pas pu
        aboutir.
      </p>
      {error ? <p className="mt-2 text-sm text-red-200">{error}</p> : null}
      {onRetry ? (
        <button
          onClick={onRetry}
          disabled={retrying}
          className="btn-gradient mt-4 min-h-11 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400 disabled:opacity-50"
        >
          {retrying ? "Relance…" : "Relancer l'analyse"}
        </button>
      ) : null}
    </div>
  );
}

function UnavailableBody({ analysisHref }: { analysisHref: string }) {
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-sm font-semibold text-white">Score non disponible</p>
      <p className="mt-1 text-sm text-white/60">
        Ton exercice est terminé. Aucune évaluation chiffrée n&apos;est
        disponible pour cette tentative.
      </p>
      <Link
        href={analysisHref}
        className="mt-3 inline-flex min-h-11 items-center text-sm text-violet-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
      >
        Voir le détail
      </Link>
    </div>
  );
}

function AbandonedBody() {
  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-sm text-white/60">
        Cet exercice a été abandonné : il n&apos;a pas été noté.
      </p>
    </div>
  );
}
