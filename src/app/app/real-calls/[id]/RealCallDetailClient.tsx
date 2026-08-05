"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScoreRing } from "@/components/ScoreRing";
import { Badge, Button, Card, LinkButton, SectionTitle } from "@/components/ui";
import { formatAtMs } from "@/lib/debriefView";
import { RecordingStatus } from "@/lib/enums";
import type { RealCallDetailView } from "@/lib/realCallView";
import { cx, formatDateTimeFr, formatDuration } from "@/lib/utils";

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 40;

const CANCEL_CONFIRM =
  "Arrêter cette analyse ? L'étape actuellement envoyée au fournisseur peut encore se terminer, mais son résultat ne sera pas conservé.";

const DELETE_CONFIRM =
  "Supprimer définitivement cet appel, son audio, son transcript et son analyse ?";

const DETAIL_TABS = [
  { id: "resume", label: "Résumé" },
  { id: "ligne", label: "Ligne par ligne" },
  { id: "pourquoi", label: "Pourquoi" },
  { id: "comparatif", label: "Comparatif" },
] as const;

type DetailTabId = (typeof DETAIL_TABS)[number]["id"];

const PIPELINE_STEPS = [
  { id: "import", label: "Import" },
  { id: "prep", label: "Préparation" },
  { id: "transcription", label: "Transcription" },
  { id: "analyse", label: "Analyse" },
] as const;

function pipelineStepIndex(status: string): number {
  switch (status) {
    case RecordingStatus.PENDING_UPLOAD:
    case RecordingStatus.UPLOADED:
      return 0;
    case RecordingStatus.PREPROCESSING:
      return 1;
    case RecordingStatus.TRANSCRIBING:
      return 2;
    case RecordingStatus.ANALYZING:
    case RecordingStatus.WAITING_FOR_CLARIFICATION:
    case RecordingStatus.GENERATING_EXERCISE:
    case RecordingStatus.REVIEW_REQUIRED:
      return 3;
    default:
      return 0;
  }
}

function statusBadgeTone(
  tone: RealCallDetailView["statusTone"],
): "mint" | "red" | "blue" | "gray" | "flame" {
  switch (tone) {
    case "ready":
      return "mint";
    case "failed":
      return "red";
    case "processing":
      return "blue";
    case "pending":
      return "flame";
    case "cancelled":
    default:
      return "gray";
  }
}

function trendLabel(trend: RealCallDetailView["personalComparative"]["trend"]): string {
  switch (trend) {
    case "up":
      return "Au-dessus de ta moyenne";
    case "down":
      return "En dessous de ta moyenne";
    case "stable":
      return "Proche de ta moyenne";
    default:
      return "Tendance indisponible";
  }
}

function hasMetrics(
  metrics: NonNullable<RealCallDetailView["analysis"]["metrics"]>,
): boolean {
  return (
    metrics.talkRatio != null ||
    metrics.openQuestionsCount != null ||
    metrics.firstClosingAttemptMs != null
  );
}

function BackLink() {
  return (
    <Link
      href="/app/real-calls"
      className="inline-flex min-h-11 items-center text-sm text-white/50 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
    >
      ← Retour à mes appels
    </Link>
  );
}

