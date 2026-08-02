import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTelepro } from "@/lib/auth";
import { loadDebriefForTelepro } from "@/lib/debriefService";
import { Card, LinkButton } from "@/components/ui";
import { AnalysisPending } from "./AnalysisPending";
import { DebriefTabs } from "./DebriefTabs";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireTelepro();

  const view = await loadDebriefForTelepro({
    simulationId: id,
    teleproId: user.id,
    organizationId: user.organizationId,
  });
  if (!view) notFound();

  if (
    view.evaluationState === "pending" ||
    view.evaluationState === "failed" ||
    view.evaluationState === "abandoned"
  ) {
    return (
      <AnalysisPending
        simulationId={view.simulationId}
        initialStatus={view.status}
      />
    );
  }

  if (view.evaluationState === "missing") {
    return (
      <div className="animate-fade-up pb-6">
        <div className="mb-4">
          <Link
            href="/app/missions"
            className="text-sm text-white/50 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
          >
            ← Retour aux missions
          </Link>
        </div>
        <h1 className="mb-4 text-center text-2xl font-bold">
          Ton débrief détaillé
        </h1>
        <Card className="text-center">
          <p className="text-lg font-semibold">Évaluation indisponible</p>
          <p className="mt-2 text-sm text-white/55">
            Aucune analyse n&apos;est enregistrée pour cette simulation.
          </p>
          <LinkButton href="/app/missions" variant="primary" className="mt-5 w-full">
            Retour aux missions
          </LinkButton>
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-fade-up pb-6">
      <div className="mb-4">
        <Link
          href="/app/missions"
          className="text-sm text-white/50 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
        >
          ← Retour aux missions
        </Link>
      </div>
      <div className="mb-5 text-center">
        <h1 className="text-2xl font-bold">Ton débrief détaillé</h1>
        <p className="text-sm text-white/50">{view.scenarioName}</p>
      </div>
      <DebriefTabs view={view} />
    </div>
  );
}