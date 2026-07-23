import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { Card, Badge, SectionTitle } from "@/components/ui";
import { parseJson } from "@/lib/utils";
import { Role } from "@/lib/enums";
import { ScenarioForm, type ScenarioInitial } from "../ScenarioForm";
import { AssignPanel } from "./AssignPanel";
import { ScenarioActions } from "./ScenarioActions";

export default async function ScenarioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const manager = await requireManager();

  const scenario = await prisma.scenario.findFirst({
    where: { id, organizationId: manager.organizationId },
  });
  if (!scenario) notFound();

  const [knowledge, telepros, assignments] = await Promise.all([
    prisma.knowledgeItem.findMany({
      where: { organizationId: manager.organizationId, reviewStatus: "APPROVED", enabled: true },
      select: { id: true, type: true, title: true },
    }),
    prisma.user.findMany({
      where: { organizationId: manager.organizationId, role: Role.TELEPRO, isActive: true },
      select: { id: true, fullName: true, email: true },
    }),
    prisma.scenarioAssignment.findMany({
      where: { scenarioId: id },
      select: { teleproId: true },
    }),
  ]);

  const initial: ScenarioInitial = {
    id: scenario.id,
    name: scenario.name,
    callType: scenario.callType,
    level: scenario.level,
    campaign: scenario.campaign ?? "",
    offer: scenario.offer ?? "",
    prospectProfile: scenario.prospectProfile ?? "",
    initialSituation: scenario.initialSituation ?? "",
    objective: scenario.objective ?? "",
    personality: scenario.personality ?? "",
    allowedObjections: parseJson<string[]>(scenario.allowedObjections, []).join("\n"),
    secretInfos: parseJson<Array<{ question: string; answer: string }>>(scenario.secretInfos, []),
    successConditions: scenario.successConditions ?? "",
    failureConditions: scenario.failureConditions ?? "",
    targetDurationSec: scenario.targetDurationSec,
    knowledgeRefs: parseJson<string[]>(scenario.knowledgeRefs, []),
  };

  return (
    <div className="animate-fade-up">
      <Link href="/manager/scenarios" className="text-sm text-white/50 hover:text-white/80">
        ← Scénarios
      </Link>
      <div className="mt-2 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{scenario.name}</h1>
          <Badge tone={scenario.status === "PUBLISHED" ? "mint" : "gray"}>
            {scenario.status === "PUBLISHED" ? "Publié" : "Brouillon"}
          </Badge>
        </div>
        <ScenarioActions id={scenario.id} status={scenario.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          <ScenarioForm initial={initial} knowledgeOptions={knowledge} />
        </div>
        <div className="space-y-4">
          <SectionTitle>Assignation</SectionTitle>
          {scenario.status !== "PUBLISHED" ? (
            <Card className="text-sm text-white/50">
              Publie le scénario pour pouvoir l&apos;assigner à des téléprospecteurs.
            </Card>
          ) : (
            <AssignPanel
              scenarioId={scenario.id}
              telepros={telepros}
              assigned={assignments.map((a) => a.teleproId)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