function PipelineSteps({ status }: { status: string }) {
  const active = pipelineStepIndex(status);

  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {PIPELINE_STEPS.map((step, idx) => {
        const done = idx < active;
        const current = idx === active;
        return (
          <li
            key={step.id}
            className={cx(
              "rounded-xl border px-3 py-3 text-center text-sm",
              current
                ? "border-violet-500/50 bg-violet-500/10 text-white"
                : done
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : "border-white/10 bg-white/[0.03] text-white/45",
            )}
            aria-current={current ? "step" : undefined}
          >
            <p className="text-xs font-semibold uppercase tracking-wide">
              {step.label}
            </p>
            <p className="mt-1 text-[0.65rem] text-white/50">
              {done ? "Terminé" : current ? "En cours" : "À venir"}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function ProcessingView({
  data,
  pollExhausted,
}: {
  data: RealCallDetailView;
  pollExhausted: boolean;
}) {
  return (
    <Card className="mt-5">
      <SectionTitle className="mb-3">Traitement en cours</SectionTitle>
      <PipelineSteps status={data.status} />
      <div className="mt-5 space-y-3">
        {!pollExhausted ? (
          <>
            <div
              className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-violet-400"
              aria-hidden
            />
            <p className="text-center text-sm font-semibold text-white">
              {data.statusLabel}
            </p>
            <p className="text-center text-sm text-white/55">
              Cette page se met à jour automatiquement.
            </p>
          </>
        ) : (
          <p className="text-sm text-white/60">
            Le traitement continue en arrière-plan. Tu peux quitter cette page
            et revenir plus tard depuis la liste de tes appels.
          </p>
        )}
        <p className="text-center text-sm text-white/45">
          Pas besoin d&apos;attendre ici : ton appel reste enregistré.
        </p>
        <LinkButton
          href="/app/real-calls"
          variant="primary"
          className="min-h-11 w-full"
        >
          Revenir à mes appels
        </LinkButton>
      </div>
    </Card>
  );
}

function FailedView({
  data,
  retrying,
  retryError,
  onRetry,
}: {
  data: RealCallDetailView;
  retrying: boolean;
  retryError: string | null;
  onRetry: () => void;
}) {
  return (
    <Card className="mt-5 border-red-500/30 bg-red-500/10">
      <SectionTitle className="mb-2 text-red-200">Échec du traitement</SectionTitle>
      <p className="text-sm text-white/75">
        {data.errorMessage ?? "Le traitement de cet appel n'a pas pu aboutir."}
      </p>
      {retryError ? (
        <p className="mt-2 text-sm text-red-200">{retryError}</p>
      ) : null}
      <Button
        variant="primary"
        className="mt-4 min-h-11 w-full"
        disabled={retrying}
        onClick={onRetry}
      >
        {retrying ? "Relance…" : "Relancer le traitement"}
      </Button>
      <LinkButton
        href="/app/real-calls"
        variant="ghost"
        className="mt-3 min-h-11 w-full"
      >
        Revenir à mes appels
      </LinkButton>
    </Card>
  );
}

function ResumePanel({
  data,
  onGoComparatif,
}: {
  data: RealCallDetailView;
  onGoComparatif: () => void;
}) {
  const { analysis } = data;
  const score = analysis.overallScore ?? data.overallScore;
  const showComparatifCta =
    data.personalComparative.available || data.simRealComparison.available;

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center">
        <SectionTitle>Score</SectionTitle>
        {score != null ? (
          <ScoreRing score={score} className="mt-3" />
        ) : (
          <p className="mt-3 text-sm text-white/50">Donnée non disponible</p>
        )}
        {analysis.summary ? (
          <p className="mt-4 max-w-lg text-center text-sm text-white/70">
            {analysis.summary}
          </p>
        ) : (
          <p className="mt-4 text-center text-sm text-white/50">
            Donnée non disponible
          </p>
        )}
      </div>

      {analysis.skillScores && analysis.skillScores.length > 0 ? (
        <div className="space-y-3">
          <SectionTitle>Compétences</SectionTitle>
          {analysis.skillScores.map((skill) => {
            const pct =
              skill.maxScore > 0
                ? Math.max(
                    0,
                    Math.min(100, Math.round((skill.score / skill.maxScore) * 100)),
                  )
                : 0;
            return (
              <Card key={skill.key}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-white">{skill.label}</span>
                  <span className="font-semibold text-white">
                    {skill.score}
                    <span className="text-white/40">/{skill.maxScore}</span>
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#3E6BFF] via-violet-500 to-orange-400"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}

      <Card>
        <SectionTitle className="mb-3">Moments clés</SectionTitle>
        {!analysis.keyMoments || analysis.keyMoments.length === 0 ? (
          <p className="text-sm text-white/50">Aucun moment clé enregistré</p>
        ) : (
          <div className="space-y-4">
            {analysis.keyMoments.map((moment, index) => (
              <div
                key={`${moment.atMs}-${index}`}
                className="border-l-2 border-violet-500/40 pl-4"
              >
                <p className="text-[0.65rem] uppercase tracking-wide text-white/40">
                  {moment.role === "AGENT" ? "Toi" : "Interlocuteur"} ·{" "}
                  {formatAtMs(moment.atMs)}
                </p>
                <p className="mt-1 text-sm text-white/85">« {moment.quote} »</p>
                {moment.explanation ? (
                  <p className="mt-1 text-sm text-white/55">{moment.explanation}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      {analysis.metrics && hasMetrics(analysis.metrics) ? (
        <Card>
          <SectionTitle className="mb-3">Métriques</SectionTitle>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {analysis.metrics.talkRatio != null ? (
              <div>
                <dt className="text-xs text-white/45">Temps de parole</dt>
                <dd className="mt-1 text-lg font-semibold text-white">
                  {Math.round(analysis.metrics.talkRatio * 100)} %
                </dd>
              </div>
            ) : null}
            {analysis.metrics.openQuestionsCount != null ? (
              <div>
                <dt className="text-xs text-white/45">Questions ouvertes</dt>
                <dd className="mt-1 text-lg font-semibold text-white">
                  {analysis.metrics.openQuestionsCount}
                </dd>
              </div>
            ) : null}
            {analysis.metrics.firstClosingAttemptMs != null ? (
              <div>
                <dt className="text-xs text-white/45">Première tentative de closing</dt>
                <dd className="mt-1 text-lg font-semibold text-white">
                  {formatAtMs(analysis.metrics.firstClosingAttemptMs)}
                </dd>
              </div>
            ) : null}
          </dl>
        </Card>
      ) : null}

      {showComparatifCta ? (
        <button
          type="button"
          onClick={onGoComparatif}
          className="btn-gradient min-h-11 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
        >
          Voir le comparatif
        </button>
      ) : null}
    </div>
  );
}

function LignePanel({ data }: { data: RealCallDetailView }) {
  const passages = data.analysis.dialoguePassages;

  if (!passages || passages.length === 0) {
    return (
      <Card>
        <p className="text-sm text-white/50">
          Aucun passage analysé ligne par ligne pour cet appel.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {passages.map((passage, index) => {
        const isAgent = passage.role === "AGENT";
        return (
          <div
            key={`${passage.atMs}-${index}`}
            className={cx("flex", isAgent ? "justify-end" : "justify-start")}
          >
            <div
              className={cx(
                "max-w-[90%] rounded-2xl px-4 py-3 text-sm",
                isAgent
                  ? "bg-electric-500/20 text-white"
                  : "bg-white/10 text-white/85",
              )}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-wide text-white/40">
                <span>{isAgent ? "Toi" : "Interlocuteur"}</span>
                <span>{formatAtMs(passage.atMs)}</span>
              </div>
              <p className="whitespace-pre-wrap">{passage.content}</p>
              {passage.explanation ? (
                <p className="mt-2 text-xs text-violet-200/90">{passage.explanation}</p>
              ) : null}
              {passage.suggestedReformulation ? (
                <p className="mt-2 text-xs italic text-orange-200/90">
                  Reformulation suggérée : « {passage.suggestedReformulation} »
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PourquoiPanel({ data }: { data: RealCallDetailView }) {
  const { analysis, personalComparative } = data;
  const whyItems = analysis.why ?? [];
  const skills = analysis.skillScores ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle className="mb-2">Synthèse</SectionTitle>
        {whyItems.length > 0 ? (
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-white/75">
            {whyItems.map((item, index) => (
              <li key={`${index}-${item.slice(0, 24)}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/50">Donnée non disponible</p>
        )}
      </Card>

      {skills.length > 0 ? (
        skills.map((skill) => (
          <Card key={skill.key}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="font-semibold text-white">{skill.label}</p>
              <span className="text-sm text-white/70">
                {skill.score}/{skill.maxScore}
              </span>
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-white/70">
                <span className="text-white/40">Observation : </span>
                {skill.evidence?.trim() ? skill.evidence : "Donnée non disponible"}
              </p>
              <p className="text-white/70">
                <span className="text-white/40">Pourquoi : </span>
                {skill.rationale?.trim() ? skill.rationale : "Donnée non disponible"}
              </p>
              <p className="text-white/70">
                <span className="text-white/40">Recommandation : </span>
                {skill.recommendation?.trim()
                  ? skill.recommendation
                  : "Donnée non disponible"}
              </p>
            </div>
          </Card>
        ))
      ) : (
        <Card>
          <p className="text-sm text-white/50">Aucune compétence évaluée</p>
        </Card>
      )}

      {!personalComparative.available && personalComparative.message ? (
        <Card>
          <p className="text-sm text-white/55">{personalComparative.message}</p>
        </Card>
      ) : null}
    </div>
  );
}

function ComparatifPanel({ data }: { data: RealCallDetailView }) {
  const { personalComparative: personal, simRealComparison: simReal } = data;

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle className="mb-2">Comparatif personnel</SectionTitle>
        {personal.available ? (
          <div className="space-y-3">
            <p className="text-sm text-white/55">
              Basé sur {personal.sampleSize} appel
              {personal.sampleSize > 1 ? "s" : ""} précédent
              {personal.sampleSize > 1 ? "s" : ""} analysé
              {personal.sampleSize > 1 ? "s" : ""}.
            </p>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-white/5 p-3">
                <p className="text-xs text-white/40">Score actuel</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {personal.currentScore != null ? personal.currentScore : "—"}
                </p>
              </div>
              <div className="rounded-xl bg-white/5 p-3">
                <p className="text-xs text-white/40">Moyenne personnelle</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {personal.personalAverage != null ? personal.personalAverage : "—"}
                </p>
              </div>
            </div>
            <p className="text-sm font-medium text-violet-200">
              {trendLabel(personal.trend)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-white/55">
            {personal.message ?? "Donnée non disponible"}
          </p>
        )}
      </Card>

      <Card>
        <SectionTitle className="mb-2">Simulation vs réel</SectionTitle>
        {simReal.available && simReal.rows.length > 0 ? (
          <div className="space-y-4">
            {simReal.rows.map((row) => {
              const realPct =
                row.realMax > 0
                  ? Math.round((row.realScore / row.realMax) * 100)
                  : 0;
              const simPct =
                row.simMax > 0 ? Math.round((row.simScore / row.simMax) * 100) : 0;
              return (
                <div key={row.key}>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-white">{row.label}</span>
                    <span className="text-white/55">
                      Sim. {row.simScore}/{row.simMax} · Réel {row.realScore}/
                      {row.realMax}
                      {row.deltaPct != null ? ` (${row.deltaPct > 0 ? "+" : ""}${row.deltaPct} pts)` : ""}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="h-2 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-white/25"
                        style={{ width: `${simPct}%` }}
                        title="Simulation"
                      />
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#3E6BFF] via-violet-500 to-orange-400"
                        style={{ width: `${realPct}%` }}
                        title="Appel réel"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-white/55">
            {simReal.message ?? "Donnée non disponible"}
          </p>
        )}
      </Card>
    </div>
  );
}

function AssociatedExercisesSection({ data }: { data: RealCallDetailView }) {
  const { associatedExercises } = data;

  return (
    <section className="mt-8" aria-labelledby="associated-exercises-title">
      <h2
        id="associated-exercises-title"
        className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-white/40"
      >
        Exercices associés
      </h2>
      {associatedExercises.items.length === 0 ? (
        <Card>
          <p className="text-sm text-white/55">
            Aucun exercice associé pour le moment.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {associatedExercises.items.map((item) => (
            <Card key={item.scenarioId}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-white">{item.name}</p>
                  <p className="mt-1 text-sm text-white/55">
                    {item.themeName ?? "Donnée non disponible"} · {item.levelLabel}
                  </p>
                  {item.matchedSkillKeys.length > 0 ? (
                    <p className="mt-2 text-xs text-white/45">
                      Compétences ciblées : {item.matchedSkillKeys.join(", ")}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-white/45">{item.accessLabel}</p>
                  {!item.playable ? (
                    <p className="mt-2 text-sm text-orange-300">
                      À débloquer dans Missions
                    </p>
                  ) : null}
                </div>
                {item.playable && item.ctaHref ? (
                  <Link
                    href={item.ctaHref}
                    className="btn-gradient inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
                  >
                    Lancer l&apos;exercice
                  </Link>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function DetailTabs({ data }: { data: RealCallDetailView }) {
  const [tab, setTab] = useState<DetailTabId>("resume");

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = DETAIL_TABS.findIndex((t) => t.id === tab);
    if (idx < 0) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setTab(DETAIL_TABS[(idx + 1) % DETAIL_TABS.length]!.id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setTab(
        DETAIL_TABS[(idx - 1 + DETAIL_TABS.length) % DETAIL_TABS.length]!.id,
      );
    }
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Onglets de l'analyse d'appel réel"
        className="mb-5 flex flex-wrap gap-2"
        onKeyDown={onKeyDown}
      >
        {DETAIL_TABS.map((t) => {
          const selected = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`real-call-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`real-call-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={cx(
                "min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b12]",
                selected
                  ? "bg-[#3E6BFF] text-white"
                  : "bg-white/5 text-white/65 hover:bg-white/10",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {DETAIL_TABS.map((t) => {
        if (tab !== t.id) return null;
        return (
          <div
            key={t.id}
            role="tabpanel"
            id={`real-call-panel-${t.id}`}
            aria-labelledby={`real-call-tab-${t.id}`}
          >
            {t.id === "resume" ? (
              <ResumePanel data={data} onGoComparatif={() => setTab("comparatif")} />
            ) : null}
            {t.id === "ligne" ? <LignePanel data={data} /> : null}
            {t.id === "pourquoi" ? <PourquoiPanel data={data} /> : null}
            {t.id === "comparatif" ? <ComparatifPanel data={data} /> : null}
          </div>
        );
      })}
    </div>
  );
}

export function RealCallDetailClient({
  initial,
}: {
  initial: RealCallDetailView;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [pollExhausted, setPollExhausted] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const pollsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isReady = data.status === RecordingStatus.READY;
  const isFailed = data.status === RecordingStatus.FAILED;
  const isCancelled = data.status === RecordingStatus.CANCELLED;
  const isCancelRequested = data.status === RecordingStatus.CANCEL_REQUESTED;
  const isTerminal = isReady || isFailed || isCancelled;
  const isProcessing = !isTerminal;
  const canCancel =
    data.status === RecordingStatus.UPLOADED ||
    data.status === RecordingStatus.PREPROCESSING ||
    data.status === RecordingStatus.TRANSCRIBING ||
    data.status === RecordingStatus.ANALYZING ||
    data.status === RecordingStatus.WAITING_FOR_CLARIFICATION ||
    data.status === RecordingStatus.GENERATING_EXERCISE;
  const canDelete =
    data.status === RecordingStatus.PENDING_UPLOAD ||
    data.status === RecordingStatus.READY ||
    data.status === RecordingStatus.FAILED ||
    data.status === RecordingStatus.CANCELLED;

  const fetchDetail = useCallback(async (): Promise<RealCallDetailView | null> => {
    try {
      const res = await fetch(`/api/real-calls/${data.id}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) return null;
      return (json?.data as RealCallDetailView | undefined) ?? null;
    } catch {
      return null;
    }
  }, [data.id]);

  useEffect(() => {
    if (!isProcessing) return;

    pollsRef.current = 0;
    setPollExhausted(false);

    const poll = async () => {
      if (pollsRef.current >= MAX_POLLS) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        setPollExhausted(true);
        return;
      }
      pollsRef.current += 1;
      const detail = await fetchDetail();
      if (!detail) return;
      setData(detail);
    };

    void poll();
    timerRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [isProcessing, fetchDetail]);

  const retry = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(`/api/real-calls/${data.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setRetryError(json?.error?.message ?? "La relance a échoué.");
        setRetrying(false);
        return;
      }
      const detail = await fetchDetail();
      if (detail) setData(detail);
      setRetrying(false);
    } catch {
      setRetryError("La relance a échoué (réseau).");
      setRetrying(false);
    }
  }, [data.id, fetchDetail, retrying]);

  const cancelAnalysis = useCallback(async () => {
    if (actionBusy) return;
    if (!window.confirm(CANCEL_CONFIRM)) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/real-calls/${data.id}/cancel`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(json?.error?.message ?? "Impossible d'arrêter l'analyse.");
        return;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const detail = await fetchDetail();
      if (detail) setData(detail);
    } catch {
      setActionError("Impossible d'arrêter l'analyse.");
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, data.id, fetchDetail]);

  const deleteCall = useCallback(async () => {
    if (actionBusy) return;
    if (!window.confirm(DELETE_CONFIRM)) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/real-calls/${data.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(json?.error?.message ?? "Impossible de supprimer cet appel.");
        return;
      }
      router.push("/app/real-calls");
    } catch {
      setActionError("Impossible de supprimer cet appel.");
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, data.id, router]);

  return (
    <div className="animate-fade-up pb-6">
      <div className="mb-4">
        <BackLink />
      </div>

      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-white">{data.title}</h1>
          <Badge tone={statusBadgeTone(data.statusTone)}>{data.statusLabel}</Badge>
        </div>
        <p className="mt-2 text-sm text-white/45">
          {formatDateTimeFr(data.createdAt)} · {formatDuration(data.durationSec)}
        </p>
      </header>

      {actionError ? (
        <p className="mb-3 text-sm text-red-300" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="mb-4 flex flex-col gap-2">
        {canCancel ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full"
            disabled={actionBusy}
            onClick={() => void cancelAnalysis()}
          >
            {actionBusy ? "Arrêt…" : "Arrêter l'analyse"}
          </Button>
        ) : null}
        {isCancelRequested ? (
          <Button type="button" variant="outline" className="min-h-11 w-full" disabled>
            Arrêt en cours…
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full"
            disabled={actionBusy}
            onClick={() => void deleteCall()}
          >
            {actionBusy ? "Suppression…" : "Supprimer"}
          </Button>
        ) : null}
      </div>

      {isProcessing ? (
        <ProcessingView data={data} pollExhausted={pollExhausted} />
      ) : null}

      {isCancelled ? (
        <Card className="mt-2">
          <p className="text-sm text-white/70">
            Analyse arrêtée. Aucun résultat de coaching n&apos;a été conservé pour
            cette tentative. Vous pouvez supprimer cet appel.
          </p>
          <LinkButton
            href="/app/real-calls"
            variant="primary"
            className="mt-4 min-h-11 w-full"
          >
            Revenir à mes appels
          </LinkButton>
        </Card>
      ) : null}

      {isFailed ? (
        <FailedView
          data={data}
          retrying={retrying}
          retryError={retryError}
          onRetry={() => void retry()}
        />
      ) : null}

      {isReady ? (
        <>
          <DetailTabs data={data} />
          <AssociatedExercisesSection data={data} />
        </>
      ) : null}
    </div>
  );
}
