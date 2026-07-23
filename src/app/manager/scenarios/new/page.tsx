import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { ScenarioForm } from "../ScenarioForm";

export default async function NewScenarioPage() {
  const manager = await requireManager();

  const knowledge = await prisma.knowledgeItem.findMany({
    where: {
      organizationId: manager.organizationId,
      reviewStatus: "APPROVED",
      enabled: true,
    },
    select: { id: true, type: true, title: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="animate-fade-up">
      <Link href="/manager/scenarios" className="text-sm text-white/50 hover:text-white/80">
        ← Scénarios
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-bold">Nouveau scénario</h1>
      <ScenarioForm knowledgeOptions={knowledge} />
    </div>
  );
}
