import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTelepro } from "@/lib/auth";
import { Card, Badge, SectionTitle, LinkButton } from "@/components/ui";
import { ScoreRing } from "@/components/ScoreRing";
import { parseJson, formatDuration } from "@/lib/utils";
import { OUTCOME_LABELS } from "@/lib/enums";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireTelepro();

  const sim = await prisma.simulation.findFirst({
    where: { id, organizationId: user.organizationId, teleproId: user.id },
    include: {
      scenario: true,
      evaluation: { include: { skillScores: true } },
      turns: { orderBy: { atMs: "asc" } },
    },
  });
  if (!sim || !sim.evaluation) notFound();

  const ev = sim.evaluation;
  const strengths = parseJson<string[]>(ev.strengths, []);
  const improvements = parseJson<string[]>(ev.improvements, []);
  const advice = parseJson<string[]>(ev.advice, []);
  const keyMoments = parseJson<Array<{ role: string; quote: string; atMs: number }>>(
    ev.keyMoments,
    [],
  );

  return (
    <div className="animate-fade-up pb-6">
      <div className="mb-2 text-center">
        <h1 className="text-2xl font-bold">Ton analyse</h1>
        <p className="text-sm text-white/50">{sim.scenario.name}</p>
      </div>

      {/* Score global */}
      <div className="mt-4 flex flex-col items-center">
        <SectionTitle>Score</SectionTitle>
        <ScoreRing score={ev.overallScore} className="mt-3" />
        <div className="mt-3 flex items-center gap-2">
          {ev.outcome && (
            <Badge tone={ev.outcome === "REFUS" ? "red" : "mint"}>
              {OUTCOME_LABELS[ev.outcome] ?? ev.outcome}
            </Badge>
          )}
          <Badge tone="gray">⏱ {formatDuration(sim.durationSec)}</Badge>
        </div>
        {ev.summary && (
          <p className="mt-3 max-w-sm text-center text-sm text-white/60">
            {ev.summary}
          </p>
        )}
      </div>

      {/* Insights */}
      <div className="mt-8">
        <SectionTitle className="mb-3">Insights</SectionTitle>
        <div className="space-y-3">
          {strengths[0] && (
            <InsightCard tone="mint" icon="👍" title="Point fort" text={strengths[0]} />
          )}
          {improvements[0] && (
            <InsightCard tone="flame" icon="⚠️" title="À améliorer" text={improvements[0]} />
          )}
          {advice[0] && (
            <InsightCard tone="violet" icon="💡" title="Conseil" text={advice[0]} />
          )}
        </div>
      </div>

      {/* Scores par critère */}
      <div className="mt-8">
        <SectionTitle className="mb-3">Détail par compétence</SectionTitle>
        <Card>
          <div className="space-y-4">
            {ev.skillScores
              .slice()
              .sort((a, b) => b.maxScore - a.maxScore)
              .map((s) => (
                <div key={s.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/80">{s.label}</span>
                    <span className="font-semibold text-white">
                      {s.score}
                      <span className="text-white/40">/{s.maxScore}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(s.score / s.maxScore) * 100}%`,
                        background: "linear-gradient(90deg,#3b82f6,#8b5cf6,#f97316)",
                      }}
                    />
                  </div>
                  {s.recommendation && (
                    <p className="mt-1 text-xs text-white/45">→ {s.recommendation}</p>
                  )}
                </div>
              ))}
          </div>
        </Card>
      </div>

      {/* Meilleure formulation */}
      {ev.betterExample && (
        <div className="mt-6">
          <SectionTitle className="mb-3">Exemple d&apos;une meilleure formulation</SectionTitle>
          <Card className="border-violet-500/30 text-sm italic text-white/80">
            {ev.betterExample}
          </Card>
        </div>
      )}

      {/* Moments clés */}
      {keyMoments.length > 0 && (
        <div className="mt-6">
          <SectionTitle className="mb-3">Moments clés</SectionTitle>
          <div className="space-y-2">
            {keyMoments.map((m, i) => (
              <Card key={i} className="text-sm">
                <p className="mb-1 text-[0.6rem] uppercase tracking-wide text-white/40">
                  {m.role === "AGENT" ? "Toi" : sim.prospectName} ·{" "}
                  {formatDuration(Math.round(m.atMs / 1000))}
                </p>
                <p className="text-white/80">« {m.quote} »</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-8 flex flex-col gap-3">
        <LinkButton href={`/app/prepare/${sim.scenarioId}`} variant="flame" className="w-full py-4">
          🔄 Rejouer une simulation
        </LinkButton>
        <LinkButton href="/app/history" variant="ghost" className="w-full">
          Voir mon historique
        </LinkButton>
        <LinkButton href="/app" variant="outline" className="w-full">
          Retour aux entraînements
        </LinkButton>
      </div>
    </div>
  );
}

function InsightCard({
  tone,
  icon,
  title,
  text,
}: {
  tone: "mint" | "flame" | "violet";
  icon: string;
  title: string;
  text: string;
}) {
  const colors: Record<string, string> = {
    mint: "text-emerald-300",
    flame: "text-flame-400",
    violet: "text-violet-300",
  };
  return (
    <Card className="flex items-start gap-3">
      <div className="text-xl">{icon}</div>
      <div>
        <p className={`text-sm font-semibold ${colors[tone]}`}>{title}</p>
        <p className="mt-0.5 text-sm text-white/70">{text}</p>
      </div>
    </Card>
  );
}
