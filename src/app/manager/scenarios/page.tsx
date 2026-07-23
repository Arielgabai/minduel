import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { Card, Badge, EmptyState, LinkButton } from "@/components/ui";
import { LEVEL_LABELS, CALL_TYPE_LABELS } from "@/lib/enums";

export default async function ScenariosPage() {
  const manager = await requireManager();

  const scenarios = await prisma.scenario.findMany({
    where: { organizationId: manager.organizationId },
    include: { _count: { select: { assignments: true, simulations: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Scénarios</h1>
          <p className="text-sm text-white/50">
            Crée des scénarios manuellement ou à partir des connaissances approuvées.
          </p>
        </div>
        <LinkButton href="/manager/scenarios/new" variant="primary">
          + Nouveau scénario
        </LinkButton>
      </div>

      {scenarios.length === 0 ? (
        <EmptyState
          icon="🎭"
          title="Aucun scénario"
          description="Crée ton premier scénario d'entraînement."
          action={
            <LinkButton href="/manager/scenarios/new" variant="primary" className="mt-2">
              Créer un scénario
            </LinkButton>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {scenarios.map((s) => (
            <Link key={s.id} href={`/manager/scenarios/${s.id}`}>
              <Card hover className="flex h-full flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <Badge tone={s.level === "DIFFICILE" ? "flame" : s.level === "FACILE" ? "mint" : "violet"}>
                      {LEVEL_LABELS[s.level]}
                    </Badge>
                    <Badge tone={s.status === "PUBLISHED" ? "mint" : "gray"}>
                      {s.status === "PUBLISHED" ? "Publié" : "Brouillon"}
                    </Badge>
                  </div>
                  <p className="mt-3 font-semibold text-white">{s.name}</p>
                  <p className="text-xs text-white/45">
                    {CALL_TYPE_LABELS[s.callType] ?? s.callType}
                  </p>
                  {s.objective && (
                    <p className="mt-2 line-clamp-2 text-sm text-white/60">{s.objective}</p>
                  )}
                </div>
                <div className="mt-3 flex gap-2 text-xs text-white/45">
                  <span>👥 {s._count.assignments} assigné(s)</span>
                  <span>🎯 {s._count.simulations} sim.</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
