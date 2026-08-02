import { requireTelepro } from "@/lib/auth";
import { EmptyState } from "@/components/ui";
import { loadSkillsLibrary } from "@/lib/skillsTeleproService";
import { SkillsLibraryClient } from "./SkillsLibraryClient";

/**
 * Destination Skills — bibliothèque pédagogique dynamique.
 * Seul le contenu dont la catégorie, la section et l'article sont tous
 * PUBLISHED est visible ; compteurs calculés sur les données réelles.
 */
export default async function SkillsPage() {
  const user = await requireTelepro();
  const { categories, searchIndex } = await loadSkillsLibrary(
    user.id,
    user.organizationId,
  );

  return (
    <div className="animate-fade-up">
      <h1 className="mb-1 text-2xl font-bold">Skills</h1>
      <p className="mb-6 text-sm text-white/50">
        Ta bibliothèque pédagogique pour progresser entre deux appels.
      </p>

      {categories.length === 0 ? (
        <EmptyState
          icon="📚"
          title="Aucun contenu Skills publié"
          description="Les catégories et les fiches apparaîtront ici dès qu'elles seront publiées par l'équipe."
        />
      ) : (
        <SkillsLibraryClient
          categories={categories}
          searchIndex={searchIndex}
        />
      )}
    </div>
  );
}
