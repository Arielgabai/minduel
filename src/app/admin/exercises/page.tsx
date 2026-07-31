"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card } from "@/components/ui";

export const LIST_SENSITIVE_KEYS = [
  "artifacts",
  "contentHash",
  "prompt",
  "promptBundle",
  "promptBundles",
  "PROSPECT_PERSONA",
  "EVALUATION_SYSTEM",
  "EVALUATION_USER",
] as const;

export type AdminExerciseListItem = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  level: string;
  missionLevel: number;
  sortOrder: number;
  callType?: string;
  updatedAt: string;
  createdAt: string;
};

export function listItemLooksSafe(item: Record<string, unknown>): boolean {
  for (const key of LIST_SENSITIVE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(item, key)) return false;
  }
  return true;
}

async function readError(res: Response): Promise<string> {
  const json = await res.json().catch(() => null);
  return (
    json?.error?.message ??
    "Action impossible. Réessaie ou contacte un administrateur."
  );
}

function statusTone(status: string): "gray" | "mint" | "red" | "flame" {
  if (status === "PUBLISHED") return "mint";
  if (status === "ARCHIVED") return "red";
  if (status === "REVIEW_REQUIRED") return "flame";
  return "gray";
}

export default function AdminExercisesPage() {
  const router = useRouter();
  const [items, setItems] = useState<AdminExerciseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [missionLevel, setMissionLevel] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      if (missionLevel) params.set("missionLevel", missionLevel);
      const qs = params.toString();
      const res = await fetch(
        `/api/admin/exercises${qs ? `?${qs}` : ""}`,
        { method: "GET" },
      );
      if (!res.ok) {
        setError(await readError(res));
        setItems([]);
        return;
      }
      const json = await res.json().catch(() => null);
      const list = (json?.data?.items ?? []) as AdminExerciseListItem[];
      setItems(Array.isArray(list) ? list : []);
    } catch {
      setError("Chargement impossible.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [q, status, missionLevel]);

  useEffect(() => {
    void load();
  }, [load]);

  const countLabel = useMemo(
    () => `${items.length} exercice${items.length === 1 ? "" : "s"}`,
    [items.length],
  );

  async function createDraft() {
    if (creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/admin/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setCreateError(
          json?.error?.message ??
            "Création impossible. Réessaie ou contacte un administrateur.",
        );
        return;
      }
      const id = json?.data?.id as string | undefined;
      if (!id) {
        setCreateError("Création impossible.");
        return;
      }
      router.push(`/admin/exercises/${id}`);
    } catch {
      setCreateError("Création impossible.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Exercices</h1>
          <p className="mt-1 text-sm text-[#9AA1B2]">{countLabel}</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setShowCreate(true);
            setCreateError(null);
          }}
        >
          Nouvel exercice
        </Button>
      </div>

      <Card className="border border-[#1e222c] bg-[#0d1017]">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs text-[#9AA1B2]">
            Recherche
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#1e222c] bg-[#12151d] px-3 py-2 text-sm text-white"
              placeholder="Nom ou slug"
            />
          </label>
          <label className="block text-xs text-[#9AA1B2]">
            Statut
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#1e222c] bg-[#12151d] px-3 py-2 text-sm text-white"
            >
              <option value="">Tous</option>
              <option value="DRAFT">DRAFT</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="ARCHIVED">ARCHIVED</option>
              <option value="REVIEW_REQUIRED">REVIEW_REQUIRED</option>
            </select>
          </label>
          <label className="block text-xs text-[#9AA1B2]">
            Niveau de mission
            <input
              type="number"
              min={1}
              max={20}
              value={missionLevel}
              onChange={(e) => setMissionLevel(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#1e222c] bg-[#12151d] px-3 py-2 text-sm text-white"
              placeholder="1–20"
            />
          </label>
        </div>
      </Card>

      {error && (
        <p className="text-sm text-[#FF5C5C]" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-[#9AA1B2]">Chargement…</p>
      ) : items.length === 0 ? (
        <Card className="border border-[#1e222c] bg-[#0d1017]">
          <p className="text-sm text-[#9AA1B2]">Aucun exercice trouvé.</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#1e222c]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#0d1017] text-xs uppercase tracking-wide text-[#9AA1B2]">
              <tr>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Niveau</th>
                <th className="px-4 py-3">Mission</th>
                <th className="px-4 py-3">Ordre</th>
                <th className="px-4 py-3">Maj</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t border-[#1e222c] bg-[#12151d]/60 hover:bg-[#12151d]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/exercises/${item.id}`}
                      className="font-medium text-[#3E6BFF] hover:underline"
                    >
                      {item.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[#9AA1B2]">
                    {item.slug ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                  </td>
                  <td className="px-4 py-3">{item.level}</td>
                  <td className="px-4 py-3">{item.missionLevel}</td>
                  <td className="px-4 py-3">{item.sortOrder}</td>
                  <td className="px-4 py-3 text-[#9AA1B2]">
                    {item.updatedAt?.slice(0, 10) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <Card className="w-full max-w-md space-y-4 border border-[#1e222c] bg-[#0d1017]">
            <h2 className="text-lg font-semibold">Nouvel exercice</h2>
            <label className="block text-xs text-[#9AA1B2]">
              Nom *
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#1e222c] bg-[#12151d] px-3 py-2 text-sm text-white"
                placeholder="Ex. Cold call énergie"
              />
            </label>
            {createError && (
              <p className="text-sm text-[#FF5C5C]" role="alert">
                {createError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={creating}
                onClick={() => setShowCreate(false)}
              >
                Annuler
              </Button>
              <Button
                type="button"
                disabled={creating || createName.trim().length < 2}
                onClick={() => void createDraft()}
              >
                {creating ? "Création…" : "Créer le brouillon"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}