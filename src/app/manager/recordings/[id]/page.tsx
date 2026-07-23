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
} from "@/lib/enums";
import { formatBytes, formatDateFr, formatDuration, parseJson } from "@/lib/utils";
import { RecordingControls } from "./RecordingControls";

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
      transcript: true,
      knowledgeItems: { orderBy: { confidence: "desc" } },
    },
  });
  if (!rec) notFound();

  const segments = rec.transcript
    ? parseJson<Segment[]>(rec.transcript.segments, [])
    : [];
  const tags = parseJson<string[]>(rec.tags, []);
  const audioUrl = rec.storageKey
    ? await getAudioStorage().createDownloadUrl(rec.storageKey, 600)
    : null;

  return (
    <div className="animate-fade-up">
      <Link href="/manager/recordings" className="text-sm text-white/50 hover:text-white/80">
        ← Base d&apos;appels
      </Link>

      <div className="mt-2 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{rec.title}</h1>
          <p className="text-sm text-white/50">
            {formatDateFr(rec.createdAt)} · {formatBytes(rec.sizeBytes)}
            {rec.campaign ? ` · ${rec.campaign}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Badge tone={rec.status === "READY" ? "mint" : rec.status === "FAILED" ? "red" : "blue"}>
              {RECORDING_STATUS_LABELS[rec.status]}
            </Badge>
            {rec.callOutcome && <Badge tone="violet">{OUTCOME_LABELS[rec.callOutcome]}</Badge>}
            {!rec.enabled && <Badge tone="gray">Désactivé</Badge>}
            {tags.map((t) => <Badge key={t} tone="blue">{t}</Badge>)}
          </div>
        </div>
        <RecordingControls
          id={rec.id}
          enabled={rec.enabled}
          failed={rec.status === "FAILED"}
        />
      </div>

      {rec.errorMessage && (
        <Card className="mb-4 border-red-500/30 bg-red-500/5 text-sm text-red-300">
          ⚠️ {rec.errorMessage}
        </Card>
      )}

      {/* Lecteur audio (URL signée temporaire) */}
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
        {/* Transcript diarisé */}
        <div>
          <SectionTitle className="mb-3">Transcript</SectionTitle>
          {segments.length === 0 ? (
            <Card className="text-sm text-white/50">
              {rec.status === "READY"
                ? "Aucun transcript disponible."
                : "Transcript en cours de génération…"}
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

        {/* Connaissances dérivées */}
        <div>
          <SectionTitle className="mb-3">
            Connaissances extraites ({rec.knowledgeItems.length})
          </SectionTitle>
          {rec.knowledgeItems.length === 0 ? (
            <Card className="text-sm text-white/50">
              {rec.status === "READY"
                ? "Aucune connaissance extraite."
                : "Extraction en cours…"}
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
