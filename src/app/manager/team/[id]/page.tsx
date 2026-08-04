import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { Card, Badge, StatCard, SectionTitle, EmptyState } from "@/components/ui";
import { MiniScore } from "@/components/ScoreRing";
import { loadManagerExercisesCatalog } from "@/lib/managerExercisesService";
import { flattenManagerCatalogExercises } from "@/lib/managerExercisesView";
import { formatDateFr } from "@/lib/utils";

export default async function TeleproDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const manager = await requireManager();

  const telepro = await prisma.user.findFirst({
    where: { id, organizationId: manager.organizationId, role: "TELEPRO" },
  });
  if (!telepro) notFound();

  // Catalogue org commun (1 requête métier) + tentatives personnelles.
  const [catalog, sims] = await Promise.all([
    loadManagerExercisesCatalog(manager.organizationId),
    prisma.simulation.findMany({
      where: {
        teleproId: id,
        organizationId: manager.organizationId,
        status: "COMPLETED",
      },
      include: {
        scenario: true,
        evaluation: { select: { overallScore: true } },
      },
      orderBy: { endedAt: "desc" },
    }),
  ]);

  const available = flattenManagerCatalogExercises(catalog);
  const availableCount = catalog.totalCount;

  const scores = sims
    .map((s) => s.evaluation?.overallScore)
    .filter((n): n is number => typeof n === "number");
  const avg = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : null;
  const best = scores.length ? Math.max(...scores) : null;

  const attemptsByScenario = new Map<string, number>();
  for (const s of sims) {
    attemptsByScenario.set(
      s.scenarioId,
      (attemptsByScenario.get(s.scenarioId) ?? 0) + 1,
    );
  }

  return (
    <div className="animate-fade-up">
      <Link href="/manager/team" className="text-sm text-white/50 hover:text-white/80">
        ← Équipe
      </Link>
      <div className="mt-2 mb-6 flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-500/15 text-xl font-semibold text-violet-300">
          {telepro.fullName.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{telepro.fullName}</h1>
          <p className="text-sm text-white/50">{telepro.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Score moyen" value={avg ?? "—"} sub="/ 100" accent="violet" />
        <StatCard label="Meilleur score" value={best ?? "—"} sub="/ 100" accent="flame" />
        <StatCard label="Tentatives" value={sims.length} accent="blue" />
        <StatCard label="Disponibles" value={availableCount} accent="mint" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle className="mb-3">Exercices disponibles</SectionTitle>
          {available.length === 0 ? (
            <Card className="text-sm text-white/50">
              Aucun exercice disponible.
            </Card>
          ) : (
            <div className="space-y-2">
              {available.map((ex) => (
                <Card
                  key={ex.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="font-medium text-white">{ex.name}</p>
                    <div className="mt-1 flex gap-1">
                      <Badge tone="violet">{ex.difficultyLabel}</Badge>
                      <Badge tone="gray">
                        {attemptsByScenario.get(ex.id) ?? 0} tentative(s)
                      </Badge>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionTitle className="mb-3">Tentatives récentes</SectionTitle>
          {sims.length === 0 ? (
            <EmptyState
              title="Aucune tentative"
              description="Ce téléprospecteur n'a pas encore terminé de simulation."
            />
          ) : (
            <div className="space-y-2">
              {sims.map((s) => (
                <Card
                  key={s.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="font-medium text-white">{s.scenario.name}</p>
                    <p className="text-xs text-white/45">
                      {formatDateFr(s.endedAt)}
                    </p>
                  </div>
                  <MiniScore score={s.evaluation?.overallScore ?? 0} size={50} />
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
