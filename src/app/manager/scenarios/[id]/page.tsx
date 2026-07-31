import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { Card, Badge, SectionTitle } from "@/components/ui";
import { parseJson } from "@/lib/utils";
import {
  CALL_TYPE_LABELS,
  LEVEL_LABELS,
  Role,
  ScenarioStatus,
} from "@/lib/enums";
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

  const isArchived = scenario.status === ScenarioStatus.ARCHIVED;

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

  if (isArchived) {
    return (
      <div className="animate-fade-up">
        <Link href="/manager/scenarios" className="text-sm text-white/50 hover:text-white/80">
          ← Scénarios
        </Link>
        <div className="mt-2 mb-6">
          <h1 className="text-2xl font-bold">{scenario.name}</h1>
          <Badge tone="red">Archivé</Badge>
          <p className="mt-2 text-sm text-white/50">
            Cet exercice n&apos;est plus proposé aux télépros. L&apos;historique est conservé.
          </p>
        </div>

        <Card className="space-y-3 text-sm">
          <p>
            <span className="text-white/45">Type</span>{" "}
            <span className="text-white/80">
              {CALL_TYPE_LABELS[scenario.callType] ?? scenario.callType}
            </span>
          </p>
          <p>
            <span className="text-white/45">Niveau</span>{" "}
            <span className="text-white/80">
              {LEVEL_LABELS[scenario.level] ?? scenario.level}
            </span>
          </p>
          {scenario.campaign && (
            <p>
              <span className="text-white/45">Campagne</span>{" "}
              <span className="text-white/80">{scenario.campaign}</span>
            </p>
          )}
          {scenario.objective && (
            <p>
              <span className="text-white/45">Objectif</span>{" "}
              <span className="text-white/80">{scenario.objective}</span>
            </p>
          )}
          {scenario.offer && (
            <p>
              <span className="text-white/45">Offre</span>{" "}
              <span className="text-white/80">{scenario.offer}</span>
            </p>
          )}
          {scenario.prospectProfile && (
            <p>
              <span className="text-white/45">Profil prospect</span>{" "}
              <span className="text-white/80">{scenario.prospectProfile}</span>
            </p>
          )}
          <p>
            <span className="text-white/45">Durée cible</span>{" "}
            <span className="text-white/80">{scenario.targetDurationSec}s</span>
          </p>
          <p>
            <span className="text-white/45">Assignations</span>{" "}
            <span className="text-white/80">{assignments.length}</span>
          </p>
        </Card>
      </div>
    );
  }

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
        <ScenarioActions
          id={scenario.id}
          status={scenario.status}
          allowArchive
        />
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
