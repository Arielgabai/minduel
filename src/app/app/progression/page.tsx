import { requireTelepro } from "@/lib/auth";
import { loadProgressionForTelepro } from "@/lib/progressionService";
import { ProgressionTabs } from "./ProgressionTabs";

/**
 * Destination Progression — Tendances, Comparatif, Diagnostic, Badges
 * à partir des simulations et évaluations persistées (lot M).
 */
export default async function ProgressionPage() {
  const user = await requireTelepro();
  const view = await loadProgressionForTelepro({
    teleproId: user.id,
    organizationId: user.organizationId,
  });

  return (
    <div className="animate-fade-up">
      <h1 className="mb-4 text-2xl font-bold text-white">Progression</h1>
      <ProgressionTabs view={view} />
    </div>
  );
}
