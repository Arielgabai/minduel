import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTelepro } from "@/lib/auth";
import { Card, Badge, SectionTitle, LinkButton } from "@/components/ui";
import { ProspectAvatar } from "@/components/ProspectAvatar";
import { LEVEL_LABELS, CALL_TYPE_LABELS } from "@/lib/enums";
import { resolvePlatformCatalogOrganizationId } from "@/lib/platformCatalog";
import { formatDuration } from "@/lib/utils";
import {
  LOCKED_LEVEL_MESSAGE,
  resolveTeleproScenarioStartAccess,
  type MissionAccessDecision,
} from "@/lib/missionAccess";
import {
  ExerciseMissionStatus,
  type TeleproMissionExerciseNode,
} from "@/lib/teleproMissions";
import { PrepareClient } from "./PrepareClient";

export default async function PreparePage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = await params;
  const user = await requireTelepro();
  const catalogOrganizationId = await resolvePlatformCatalogOrganizationId();

  const scenario = await prisma.scenario.findFirst({
    where: {
      id: scenarioId,
      organizationId: catalogOrganizationId,
      status: "PUBLISHED",
    },
  });
  if (!scenario) notFound();

  // LOT O/P2 : catalogue global plateforme — plus de garde ScenarioAssignment.
  // LOT Q2 : garde d'accès télépro (verrouillage niveau, analyse en cours, reprise).
  const access = await resolveTeleproScenarioStartAccess(
    user.id,
    user.organizationId,
    scenarioId,
  );
  const node = access.node;
  const blocked = !access.allowed;
  const showPrepareClient = access.allowed;
  const showScoreCard =
    node != null && node.status !== ExerciseMissionStatus.LOCKED;

  return (
    <div className="animate-fade-up">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/app"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5"
          aria-label="Retour"
        >
          ←
        </Link>
        <h1 className="text-xl font-bold">Configurer la simulation</h1>
      </div>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <ProspectAvatar
              avatarKey={scenario.prospectAvatarKey}
              fallbackText={scenario.name}
              size={56}
              decorative={false}
            />
            <div className="min-w-0">
              <p className="text-lg font-semibold">{scenario.name}</p>
              <p className="text-sm text-white/50">
                {CALL_TYPE_LABELS[scenario.callType] ?? scenario.callType}
              </p>
            </div>
          </div>
          <Badge tone={scenario.level === "DIFFICILE" ? "flame" : scenario.level === "FACILE" ? "mint" : "violet"}>
            {LEVEL_LABELS[scenario.level]}
          </Badge>
        </div>

        {!blocked && (
          <div className="mt-4 space-y-3 text-sm">
            {scenario.objective && (
              <Field label="🎯 Ton objectif" value={scenario.objective} />
            )}
            {scenario.prospectProfile && (
              <Field label="👤 Profil du prospect" value={scenario.prospectProfile} />
            )}
            {scenario.initialSituation && (
              <Field label="📍 Situation initiale" value={scenario.initialSituation} />
            )}
            {scenario.offer && <Field label="📦 Offre" value={scenario.offer} />}
            <Field
              label="⏱️ Durée cible"
              value={formatDuration(scenario.targetDurationSec)}
            />
          </div>
        )}
      </Card>

      {showScoreCard && node ? <ScoreCard node={node} /> : null}

      {blocked ? (
        <BlockedNotice access={access} node={node} />
      ) : showPrepareClient ? (
        <div className="mt-6">
          <SectionTitle className="mb-3">Test du micro</SectionTitle>
          <PrepareClient scenarioId={scenario.id} />
        </div>
      ) : null}
    </div>
  );
}

function ScoreCard({ node }: { node: TeleproMissionExerciseNode }) {
  const badge =
    node.status === ExerciseMissionStatus.PASSED ? (
      <Badge tone="mint">Validé</Badge>
    ) : node.status === ExerciseMissionStatus.TO_RETRY ? (
      <Badge tone="flame">À refaire</Badge>
    ) : null;

  return (
    <Card className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          <p className="text-white/70">
            Meilleur score :{" "}
            <span className="font-semibold text-white">
              {node.bestScore ?? "—"}/100
            </span>
          </p>
          <p className="mt-1 text-white/50">Objectif : {node.passingScore}/100</p>
        </div>
        {badge}
      </div>
      {node.debriefHref ? (
        <div className="mt-3">
          <LinkButton
            href={node.debriefHref}
            variant="outline"
            className="w-full"
          >
            Voir le dernier débrief
          </LinkButton>
        </div>
      ) : null}
    </Card>
  );
}

function BlockedNotice({
  access,
  node,
}: {
  access: MissionAccessDecision;
  node: TeleproMissionExerciseNode | null;
}) {
  if (access.allowed) return null;

  if (access.code === "NOT_FOUND" || !node) {
    return (
      <Card className="mt-4">
        <p className="text-sm text-white/70">
          Cet exercice n&apos;est pas disponible actuellement.
        </p>
        <div className="mt-4">
          <LinkButton href="/app/missions" variant="primary" className="w-full">
            Retour à mes missions
          </LinkButton>
        </div>
      </Card>
    );
  }

  if (node.status === ExerciseMissionStatus.IN_PROGRESS) {
    return (
      <Card className="mt-4">
        <p className="text-sm text-white/70">{access.message}</p>
        <div className="mt-4 space-y-2">
          {node.ctaHref ? (
            <LinkButton href={node.ctaHref} variant="primary" className="w-full">
              Reprendre l&apos;appel
            </LinkButton>
          ) : null}
          <LinkButton href="/app/missions" variant="outline" className="w-full">
            Retour à mes missions
          </LinkButton>
        </div>
      </Card>
    );
  }

  if (node.status === ExerciseMissionStatus.ANALYSIS_PENDING) {
    return (
      <Card className="mt-4">
        <p className="text-sm text-white/70">{access.message}</p>
        <div className="mt-4 space-y-2">
          {node.ctaHref ? (
            <LinkButton href={node.ctaHref} variant="primary" className="w-full">
              Voir l&apos;analyse
            </LinkButton>
          ) : null}
          {node.debriefHref ? (
            <LinkButton
              href={node.debriefHref}
              variant="outline"
              className="w-full"
            >
              Voir le dernier débrief
            </LinkButton>
          ) : null}
          <LinkButton href="/app/missions" variant="outline" className="w-full">
            Retour à mes missions
          </LinkButton>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mt-4">
      <p className="text-sm text-white/70">
        {access.message || LOCKED_LEVEL_MESSAGE}
      </p>
      <div className="mt-4 space-y-2">
        {node.debriefHref ? (
          <LinkButton
            href={node.debriefHref}
            variant="outline"
            className="w-full"
          >
            Voir le dernier débrief
          </LinkButton>
        ) : null}
        <LinkButton href="/app/missions" variant="primary" className="w-full">
          Retour à mes missions
        </LinkButton>
      </div>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-0.5 text-white/80">{value}</p>
    </div>
  );
}
