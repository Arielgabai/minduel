import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTelepro } from "@/lib/auth";
import { Card, Badge, SectionTitle } from "@/components/ui";
import { Waveform } from "@/components/Waveform";
import { LEVEL_LABELS } from "@/lib/enums";
import { cx } from "@/lib/utils";

export default async function TeleproHome() {
  const user = await requireTelepro();

  const [assignments, evaluations, dbUser] = await Promise.all([
    prisma.scenarioAssignment.findMany({
      where: { teleproId: user.id, organizationId: user.organizationId },
      include: { scenario: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.simulationEvaluation.findMany({
      where: { simulation: { teleproId: user.id } },
      select: { overallScore: true },
    }),
    prisma.user.findUnique({ where: { id: user.id } }),
  ]);

  const avgScore =
    evaluations.length > 0
      ? Math.round(
          evaluations.reduce((s, e) => s + e.overallScore, 0) / evaluations.length,
        )
      : null;
  const streak = dbUser?.streakDays ?? 0;

  // Nombre de simulations terminées par scénario (état de complétion).
  const completedByScenario = await prisma.simulation.groupBy({
    by: ["scenarioId"],
    where: { teleproId: user.id, status: "COMPLETED" },
    _count: { _all: true },
  });
  const completedMap = new Map(
    completedByScenario.map((c) => [c.scenarioId, c._count._all]),
  );

  const firstName = user.fullName.split(" ")[0] ?? user.fullName;
  const recommended = assignments.find(
    (a) => (completedMap.get(a.scenarioId) ?? 0) === 0,
  ) ?? assignments[0];

  return (
    <div className="animate-fade-up">
      <header className="flex items-start justify-between">
        <div>
          <p className="text-sm text-white/50">Bonjour</p>
          <h1 className="text-2xl font-bold">{firstName} 👋</h1>
        </div>
        <Link
          href="/app/profile"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5"
          aria-label="Profil"
        >
          <span className="text-sm font-semibold text-violet-300">
            {firstName.slice(0, 1).toUpperCase()}
          </span>
        </Link>
      </header>

      {/* Bouton principal : lancer une simulation */}
      <Link
        href={recommended ? `/app/prepare/${recommended.scenarioId}` : "#"}
        className={cx(
          "relative mt-6 block overflow-hidden rounded-3xl border border-violet-500/30 p-8",
          !recommended && "pointer-events-none opacity-60",
        )}
        style={{
          background:
            "radial-gradient(120% 90% at 50% 0%, rgba(124,58,237,0.35), rgba(10,11,26,0.2) 60%)",
        }}
      >
        <div className="glow-violet absolute inset-0 rounded-3xl" />
        <div className="relative flex flex-col items-center">
          <div className="animate-pulse-ring flex h-40 w-40 items-center justify-center rounded-full border-2 border-white/15">
            <div className="flex flex-col items-center">
              <Waveform bars={12} active className="h-6" />
              <p className="mt-3 text-xl font-extrabold tracking-wide">LANCER</p>
              <p className="text-xs font-medium tracking-[0.2em] text-electric-400">
                UNE SIMULATION
              </p>
              <span className="mt-2 text-lg">→</span>
            </div>
          </div>
        </div>
      </Link>

      {/* Progression : streak + score global */}
      <div className="mt-8">
        <SectionTitle className="mb-3 flex items-center gap-2">
          <span>📈</span> Ta progression
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <Card className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-flame-500/15 text-2xl glow-flame">
              🔥
            </div>
            <div>
              <p className="text-xs text-white/45">Série</p>
              <p className="text-xl font-bold text-flame-400">
                {streak} jour{streak > 1 ? "s" : ""}
              </p>
              <p className="text-[0.65rem] text-white/40">Garde le rythme !</p>
            </div>
          </Card>
          <Card className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/15 text-2xl">
              🎯
            </div>
            <div>
              <p className="text-xs text-white/45">Score global</p>
              <p className="text-xl font-bold text-violet-300">
                {avgScore ?? "—"}
                <span className="text-sm text-white/40"> / 100</span>
              </p>
              <p className="text-[0.65rem] text-white/40">Continue !</p>
            </div>
          </Card>
        </div>
      </div>

      {/* Scénarios assignés */}
      <div className="mt-8">
        <SectionTitle className="mb-3">Tes entraînements</SectionTitle>
        {assignments.length === 0 ? (
          <Card className="text-center text-sm text-white/50">
            Aucun entraînement assigné pour l&apos;instant. Ton manager va bientôt
            t&apos;en attribuer.
          </Card>
        ) : (
          <div className="space-y-3">
            {assignments.map((a) => {
              const done = completedMap.get(a.scenarioId) ?? 0;
              return (
                <Link key={a.id} href={`/app/prepare/${a.scenarioId}`}>
                  <Card hover className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-white">{a.scenario.name}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge tone={a.scenario.level === "DIFFICILE" ? "flame" : a.scenario.level === "FACILE" ? "mint" : "violet"}>
                          {LEVEL_LABELS[a.scenario.level]}
                        </Badge>
                        {done > 0 ? (
                          <Badge tone="mint">✓ {done} tentative{done > 1 ? "s" : ""}</Badge>
                        ) : (
                          <Badge tone="gray">Nouveau</Badge>
                        )}
                      </div>
                    </div>
                    <span className="text-white/30">→</span>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
