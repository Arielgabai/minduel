import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { EmptyState, SectionTitle } from "@/components/ui";
import { KnowledgeList } from "./KnowledgeList";

export default async function KnowledgePage() {
  const manager = await requireManager();

  const items = await prisma.knowledgeItem.findMany({
    where: { organizationId: manager.organizationId },
    include: { recording: { select: { title: true } } },
    orderBy: [{ reviewStatus: "asc" }, { confidence: "desc" }],
  });

  const pending = items.filter((i) => i.reviewStatus === "PENDING");
  const reviewed = items.filter((i) => i.reviewStatus !== "PENDING");

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Connaissances extraites</h1>
        <p className="text-sm text-white/50">
          Valide, édite ou rejette. Seuls les éléments approuvés et actifs
          alimentent les simulations.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="🧠"
          title="Aucune connaissance"
          description="Importe et traite des appels dans la Base d'appels pour générer des connaissances."
        />
      ) : (
        <div className="space-y-8">
          <div>
            <SectionTitle className="mb-3">À valider ({pending.length})</SectionTitle>
            <KnowledgeList
              items={pending.map(serialize)}
              emptyLabel="Rien à valider — tout est traité 🎉"
            />
          </div>
          {reviewed.length > 0 && (
            <div>
              <SectionTitle className="mb-3">Déjà traité ({reviewed.length})</SectionTitle>
              <KnowledgeList items={reviewed.map(serialize)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function serialize(i: {
  id: string;
  type: string;
  title: string;
  content: string;
  sourceExcerpt: string | null;
  startMs: number;
  confidence: number;
  reviewStatus: string;
  enabled: boolean;
  recording: { title: string } | null;
}) {
  return {
    id: i.id,
    type: i.type,
    title: i.title,
    content: i.content,
    sourceExcerpt: i.sourceExcerpt,
    startMs: i.startMs,
    confidence: i.confidence,
    reviewStatus: i.reviewStatus,
    enabled: i.enabled,
    recordingTitle: i.recording?.title ?? null,
  };
}
