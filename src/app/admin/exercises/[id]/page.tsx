"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Badge, Button, Card } from "@/components/ui";

export type PromptEditorState = {
  prospectPersona: string;
  includeEvalSystem: boolean;
  evalSystem: string;
  includeEvalUser: boolean;
  evalUser: string;
  changeNote: string;
};

export type AdminExerciseDetail = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  level: string;
  missionLevel: number;
  sortOrder: number;
  callType: string;
  campaign: string | null;
  offer: string | null;
  prospectProfile: string | null;
  initialSituation: string | null;
  objective: string | null;
  personality: string | null;
  allowedObjections: string[];
  secretInfos: Array<{ question: string; answer: string }>;
  successConditions: string | null;
  failureConditions: string | null;
  targetDurationSec: number;
  traineeBrief: string | null;
  referenceCounts?: { simulations: number; assignments: number };
  currentBundle: null | {
    id: string;
    version: number;
    status: string;
    changeNote: string | null;
    createdById: string | null;
    createdAt: string;
    publishedAt: string | null;
    artifacts: {
      PROSPECT_PERSONA: { body: string; contentType: string };
      EVALUATION_SYSTEM?: { body: string; contentType: string };
      EVALUATION_USER?: { body: string; contentType: string };
    };
  };
  versions: Array<{
    id: string;
    version: number;
    status: string;
    changeNote: string | null;
    createdById: string | null;
    createdAt: string;
    publishedAt: string | null;
  }>;
};

export function isArchivedReadOnly(status: string): boolean {
  return status === "ARCHIVED";
}

export function resolvePromptSaveAction(
  hasDraft: boolean,
): "updateDraftPrompts" | "createVersion" {
  return hasDraft ? "updateDraftPrompts" : "createVersion";
}

export function editorStateFromBundle(
  bundle: AdminExerciseDetail["currentBundle"],
): PromptEditorState {
  const arts = bundle?.artifacts;
  return {
    prospectPersona:
      arts?.PROSPECT_PERSONA?.body ??
      "Tu incarnes {{prospectName}}, un prospect au téléphone. Parle en français.",
    includeEvalSystem: Boolean(arts?.EVALUATION_SYSTEM?.body),
    evalSystem: arts?.EVALUATION_SYSTEM?.body ?? "",
    includeEvalUser: Boolean(arts?.EVALUATION_USER?.body),
    evalUser: arts?.EVALUATION_USER?.body ?? "",
    changeNote: "",
  };
}

/** Construit les artifacts API : PROSPECT_PERSONA obligatoire ; optionnels omis si désactivés. */
export function buildArtifactsFromEditor(state: PromptEditorState) {
  const artifacts: Record<string, { body: string; contentType: string }> = {
    PROSPECT_PERSONA: {
      body: state.prospectPersona,
      contentType: "text/plain",
    },
  };
  if (state.includeEvalSystem && state.evalSystem.trim()) {
    artifacts.EVALUATION_SYSTEM = {
      body: state.evalSystem,
      contentType: "text/plain",
    };
  }
  if (state.includeEvalUser && state.evalUser.trim()) {
    artifacts.EVALUATION_USER = {
      body: state.evalUser,
      contentType: "text/plain",
    };
  }
  return artifacts;
}

export type SecretInfoRow = { question: string; answer: string };

export type MetaFormState = {
  name: string;
  slug: string;
  level: string;
  missionLevel: number;
  sortOrder: number;
  callType: string;
  campaign: string;
  offer: string;
  prospectProfile: string;
  initialSituation: string;
  objective: string;
  personality: string;
  allowedObjections: string;
  secretInfos: SecretInfoRow[];
  successConditions: string;
  failureConditions: string;
  targetDurationSec: number;
  traineeBrief: string;
};

export type ApplyExerciseSync = {
  syncMeta?: boolean;
  syncEditor?: boolean;
};

