import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTelepro } from "@/lib/auth";
import { Card, Badge, EmptyState, SectionTitle } from "@/components/ui";
import { MiniScore } from "@/components/ScoreRing";
import { CALL_TYPE_LABELS } from "@/lib/enums";
import { formatDateFr } from "@/lib/utils";

/**
 * Destination Progression — réutilise la consultation historique existante
 * (simulations terminées + moyennes de compétences déjà calculées).
 * Pas de graphiques ni agrégats inventés.
 */
export default async function ProgressionPage() {
  const user = await requireTelepro();

  const sims = await prisma.simulation.findMany({
    where: {
      teleproId: user.id,
      organizationId: user.organizationId,
      status: "COMPLETED",
    },
    include: {
      scenario: true,
      evaluation: { select: { overallScore: true } },
    },
    orderBy: { endedAt: "desc" },
  });

  const skillAgg = await prisma.skillScore.findMany({
    where: { evaluation: { simulation: { teleproId: user.id } } },
    select: { label: true, score: true, maxScore: true },
  });
  const bySkill = new Map<string, { total: number; max: number; n: number }>();
  for (const s of skillAgg) {
    const cur = bySkill.get(s.label) ?? { total: 0, max: 0, n: 0 };
    cur.total += s.score;
    cur.max += s.maxScore;
    cur.n += 1;
    bySkill.set(s.label, cur);
  }

  return (
    <div className="animate-fade-up">
      <h1 className="mb-1 text-2xl font-bold">Progression</h1>
      <p className="mb-6 text-sm text-white/50">
        Historique de tes simulations et évolution par compétence.
      </p>

      {sims.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="Aucune simulation terminée"
          description="Lance ta première simulation depuis l'accueil pour voir tes résultats ici."
        />
      ) : (
        <>
          <SectionTitle className="mb-3">Historique</SectionTitle>
          <div className="space-y-3">
            {sims.map((s) => (
              <Link key={s.id} href={`/app/analysis/${s.id}`}>
                <Card hover className="flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-lg">
                      {s.scenario.callType === "VENTE" ? "📈" : "🎯"}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">
                        {s.scenario.name}
                      </p>
                      <p className="text-xs text-white/45">
                        📅 {formatDateFr(s.endedAt)}
                      </p>
                      <Badge tone="violet" className="mt-1">
                        {CALL_TYPE_LABELS[s.scenario.callType] ?? s.scenario.callType}
                      </Badge>
                    </div>
                  </div>
                  <MiniScore score={s.evaluation?.overallScore ?? 0} size={58} />
                </Card>
              </Link>
            ))}
          </div>

          {bySkill.size > 0 && (
            <div className="mt-8">
              <SectionTitle className="mb-3">Évolution par compétence</SectionTitle>
              <Card>
                <div className="space-y-3">
                  {[...bySkill.entries()].map(([label, agg]) => {
                    const pct =
                      agg.max > 0 ? Math.round((agg.total / agg.max) * 100) : 0;
                    return (
                      <div key={label}>
                        <div className="flex justify-between text-sm">
                          <span className="text-white/75">{label}</span>
                          <span className="text-white/50">{pct}%</span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/5">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background:
                                "linear-gradient(90deg,#3b82f6,#8b5cf6,#f97316)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
