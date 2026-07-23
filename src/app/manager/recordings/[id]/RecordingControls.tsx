"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RecordingControls({
  id,
  enabled,
  failed,
}: {
  id: string;
  enabled: boolean;
  failed: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch(`/api/recordings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    await patch({ retry: true });
    // Relance le pipeline.
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`/api/recordings/${id}/process`, { method: "POST" });
      const json = await res.json();
      router.refresh();
      if (["READY", "FAILED"].includes(json.data?.status)) break;
      await new Promise((r) => setTimeout(r, 700));
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await fetch(`/api/recordings/${id}`, { method: "DELETE" });
      router.push("/manager/recordings");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {failed && (
        <button
          onClick={retry}
          disabled={busy}
          className="rounded-lg border border-electric-500/40 bg-electric-500/10 px-3 py-2 text-sm text-electric-400"
        >
          ↻ Relancer
        </button>
      )}
      <button
        onClick={() => patch({ enabled: !enabled })}
        disabled={busy}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70"
      >
        {enabled ? "Désactiver" : "Activer"}
      </button>
      {confirmDelete ? (
        <span className="flex items-center gap-2">
          <button
            onClick={remove}
            disabled={busy}
            className="rounded-lg bg-red-500/90 px-3 py-2 text-sm text-white"
          >
            Confirmer la suppression
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/60"
          >
            Annuler
          </button>
        </span>
      ) : (
        <button
          onClick={() => setConfirmDelete(true)}
          disabled={busy}
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          🗑 Supprimer
        </button>
      )}
    </div>
  );
}
