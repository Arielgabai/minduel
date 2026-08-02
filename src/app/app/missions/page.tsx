import { requireTelepro } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { loadTeleproMissionsView } from "@/lib/teleproMissionsService";
import { MissionsPath } from "./MissionsPath";

/**
 * Destination Missions — parcours progressif (maquette p.14–15).
 * Les données (niveaux, statuts, déblocage, recommandation) viennent du moteur
 * du lot I via `loadTeleproMissionsView` ; le rendu est délégué à `MissionsPath`.
 */
export default async function MissionsPage() {
  const user = await requireTelepro();
  const view = await loadTeleproMissionsView(user.id, user.organizationId);

  if (view.empty) {
    return (
      <div className="animate-fade-up">
        <h1 className="mb-1 text-2xl font-bold">Missions</h1>
        <p className="mb-6 text-sm text-white/50">
          Ton parcours d&apos;entraînement, niveau par niveau.
        </p>
        <EmptyState
          icon="🎯"
          title="Aucune mission assignée"
          description="Ton manager va bientôt t'attribuer des entraînements."
        />
      </div>
    );
  }

  return <MissionsPath view={view} />;
}
