import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { Card, StatCard, Badge, SectionTitle, LinkButton } from "@/components/ui";
import { MiniScore } from "@/components/ScoreRing";
import { RECORDING_STATUS_LABELS, Role } from "@/lib/enums";
import { formatDateFr } from "@/lib/utils";

export default async function ManagerDashboard() {
  const user = await requireManager();
  const orgId = user.organizationId;

  const since7 = new Date(Date.now() - 7 * 864e5).toISOString();
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();

  const [
    teleproCount,
    completedCount,
    completed7,
    completed30,
    assignmentsCount,
    completedAssignments,
    evals,
    recentRecordings,
    telepros,
  ] = await Promise.all([
    prisma.user.count({ where: { organizationId: orgId, role: Role.TELEPRO, isActive: true } }),
    prisma.simulation.count({ where: { organizationId: orgId, status: "COMPLETED" } }),
    prisma.simulation.count({ where: { organizationId: orgId, status: "COMPLETED", endedAt: { gte: since7 } } }),
    prisma.simulation.count({ where: { organizationId: orgId, status: "COMPLETED", endedAt: { gte: since30 } } }),
    prisma.scenarioAssignment.count({ where: { organizationId: orgId } }),
    prisma.scenarioAssignment.count({ where: { organizationId: orgId, status: "COMPLETED" } }),
    prisma.simulationEvaluation.findMany({
      where: { simulation: { organizationId: orgId } },
      select: { overallScore: true },
    }),
    prisma.callRecording.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.user.findMany({
      where: { organizationId: orgId, role: Role.TELEPRO, isActive: true },
      include: {
        simulations: {
          where: { status: "COMPLETED" },
          include: { evaluation: { select: { overallScore: true } } },
        },
      },
    }),
  ]);

  const avgScore =
    evals.length > 0
      ? Math.round(evals.reduce((s, e) => s + e.overallScore, 0) / evals.length)
      : null;
  const completionRate =
    assignmentsCount > 0
      ? Math.round((completedAssignments / assignmentsCount) * 100)
      : 0;

  // Téléprospecteurs ayant besoin d'accompagnement (score moyen < 60 ou aucune tentative).
  const needHelp = telepros
    .map((t) => {
      const scores = t.simulations
        .map((s) => s.evaluation?.overallScore)
        .filter((n): n is number => typeof n === "number");
      const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      return { id: t.id, name: t.fullName, avg, attempts: scores.length };
    })
    .filter((t) => t.avg === null || t.avg < 60)
    .sort((a, b) => (a.avg ?? -1) - (b.avg ?? -1))
    .slice(0, 5);

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tableau de bord</h1>
          <p className="text-sm text-white/50">{user.organizationName}</p>
        </div>
        <LinkButton href="/manager/scenarios/new" variant="primary">
          + Nouveau scénario
        </LinkButton>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Téléprospecteurs" value={teleproCount} accent="violet" />
        <StatCard label="Simulations terminées" value={completedCount} sub={`${completed7} sur 7j · ${completed30} sur 30j`} accent="blue" />
        <StatCard label="Score moyen" value={avgScore ?? "—"} sub="/ 100" accent="flame" />
        <StatCard label="Taux de complétion" value={`${completionRate}%`} sub={`${completedAssignments}/${assignmentsCount} entraînements`} accent="mint" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Télépros à accompagner */}
        <div>
          <SectionTitle className="mb-3">À accompagner</SectionTitle>
          {needHelp.length === 0 ? (
            <Card className="text-sm text-white/50">
              Toute l&apos;équipe est au niveau attendu 🎉
            </Card>
          ) : (
            <div className="space-y-2">
              {needHelp.map((t) => (
                <Link key={t.id} href={`/manager/team/${t.id}`}>
                  <Card hover className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium text-white">{t.name}</p>
                      <p className="text-xs text-white/45">
                        {t.attempts === 0 ? "Aucune tentative" : `${t.attempts} tentative(s)`}
                      </p>
                    </div>
                    {t.avg === null ? (
                      <Badge tone="gray">Nouveau</Badge>
                    ) : (
                      <MiniScore score={t.avg} size={50} />
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Derniers appels importés */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <SectionTitle>Derniers appels importés</SectionTitle>
            <Link href="/manager/recordings" className="text-xs text-violet-300 hover:underline">
              Tout voir →
            </Link>
          </div>
          {recentRecordings.length === 0 ? (
            <Card className="text-sm text-white/50">
              Aucun appel importé.{" "}
              <Link href="/manager/recordings" className="text-violet-300">Importer</Link>
            </Card>
          ) : (
            <div className="space-y-2">
              {recentRecordings.map((r) => (
                <Card key={r.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{r.title}</p>
                    <p className="text-xs text-white/45">{formatDateFr(r.createdAt)}</p>
                  </div>
                  <RecordingStatusBadge status={r.status} />
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecordingStatusBadge({ status }: { status: string }) {
  const tone =
    status === "READY" ? "mint" : status === "FAILED" ? "red" : "blue";
  return <Badge tone={tone}>{RECORDING_STATUS_LABELS[status] ?? status}</Badge>;
}
