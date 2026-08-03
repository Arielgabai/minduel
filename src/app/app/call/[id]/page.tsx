import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTelepro } from "@/lib/auth";
import { CallClient } from "./CallClient";

export default async function CallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireTelepro();

  const sim = await prisma.simulation.findFirst({
    where: { id, organizationId: user.organizationId, teleproId: user.id },
    include: {
      scenario: true,
      turns: { orderBy: { atMs: "asc" } },
      evaluation: { select: { id: true } },
    },
  });
  if (!sim) notFound();

  // Si déjà terminée, rediriger vers l'analyse via le client.
  const initialTurns = sim.turns.map((t) => ({ role: t.role, content: t.content }));

  return (
    <CallClient
      simulationId={sim.id}
      prospectName={sim.prospectName ?? "Prospect"}
      prospectAvatarKey={sim.scenario.prospectAvatarKey ?? null}
      scenarioName={sim.scenario.name}
      level={sim.scenario.level}
      demo={sim.mode === "DEMO"}
      alreadyEvaluated={!!sim.evaluation}
      initialTurns={initialTurns}
    />
  );
}
