"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card } from "@/components/ui";
import { RecordingStatus } from "@/lib/enums";
import { cx, formatDateTimeFr, formatDuration, formatBytes } from "@/lib/utils";

type RealCallListItem = {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  statusTone: "ready" | "processing" | "failed" | "pending" | "cancelled";
  source: string;
  createdAt: string;
  updatedAt: string;
  durationSec: number;
  language: string;
  overallScore: number | null;
  errorMessage: string | null;
};

type UploadPhase =
  | "préparation"
  | "envoi"
  | "finalisation"
  | "analyse en arrière-plan"
  | null;

type PrepareResponse = {
  id: string;
  status: string;
  uploadMode: "presigned" | "direct";
  uploadUrl: string | null;
  expiresAt: string;
  alreadyAccepted?: boolean;
};

const CONSENT_LABEL =
  "Je confirme être autorisé à importer et analyser cet enregistrement.";

const CANCEL_CONFIRM =
  "Arrêter cette analyse ? L'étape actuellement envoyée au fournisseur peut encore se terminer, mais son résultat ne sera pas conservé.";

const DELETE_CONFIRM =
  "Supprimer définitivement cet appel, son audio, son transcript et son analyse ?";

const fieldClass =
  "w-full min-h-11 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-violet-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400";

function statusBadgeTone(
  tone: RealCallListItem["statusTone"],
): "mint" | "blue" | "flame" | "red" | "gray" {
  switch (tone) {
    case "ready":
      return "mint";
    case "failed":
      return "red";
    case "pending":
      return "flame";
    case "cancelled":
      return "gray";
    case "processing":
    default:
      return "blue";
  }
}

function newAttemptId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "00000000-0000-4000-8000-000000000000";
}

async function readApiError(res: Response): Promise<string> {
  try {
    const json = await res.json();
    return (
      (json as { error?: { message?: string } }).error?.message ??
      "Une erreur est survenue."
    );
  } catch {
    return "Une erreur est survenue.";
  }
}

function isActiveProcessing(status: string): boolean {
  return (
    status === RecordingStatus.UPLOADED ||
    status === RecordingStatus.PREPROCESSING ||
    status === RecordingStatus.TRANSCRIBING ||
    status === RecordingStatus.ANALYZING ||
    status === RecordingStatus.WAITING_FOR_CLARIFICATION ||
    status === RecordingStatus.GENERATING_EXERCISE
  );
}

function isDeletable(status: string): boolean {
  return (
    status === RecordingStatus.PENDING_UPLOAD ||
    status === RecordingStatus.READY ||
    status === RecordingStatus.FAILED ||
    status === RecordingStatus.CANCELLED
  );
}

