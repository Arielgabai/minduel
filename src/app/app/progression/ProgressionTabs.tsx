"use client";

import { useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { cx } from "@/lib/utils";
import {
  PROGRESSION_TABS,
  type DeltaDirection,
  type ProgressionTabId,
  type ProgressionView,
} from "@/lib/progressionView";

function deltaText(direction: DeltaDirection, delta: number): string {
  const sign = delta > 0 ? "+" : "";
  if (direction === "up") return `Hausse ${sign}${delta}`;
  if (direction === "down") return `Baisse ${delta}`;
  return `Stable ${sign}${delta}`;
}

function deltaClass(direction: DeltaDirection): string {
  if (direction === "up") return "text-emerald-400";
  if (direction === "down") return "text-orange-400";
  return "text-white/55";
}

function TendancesPanel({ view }: { view: ProgressionView }) {
  const t = view.trends;
  if (t.empty) {
    return (
      <Card>
        <p className="text-sm text-white/55">{t.emptyMessage}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-white/45">
        {t.evaluatedCount} tentative{t.evaluatedCount > 1 ? "s" : ""}{" "}
        évaluée{t.evaluatedCount > 1 ? "s" : ""} sur{" "}
        {t.finishedCount} terminée{t.finishedCount > 1 ? "s" : ""}.
        {t.truncated
          ? " Historique détaillé limité aux plus récentes."
          : ""}
      </p>

      <Card>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs text-white/45">Score moyen</dt>
            <dd className="mt-1 text-xl font-bold text-white">
              {t.averageScore != null ? `${t.averageScore}/100` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-white/45">Meilleur score</dt>
            <dd className="mt-1 text-xl font-bold text-white">
              {t.bestScore != null ? `${t.bestScore}/100` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-white/45">Dernier score</dt>
            <dd className="mt-1 text-xl font-bold text-white">
              {t.lastScore != null ? `${t.lastScore}/100` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-white/45">Évaluées</dt>
            <dd className="mt-1 text-xl font-bold text-white">
              {t.evaluatedCount}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-white">
          Évolution des scores
        </h2>
        {!t.hasTrend ? (
          <p className="text-sm text-white/50">
            Une seule évaluation : score affiché, aucune tendance calculée.
          </p>
        ) : null}
        <div
          role="img"
          aria-label={`Graphique des scores sur ${t.chartPoints.length} évaluations`}
          className="mt-3 flex h-40 items-end gap-1.5"
        >
          {t.chartPoints.map((p) => (
            <div
              key={p.simulationId}
              className="flex min-w-0 flex-1 flex-col items-center justify-end"
            >
              <span className="mb-1 text-[0.65rem] text-white/50">
                {p.score}
              </span>
              <div
                className="w-full max-w-[28px] rounded-t-md bg-gradient-to-t from-[#3E6BFF] via-violet-500 to-orange-400"
                style={{ height: `${Math.max(4, p.barPct)}%` }}
                title={`${p.dateLabel} : ${p.score}/100`}
              />
            </div>
          ))}
        </div>
        <table className="sr-only">
          <caption>Scores chronologiques</caption>
          <thead>
            <tr>
              <th>Date</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {t.chartPoints.map((p) => (
              <tr key={`tbl-${p.simulationId}`}>
                <td>{p.dateLabel}</td>
                <td>{p.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Historique récent</h2>
        {t.recentHistory.map((h) => (
          <Link
            key={h.simulationId}
            href={h.analysisHref}
            className="card card-hover flex min-h-11 items-center justify-between p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">
                {h.scenarioName}
              </p>
              <p className="text-xs text-white/45">{h.dateLabel}</p>
            </div>
            <span className="shrink-0 text-sm font-semibold text-white">
              {h.evaluated && h.overallScore != null
                ? `${h.overallScore}/100`
                : "Non évalué"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ComparatifPanel({ view }: { view: ProgressionView }) {
  const c = view.comparatif;
  if (c.kind === "empty") {
    return (
      <Card>
        <p className="text-sm text-white/55">{c.message}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-white/45">{c.scopeLabel}</p>
      <Card>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-white/45">Dernière</p>
            <p className="mt-1 text-lg font-bold text-white">
              {c.current.overallScore}/100
            </p>
            <p className="mt-1 text-xs text-white/45">
              {c.current.scenarioName} · {c.current.dateLabel}
            </p>
            <Link
              href={c.current.analysisHref}
              className="mt-2 inline-flex min-h-11 items-center text-sm text-electric-400 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
            >
              Voir le débrief
            </Link>
          </div>
          <div>
            <p className="text-xs text-white/45">Précédente</p>
            <p className="mt-1 text-lg font-bold text-white">
              {c.previous.overallScore}/100
            </p>
            <p className="mt-1 text-xs text-white/45">
              {c.previous.scenarioName} · {c.previous.dateLabel}
            </p>
            <Link
              href={c.previous.analysisHref}
              className="mt-2 inline-flex min-h-11 items-center text-sm text-electric-400 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
            >
              Voir le débrief
            </Link>
          </div>
        </div>
        <p
          className={cx(
            "mt-4 text-sm font-semibold",
            deltaClass(c.overallDirection),
          )}
        >
          Score global : {deltaText(c.overallDirection, c.overallDelta)}
        </p>
      </Card>

      {c.skillDeltas.length === 0 ? (
        <Card>
          <p className="text-sm text-white/50">
            Aucune compétence comparable (même clé) entre ces tentatives.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="space-y-4">
            {c.skillDeltas.map((s) => (
              <div key={s.key}>
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="text-white/80">{s.label}</span>
                  <span className={cx("font-semibold", deltaClass(s.direction))}>
                    {s.previousPct}% → {s.currentPct}% (
                    {deltaText(s.direction, s.delta)})
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-white/25"
                      style={{ width: `${s.previousPct}%` }}
                    />
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#3E6BFF] via-violet-500 to-orange-400"
                      style={{ width: `${s.currentPct}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function DiagnosticPanel({ view }: { view: ProgressionView }) {
  const d = view.diagnostic;
  if (d.kind === "insufficient") {
    return (
      <Card>
        <p className="text-sm text-white/55">{d.message}</p>
        <p className="mt-2 text-xs text-white/40">{d.sampleHint}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-white/45">
        Diagnostic statistique à partir des scores de compétences persistants.
      </p>

      {d.strongest ? (
        <Card>
          <p className="text-xs text-white/45">Compétence la plus solide</p>
          <p className="mt-1 text-lg font-bold text-emerald-400">
            {d.strongest.label} · {d.strongest.averagePct}%
          </p>
          <p className="mt-1 text-xs text-white/45">
            {d.strongest.sampleCount} observation
            {d.strongest.sampleCount > 1 ? "s" : ""}
          </p>
        </Card>
      ) : null}

      {d.priority ? (
        <Card>
          <p className="text-xs text-white/45">Priorité de progression</p>
          <p className="mt-1 text-lg font-bold text-orange-400">
            {d.priority.label} · {d.priority.averagePct}%
          </p>
          <p className="mt-1 text-xs text-white/45">
            {d.priority.sampleCount} observation
            {d.priority.sampleCount > 1 ? "s" : ""}
          </p>
        </Card>
      ) : null}

      <div className="space-y-3">
        {d.skills.map((s) => (
          <Card key={s.key}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-white">{s.label}</p>
                <p className="mt-1 text-xs text-white/45">
                  n={s.sampleCount}
                  {s.delta != null && s.direction
                    ? ` · ${deltaText(s.direction, s.delta)}`
                    : ""}
                </p>
              </div>
              <p className="shrink-0 text-lg font-bold text-white">
                {s.averagePct}%
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#3E6BFF] via-violet-500 to-orange-400"
                style={{ width: `${s.averagePct}%` }}
              />
            </div>
            {s.skillLinks.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {s.skillLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-11 items-center text-sm text-electric-400 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
                    >
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        ))}
      </div>

      {d.recentDebriefHrefs.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-white">Débriefs récents</h2>
          {d.recentDebriefHrefs.map((r) => (
            <Link
              key={r.simulationId}
              href={r.href}
              className="flex min-h-11 items-center justify-between rounded-xl bg-white/5 px-4 text-sm text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
            >
              <span className="truncate">{r.scenarioName}</span>
              <span className="shrink-0 text-white/45">{r.dateLabel}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BadgesPanel({ view }: { view: ProgressionView }) {
  const b = view.badges;
  return (
    <div className="space-y-5">
      <p className="text-sm text-white/45">{b.notice}</p>
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <p className="text-xs text-white/45">Score moyen</p>
          <p className="mt-1 text-xl font-bold text-white">
            {b.averageScore != null ? `${b.averageScore}/100` : "—"}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-white/45">Jours distincts</p>
          <p className="mt-1 text-xl font-bold text-white">
            {b.distinctDayCount}
          </p>
        </Card>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {b.badges.map((badge) => (
          <Card
            key={badge.id}
            className={cx(
              "min-h-[120px]",
              badge.earned ? "border-electric-500/40" : "opacity-60",
            )}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-white/40">
              {badge.earned ? "Gagné" : "Verrouillé"}
            </p>
            <p className="mt-2 font-semibold text-white">{badge.label}</p>
            <p className="mt-1 text-xs text-white/50">{badge.description}</p>
            <p className="mt-3 text-sm text-white/70">
              Progression : {badge.progress}/{badge.threshold}
            </p>
            {badge.earned && badge.earnedAtLabel ? (
              <p className="mt-1 text-xs text-emerald-400">
                Obtenu le {badge.earnedAtLabel}
              </p>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}

export function ProgressionTabs({ view }: { view: ProgressionView }) {
  const [tab, setTab] = useState<ProgressionTabId>("tendances");

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = PROGRESSION_TABS.findIndex((t) => t.id === tab);
    if (idx < 0) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setTab(PROGRESSION_TABS[(idx + 1) % PROGRESSION_TABS.length]!.id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setTab(
        PROGRESSION_TABS[
          (idx - 1 + PROGRESSION_TABS.length) % PROGRESSION_TABS.length
        ]!.id,
      );
    } else if (e.key === "Home") {
      e.preventDefault();
      setTab(PROGRESSION_TABS[0]!.id);
    } else if (e.key === "End") {
      e.preventDefault();
      setTab(PROGRESSION_TABS[PROGRESSION_TABS.length - 1]!.id);
    }
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Onglets de progression"
        className="mb-5 flex flex-wrap gap-2"
        onKeyDown={onKeyDown}
      >
        {PROGRESSION_TABS.map((t) => {
          const selected = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`progression-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`progression-panel-${t.id}`}
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

      {PROGRESSION_TABS.map((t) => {
        if (tab !== t.id) return null;
        return (
          <div
            key={t.id}
            role="tabpanel"
            id={`progression-panel-${t.id}`}
            aria-labelledby={`progression-tab-${t.id}`}
          >
            {t.id === "tendances" ? <TendancesPanel view={view} /> : null}
            {t.id === "comparatif" ? <ComparatifPanel view={view} /> : null}
            {t.id === "diagnostic" ? <DiagnosticPanel view={view} /> : null}
            {t.id === "badges" ? <BadgesPanel view={view} /> : null}
          </div>
        );
      })}
    </div>
  );
}
