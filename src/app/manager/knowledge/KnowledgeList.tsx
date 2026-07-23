"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import { KNOWLEDGE_TYPE_LABELS } from "@/lib/enums";
import { formatDuration } from "@/lib/utils";

interface Item {
  id: string;
  type: string;
  title: string;
  content: string;
  sourceExcerpt: string | null;
  startMs: number;
  confidence: number;
  reviewStatus: string;
  enabled: boolean;
  recordingTitle: string | null;
}

export function KnowledgeList({
  items,
  emptyLabel,
}: {
  items: Item[];
  emptyLabel?: string;
}) {
  if (items.length === 0 && emptyLabel) {
    return <Card className="text-sm text-white/50">{emptyLabel}</Card>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <KnowledgeCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function KnowledgeCard({ item }: { item: Item }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(item.reviewStatus);
  const [enabled, setEnabled] = useState(item.enabled);

  async function update(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/knowledge/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok) {
        setStatus(json.data.reviewStatus);
        setEnabled(json.data.enabled);
        setEditing(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between">
        <Badge tone="violet">{KNOWLEDGE_TYPE_LABELS[item.type] ?? item.type}</Badge>
        <div className="flex items-center gap-1">
          <Badge tone={status === "APPROVED" ? "mint" : status === "REJECTED" ? "red" : "gray"}>
            {status === "APPROVED" ? "Approuvé" : status === "REJECTED" ? "Rejeté" : "En attente"}
          </Badge>
          <span className="text-xs text-white/35">{Math.round(item.confidence * 100)}%</span>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
          />
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm font-medium text-white">{title}</p>
          <p className="text-sm text-white/65">{content}</p>
        </>
      )}

      {item.sourceExcerpt && !editing && (
        <p className="mt-2 border-l-2 border-violet-500/40 pl-2 text-xs italic text-white/45">
          « {item.sourceExcerpt} » · {formatDuration(Math.round(item.startMs / 1000))}
          {item.recordingTitle ? ` · ${item.recordingTitle}` : ""}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {editing ? (
          <>
            <button
              onClick={() => update({ title, content })}
              disabled={busy}
              className="rounded-lg bg-violet-500/80 px-3 py-1.5 text-xs font-medium text-white"
            >
              Enregistrer
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60"
            >
              Annuler
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => update({ reviewStatus: "APPROVED", enabled: true })}
              disabled={busy || status === "APPROVED"}
              className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-300 disabled:opacity-40"
            >
              ✓ Approuver
            </button>
            <button
              onClick={() => update({ reviewStatus: "REJECTED" })}
              disabled={busy || status === "REJECTED"}
              className="rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-300 disabled:opacity-40"
            >
              ✕ Rejeter
            </button>
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60"
            >
              Éditer
            </button>
            {status === "APPROVED" && (
              <button
                onClick={() => update({ enabled: !enabled })}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60"
              >
                {enabled ? "Désactiver" : "Activer"}
              </button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