export function RealCallsClient({
  initialItems,
  maxUploadMb,
}: {
  initialItems: RealCallListItem[];
  rightsConfirmationText?: string;
  maxUploadMb: number;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadInFlightRef = useRef(false);
  const uploadAttemptIdRef = useRef<string | null>(null);
  const recordingIdRef = useRef<string | null>(null);
  const acceptedRef = useRef(false);
  const fileFingerprintRef = useRef<string | null>(null);

  const [items, setItems] = useState(initialItems);
  const [showImport, setShowImport] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const uploading = uploadPhase !== null;
  const canSubmit =
    title.trim().length > 0 && file !== null && consent && !uploading;

  function openImport() {
    setShowImport(true);
    setError(null);
  }

  function pickFile(next: File | null) {
    if (!next) return;
    const lower = next.name.toLowerCase();
    if (!lower.endsWith(".mp3")) {
      setError("Seuls les fichiers MP3 sont acceptés.");
      return;
    }
    const fingerprint = `${next.name}:${next.size}:${next.lastModified}`;
    if (fileFingerprintRef.current !== fingerprint) {
      uploadAttemptIdRef.current = null;
      recordingIdRef.current = null;
      acceptedRef.current = false;
      fileFingerprintRef.current = fingerprint;
    }
    setFile(next);
    setError(null);
  }

  async function recoverAccepted(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/real-calls/${id}`);
      if (!res.ok) return false;
      const json = await res.json();
      const status = (json?.data as { status?: string } | undefined)?.status;
      if (!status || status === RecordingStatus.PENDING_UPLOAD) return false;
      acceptedRef.current = true;
      setUploadPhase("analyse en arrière-plan");
      router.push(`/app/real-calls/${id}`);
      return true;
    } catch {
      return false;
    }
  }

  async function finalizePresigned(id: string): Promise<boolean> {
    const finalizeRes = await fetch(`/api/real-calls/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "finalize" }),
    });
    if (!finalizeRes.ok) {
      setError(await readApiError(finalizeRes));
      setUploadPhase(null);
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !file || uploadInFlightRef.current) return;

    uploadInFlightRef.current = true;
    acceptedRef.current = false;
    setError(null);
    setUploadPhase("préparation");

    try {
      if (!uploadAttemptIdRef.current) {
        uploadAttemptIdRef.current = newAttemptId();
      }
      const uploadAttemptId = uploadAttemptIdRef.current;

      const prepareRes = await fetch("/api/real-calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rightsConfirmed: true,
          fileName: file.name,
          mimeType: file.type || "audio/mpeg",
          sizeBytes: file.size,
          title: title.trim(),
          uploadAttemptId,
        }),
      });

      if (!prepareRes.ok) {
        setError(await readApiError(prepareRes));
        setUploadPhase(null);
        return;
      }

      let prepared: PrepareResponse;
      try {
        const prepareJson = await prepareRes.json();
        prepared = prepareJson.data as PrepareResponse;
      } catch {
        setError("Réponse d'initialisation illisible.");
        setUploadPhase(null);
        return;
      }

      const { id, uploadMode, uploadUrl, alreadyAccepted } = prepared;
      recordingIdRef.current = id;

      if (alreadyAccepted) {
        acceptedRef.current = true;
        setUploadPhase("analyse en arrière-plan");
        router.push(`/app/real-calls/${id}`);
        return;
      }

      setUploadPhase("envoi");

      if (uploadMode === "presigned") {
        if (!uploadUrl) {
          setError("URL d'envoi indisponible.");
          setUploadPhase(null);
          return;
        }
        let putOk = false;
        try {
          const putRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type || "audio/mpeg" },
            body: file,
          });
          putOk = putRes.ok;
          if (!putOk) {
            setError("Échec de l'envoi du fichier.");
            setUploadPhase(null);
            return;
          }
        } catch {
          // PUT potentiellement envoyé : finalisation de vérification via head serveur.
          setUploadPhase("finalisation");
          try {
            const recovered = await finalizePresigned(id);
            if (!recovered) return;
            acceptedRef.current = true;
            setUploadPhase("analyse en arrière-plan");
            router.push(`/app/real-calls/${id}`);
            return;
          } catch {
            if (await recoverAccepted(id)) return;
            setError("Échec de l'envoi du fichier.");
            setUploadPhase(null);
            return;
          }
        }

        setUploadPhase("finalisation");
        try {
          const okFinalize = await finalizePresigned(id);
          if (!okFinalize) {
            if (await recoverAccepted(id)) return;
            return;
          }
        } catch {
          if (await recoverAccepted(id)) return;
          setError("Finalisation interrompue. Vérifiez l'état de l'appel.");
          setUploadPhase(null);
          return;
        }
      } else {
        setUploadPhase("finalisation");
        try {
          const fd = new FormData();
          fd.append("action", "finalize");
          fd.append("file", file);
          const finalizeRes = await fetch(`/api/real-calls/${id}`, {
            method: "POST",
            body: fd,
          });
          if (!finalizeRes.ok) {
            if (await recoverAccepted(id)) return;
            setError(await readApiError(finalizeRes));
            setUploadPhase(null);
            return;
          }
        } catch {
          if (await recoverAccepted(id)) return;
          setError("Finalisation interrompue. Vérifiez l'état de l'appel.");
          setUploadPhase(null);
          return;
        }
      }

      acceptedRef.current = true;
      setUploadPhase("analyse en arrière-plan");
      router.push(`/app/real-calls/${id}`);
    } catch {
      if (acceptedRef.current && recordingIdRef.current) {
        router.push(`/app/real-calls/${recordingIdRef.current}`);
        return;
      }
      if (recordingIdRef.current && (await recoverAccepted(recordingIdRef.current))) {
        return;
      }
      setError("Erreur réseau.");
      setUploadPhase(null);
    } finally {
      uploadInFlightRef.current = false;
    }
  }

  async function onCancel(item: RealCallListItem) {
    if (actionBusyId) return;
    if (!window.confirm(CANCEL_CONFIRM)) return;
    setActionBusyId(item.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/real-calls/${item.id}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        setActionError(await readApiError(res));
        return;
      }
      const json = await res.json();
      const status = (json?.data as { status?: string })?.status ?? item.status;
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? {
                ...row,
                status,
                statusLabel:
                  status === RecordingStatus.CANCELLED
                    ? "Analyse arrêtée"
                    : status === RecordingStatus.CANCEL_REQUESTED
                      ? "Arrêt en cours"
                      : row.statusLabel,
                statusTone:
                  status === RecordingStatus.CANCELLED
                    ? "cancelled"
                    : "processing",
                errorMessage: null,
              }
            : row,
        ),
      );
    } catch {
      setActionError("Impossible d'arrêter l'analyse.");
    } finally {
      setActionBusyId(null);
    }
  }

  async function onDelete(item: RealCallListItem) {
    if (actionBusyId) return;
    if (!window.confirm(DELETE_CONFIRM)) return;
    setActionBusyId(item.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/real-calls/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        setActionError(await readApiError(res));
        return;
      }
      setItems((prev) => prev.filter((row) => row.id !== item.id));
    } catch {
      setActionError("Impossible de supprimer cet appel.");
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <div className="animate-fade-up mx-auto max-w-md pb-24">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">Mes appels réels</h1>
        <p className="mt-2 text-sm text-white/55">
          Importez vos enregistrements MP3 pour obtenir une analyse de coaching
          personnalisée et suivre votre progression.
        </p>
      </header>

      <button
        type="button"
        onClick={() => (showImport ? setShowImport(false) : openImport())}
        className="btn-gradient mb-5 flex min-h-11 w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b12]"
      >
        {showImport ? "Fermer l'import" : "Importer un appel MP3"}
      </button>

      {showImport ? (
        <Card className="mb-6 border-violet-500/20">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="real-call-title" className="mb-1.5 block text-xs text-white/50">
                Titre de l&apos;appel
              </label>
              <input
                id="real-call-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="Ex. Appel client Dupont"
                className={fieldClass}
                disabled={uploading}
              />
            </div>

            <div>
              <label htmlFor="real-call-file" className="mb-1.5 block text-xs text-white/50">
                Fichier audio
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={cx(
                  "flex min-h-11 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-4 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400",
                  file
                    ? "border-violet-500/40 bg-violet-500/10"
                    : "border-white/15 hover:border-white/25",
                )}
              >
                <span className="text-sm text-white/75">
                  {file ? file.name : "Sélectionner un fichier .mp3"}
                </span>
                <span className="mt-1 text-xs text-white/40">
                  {file
                    ? formatBytes(file.size)
                    : `MP3 uniquement · max ${maxUploadMb} Mo`}
                </span>
              </button>
              <input
                ref={fileInputRef}
                id="real-call-file"
                type="file"
                accept=".mp3,audio/mpeg"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={uploading}
                className="mt-1 size-4 shrink-0 rounded border-white/20 accent-[#3E6BFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
              />
              <span>{CONSENT_LABEL}</span>
            </label>

            {uploadPhase ? (
              <p className="text-sm font-medium text-electric-400" aria-live="polite">
                {uploadPhase === "analyse en arrière-plan"
                  ? "Analyse lancée en arrière-plan…"
                  : `${uploadPhase.charAt(0).toUpperCase()}${uploadPhase.slice(1)}…`}
              </p>
            ) : null}

            {error ? (
              <p className="text-sm text-red-300" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              disabled={!canSubmit}
              className="min-h-11 w-full"
            >
              {uploading ? "Import en cours…" : "Lancer l'import"}
            </Button>
          </form>
        </Card>
      ) : null}

      {actionError ? (
        <p className="mb-3 text-sm text-red-300" role="alert">
          {actionError}
        </p>
      ) : null}

      {items.length === 0 ? (
        <Card className="text-center">
          <p className="text-sm text-white/55">
            Aucun appel importé pour le moment.
          </p>
          <p className="mt-2 text-xs text-white/40">
            Importez un enregistrement MP3 pour lancer votre première analyse.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 min-h-11 w-full"
            onClick={openImport}
          >
            Importer un appel MP3
          </Button>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="card flex flex-col gap-3 p-4">
              <Link
                href={`/app/real-calls/${item.id}`}
                className="flex min-h-11 flex-col gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-400"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-xs text-white/45">
                      {formatDateTimeFr(item.createdAt)}
                      {item.durationSec > 0
                        ? ` · ${formatDuration(item.durationSec)}`
                        : ""}
                    </p>
                  </div>
                  <Badge
                    tone={statusBadgeTone(item.statusTone)}
                    className="shrink-0"
                  >
                    {item.statusLabel}
                  </Badge>
                </div>
                {item.statusTone === "failed" && item.errorMessage ? (
                  <p className="text-xs text-red-300/90">{item.errorMessage}</p>
                ) : null}
                {item.statusTone === "ready" && item.overallScore != null ? (
                  <p className="text-xs text-white/50">
                    Score : {item.overallScore}/100
                  </p>
                ) : null}
              </Link>

              <div className="flex flex-col gap-2">
                {isActiveProcessing(item.status) ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full"
                    disabled={actionBusyId === item.id}
                    onClick={() => void onCancel(item)}
                  >
                    {actionBusyId === item.id
                      ? "Arrêt…"
                      : "Arrêter l'analyse"}
                  </Button>
                ) : null}
                {item.status === RecordingStatus.CANCEL_REQUESTED ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full"
                    disabled
                  >
                    Arrêt en cours…
                  </Button>
                ) : null}
                {isDeletable(item.status) ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full"
                    disabled={actionBusyId === item.id}
                    onClick={() => void onDelete(item)}
                  >
                    {actionBusyId === item.id ? "Suppression…" : "Supprimer"}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
