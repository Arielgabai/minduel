"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ScenarioActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState<{ prospectName: string; opener: string; persona: string } | null>(null);

  async function togglePublish() {
    setBusy(true);
    try {
      await fetch(`/api/scenarios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: status === "PUBLISHED" ? "DRAFT" : "PUBLISHED" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const res = await fetch(`/api/scenarios/${id}/preview`, { method: "POST" });
      const json = await res.json();
      if (res.ok) setPreview(json.data);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await fetch(`/api/scenarios/${id}`, { method: "DELETE" });
      router.push("/manager/scenarios");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={test} disabled={busy} className="rounded-lg border border-electric-500/40 bg-electric-500/10 px-3 py-2 text-sm text-electric-400">
        🧪 Tester
      </button>
      <button onClick={togglePublish} disabled={busy} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70">
        {status === "PUBLISHED" ? "Dépublier" : "Publier"}
      </button>
      {confirmDelete ? (
        <>
          <button onClick={remove} disabled={busy} className="rounded-lg bg-red-500/90 px-3 py-2 text-sm text-white">
            Confirmer
          </button>
          <button onClick={() => setConfirmDelete(false)} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/60">
            Annuler
          </button>
        </>
      ) : (
        <button onClick={() => setConfirmDelete(true)} disabled={busy} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          🗑
        </button>
      )}

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-6" onClick={() => setPreview(null)}>
          <div className="card max-h-[80vh] w-full max-w-lg overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Aperçu du prospect IA</h3>
            <p className="mt-1 text-sm text-white/50">
              Prospect : <span className="text-violet-300">{preview.prospectName}</span>
            </p>
            <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
              <p className="text-xs uppercase tracking-wide text-white/40">Réplique d&apos;ouverture</p>
              <p className="mt-1">« {preview.opener} »</p>
            </div>
            <p className="mt-4 text-xs uppercase tracking-wide text-white/40">Instructions (persona)</p>
            <pre className="mt-1 whitespace-pre-wrap rounded-lg border border-white/10 bg-ink-950 p-3 text-xs text-white/60">
              {preview.persona}
            </pre>
            <button onClick={() => setPreview(null)} className="btn-gradient mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white">
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
