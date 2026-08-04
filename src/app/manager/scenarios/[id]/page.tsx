import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { ScenarioStatus } from "@/lib/enums";
import { prisma } from "@/lib/db";

/**
 * LOT O : ancienne fiche scénario manager.
 * PUBLISHED de l'org → fiche lecture seule ; sinon → catalogue.
 */
export default async function ScenarioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const manager = await requireManager();

  const scenario = await prisma.scenario.findFirst({
    where: { id, organizationId: manager.organizationId },
    select: { id: true, status: true },
  });

  if (scenario?.status === ScenarioStatus.PUBLISHED) {
    redirect("/manager/exercises/detail/" + scenario.id);
  }
  redirect("/manager/exercises");
}
