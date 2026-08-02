import { requireTelepro } from "@/lib/auth";
import { EmptyState } from "@/components/ui";

/**
 * Destination Skills — bibliothèque pédagogique.
 * Aucune source métier stable pour les scores : état vide explicite, zéro donnée fictive.
 */
export default async function SkillsPage() {
  await requireTelepro();

  return (
    <div className="animate-fade-up">
      <h1 className="mb-1 text-2xl font-bold">Skills</h1>
      <p className="mb-6 text-sm text-white/50">
        Articles et parcours de compétences — bientôt disponibles.
      </p>

      <EmptyState
        icon="📚"
        title="Aucun contenu Skills pour l'instant"
        description="Les catégories pédagogiques (Élocution, Découverte, Objections, Closing) seront ajoutées lorsqu'une source réelle sera disponible. Aucun score ni niveau n'est affiché ici."
      />
    </div>
  );
}
