import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTelepro } from "@/lib/auth";
import { Card, Badge, SectionTitle } from "@/components/ui";
import { LEVEL_LABELS, CALL_TYPE_LABELS } from "@/lib/enums";
import { formatDuration } from "@/lib/utils";
import { PrepareClient } from "./PrepareClient";

export default async function PreparePage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = await params;
  const user = await requireTelepro();

  const scenario = await prisma.scenario.findFirst({
    where: {
      id: scenarioId,
      organizationId: user.organizationId,
      status: "PUBLISHED",
    },
  });
  if (!scenario) notFound();

  // Vérifier l'assignation (isolation : un télépro ne prépare que ses scénarios).
  const assignment = await prisma.scenarioAssignment.findFirst({
    where: { scenarioId, teleproId: user.id },
  });
  if (!assignment) notFound();

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
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-semibold">{scenario.name}</p>
            <p className="text-sm text-white/50">
              {CALL_TYPE_LABELS[scenario.callType] ?? scenario.callType}
            </p>
          </div>
          <Badge tone={scenario.level === "DIFFICILE" ? "flame" : scenario.level === "FACILE" ? "mint" : "violet"}>
            {LEVEL_LABELS[scenario.level]}
          </Badge>
        </div>

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
      </Card>

      <div className="mt-6">
        <SectionTitle className="mb-3">Test du micro</SectionTitle>
        <PrepareClient scenarioId={scenario.id} />
      </div>
    </div>
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
