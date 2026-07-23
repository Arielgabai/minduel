import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { Card, Badge, SectionTitle } from "@/components/ui";
import { ScoreRing } from "@/components/ScoreRing";
import { parseJson, formatDateTimeFr, formatDuration } from "@/lib/utils";
import { OUTCOME_LABELS } from "@/lib/enums";

export default async function ResultDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const manager = await requireManager();

  const sim = await prisma.simulation.findFirst({
    where: { id, organizationId: manager.organizationId },
    include: {
      scenario: { select: { name: true } },
      telepro: { select: { fullName: true } },
      evaluation: { include: { skillScores: true } },
      turns: { orderBy: { atMs: "asc" } },
    },
  });
  if (!sim || !sim.evaluation) notFound();

  // Tentative précédente du même télépro sur le même scénario (pour comparaison).
  const previous = await prisma.simulation.findFirst({
    where: {
      organizationId: manager.organizationId,
      teleproId: sim.teleproId,
      scenarioId: sim.scenarioId,
      status: "COMPLETED",
      endedAt: { lt: sim.endedAt ?? undefined },
    },
    include: { evaluation: { select: { overallScore: true } } },
    orderBy: { endedAt: "desc" },
  });

  const ev = sim.evaluation;
  const strengths = parseJson<string[]>(ev.strengths, []);
  const improvements = parseJson<string[]>(ev.improvements, []);
  const prevScore = previous?.evaluation?.overallScore ?? null;
  const delta = prevScore !== null ? ev.overallScore - prevScore : null;

  return (
    <div className="animate-fade-up">
      <Link href="/manager/results" className="text-sm text-white/50 hover:text-white/80">
        ← Résultats
      </Link>
      <div className="mt-2 mb-6">
        <h1 className="text-2xl font-bold">
          {sim.telepro.fullName} — {sim.scenario.name}
        </h1>
        <p className="text-sm text-white/50">{formatDateTimeFr(sim.endedAt)}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <Card className="flex flex-col items-center">
            <ScoreRing score={ev.overallScore} />
            <div className="mt-3 flex items-center gap-2">
              {ev.outcome && (
                <Badge tone={ev.outcome === "REFUS" ? "red" : "mint"}>
                  {OUTCOME_LABELS[ev.outcome] ?? ev.outcome}
                </Badge>
              )}
              <Badge tone="gray">⏱ {formatDuration(sim.durationSec)}</Badge>
            </div>
            {delta !== null && (
              <p className="mt-3 text-sm">
                vs précédente ({prevScore}) :{" "}
                <span className={delta >= 0 ? "text-emerald-300" : "text-red-300"}>
                  {delta >= 0 ? "+" : ""}
                  {delta}
                </span>
              </p>
            )}
          </Card>

          <Card>
            <SectionTitle className="mb-2">Compétences</SectionTitle>
            <div className="space-y-3">
              {ev.skillScores.map((s) => (
                <div key={s.id}>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/75">{s.label}</span>
                    <span className="text-white/50">{s.score}/{s.maxScore}</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(s.score / s.maxScore) * 100}%`,
                        background: "linear-gradient(90deg,#3b82f6,#8b5cf6,#f97316)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <SectionTitle className="mb-2">Points forts</SectionTitle>
              <ul className="space-y-1 text-sm text-white/75">
                {strengths.length ? strengths.map((s, i) => <li key={i}>✓ {s}</li>) : <li className="text-white/40">—</li>}
              </ul>
            </Card>
            <Card>
              <SectionTitle className="mb-2">Axes de travail</SectionTitle>
              <ul className="space-y-1 text-sm text-white/75">
                {improvements.length ? improvements.map((s, i) => <li key={i}>→ {s}</li>) : <li className="text-white/40">—</li>}
              </ul>
            </Card>
          </div>

          {ev.summary && (
            <Card className="text-sm text-white/70">{ev.summary}</Card>
          )}

          <div>
            <SectionTitle className="mb-3">Transcript</SectionTitle>
            <Card className="max-h-[500px] space-y-3 overflow-y-auto">
              {sim.turns.map((t) => (
                <div key={t.id} className="text-sm">
                  <span className="text-[0.6rem] uppercase tracking-wide text-white/40">
                    {t.role === "AGENT" ? sim.telepro.fullName : t.role === "PROSPECT" ? sim.prospectName : "Système"}
                  </span>
                  <p className={t.role === "AGENT" ? "text-violet-200" : "text-white/80"}>{t.content}</p>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
