import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { Card, Badge, EmptyState, SectionTitle } from "@/components/ui";
import { MiniScore } from "@/components/ScoreRing";
import { Role } from "@/lib/enums";
import { loadManagerExercisesCatalog } from "@/lib/managerExercisesService";
import { AddTeleproForm } from "./AddTeleproForm";

export default async function TeamPage() {
  const user = await requireManager();

  // Catalogue global : une seule charge pour toute l'équipe (pas de N+1).
  const [catalog, telepros] = await Promise.all([
    loadManagerExercisesCatalog(user.organizationId),
    prisma.user.findMany({
      where: { organizationId: user.organizationId, role: Role.TELEPRO },
      include: {
        simulations: {
          where: { status: "COMPLETED" },
          include: { evaluation: { select: { overallScore: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const availableCount = catalog.totalCount;

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Équipe</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          {telepros.length === 0 ? (
            <EmptyState
              icon="👥"
              title="Aucun téléprospecteur"
              description="Ajoute ton premier téléprospecteur pour suivre sa progression sur le catalogue publié."
            />
          ) : (
            <div className="space-y-2">
              {telepros.map((t) => {
                const scores = t.simulations
                  .map((s) => s.evaluation?.overallScore)
                  .filter((n): n is number => typeof n === "number");
                const avg = scores.length
                  ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
                  : null;
                return (
                  <Link key={t.id} href={`/manager/team/${t.id}`}>
                    <Card hover className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/15 font-semibold text-violet-300">
                          {t.fullName.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-white">{t.fullName}</p>
                          <p className="text-xs text-white/45">{t.email}</p>
                          <div className="mt-1 flex gap-1">
                            <Badge tone="gray">
                              {availableCount} disponible
                              {availableCount > 1 ? "s" : ""}
                            </Badge>
                            <Badge tone="violet">{scores.length} tentative(s)</Badge>
                            {!t.isActive && <Badge tone="red">Inactif</Badge>}
                          </div>
                        </div>
                      </div>
                      {avg !== null ? (
                        <MiniScore score={avg} size={52} />
                      ) : (
                        <Badge tone="gray">—</Badge>
                      )}
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <SectionTitle className="mb-3">Ajouter un téléprospecteur</SectionTitle>
          <AddTeleproForm />
        </div>
      </div>
    </div>
  );
}
