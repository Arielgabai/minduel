"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";

export function AssignPanel({
  scenarioId,
  telepros,
  assigned,
}: {
  scenarioId: string;
  telepros: Array<{ id: string; fullName: string; email: string }>;
  assigned: string[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(assigned));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/scenarios/${scenarioId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teleproIds: [...selected] }),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      {telepros.length === 0 ? (
        <p className="text-sm text-white/50">
          Aucun téléprospecteur. Ajoute-en dans « Équipe ».
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {telepros.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2 text-sm"
              >
                <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                <span className="text-white/80">{t.fullName}</span>
              </label>
            ))}
          </div>
          <Button onClick={save} disabled={busy} className="mt-3 w-full">
            {busy ? "Enregistrement…" : "Mettre à jour l'assignation"}
          </Button>
          {saved && <p className="mt-2 text-center text-xs text-emerald-300">✓ Assignation mise à jour</p>}
        </>
      )}
    </Card>
  );
}