/** Quelle partie du formulaire resynchroniser après une réponse API. */
export function resolveApplySync(
  kind: "load" | "saveMetadata" | "savePrompts" | "lifecycle" | "restore",
): Required<ApplyExerciseSync> {
  switch (kind) {
    case "load":
      return { syncMeta: true, syncEditor: true };
    case "saveMetadata":
      return { syncMeta: true, syncEditor: false };
    case "savePrompts":
      return { syncMeta: false, syncEditor: true };
    case "restore":
      return { syncMeta: false, syncEditor: true };
    case "lifecycle":
      return { syncMeta: false, syncEditor: false };
  }
}

export function metaFormFromExercise(ex: AdminExerciseDetail): MetaFormState {
  return {
    name: ex.name,
    slug: ex.slug ?? "",
    level: ex.level,
    missionLevel: ex.missionLevel,
    sortOrder: ex.sortOrder,
    callType: ex.callType,
    campaign: ex.campaign ?? "",
    offer: ex.offer ?? "",
    prospectProfile: ex.prospectProfile ?? "",
    initialSituation: ex.initialSituation ?? "",
    objective: ex.objective ?? "",
    personality: ex.personality ?? "",
    allowedObjections: (ex.allowedObjections ?? []).join("\n"),
    secretInfos: (ex.secretInfos ?? []).map((s) => ({
      question: s.question ?? "",
      answer: s.answer ?? "",
    })),
    successConditions: ex.successConditions ?? "",
    failureConditions: ex.failureConditions ?? "",
    targetDurationSec: ex.targetDurationSec,
    traineeBrief: ex.traineeBrief ?? "",
  };
}

/**
 * Payload PATCH métadonnées.
 * Chaînes optionnelles : "" conservé (effacement).
 * slug vide omis (contrat backend).
 * allowedObjections / secretInfos : toujours des tableaux (y compris []).
 */
export function buildMetadataPatchPayload(meta: MetaFormState) {
  const payload: Record<string, unknown> = {
    name: meta.name,
    level: meta.level,
    missionLevel: Number(meta.missionLevel),
    sortOrder: Number(meta.sortOrder),
    callType: meta.callType,
    campaign: meta.campaign,
    offer: meta.offer,
    prospectProfile: meta.prospectProfile,
    initialSituation: meta.initialSituation,
    objective: meta.objective,
    personality: meta.personality,
    allowedObjections: meta.allowedObjections
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    secretInfos: meta.secretInfos.map((s) => ({
      question: s.question,
      answer: s.answer,
    })),
    successConditions: meta.successConditions,
    failureConditions: meta.failureConditions,
    targetDurationSec: Number(meta.targetDurationSec),
    traineeBrief: meta.traineeBrief,
  };
  if (meta.slug.trim()) payload.slug = meta.slug.trim();
  return payload;
}

/** Ne pas effacer la confirmation restore après un échec API. */
export function shouldClearConfirmOnFailure(action: unknown): boolean {
  return action !== "restoreVersion";
}

/** Fermer/vider le panneau restore uniquement si l’action a renvoyé des données. */
export function shouldDismissRestoreUi(actionResult: unknown): boolean {
  return Boolean(actionResult);
}

async function readError(res: Response): Promise<string> {
  const json = await res.json().catch(() => null);
  return (
    json?.error?.message ??
    "Action impossible. Réessaie ou contacte un administrateur."
  );
}

function statusTone(
  status: string,
): "gray" | "mint" | "red" | "flame" | "blue" {
  if (status === "PUBLISHED") return "mint";
  if (status === "ARCHIVED") return "red";
  if (status === "DRAFT") return "gray";
  if (status === "SUPERSEDED") return "blue";
  return "flame";
}

const fieldCls =
  "mt-1 w-full rounded-xl border border-[#1e222c] bg-[#12151d] px-3 py-2 text-sm text-white";
const labelCls = "block text-xs text-[#9AA1B2]";

