import { notFound, redirect } from "next/navigation";
import { requireTelepro } from "@/lib/auth";
import { loadDebriefForTelepro } from "@/lib/debriefService";
import { isFinishedSimulationStatus } from "@/lib/teleproMissions";
import { SimulationStatus } from "@/lib/enums";
import { buildExerciseCompleteView } from "@/lib/callUi";
import { ExerciseComplete } from "./ExerciseComplete";

/**
 * Écran de fin d'exercice (maquette p.17).
 * Rechargeable : relit uniquement des données déjà persistées via
 * `loadDebriefForTelepro` (isolé org + télépro → 404 pour un autre). Ne finalise
 * jamais la simulation et ne rappelle jamais /end.
 */
export default async function CallDonePage({
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

  // Sécurité d'affichage : si l'appel n'est pas encore terminé, on reprend
  // l'appel plutôt que d'annoncer une fin (aucune finalisation ici).
  if (
    view.status !== SimulationStatus.ABANDONED &&
    !isFinishedSimulationStatus(view.status)
  ) {
    redirect(`/app/call/${id}`);
  }

  const complete = buildExerciseCompleteView({
    simulationId: view.simulationId,
    evaluationState: view.evaluationState,
    durationSec: view.durationSec,
    overallScore: view.overallScore,
    strengths: view.strengths,
    improvements: view.improvements,
    outcome: view.outcome,
  });

  return (
    <ExerciseComplete
      view={complete}
      simulationId={view.simulationId}
      scenarioName={view.scenarioName}
    />
  );
}
