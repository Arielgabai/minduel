"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { formatBytes } from "@/lib/utils";

type Phase = "idle" | "uploading" | "processing" | "done" | "error";

export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [title, setTitle] = useState("");
  const [campaign, setCampaign] = useState("");
  const [callOutcome, setCallOutcome] = useState("");
  const [tags, setTags] = useState("");
  const [managerNote, setManagerNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [statusLabel, setStatusLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File | null) {
    if (!f) return;
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  async function pollProcessing(id: string) {
    setPhase("processing");
    const labels: Record<string, string> = {
      TRANSCRIBING: "Transcription en cours…",
      ANALYZING: "Analyse et extraction…",
      READY: "Prêt ✓",
      FAILED: "Échec du traitement",
    };
    for (let i = 0; i < 8; i++) {
      const res = await fetch(`/api/recordings/${id}/process`, { method: "POST" });
      const json = await res.json();
      const status = json.data?.status as string;
      setStatusLabel(labels[status] ?? status);
      router.refresh();
      if (status === "READY") {
        setPhase("done");
        return;
      }
      if (status === "FAILED") {
        setPhase("error");
        setError("Le traitement a échoué. Tu peux le relancer depuis la fiche.");
        return;
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    setPhase("done");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) return setError("Sélectionne un fichier audio.");
    if (!consent) return setError("Le consentement est obligatoire.");

    setPhase("uploading");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title);
    fd.append("campaign", campaign);
    fd.append("callOutcome", callOutcome);
    fd.append("tags", tags);
    fd.append("managerNote", managerNote);
    fd.append("consent", String(consent));

    try {
      const res = await fetch("/api/recordings", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setPhase("error");
        setError(json.error?.message ?? "Upload impossible.");
        return;
      }
      // Réinitialise le formulaire.
      const id = json.data.id as string;
      setFile(null);
      setTitle("");
      setCampaign("");
      setTags("");
      setManagerNote("");
      setConsent(false);
      if (inputRef.current) inputRef.current.value = "";
      await pollProcessing(id);
    } catch {
      setPhase("error");
      setError("Erreur réseau.");
    }
  }

  const field =
    "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-violet-500/50";

  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        {/* Drag & drop */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            pickFile(e.dataTransfer.files?.[0] ?? null);
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
            dragOver ? "border-violet-500/60 bg-violet-500/10" : "border-white/15"
          }`}
        >
          <span className="text-2xl">📥</span>
          <p className="mt-1 text-sm text-white/70">
            {file ? file.name : "Glisse un fichier ou clique"}
          </p>
          <p className="text-xs text-white/40">
            {file ? formatBytes(file.size) : "MP3, WAV, M4A"}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".mp3,.wav,.m4a,audio/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder="Titre *" required />
        <div className="grid grid-cols-2 gap-2">
          <input value={campaign} onChange={(e) => setCampaign(e.target.value)} className={field} placeholder="Campagne" />
          <select value={callOutcome} onChange={(e) => setCallOutcome(e.target.value)} className={field}>
            <option value="">Résultat…</option>
            <option value="VENTE">Vente</option>
            <option value="REFUS">Refus</option>
            <option value="RAPPEL">Rappel</option>
            <option value="RDV">RDV</option>
            <option value="AUTRE">Autre</option>
          </select>
        </div>
        <input value={tags} onChange={(e) => setTags(e.target.value)} className={field} placeholder="Tags (séparés par des virgules)" />
        <textarea value={managerNote} onChange={(e) => setManagerNote(e.target.value)} className={field} placeholder="Note du manager" rows={2} />

        {/* Consentement obligatoire */}
        <label className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/60">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
          <span>
            Je confirme que mon organisation a le droit de traiter cet enregistrement
            (base légale / consentement). Évite les données personnelles inutiles et
            anonymise les informations sensibles.
          </span>
        </label>

        {error && <p className="text-sm text-red-300">{error}</p>}
        {phase === "processing" && (
          <p className="text-sm text-violet-300">⏳ {statusLabel}</p>
        )}
        {phase === "done" && (
          <p className="text-sm text-emerald-300">✓ Import terminé — {statusLabel}</p>
        )}

        <Button type="submit" disabled={phase === "uploading" || phase === "processing"} className="w-full">
          {phase === "uploading" ? "Envoi…" : phase === "processing" ? "Traitement…" : "Importer et traiter"}
        </Button>
      </form>
    </Card>
  );
}
