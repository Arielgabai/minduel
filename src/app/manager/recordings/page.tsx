import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { Card, Badge, EmptyState, SectionTitle } from "@/components/ui";
import { RECORDING_STATUS_LABELS } from "@/lib/enums";
import { formatBytes, formatDateFr, parseJson } from "@/lib/utils";
import { UploadForm } from "./UploadForm";

export default async function RecordingsPage() {
  const manager = await requireManager();

  const recordings = await prisma.callRecording.findMany({
    where: { organizationId: manager.organizationId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { knowledgeItems: true } } },
  });

  return (
    <div className="animate-fade-up">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Base d&apos;appels réels</h1>
        <p className="text-sm text-white/50">
          Importe des appels pour en extraire des connaissances et nourrir tes scénarios.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          {recordings.length === 0 ? (
            <EmptyState
              icon="🎧"
              title="Aucun appel importé"
              description="Importe ton premier enregistrement (MP3, WAV, M4A) via le formulaire."
            />
          ) : (
            <div className="space-y-2">
              {recordings.map((r) => {
                const tags = parseJson<string[]>(r.tags, []);
                return (
                  <Link key={r.id} href={`/manager/recordings/${r.id}`}>
                    <Card hover className="flex items-center justify-between py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{r.title}</p>
                        <p className="text-xs text-white/45">
                          {formatDateFr(r.createdAt)} · {formatBytes(r.sizeBytes)}
                          {r.campaign ? ` · ${r.campaign}` : ""}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r._count.knowledgeItems > 0 && (
                            <Badge tone="violet">🧠 {r._count.knowledgeItems}</Badge>
                          )}
                          {!r.enabled && <Badge tone="gray">Désactivé</Badge>}
                          {tags.slice(0, 2).map((t) => (
                            <Badge key={t} tone="blue">{t}</Badge>
                          ))}
                        </div>
                      </div>
                      <StatusBadge status={r.status} />
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <SectionTitle className="mb-3">Importer un appel</SectionTitle>
          <UploadForm />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "READY" ? "mint" : status === "FAILED" ? "red" : "blue";
  const pulse = ["TRANSCRIBING", "ANALYZING"].includes(status);
  return (
    <Badge tone={tone} className={pulse ? "animate-pulse-ring" : ""}>
      {RECORDING_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
