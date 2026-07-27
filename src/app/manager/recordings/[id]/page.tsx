import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { getAudioStorage } from "@/lib/providers";
import { Card, Badge, SectionTitle } from "@/components/ui";
import {
  RECORDING_STATUS_LABELS,
  KNOWLEDGE_TYPE_LABELS,
  OUTCOME_LABELS,
  RECORDING_IN_PROGRESS_STATUSES,
  RecordingStatus,
} from "@/lib/enums";
import { formatBytes, formatDateFr, formatDuration, parseJson } from "@/lib/utils";
import { RecordingControls } from "./RecordingControls";
import { RecordingProcessing } from "./RecordingProcessing";
import { RecordingReview, type ReviewData } from "./RecordingReview";

interface Segment {
  speaker: "AGENT" | "PROSPECT";
  text: string;
  startMs: number;
  endMs: number;
}

export default async function RecordingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const manager = await requireManager();

  const rec = await prisma.callRecording.findFirst({
    where: { id, organizationId: manager.organizationId },
    include: {
      transcript: { include: { turns: { orderBy: { idx: "asc" } } } },
      analysis: true,
      generatedScenario: { include: { rubric: true } },
      knowledgeItems: { orderBy: { confidence: "desc" } },
    },
  });
  if (!rec) notFound();

  const header = (
    <>
      <Link href="/manager/recordings" className="text-sm text-white/50 hover:text-white/80">
        ← Appels modèles
      </Link>
      <div className="mt-2 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{rec.title}</h1>
          <p className="text-sm text-white/50">
            {formatDateFr(rec.createdAt)} · {formatBytes(rec.sizeBytes)}
            {rec.campaign ? ` · ${rec.campaign}` : ""}
          </p>
        </div>
        <RecordingControls id={rec.id} enabled={rec.enabled} failed={rec.status === "FAILED"} />
      </div>
    </>
  );

  // ---- Pipeline appel -> exercice (recordings importés comme appels modèles) ----
  if (rec.useAsModel) {
    const inProgress =
      RECORDING_IN_PROGRESS_STATUSES.includes(rec.status) ||
      rec.status === RecordingStatus.WAITING_FOR_CLARIFICATION ||
      rec.status === RecordingStatus.FAILED;

    // READY + exercice généré -> page de validation ; sinon page de progression.
    if (rec.status === RecordingStatus.READY && rec.generatedScenario) {
      const s = rec.generatedScenario;
      const analysisRow = rec.analysis;
      const commercialStrategy = analysisRow
        ? parseJson<{
            objective?: string;
            outcome?: string;
            retainedPractices?: Array<{
              id: string;
              label: string;
              description: string;
              importance: string;
              evidenceSegmentIds: string[];
            }>;
          }>(analysisRow.commercialStrategy, {})
        : {};
      const customerProfile = analysisRow
        ? parseJson<{
            role: string;
            context: string;
            needs: string[];
            objections: string[];
            signals: string[];
          } | null>(analysisRow.customerProfile, null)
        : null;
      const ambiguities = analysisRow
        ? parseJson<Array<{ id: string; question: string; importance: string }>>(
            analysisRow.ambiguities,
            [],
          )
        : [];

      const segmentsByIdx: Record<string, { role: string; text: string }> = {};
      for (const t of rec.transcript?.turns ?? []) {
        segmentsByIdx[String(t.idx)] = {
          role: t.role ?? "PROSPECT",
          text: t.anonymizedText ?? t.text,
        };
      }

      const [telepros, assignments] = await Promise.all([
        prisma.user.findMany({
          where: { organizationId: manager.organizationId, role: "TELEPRO", isActive: true },
          select: { id: true, fullName: true, email: true },
          orderBy: { fullName: "asc" },
        }),
        prisma.scenarioAssignment.findMany({
          where: { scenarioId: s.id },
          select: { teleproId: true },
        }),
      ]);

      const data: ReviewData = {
        scenario: {
          id: s.id,
          name: s.name,
          status: s.status,
          callType: s.callType,
          level: s.level,
          offer: s.offer ?? "",
          objective: s.objective ?? "",
          prospectProfile: s.prospectProfile ?? "",
          initialSituation: s.initialSituation ?? "",
          personality: s.personality ?? "",
          traineeBrief: s.traineeBrief ?? "",
          relationshipHistory: s.relationshipHistory ?? "",
          allowedObjections: parseJson<string[]>(s.allowedObjections, []),
          successConditions: s.successConditions ?? "",
          failureConditions: s.failureConditions ?? "",
          expectedNextSteps: parseJson<string[]>(s.expectedNextSteps, []),
          targetSkills: parseJson<string[]>(s.targetSkills, []),
          coachingReference: parseJson<string[]>(s.coachingReference, []),
          aiProspect: parseJson<ReviewData["scenario"]["aiProspect"]>(s.aiProspect, null),
        },
        analysis: analysisRow
          ? {
              callType: analysisRow.callType ?? s.callType,
              callTypeConfidence: analysisRow.callTypeConfidence ?? 0,
              relationshipStage: analysisRow.relationshipStage ?? "UNKNOWN",
              summary: analysisRow.summary ?? "",
              suitabilityScore: analysisRow.referenceSuitabilityScore ?? 0,
              commercialObjective: commercialStrategy.objective ?? "",
              outcome: commercialStrategy.outcome ?? "",
              customerProfile,
              retainedPractices: commercialStrategy.retainedPractices ?? [],
              ambiguities,
            }
          : null,
        segmentsByIdx,
        rubric: s.rubric ? parseJson<ReviewData["rubric"]>(s.rubric.criteria, []) : [],
        telepros,
        assigned: assignments.map((a) => a.teleproId),
      };

      return (
        <div className="animate-fade-up">
          {header}
          <RecordingReview data={data} />
        </div>
      );
    }

    if (inProgress) {
      return (
        <div className="animate-fade-up">
          {header}
          <div className="max-w-xl">
            <RecordingProcessing recordingId={rec.id} initialStatus={rec.status} />
          </div>
        </div>
      );
    }
  }

  // ---- Vue héritée : appels traités pour l'extraction de connaissances ----
  const segments = rec.transcript ? parseJson<Segment[]>(rec.transcript.segments, []) : [];
  const tags = parseJson<string[]>(rec.tags, []);
  const audioUrl = rec.storageKey
    ? await getAudioStorage().createDownloadUrl(rec.storageKey, 600)
    : null;

  return (
    <div className="animate-fade-up">
      {header}

      <div className="mb-6 flex flex-wrap gap-1">
        <Badge tone={rec.status === "READY" ? "mint" : rec.status === "FAILED" ? "red" : "blue"}>
          {RECORDING_STATUS_LABELS[rec.status]}
        </Badge>
        {rec.callOutcome && <Badge tone="violet">{OUTCOME_LABELS[rec.callOutcome]}</Badge>}
        {!rec.enabled && <Badge tone="gray">Désactivé</Badge>}
        {tags.map((t) => (
          <Badge key={t} tone="blue">{t}</Badge>
        ))}
      </div>

      {rec.errorMessage && (
        <Card className="mb-4 border-red-500/30 bg-red-500/5 text-sm text-red-300">
          ⚠️ {rec.errorMessage}
        </Card>
      )}

      {audioUrl && (
        <Card className="mb-6">
          <SectionTitle className="mb-2">Écoute</SectionTitle>
          <audio controls src={audioUrl} className="w-full">
            Votre navigateur ne supporte pas la lecture audio.
          </audio>
          <p className="mt-2 text-xs text-white/40">
            Lien temporaire signé — le fichier n&apos;est jamais exposé publiquement.
          </p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle className="mb-3">Transcript</SectionTitle>
          {segments.length === 0 ? (
            <Card className="text-sm text-white/50">
              {rec.status === "READY" ? "Aucun transcript disponible." : "Transcript en cours de génération…"}
            </Card>
          ) : (
            <Card className="max-h-[520px] space-y-3 overflow-y-auto">
              {segments.map((s, i) => (
                <div key={i} className="text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone={s.speaker === "AGENT" ? "violet" : "flame"}>
                      {s.speaker === "AGENT" ? "Agent" : "Prospect"}
                    </Badge>
                    <span className="text-xs text-white/35">
                      {formatDuration(Math.round(s.startMs / 1000))}
                    </span>
                  </div>
                  <p className="mt-1 text-white/80">{s.text}</p>
                </div>
              ))}
            </Card>
          )}
        </div>

        <div>
          <SectionTitle className="mb-3">
            Connaissances extraites ({rec.knowledgeItems.length})
          </SectionTitle>
          {rec.knowledgeItems.length === 0 ? (
            <Card className="text-sm text-white/50">
              {rec.status === "READY" ? "Aucune connaissance extraite." : "Extraction en cours…"}
            </Card>
          ) : (
            <div className="space-y-2">
              {rec.knowledgeItems.map((k) => (
                <Card key={k.id}>
                  <div className="flex items-center justify-between">
                    <Badge tone="violet">{KNOWLEDGE_TYPE_LABELS[k.type] ?? k.type}</Badge>
                    <Badge tone={k.reviewStatus === "APPROVED" ? "mint" : k.reviewStatus === "REJECTED" ? "red" : "gray"}>
                      {k.reviewStatus === "APPROVED" ? "Approuvé" : k.reviewStatus === "REJECTED" ? "Rejeté" : "En attente"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm font-medium text-white">{k.title}</p>
                  <p className="text-sm text-white/65">{k.content}</p>
                  {k.sourceExcerpt && (
                    <p className="mt-1 border-l-2 border-violet-500/40 pl-2 text-xs italic text-white/45">
                      « {k.sourceExcerpt} » · {formatDuration(Math.round(k.startMs / 1000))}
                    </p>
                  )}
                </Card>
              ))}
              <Link href="/manager/knowledge" className="block text-center text-sm text-violet-300 hover:underline">
                Valider les connaissances →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
