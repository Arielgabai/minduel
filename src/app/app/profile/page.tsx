import { prisma } from "@/lib/db";
import { requireTelepro } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { ScoreRing } from "@/components/ScoreRing";
import { LogoutButton } from "@/components/LogoutButton";

export default async function ProfilePage() {
  const user = await requireTelepro();

  const [evaluations, dbUser, completedCount] = await Promise.all([
    prisma.simulationEvaluation.findMany({
      where: { simulation: { teleproId: user.id } },
      select: { overallScore: true },
    }),
    prisma.user.findUnique({ where: { id: user.id } }),
    prisma.simulation.count({
      where: { teleproId: user.id, status: "COMPLETED" },
    }),
  ]);

  const avg =
    evaluations.length > 0
      ? Math.round(evaluations.reduce((s, e) => s + e.overallScore, 0) / evaluations.length)
      : 0;
  const streak = dbUser?.streakDays ?? 0;

  return (
    <div className="animate-fade-up">
      <h1 className="mb-1 text-2xl font-bold">Profil</h1>
      <p className="mb-6 text-sm text-white/50">{user.fullName}</p>

      <SectionTitle className="mb-3 text-center">Mes stats</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Card className="flex flex-col items-center">
          <p className="text-xs uppercase tracking-wide text-white/40">Score moyen</p>
          <ScoreRing score={avg} size={120} stroke={9} className="mt-2" />
        </Card>
        <Card className="flex flex-col items-center justify-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-flame-500/15 text-3xl glow-flame">
            🔥
          </div>
          <p className="text-xs uppercase tracking-wide text-white/40">Série</p>
          <p className="text-2xl font-bold text-flame-400">
            {streak} jour{streak > 1 ? "s" : ""}
          </p>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-white/40">Simulations</p>
          <p className="mt-1 text-2xl font-bold text-violet-300">{completedCount}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-white/40">Organisation</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">
            {user.organizationName}
          </p>
          <p className="text-xs text-white/45">{user.email}</p>
        </Card>
      </div>

      <div className="mt-8">
        <SectionTitle className="mb-3">Compte</SectionTitle>
        <LogoutButton />
      </div>
    </div>
  );
}
