"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { formatBytes } from "@/lib/utils";

type Phase = "idle" | "uploading" | "error";

/**
 * Import minimal : seuls le fichier + le consentement sont requis.
 * Le titre, la campagne et la note sont optionnels. « Utiliser comme appel
 * modèle » (défaut activé) déclenche le pipeline de génération d'exercice.
 * Après l'upload, on redirige vers la fiche (page de progression / validation).
 */
export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [title, setTitle] = useState("");
  const [campaign, setCampaign] = useState("");
  const [managerNote, setManagerNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [useAsModel, setUseAsModel] = useState(true);
  const [showOptional, setShowOptional] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File | null) {
    if (!f) return;
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) return setError("Sélectionne un fichier audio.");
    if (!consent) return setError("Le consentement est obligatoire.");

    setPhase("uploading");
    const fd = new FormData();
    fd.append("file", file);
    if (title) fd.append("title", title);
    if (campaign) fd.append("campaign", campaign);
    if (managerNote) fd.append("managerNote", managerNote);
    fd.append("consent", String(consent));
    fd.append("useAsModel", String(useAsModel));

    try {
      const res = await fetch("/api/recordings", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setPhase("error");
        setError(json.error?.message ?? "Upload impossible.");
        return;
      }
      const id = json.data.id as string;
      // Redirige vers la fiche : la progression y est suivie en direct.
      router.push(`/manager/recordings/${id}`);
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
            {file ? file.name : "Glisse un appel ou clique"}
          </p>
          <p className="text-xs text-white/40">
            {file ? formatBytes(file.size) : "MP3, WAV, M4A, WebM"}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".mp3,.wav,.m4a,.webm,audio/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {/* Utiliser comme appel modèle */}
        <label className="flex items-start gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 text-xs text-white/70">
          <input
            type="checkbox"
            checked={useAsModel}
            onChange={(e) => setUseAsModel(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-white/85">Créer un exercice depuis cet appel</span>
            <br />
            Transcription, anonymisation et génération d&apos;un scénario d&apos;entraînement équivalent.
          </span>
        </label>

        {/* Consentement obligatoire */}
        <label className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/60">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Je confirme que mon organisation a le droit de traiter cet enregistrement
            (base légale / consentement).
          </span>
        </label>

        <button
          type="button"
          onClick={() => setShowOptional((v) => !v)}
          className="text-xs text-white/45 hover:text-white/70"
        >
          {showOptional ? "− Masquer les champs optionnels" : "+ Champs optionnels (titre, campagne, note)"}
        </button>
        {showOptional && (
          <div className="space-y-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} placeholder="Titre (auto depuis le fichier si vide)" />
            <input value={campaign} onChange={(e) => setCampaign(e.target.value)} className={field} placeholder="Campagne" />
            <textarea value={managerNote} onChange={(e) => setManagerNote(e.target.value)} className={field} placeholder="Note du manager" rows={2} />
          </div>
        )}

        {error && <p className="text-sm text-red-300">{error}</p>}

        <Button type="submit" disabled={phase === "uploading"} className="w-full">
          {phase === "uploading" ? "Envoi…" : useAsModel ? "Importer et générer l'exercice" : "Importer l'appel"}
        </Button>
      </form>
    </Card>
  );
}
