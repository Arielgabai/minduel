import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTelepro } from "@/lib/auth";
import { Card, Badge, EmptyState, SectionTitle } from "@/components/ui";
import { LEVEL_LABELS } from "@/lib/enums";

/**
 * Destination Missions — liste des scénarios assignés / publiés.
 * Pas de niveaux, verrouillage ni recommandation dynamique (lot suivant).
 */
export default async function MissionsPage() {
  const user = await requireTelepro();

  const assignments = await prisma.scenarioAssignment.findMany({
    where: {
      teleproId: user.id,
      organizationId: user.organizationId,
      scenario: { status: "PUBLISHED" },
    },
    include: { scenario: true },
    orderBy: { createdAt: "desc" },
  });

  const completedByScenario = await prisma.simulation.groupBy({
    by: ["scenarioId"],
    where: { teleproId: user.id, status: "COMPLETED" },
    _count: { _all: true },
  });
  const completedMap = new Map(
    completedByScenario.map((c) => [c.scenarioId, c._count._all]),
  );

  return (
    <div className="animate-fade-up">
      <h1 className="mb-1 text-2xl font-bold">Missions</h1>
      <p className="mb-6 text-sm text-white/50">
        Tes entraînements assignés. Ouvre une mission pour te préparer.
      </p>

      <SectionTitle className="mb-3">Scénarios disponibles</SectionTitle>

      {assignments.length === 0 ? (
        <EmptyState
          icon="🎯"
          title="Aucune mission assignée"
          description="Ton manager va bientôt t'attribuer des entraînements."
        />
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            const done = completedMap.get(a.scenarioId) ?? 0;
            return (
              <Link key={a.id} href={`/app/prepare/${a.scenarioId}`}>
                <Card hover className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white">{a.scenario.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge
                        tone={
                          a.scenario.level === "DIFFICILE"
                            ? "flame"
                            : a.scenario.level === "FACILE"
                              ? "mint"
                              : "violet"
                        }
                      >
                        {LEVEL_LABELS[a.scenario.level]}
                      </Badge>
                      {done > 0 ? (
                        <Badge tone="mint">
                          ✓ {done} tentative{done > 1 ? "s" : ""}
                        </Badge>
                      ) : (
                        <Badge tone="gray">À faire</Badge>
                      )}
                    </div>
                  </div>
                  <span className="text-white/30" aria-hidden>
                    →
                  </span>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
