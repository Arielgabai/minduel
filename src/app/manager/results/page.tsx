import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { Card, Badge, EmptyState, SectionTitle } from "@/components/ui";
import { MiniScore } from "@/components/ScoreRing";
import { LEVEL_LABELS, OUTCOME_LABELS, Role } from "@/lib/enums";
import { formatDateTimeFr } from "@/lib/utils";
import { ResultsFilters } from "./ResultsFilters";

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ telepro?: string; scenario?: string; period?: string }>;
}) {
  const manager = await requireManager();
  const sp = await searchParams;

  const periodDays = sp.period ? Number(sp.period) : 0;
  const sinceIso =
    periodDays > 0 ? new Date(Date.now() - periodDays * 864e5).toISOString() : undefined;

  const [telepros, scenarios, sims] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: manager.organizationId, role: Role.TELEPRO },
      select: { id: true, fullName: true },
    }),
    prisma.scenario.findMany({
      where: { organizationId: manager.organizationId },
      select: { id: true, name: true },
    }),
    prisma.simulation.findMany({
      where: {
        organizationId: manager.organizationId,
        status: "COMPLETED",
        ...(sp.telepro ? { teleproId: sp.telepro } : {}),
        ...(sp.scenario ? { scenarioId: sp.scenario } : {}),
        ...(sinceIso ? { endedAt: { gte: sinceIso } } : {}),
      },
      include: {
        scenario: { select: { name: true, level: true } },
        telepro: { select: { fullName: true } },
        evaluation: { select: { overallScore: true, outcome: true } },
      },
      orderBy: { endedAt: "desc" },
    }),
  ]);

  const avg =
    sims.length > 0
      ? Math.round(
          sims.reduce((s, x) => s + (x.evaluation?.overallScore ?? 0), 0) / sims.length,
        )
      : null;

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Résultats</h1>
          <p className="text-sm text-white/50">
            {sims.length} tentative(s){avg !== null ? ` · score moyen ${avg}/100` : ""}
          </p>
        </div>
        <a
          href="/api/export/results"
          className="btn-gradient rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
        >
          ⬇ Export CSV
        </a>
      </div>

      <ResultsFilters
        telepros={telepros}
        scenarios={scenarios}
        current={{ telepro: sp.telepro, scenario: sp.scenario, period: sp.period }}
      />

      <div className="mt-6">
        <SectionTitle className="mb-3">Tentatives</SectionTitle>
        {sims.length === 0 ? (
          <EmptyState title="Aucun résultat" description="Aucune simulation ne correspond à ces filtres." />
        ) : (
          <div className="space-y-2">
            {sims.map((s) => (
              <Link key={s.id} href={`/manager/results/${s.id}`}>
                <Card hover className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-white">
                      {s.telepro.fullName} — {s.scenario.name}
                    </p>
                    <p className="text-xs text-white/45">{formatDateTimeFr(s.endedAt)}</p>
                    <div className="mt-1 flex gap-1">
                      <Badge tone="violet">{LEVEL_LABELS[s.scenario.level]}</Badge>
                      {s.evaluation?.outcome && (
                        <Badge tone={s.evaluation.outcome === "REFUS" ? "red" : "mint"}>
                          {OUTCOME_LABELS[s.evaluation.outcome] ?? s.evaluation.outcome}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <MiniScore score={s.evaluation?.overallScore ?? 0} size={52} />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
