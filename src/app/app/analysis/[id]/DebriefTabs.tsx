"use client";

import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ScoreRing } from "@/components/ScoreRing";
import { Badge, Card, LinkButton, SectionTitle } from "@/components/ui";
import { OUTCOME_LABELS } from "@/lib/enums";
import { cx, formatDuration } from "@/lib/utils";
import {
  DEBRIEF_TABS,
  type DebriefTabId,
  type DebriefView,
  type ListFieldStatus,
} from "@/lib/debriefView";

function listMessage(status: ListFieldStatus, emptyLabel: string): string | null {
  if (status === "unavailable") return "Donnée non disponible";
  if (status === "empty") return emptyLabel;
  return null;
}

function ListBlock({
  title,
  status,
  items,
  emptyLabel,
}: {
  title: string;
  status: ListFieldStatus;
  items: string[];
  emptyLabel: string;
}) {
  const msg = listMessage(status, emptyLabel);
  return (
    <Card>
      <SectionTitle className="mb-2">{title}</SectionTitle>
      {msg ? (
        <p className="text-sm text-white/50">{msg}</p>
      ) : (
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-white/75">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ResumePanel({ view }: { view: DebriefView }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center">
        <SectionTitle>Score</SectionTitle>
        {view.overallScore != null ? (
          <ScoreRing score={view.overallScore} className="mt-3" />
        ) : (
          <p className="mt-3 text-sm text-white/50">Score non disponible</p>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {view.outcome && (
            <Badge tone={view.outcome === "REFUS" ? "red" : "mint"}>
              {OUTCOME_LABELS[view.outcome] ?? view.outcome}
            </Badge>
          )}
          <Badge tone="gray">{formatDuration(view.durationSec)}</Badge>
        </div>
        {view.summary ? (
          <p className="mt-3 max-w-sm text-center text-sm text-white/60">
            {view.summary}
          </p>
        ) : (
          <p className="mt-3 text-center text-sm text-white/45">
            Résumé non disponible
          </p>
        )}
      </div>

      <ListBlock
        title="Points forts"
        status={view.strengths.status}
        items={view.strengths.items}
        emptyLabel="Aucun point fort enregistré"
      />
      <ListBlock
        title="À améliorer"
        status={view.improvements.status}
        items={view.improvements.items}
        emptyLabel="Aucun axe d'amélioration enregistré"
      />
      <ListBlock
        title="Conseils"
        status={view.advice.status}
        items={view.advice.items}
        emptyLabel="Aucun conseil enregistré"
      />

      {view.betterExample ? (
        <Card className="border-violet-500/30 text-sm italic text-white/80">
          <SectionTitle className="mb-2">Meilleure formulation</SectionTitle>
          {view.betterExample}
        </Card>
      ) : (
        <Card>
          <SectionTitle className="mb-2">Meilleure formulation</SectionTitle>
          <p className="text-sm text-white/50">Donnée non disponible</p>
        </Card>
      )}

      <Card>
        <SectionTitle className="mb-2">Moments clés</SectionTitle>
        {view.keyMoments.status === "unavailable" ? (
          <p className="text-sm text-white/50">Donnée non disponible</p>
        ) : view.keyMoments.status === "empty" ? (
          <p className="text-sm text-white/50">Aucun moment clé enregistré</p>
        ) : (
          <div className="space-y-3">
            {view.keyMoments.items.map((m, i) => (
              <div key={`${m.atMs}-${i}`} className="text-sm">
                <p className="mb-1 text-[0.6rem] uppercase tracking-wide text-white/40">
                  {m.role === "AGENT" ? "Toi" : view.prospectName ?? "Prospect"} ·{" "}
                  {m.timeLabel}
                </p>
                <p className="text-white/80">« {m.quote} »</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {view.skillScores.length > 0 ? (
        <Card>
          <SectionTitle className="mb-3">Compétences</SectionTitle>
          <div className="space-y-4">
            {view.skillScores.map((s) => (
              <div key={s.key || s.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/80">{s.label}</span>
                  <span className="font-semibold text-white">
                    {s.score}
                    <span className="text-white/40">/{s.maxScore}</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-electric-500 via-violet-500 to-flame-500"
                    style={{ width: `${s.scorePct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-white/50">Non évalué</p>
        </Card>
      )}
    </div>
  );
}

function LignePanel({ view }: { view: DebriefView }) {
  if (!view.turnsAvailable) {
    return (
      <Card>
        <p className="text-sm text-white/50">Transcription indisponible</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {!view.lineAnnotationsAvailable ? (
        <Card>
          <p className="text-sm text-white/50">
            Analyse ligne par ligne indisponible pour cette simulation.
          </p>
        </Card>
      ) : null}
      {view.turns.map((t) => {
        const isAgent = t.role === "AGENT";
        return (
          <div
            key={t.id}
            className={cx("flex", isAgent ? "justify-end" : "justify-start")}
          >
            <div
              className={cx(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                isAgent
                  ? "bg-electric-500/20 text-white"
                  : "bg-white/10 text-white/85",
              )}
            >
              <div className="mb-1 flex items-center gap-2 text-[0.65rem] uppercase tracking-wide text-white/40">
                <span>{isAgent ? "Toi" : view.prospectName ?? "Prospect"}</span>
                <span>{t.timeLabel}</span>
                {t.isKeyMoment ? (
                  <Badge tone="flame" className="normal-case tracking-normal">
                    Moment clé
                  </Badge>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap">{t.content}</p>
              {t.keyMomentQuote ? (
                <p className="mt-2 text-xs text-flame-300/90">
                  Extrait retenu : « {t.keyMomentQuote} »
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PourquoiPanel({ view }: { view: DebriefView }) {
  if (view.skillScores.length === 0) {
    return (
      <Card>
        <p className="text-sm text-white/50">Non évalué</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {view.skillScores.map((s) => (
        <Card key={s.key || s.label}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="font-semibold text-white">{s.label}</p>
            <span className="text-sm text-white/70">
              {s.score}/{s.maxScore}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <p className="text-white/70">
              <span className="text-white/40">Observation : </span>
              {s.hasEvidence ? s.evidence : "Non renseigné"}
            </p>
            <p className="text-white/70">
              <span className="text-white/40">Pourquoi : </span>
              {s.hasRationale ? s.rationale : "Non renseigné"}
            </p>
            <p className="text-white/70">
              <span className="text-white/40">Recommandation : </span>
              {s.hasRecommendation ? s.recommendation : "Non renseigné"}
            </p>
          </div>
          {s.skillLinks.length > 0 ? (
            <div className="mt-3 space-y-2">
              <SectionTitle>Aller plus loin</SectionTitle>
              {s.skillLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-electric-300 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
                >
                  <span className="font-medium">{link.title}</span>
                  <span className="mt-0.5 block text-xs text-white/45">
                    {link.categoryName} · {link.readingMinutes} min
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

function ComparatifPanel({ view }: { view: DebriefView }) {
  const c = view.comparative;
  if (c.kind === "unavailable") {
    return (
      <Card>
        <SectionTitle className="mb-2">{c.title}</SectionTitle>
        <p className="text-sm text-white/50">{c.message}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle className="mb-2">{c.title}</SectionTitle>
        <p className="text-sm text-white/55">{c.previousDateLabel}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-white/5 p-3">
            <p className="text-xs text-white/40">Actuelle</p>
            <p className="mt-1 text-lg font-semibold text-white">
              {c.currentOverallScore != null ? c.currentOverallScore : "—"}
            </p>
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <p className="text-xs text-white/40">Précédente</p>
            <p className="mt-1 text-lg font-semibold text-white">
              {c.previousOverallScore != null ? c.previousOverallScore : "—"}
            </p>
          </div>
        </div>
      </Card>

      {c.skillComparisons.length === 0 ? (
        <Card>
          <p className="text-sm text-white/50">
            Aucune compétence comparable entre les deux tentatives.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="space-y-4">
            {c.skillComparisons.map((s) => {
              const max = s.maxScore > 0 ? s.maxScore : 1;
              const curPct = Math.max(
                0,
                Math.min(100, Math.round((s.currentScore / max) * 100)),
              );
              const prevPct = Math.max(
                0,
                Math.min(100, Math.round((s.previousScore / max) * 100)),
              );
              return (
                <div key={s.key}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-white/80">{s.label}</span>
                    <span className="text-white/50">
                      {s.previousScore} → {s.currentScore}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className="h-2 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-white/25"
                        style={{ width: `${prevPct}%` }}
                      />
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-electric-500 to-violet-500"
                        style={{ width: `${curPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

export function DebriefTabs({ view }: { view: DebriefView }) {
  const [tab, setTab] = useState<DebriefTabId>("resume");

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = DEBRIEF_TABS.findIndex((t) => t.id === tab);
    if (idx < 0) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setTab(DEBRIEF_TABS[(idx + 1) % DEBRIEF_TABS.length]!.id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setTab(
        DEBRIEF_TABS[(idx - 1 + DEBRIEF_TABS.length) % DEBRIEF_TABS.length]!.id,
      );
    } else if (e.key === "Home") {
      e.preventDefault();
      setTab(DEBRIEF_TABS[0]!.id);
    } else if (e.key === "End") {
      e.preventDefault();
      setTab(DEBRIEF_TABS[DEBRIEF_TABS.length - 1]!.id);
    }
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Onglets du débrief"
        className="mb-5 flex flex-wrap gap-2"
        onKeyDown={onKeyDown}
      >
        {DEBRIEF_TABS.map((t) => {
          const selected = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`debrief-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`debrief-panel-${t.id}`}
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

      {DEBRIEF_TABS.map((t) => {
        if (tab !== t.id) return null;
        return (
          <div
            key={t.id}
            role="tabpanel"
            id={`debrief-panel-${t.id}`}
            aria-labelledby={`debrief-tab-${t.id}`}
          >
            {t.id === "resume" ? <ResumePanel view={view} /> : null}
            {t.id === "ligne" ? <LignePanel view={view} /> : null}
            {t.id === "pourquoi" ? <PourquoiPanel view={view} /> : null}
            {t.id === "comparatif" ? <ComparatifPanel view={view} /> : null}
          </div>
        );
      })}

      <div className="mt-8 flex flex-col gap-3">
        <LinkButton href="/app/missions" variant="primary" className="w-full py-4">
          Retour aux missions
        </LinkButton>
        <LinkButton href="/app/progression" variant="ghost" className="w-full">
          Voir ma progression
        </LinkButton>
      </div>
    </div>
  );
}