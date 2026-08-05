"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Badge, Button, Card } from "@/components/ui";
import {
  buildArtifactsFromEditor,
  buildMetadataPatchPayload,
  editorStateFromBundle,
  isArchivedReadOnly,
  metaFormFromExercise,
  resolveApplySync,
  resolvePromptSaveAction,
  shouldClearConfirmOnFailure,
  shouldDismissRestoreUi,
  type AdminExerciseDetail,
  type ApplyExerciseSync,
  collectOccupiedStageIds,
  resolveStageAfterThemeChange,
  resolveStageOptions,
  resolveThemeIdForStage,
  isStageSelectable,
  type MetaFormState,
  type PromptEditorState,
} from "@/lib/adminExercisesUi";
import { ProspectAvatar } from "@/components/ProspectAvatar";
import { PROSPECT_AVATARS } from "@/lib/prospectAvatars";
import {
  UNCLASSIFIED_LABEL,
  type MissionThemeNode,
} from "@/lib/missionCatalog";

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
    passingScore: 60,
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
    missionStageId: "",
    prospectAvatarKey: "",
  });
  const [themes, setThemes] = useState<MissionThemeNode[]>([]);
  const [missionThemeId, setMissionThemeId] = useState("");
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
      if (syncMeta) {
        setMeta(metaFormFromExercise(ex));
        setMissionThemeId(ex.missionThemeId ?? "");
      }
      if (syncEditor) setEditor(editorStateFromBundle(ex.currentBundle));
    },
    [],
  );

  // Catalogue Missions : alimente les sélecteurs thème / niveau de l'éditeur.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/mission-catalog", {
          method: "GET",
        });
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        const list = (json?.data?.themes ?? []) as MissionThemeNode[];
        if (!cancelled && Array.isArray(list)) setThemes(list);
      } catch {
        // Sans catalogue, l'exercice reste modifiable et « Non classé ».
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Le thème parent est déduit du niveau enregistré dès que l'arbre arrive.
  useEffect(() => {
    if (!missionThemeId && meta.missionStageId) {
      const owner = resolveThemeIdForStage(themes, meta.missionStageId);
      if (owner) setMissionThemeId(owner);
    }
  }, [themes, meta.missionStageId, missionThemeId]);

  /** Niveaux déjà pris (via l'arbre catalogue) — hors exercice courant. */
  const occupiedStageIds = useMemo(() => {
    const summaries: { id: string; missionStageId?: string | null }[] = [];
    for (const theme of themes) {
      for (const stage of theme.stages) {
        if (stage.exercise?.id) {
          summaries.push({
            id: stage.exercise.id,
            missionStageId: stage.id,
          });
        }
      }
    }
    return collectOccupiedStageIds(summaries, id);
  }, [themes, id]);

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
        const apiMessage =
          json?.error?.message ??
          "Enregistrement impossible. Réessaie ou contacte un administrateur.";
        setMetaError(
          res.status === 409
            ? `Niveau indisponible : ${apiMessage}`
            : apiMessage,
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
            Difficulté
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
            Ordre legacy
            <input type="number" min={1} max={20} className={fieldCls} disabled={archived || busy} value={meta.missionLevel} onChange={(e) => setMeta({ ...meta, missionLevel: Number(e.target.value) })} />
          </label>
          <label className={labelCls}>
            Ordre
            <input type="number" min={0} max={999} className={fieldCls} disabled={archived || busy} value={meta.sortOrder} onChange={(e) => setMeta({ ...meta, sortOrder: Number(e.target.value) })} />
          </label>
          <label className={labelCls}>
            Score minimum de validation
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                className={fieldCls}
                disabled={archived || busy}
                value={meta.passingScore}
                onChange={(e) =>
                  setMeta({ ...meta, passingScore: Number(e.target.value) })
                }
              />
              <span className="shrink-0 text-sm text-white/50">/100</span>
            </div>
            <p className="mt-1 text-xs text-white/45">
              Le niveau suivant se débloque lorsque le télépro atteint ce score.
            </p>
          </label>
          <label className={labelCls}>
            Campagne
            <input className={fieldCls} disabled={archived || busy} value={meta.campaign} onChange={(e) => setMeta({ ...meta, campaign: e.target.value })} />
          </label>
          <label className={labelCls}>
            Durée cible (s)
            <input type="number" min={60} max={1800} className={fieldCls} disabled={archived || busy} value={meta.targetDurationSec} onChange={(e) => setMeta({ ...meta, targetDurationSec: Number(e.target.value) })} />
          </label>
          <label className={labelCls}>
            Thème
            <select
              className={fieldCls}
              disabled={archived || busy}
              value={missionThemeId}
              onChange={(e) => {
                const next = e.target.value;
                setMissionThemeId(next);
                // Un niveau devenu incompatible est réinitialisé.
                setMeta({
                  ...meta,
                  missionStageId: resolveStageAfterThemeChange(
                    themes,
                    next,
                    meta.missionStageId,
                  ),
                });
              }}
            >
              <option value="">{UNCLASSIFIED_LABEL}</option>
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Niveau
            <select
              className={fieldCls}
              disabled={archived || busy || !missionThemeId}
              value={meta.missionStageId}
              onChange={(e) =>
                setMeta({ ...meta, missionStageId: e.target.value })
              }
            >
              <option value="">{UNCLASSIFIED_LABEL}</option>
              {resolveStageOptions(themes, missionThemeId).map((stage) => {
                const theme = themes.find((t) => t.id === missionThemeId);
                const selectable = theme
                  ? isStageSelectable(theme, stage, {
                      currentStageId: meta.missionStageId,
                      occupiedStageIds,
                    })
                  : false;
                const occupied =
                  occupiedStageIds.has(stage.id) &&
                  stage.id !== meta.missionStageId;
                return (
                  <option
                    key={stage.id}
                    value={stage.id}
                    disabled={!selectable}
                  >
                    N{stage.levelNumber} — {stage.name}
                    {occupied ? " — déjà pris" : ""}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
        <fieldset className="space-y-4 rounded-xl border border-[#1e222c] p-4">
          <legend className="px-1 text-sm font-semibold text-white">
            Prospect simulé
          </legend>

          <div className="space-y-2">
            <p className={labelCls}>Photo</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <button
                type="button"
                disabled={archived || busy}
                onClick={() => setMeta({ ...meta, prospectAvatarKey: "" })}
                className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3E6BFF] disabled:opacity-50 ${
                  meta.prospectAvatarKey === ""
                    ? "border-[#3E6BFF] bg-[#3E6BFF]/10 text-white"
                    : "border-[#1e222c] text-[#9AA1B2]"
                }`}
              >
                Aucun
              </button>
              {PROSPECT_AVATARS.map((avatar) => (
                <button
                  key={avatar.key}
                  type="button"
                  disabled={archived || busy}
                  aria-pressed={meta.prospectAvatarKey === avatar.key}
                  onClick={() =>
                    setMeta({ ...meta, prospectAvatarKey: avatar.key })
                  }
                  className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3E6BFF] disabled:opacity-50 ${
                    meta.prospectAvatarKey === avatar.key
                      ? "border-[#3E6BFF] bg-[#3E6BFF]/10 text-white"
                      : "border-[#1e222c] text-[#9AA1B2]"
                  }`}
                >
                  <ProspectAvatar avatarKey={avatar.key} size={44} />
                  {avatar.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-xs text-[#9AA1B2]">
              <ProspectAvatar
                avatarKey={meta.prospectAvatarKey}
                fallbackText={meta.name}
                size={72}
                decorative={false}
              />
              <span>
                Aperçu agrandi
                {meta.prospectAvatarKey
                  ? ` — ${meta.prospectAvatarKey}`
                  : " — aucun portrait"}
                . La photo et la personnalité sont indépendantes.
              </span>
            </div>
          </div>

          <label className={labelCls}>
            Personnalité et consignes de jeu
            <textarea
              rows={6}
              className={fieldCls}
              disabled={archived || busy}
              value={meta.personality}
              onChange={(e) =>
                setMeta({ ...meta, personality: e.target.value })
              }
              placeholder="Ton et manière de parler, patience, confiance, résistance, objections habituelles, connaissance de l'offre, infos cachées, conditions pour se laisser convaincre, moment de révélation…"
            />
          </label>
          <p className="text-xs text-[#9AA1B2]">
            Cette personnalité alimente la construction locale du persona
            (`PROSPECT_PERSONA` via `buildProspectPersona`). Deux exercices
            peuvent partager la même photo avec des personnalités différentes.
          </p>
          {exercise?.currentBundle?.status === "PUBLISHED" ? (
            <p
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
              role="status"
            >
              Un PromptBundle administrateur est déjà publié. Modifier la
              personnalité ici n&apos;écrase pas ce bundle : mettez à jour les
              prompts et republiez explicitement pour changer le comportement
              effectif de la simulation.
            </p>
          ) : (
            <p className="text-xs text-[#9AA1B2]">
              Sans PromptBundle publié, la personnalité participe au persona
              local à la prochaine génération/publication de prompts.
            </p>
          )}
        </fieldset>
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