export default function AdminExerciseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [exercise, setExercise] = useState<AdminExerciseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [restoreVersion, setRestoreVersion] = useState<number | null>(null);
  const [restoreNote, setRestoreNote] = useState("");
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<string>("");
  const [previewBusy, setPreviewBusy] = useState(false);

  const [meta, setMeta] = useState<MetaFormState>({
    name: "",
    slug: "",
    level: "MOYEN",
    missionLevel: 1,
    sortOrder: 0,
    callType: "VENTE",
    campaign: "",
    offer: "",
    prospectProfile: "",
    initialSituation: "",
    objective: "",
    personality: "",
    allowedObjections: "",
    secretInfos: [],
    successConditions: "",
    failureConditions: "",
    targetDurationSec: 300,
    traineeBrief: "",
  });
  const [editor, setEditor] = useState<PromptEditorState>(
    editorStateFromBundle(null),
  );

  const archived = exercise ? isArchivedReadOnly(exercise.status) : false;
  const hasDraft = exercise?.currentBundle?.status === "DRAFT";
  const promptAction = resolvePromptSaveAction(Boolean(hasDraft));

  const applyExercise = useCallback(
    (ex: AdminExerciseDetail, sync: ApplyExerciseSync = {}) => {
      const { syncMeta = false, syncEditor = false } = sync;
      setExercise(ex);
      if (syncMeta) setMeta(metaFormFromExercise(ex));
      if (syncEditor) setEditor(editorStateFromBundle(ex.currentBundle));
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/exercises/${id}`);
      if (!res.ok) {
        setError(await readError(res));
        setExercise(null);
        return;
      }
      const json = await res.json().catch(() => null);
      if (!json?.data) {
        setError("Exercice introuvable.");
        return;
      }
      applyExercise(
        json.data as AdminExerciseDetail,
        resolveApplySync("load"),
      );
    } catch {
      setError("Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }, [id, applyExercise]);

  useEffect(() => {
    void load();
  }, [load]);

  async function postAction(
    body: Record<string, unknown>,
    opts?: { confirmKey?: string },
  ) {
    if (busy) return null;
    if (opts?.confirmKey && confirm !== opts.confirmKey) {
      setConfirm(opts.confirmKey);
      return null;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/exercises/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(
          json?.error?.message ??
            "Action impossible. Réessaie ou contacte un administrateur.",
        );
        if (shouldClearConfirmOnFailure(body.action)) {
          setConfirm(null);
        }
        return null;
      }
      setConfirm(null);
      if (json?.data) {
        const data = json.data as AdminExerciseDetail;
        const sync =
          body.action === "restoreVersion"
            ? resolveApplySync("restore")
            : resolveApplySync("lifecycle");
        applyExercise(data, sync);
        return data;
      }
      return null;
    } catch {
      setActionError("Action impossible.");
      if (shouldClearConfirmOnFailure(body.action)) {
        setConfirm(null);
      }
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveMetadata() {
    if (busy || archived) return;
    setBusy(true);
    setMetaError(null);
    try {
      const payload = buildMetadataPatchPayload(meta);
      const res = await fetch(`/api/admin/exercises/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMetaError(
          json?.error?.message ??
            "Enregistrement impossible. Réessaie ou contacte un administrateur.",
        );
        return;
      }
      if (json?.data) {
        applyExercise(
          json.data as AdminExerciseDetail,
          resolveApplySync("saveMetadata"),
        );
      }
    } catch {
      setMetaError("Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function savePrompts() {
    if (busy || archived) return;
    setBusy(true);
    setPromptError(null);
    try {
      const artifacts = buildArtifactsFromEditor(editor);
      const action = promptAction;
      const body: Record<string, unknown> = { action, artifacts };
      if (action === "createVersion") {
        if (!editor.changeNote.trim()) {
          setPromptError("Une note de changement est requise pour une nouvelle version.");
          return;
        }
        body.changeNote = editor.changeNote.trim();
      } else if (editor.changeNote.trim()) {
        body.changeNote = editor.changeNote.trim();
      }
      const res = await fetch(`/api/admin/exercises/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setPromptError(
          json?.error?.message ??
            "Enregistrement des prompts impossible.",
        );
        return;
      }
      if (json?.data) {
        applyExercise(
          json.data as AdminExerciseDetail,
          resolveApplySync("savePrompts"),
        );
      }
    } catch {
      setPromptError("Enregistrement des prompts impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    if (previewBusy) return;
    setPreviewBusy(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = {
        action: "preview",
        fixtureId: "default",
      };
      if (previewVersion) body.version = Number(previewVersion);
      const res = await fetch(`/api/admin/exercises/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(
          json?.error?.message ?? "Preview impossible.",
        );
        setPreviewText(null);
        return;
      }
      setPreviewText(String(json?.data?.rendered ?? ""));
    } catch {
      setActionError("Preview impossible.");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function duplicate() {
    const data = await postAction(
      { action: "duplicate" },
      { confirmKey: "duplicate" },
    );
    if (data?.id) router.push(`/admin/exercises/${data.id}`);
  }

  async function removeDraft() {
    if (busy) return;
    if (confirm !== "delete") {
      setConfirm("delete");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/exercises/${id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(
          json?.error?.message ??
            "Suppression impossible. Réessaie ou contacte un administrateur.",
        );
        setConfirm(null);
        return;
      }
      router.push("/admin/exercises");
    } catch {
      setActionError("Suppression impossible.");
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  const versionOptions = useMemo(
    () => exercise?.versions ?? [],
    [exercise],
  );

  if (loading) {
    return <p className="text-sm text-[#9AA1B2]">Chargement…</p>;
  }
  if (error || !exercise) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[#FF5C5C]" role="alert">
          {error ?? "Exercice introuvable."}
        </p>
        <Link href="/admin/exercises" className="text-sm text-[#3E6BFF]">
          Retour à la liste
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/exercises" className="text-xs text-[#3E6BFF]">
            ← Exercices
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{exercise.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(exercise.status)}>{exercise.status}</Badge>
            {exercise.currentBundle && (
              <span className="text-xs text-[#9AA1B2]">
                Bundle v{exercise.currentBundle.version} ({exercise.currentBundle.status})
              </span>
            )}
            {exercise.referenceCounts && (
              <span className="text-xs text-[#9AA1B2]">
                {exercise.referenceCounts.simulations} sim. ·{" "}
                {exercise.referenceCounts.assignments} assign.
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!archived && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void postAction(
                    { action: "publishBundle" },
                    { confirmKey: "publishBundle" },
                  )
                }
              >
                {confirm === "publishBundle"
                  ? "Confirmer publish bundle"
                  : "Publier le bundle"}
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  void postAction(
                    { action: "publish" },
                    { confirmKey: "publish" },
                  )
                }
              >
                {confirm === "publish"
                  ? "Confirmer publication"
                  : "Publier l'exercice"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void postAction({ action: "unpublish" })}
              >
                Dépublier
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="flame"
            disabled={busy}
            onClick={() => void duplicate()}
          >
            {confirm === "duplicate" ? "Confirmer duplication" : "Dupliquer"}
          </Button>
          {!archived && (
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() =>
                void postAction(
                  { action: "archive" },
                  { confirmKey: "archive" },
                )
              }
            >
              {confirm === "archive" ? "Confirmer archivage" : "Archiver"}
            </Button>
          )}
          {exercise.status === "DRAFT" && (
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={() => void removeDraft()}
            >
              {confirm === "delete" ? "Confirmer suppression" : "Supprimer"}
            </Button>
          )}
        </div>
      </div>

      {archived && (
        <p className="rounded-xl border border-[#FF7A3D]/30 bg-[#FF7A3D]/10 px-3 py-2 text-sm text-[#FF7A3D]">
          Exercice archivé : métadonnées et prompts en lecture seule. Preview et
          duplication restent disponibles.
        </p>
      )}
      {actionError && (
        <p className="text-sm text-[#FF5C5C]" role="alert">
          {actionError}
        </p>
      )}

      <Card className="space-y-4 border border-[#1e222c] bg-[#0d1017]">
        <h2 className="text-lg font-semibold">Métadonnées</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            Nom
            <input className={fieldCls} disabled={archived || busy} value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
          </label>
          <label className={labelCls}>
            Slug
            <input className={fieldCls} disabled={archived || busy} value={meta.slug} onChange={(e) => setMeta({ ...meta, slug: e.target.value })} />
          </label>
          <label className={labelCls}>
            Niveau
            <select className={fieldCls} disabled={archived || busy} value={meta.level} onChange={(e) => setMeta({ ...meta, level: e.target.value })}>
              <option value="FACILE">FACILE</option>
              <option value="MOYEN">MOYEN</option>
              <option value="DIFFICILE">DIFFICILE</option>
            </select>
          </label>
          <label className={labelCls}>
            Type d&apos;appel
            <select className={fieldCls} disabled={archived || busy} value={meta.callType} onChange={(e) => setMeta({ ...meta, callType: e.target.value })}>
              <option value="VENTE">VENTE</option>
              <option value="PITCH_INVESTISSEUR">PITCH_INVESTISSEUR</option>
              <option value="ENTRETIEN_EMBAUCHE">ENTRETIEN_EMBAUCHE</option>
            </select>
          </label>
          <label className={labelCls}>
            Mission level
            <input type="number" min={1} max={20} className={fieldCls} disabled={archived || busy} value={meta.missionLevel} onChange={(e) => setMeta({ ...meta, missionLevel: Number(e.target.value) })} />
          </label>
          <label className={labelCls}>
            Ordre
            <input type="number" min={0} max={999} className={fieldCls} disabled={archived || busy} value={meta.sortOrder} onChange={(e) => setMeta({ ...meta, sortOrder: Number(e.target.value) })} />
          </label>
          <label className={labelCls}>
            Campagne
            <input className={fieldCls} disabled={archived || busy} value={meta.campaign} onChange={(e) => setMeta({ ...meta, campaign: e.target.value })} />
          </label>
          <label className={labelCls}>
            Durée cible (s)
            <input type="number" min={60} max={1800} className={fieldCls} disabled={archived || busy} value={meta.targetDurationSec} onChange={(e) => setMeta({ ...meta, targetDurationSec: Number(e.target.value) })} />
          </label>
        </div>
        <label className={labelCls}>
          Offre
          <textarea rows={2} className={fieldCls} disabled={archived || busy} value={meta.offer} onChange={(e) => setMeta({ ...meta, offer: e.target.value })} />
        </label>
        <label className={labelCls}>
          Profil prospect
          <textarea rows={2} className={fieldCls} disabled={archived || busy} value={meta.prospectProfile} onChange={(e) => setMeta({ ...meta, prospectProfile: e.target.value })} />
        </label>
        <label className={labelCls}>
          Situation initiale
          <textarea rows={2} className={fieldCls} disabled={archived || busy} value={meta.initialSituation} onChange={(e) => setMeta({ ...meta, initialSituation: e.target.value })} />
        </label>
        <label className={labelCls}>
          Objectif
          <textarea rows={2} className={fieldCls} disabled={archived || busy} value={meta.objective} onChange={(e) => setMeta({ ...meta, objective: e.target.value })} />
        </label>
        <label className={labelCls}>
          Personnalité
          <input className={fieldCls} disabled={archived || busy} value={meta.personality} onChange={(e) => setMeta({ ...meta, personality: e.target.value })} />
        </label>
        <label className={labelCls}>
          Objections (une par ligne)
          <textarea rows={3} className={fieldCls} disabled={archived || busy} value={meta.allowedObjections} onChange={(e) => setMeta({ ...meta, allowedObjections: e.target.value })} />
        </label>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={labelCls}>Informations secrètes (question / réponse)</p>
            {!archived && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  setMeta({
                    ...meta,
                    secretInfos: [
                      ...meta.secretInfos,
                      { question: "", answer: "" },
                    ],
                  })
                }
              >
                Ajouter une ligne
              </Button>
            )}
          </div>
          {meta.secretInfos.length === 0 && (
            <p className="text-xs text-[#9AA1B2]">Aucune information secrète.</p>
          )}
          {meta.secretInfos.map((row, idx) => (
            <div
              key={idx}
              className="grid gap-2 rounded-xl border border-[#1e222c] bg-[#12151d] p-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <label className={labelCls}>
                Question
                <input
                  className={fieldCls}
                  disabled={archived || busy}
                  value={row.question}
                  onChange={(e) => {
                    const next = meta.secretInfos.slice();
                    const cur = next[idx] ?? { question: "", answer: "" };
                    next[idx] = { question: e.target.value, answer: cur.answer };
                    setMeta({ ...meta, secretInfos: next });
                  }}
                />
              </label>
              <label className={labelCls}>
                Réponse
                <input
                  className={fieldCls}
                  disabled={archived || busy}
                  value={row.answer}
                  onChange={(e) => {
                    const next = meta.secretInfos.slice();
                    const cur = next[idx] ?? { question: "", answer: "" };
                    next[idx] = { question: cur.question, answer: e.target.value };
                    setMeta({ ...meta, secretInfos: next });
                  }}
                />
              </label>
              {!archived && (
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      setMeta({
                        ...meta,
                        secretInfos: meta.secretInfos.filter((_, i) => i !== idx),
                      })
                    }
                  >
                    Retirer
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>
            Conditions de réussite
            <textarea rows={2} className={fieldCls} disabled={archived || busy} value={meta.successConditions} onChange={(e) => setMeta({ ...meta, successConditions: e.target.value })} />
          </label>
          <label className={labelCls}>
            Conditions d&apos;échec
            <textarea rows={2} className={fieldCls} disabled={archived || busy} value={meta.failureConditions} onChange={(e) => setMeta({ ...meta, failureConditions: e.target.value })} />
          </label>
        </div>
        <label className={labelCls}>
          Brief stagiaire
          <textarea rows={3} className={fieldCls} disabled={archived || busy} value={meta.traineeBrief} onChange={(e) => setMeta({ ...meta, traineeBrief: e.target.value })} />
        </label>
        {metaError && (
          <p className="text-sm text-[#FF5C5C]" role="alert">
            {metaError}
          </p>
        )}
        {!archived && (
          <Button type="button" disabled={busy} onClick={() => void saveMetadata()}>
            Enregistrer les métadonnées
          </Button>
        )}
      </Card>
      <Card className="space-y-4 border border-[#1e222c] bg-[#0d1017]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Prompts</h2>
          <span className="text-xs text-[#9AA1B2]">
            Action : {promptAction}
            {hasDraft ? " (brouillon existant)" : " (nouvelle version)"}
          </span>
        </div>
        <label className={labelCls}>
          PROSPECT_PERSONA (obligatoire)
          <textarea
            rows={10}
            className={fieldCls}
            disabled={archived || busy}
            value={editor.prospectPersona}
            onChange={(e) =>
              setEditor({ ...editor, prospectPersona: e.target.value })
            }
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-[#9AA1B2]">
          <input
            type="checkbox"
            disabled={archived || busy}
            checked={editor.includeEvalSystem}
            onChange={(e) =>
              setEditor({ ...editor, includeEvalSystem: e.target.checked })
            }
          />
          Inclure EVALUATION_SYSTEM
        </label>
        {editor.includeEvalSystem && (
          <textarea
            rows={6}
            className={fieldCls}
            disabled={archived || busy}
            value={editor.evalSystem}
            onChange={(e) =>
              setEditor({ ...editor, evalSystem: e.target.value })
            }
            placeholder="EVALUATION_SYSTEM"
          />
        )}
        <label className="flex items-center gap-2 text-sm text-[#9AA1B2]">
          <input
            type="checkbox"
            disabled={archived || busy}
            checked={editor.includeEvalUser}
            onChange={(e) =>
              setEditor({ ...editor, includeEvalUser: e.target.checked })
            }
          />
          Inclure EVALUATION_USER
        </label>
        {editor.includeEvalUser && (
          <textarea
            rows={6}
            className={fieldCls}
            disabled={archived || busy}
            value={editor.evalUser}
            onChange={(e) =>
              setEditor({ ...editor, evalUser: e.target.value })
            }
            placeholder="EVALUATION_USER"
          />
        )}
        <label className={labelCls}>
          Note de changement
          {!hasDraft ? " *" : ""}
          <input
            className={fieldCls}
            disabled={archived || busy}
            value={editor.changeNote}
            onChange={(e) =>
              setEditor({ ...editor, changeNote: e.target.value })
            }
            placeholder={
              hasDraft
                ? "Optionnel pour mise à jour du brouillon"
                : "Obligatoire pour créer une version"
            }
          />
        </label>
        {promptError && (
          <p className="text-sm text-[#FF5C5C]" role="alert">
            {promptError}
          </p>
        )}
        {!archived && (
          <Button type="button" disabled={busy} onClick={() => void savePrompts()}>
            {hasDraft
              ? "Enregistrer le brouillon de prompts"
              : "Créer une nouvelle version"}
          </Button>
        )}
      </Card>

      <Card className="space-y-4 border border-[#1e222c] bg-[#0d1017]">
        <h2 className="text-lg font-semibold">Historique des versions</h2>
        <p className="text-xs text-[#9AA1B2]">
          Restaurer crée une nouvelle version brouillon — l&apos;historique n&apos;est
          jamais réécrit.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-[#9AA1B2]">
              <tr>
                <th className="py-2 pr-3">Version</th>
                <th className="py-2 pr-3">Statut</th>
                <th className="py-2 pr-3">Note</th>
                <th className="py-2 pr-3">Auteur</th>
                <th className="py-2 pr-3">Créée</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {versionOptions.map((v) => (
                <tr key={v.id} className="border-t border-[#1e222c]">
                  <td className="py-2 pr-3">v{v.version}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={statusTone(v.status)}>{v.status}</Badge>
                  </td>
                  <td className="py-2 pr-3 text-[#9AA1B2]">
                    {v.changeNote ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-[#9AA1B2]">
                    {v.createdById?.slice(0, 8) ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-[#9AA1B2]">
                    {v.createdAt?.slice(0, 10) ?? "—"}
                  </td>
                  <td className="py-2">
                    {!archived && (
                      <button
                        type="button"
                        disabled={busy}
                        className="text-xs text-[#3E6BFF] hover:underline disabled:opacity-50"
                        onClick={() => {
                          setRestoreVersion(v.version);
                          setRestoreNote(`restauration depuis v${v.version}`);
                          setConfirm("restore");
                        }}
                      >
                        Restaurer comme nouveau brouillon
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {confirm === "restore" && restoreVersion != null && (
          <div className="space-y-2 rounded-xl border border-[#3E6BFF]/30 bg-[#3E6BFF]/10 p-3">
            <p className="text-sm">
              Confirmer la restauration de la v{restoreVersion} en nouveau
              brouillon ?
            </p>
            <input
              className={fieldCls}
              value={restoreNote}
              onChange={(e) => setRestoreNote(e.target.value)}
              placeholder="Note"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const data = await postAction({
                    action: "restoreVersion",
                    fromVersion: restoreVersion,
                    changeNote: restoreNote || undefined,
                  });
                  if (shouldDismissRestoreUi(data)) {
                    setRestoreVersion(null);
                    setRestoreNote("");
                    setConfirm(null);
                  }
                }}
              >
                Confirmer restauration
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setConfirm(null);
                  setRestoreVersion(null);
                  setRestoreNote("");
                }}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="space-y-4 border border-[#1e222c] bg-[#0d1017]">
        <h2 className="text-lg font-semibold">Preview locale</h2>
        <p className="text-xs text-[#FF7A3D]">
          Preview locale — aucun appel IA
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className={labelCls}>
            Version
            <select
              className={fieldCls}
              value={previewVersion}
              onChange={(e) => setPreviewVersion(e.target.value)}
            >
              <option value="">Courante (DRAFT puis PUBLISHED)</option>
              {versionOptions.map((v) => (
                <option key={v.id} value={String(v.version)}>
                  v{v.version} ({v.status})
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={previewBusy}
            onClick={() => void runPreview()}
          >
            {previewBusy ? "Preview…" : "Prévisualiser"}
          </Button>
        </div>
        {previewText != null && (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-[#1e222c] bg-[#05060a] p-3 text-xs text-[#F5F6FA]">
            {previewText}
          </pre>
        )}
      </Card>
    </div>
  );
}
