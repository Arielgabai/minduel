"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card } from "@/components/ui";
import type { AdminExerciseListItem } from "@/lib/adminExercisesUi";
import {
  MISSION_ICON_KEYS,
  MISSION_STATUS_LABELS,
  isMissionArchivedReadOnly,
  missionStatusTone,
  type MissionLevelReadiness,
  type MissionStageExerciseSummary,
  type MissionThemeNode,
} from "@/lib/missionCatalog";

const INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-[#1e222c] bg-[#12151d] px-3 py-2 text-sm text-white disabled:opacity-50";
const LABEL_CLASS = "block text-xs text-[#9AA1B2]";
/** Cibles tactiles : au moins 44 px de haut, focus visible. */
const TREE_BUTTON_CLASS =
  "min-h-11 flex-1 rounded-lg px-2 py-2 text-left text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3E6BFF] hover:bg-white/5";

type Selection = { kind: "theme" | "stage"; id: string } | null;

type ThemeFormState = {
  name: string;
  slug: string;
  description: string;
  iconKey: string;
  sortOrder: number;
};

type StageFormState = {
  name: string;
  slug: string;
  description: string;
  levelNumber: number;
  sortOrder: number;
};

type CreateKind =
  | { entity: "theme" }
  | { entity: "stage"; themeId: string; themeName: string }
  | null;

async function readError(res: Response): Promise<string> {
  const json = await res.json().catch(() => null);
  return (
    json?.error?.message ??
    "Action impossible. Réessaie ou contacte un administrateur."
  );
}

function exerciseStatusTone(
  status: string,
): "gray" | "mint" | "red" | "flame" {
  if (status === "PUBLISHED") return "mint";
  if (status === "ARCHIVED") return "red";
  if (status === "REVIEW_REQUIRED") return "flame";
  return "gray";
}

export default function AdminMissionsPage() {
  const [themes, setThemes] = useState<MissionThemeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);

  const [selection, setSelection] = useState<Selection>(null);
  const [detailStatus, setDetailStatus] = useState<string>("DRAFT");
  const [detailLoading, setDetailLoading] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorNotice, setEditorNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<"archive" | "delete" | null>(
    null,
  );

  const [themeForm, setThemeForm] = useState<ThemeFormState | null>(null);
  const [stageForm, setStageForm] = useState<StageFormState | null>(null);
  const [stageExercise, setStageExercise] =
    useState<MissionStageExerciseSummary | null>(null);
  const [stageReadiness, setStageReadiness] =
    useState<MissionLevelReadiness | null>(null);
  const [exerciseOptions, setExerciseOptions] = useState<
    AdminExerciseListItem[]
  >([]);
  const [assignExerciseId, setAssignExerciseId] = useState("");
  const [exercisesLoading, setExercisesLoading] = useState(false);

  const [createKind, setCreateKind] = useState<CreateKind>(null);
  const [createName, setCreateName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    setTreeError(null);
    try {
      const res = await fetch("/api/admin/mission-catalog", { method: "GET" });
      if (!res.ok) {
        setTreeError(await readError(res));
        setThemes([]);
        return;
      }
      const json = await res.json().catch(() => null);
      const list = (json?.data?.themes ?? []) as MissionThemeNode[];
      setThemes(Array.isArray(list) ? list : []);
    } catch {
      setTreeError("Chargement impossible.");
      setThemes([]);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const loadExerciseOptions = useCallback(async () => {
    setExercisesLoading(true);
    try {
      const res = await fetch("/api/admin/exercises", { method: "GET" });
      if (!res.ok) {
        setExerciseOptions([]);
        return;
      }
      const json = await res.json().catch(() => null);
      const list = (json?.data?.items ?? []) as AdminExerciseListItem[];
      setExerciseOptions(Array.isArray(list) ? list : []);
    } catch {
      setExerciseOptions([]);
    } finally {
      setExercisesLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (sel: NonNullable<Selection>) => {
    setDetailLoading(true);
    setEditorError(null);
    setEditorNotice(null);
    setConfirming(null);
    setStageExercise(null);
    setStageReadiness(null);
    setAssignExerciseId("");
    try {
      const res = await fetch(
        `/api/admin/mission-catalog/${sel.id}?type=${sel.kind}`,
        { method: "GET" },
      );
      if (!res.ok) {
        setEditorError(await readError(res));
        return;
      }
      const json = await res.json().catch(() => null);
      const data = json?.data;
      if (!data) {
        setEditorError("Chargement impossible.");
        return;
      }
      setDetailStatus(String(data.status ?? "DRAFT"));
      if (sel.kind === "theme") {
        setThemeForm({
          name: data.name,
          slug: data.slug ?? "",
          description: data.description ?? "",
          iconKey: data.iconKey,
          sortOrder: data.sortOrder,
        });
      } else {
        setStageForm({
          name: data.name,
          slug: data.slug ?? "",
          description: data.description ?? "",
          levelNumber: data.levelNumber,
          sortOrder: data.sortOrder,
        });
        const exercise = (data.exercise ??
          null) as MissionStageExerciseSummary | null;
        setStageExercise(exercise);
        setStageReadiness(
          (data.readiness ?? null) as MissionLevelReadiness | null,
        );
        setAssignExerciseId(exercise?.id ?? "");
      }
    } catch {
      setEditorError("Chargement impossible.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  function select(sel: NonNullable<Selection>) {
    setSelection(sel);
    setThemeForm(null);
    setStageForm(null);
    setStageExercise(null);
    setStageReadiness(null);
    setAssignExerciseId("");
    void loadDetail(sel);
    if (sel.kind === "stage") void loadExerciseOptions();
  }

  async function createEntity() {
    if (!createKind || createBusy) return;
    setCreateBusy(true);
    setCreateError(null);
    try {
      const payload: Record<string, unknown> = {
        entity: createKind.entity,
        name: createName.trim(),
      };
      if (createKind.entity === "stage") {
        payload.themeId = createKind.themeId;
      }
      const res = await fetch("/api/admin/mission-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      const kind = createKind.entity;
      setCreateKind(null);
      setCreateName("");
      await loadTree();
      if (id) select({ kind, id });
    } catch {
      setCreateError("Création impossible.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function saveSelection() {
    if (!selection || busy) return;
    setBusy(true);
    setEditorError(null);
    setEditorNotice(null);
    try {
      let payload: Record<string, unknown>;
      if (selection.kind === "theme" && themeForm) {
        payload = {
          name: themeForm.name,
          description: themeForm.description,
          iconKey: themeForm.iconKey,
          sortOrder: Number(themeForm.sortOrder),
        };
        if (themeForm.slug.trim()) payload.slug = themeForm.slug.trim();
      } else if (selection.kind === "stage" && stageForm) {
        payload = {
          name: stageForm.name,
          description: stageForm.description,
          levelNumber: Number(stageForm.levelNumber),
          sortOrder: Number(stageForm.sortOrder),
        };
        if (stageForm.slug.trim()) payload.slug = stageForm.slug.trim();
      } else {
        return;
      }
      const res = await fetch(`/api/admin/mission-catalog/${selection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: selection.kind, ...payload }),
      });
      if (!res.ok) {
        // L'éditeur reste ouvert : jamais de faux succès.
        setEditorError(await readError(res));
        return;
      }
      setEditorNotice("Modifications enregistrées.");
      await loadTree();
      await loadDetail(selection);
    } catch {
      setEditorError("Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function lifecycleAction(action: "publish" | "unpublish" | "archive") {
    if (!selection || busy) return;
    if (action === "archive" && confirming !== "archive") {
      setConfirming("archive");
      return;
    }
    setBusy(true);
    setEditorError(null);
    setEditorNotice(null);
    try {
      const res = await fetch(`/api/admin/mission-catalog/${selection.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: selection.kind, action }),
      });
      if (!res.ok) {
        // 409 readiness (et autres erreurs) : message API affiché tel quel.
        setEditorError(await readError(res));
        return;
      }
      setEditorNotice(
        action === "publish"
          ? "Publication effectuée."
          : action === "unpublish"
            ? "Contenu repassé en brouillon."
            : "Contenu archivé.",
      );
      await loadTree();
      await loadDetail(selection);
    } catch {
      setEditorError("Action impossible.");
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  async function assignExercise() {
    if (!selection || selection.kind !== "stage" || busy) return;
    if (!assignExerciseId) {
      setEditorError("Choisis un exercice à associer.");
      return;
    }
    setBusy(true);
    setEditorError(null);
    setEditorNotice(null);
    try {
      const res = await fetch(`/api/admin/mission-catalog/${selection.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "stage",
          action: "assignExercise",
          exerciseId: assignExerciseId,
        }),
      });
      if (!res.ok) {
        setEditorError(await readError(res));
        return;
      }
      setEditorNotice("Exercice associé au niveau.");
      await loadTree();
      await loadDetail(selection);
      await loadExerciseOptions();
    } catch {
      setEditorError("Association impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function unassignExercise() {
    if (!selection || selection.kind !== "stage" || busy) return;
    if (detailStatus !== "DRAFT") return;
    setBusy(true);
    setEditorError(null);
    setEditorNotice(null);
    try {
      const res = await fetch(`/api/admin/mission-catalog/${selection.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "stage",
          action: "unassignExercise",
        }),
      });
      if (!res.ok) {
        setEditorError(await readError(res));
        return;
      }
      setEditorNotice("Exercice retiré du niveau.");
      setAssignExerciseId("");
      await loadTree();
      await loadDetail(selection);
      await loadExerciseOptions();
    } catch {
      setEditorError("Dissociation impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelection() {
    if (!selection || busy) return;
    if (confirming !== "delete") {
      setConfirming("delete");
      return;
    }
    setBusy(true);
    setEditorError(null);
    try {
      const res = await fetch(
        `/api/admin/mission-catalog/${selection.id}?type=${selection.kind}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setEditorError(await readError(res));
        return;
      }
      setSelection(null);
      setThemeForm(null);
      setStageForm(null);
      setStageExercise(null);
      setStageReadiness(null);
      await loadTree();
    } catch {
      setEditorError("Suppression impossible.");
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  const readOnly = isMissionArchivedReadOnly(detailStatus);
  const editable = detailStatus === "DRAFT";

  const sortedExerciseOptions = useMemo(() => {
    if (!selection || selection.kind !== "stage") return exerciseOptions;
    const stageId = selection.id;
    return [...exerciseOptions].sort((a, b) => {
      const rank = (ex: AdminExerciseListItem) => {
        if (!ex.missionStageId) return 0;
        if (ex.missionStageId === stageId) return 1;
        return 2;
      };
      return rank(a) - rank(b) || a.name.localeCompare(b.name, "fr");
    });
  }, [exerciseOptions, selection]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Parcours</h1>
          <p className="mt-1 text-sm text-[#9AA1B2]">
            Thèmes et niveaux entièrement configurables (pas de plafond).
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setCreateKind({ entity: "theme" });
            setCreateName("");
            setCreateError(null);
          }}
        >
          Nouveau thème
        </Button>
      </div>

      {treeError && (
        <p className="text-sm text-[#FF5C5C]" role="alert">
          {treeError}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,380px)_1fr]">
        <Card className="border border-[#1e222c] bg-[#0d1017]">
          {treeLoading ? (
            <p className="text-sm text-[#9AA1B2]">Chargement…</p>
          ) : themes.length === 0 ? (
            <p className="text-sm text-[#9AA1B2]">
              Aucun thème. Crée le premier thème pour démarrer le catalogue.
            </p>
          ) : (
            <ul className="space-y-4">
              {themes.map((theme) => (
                <li key={theme.id}>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => select({ kind: "theme", id: theme.id })}
                      className={`${TREE_BUTTON_CLASS} font-semibold ${
                        selection?.kind === "theme" && selection.id === theme.id
                          ? "bg-[#3E6BFF]/10"
                          : ""
                      }`}
                    >
                      {theme.name}
                    </button>
                    <Badge tone={missionStatusTone(theme.status)}>
                      {MISSION_STATUS_LABELS[theme.status] ?? theme.status}
                    </Badge>
                  </div>
                  <ul className="mt-1 space-y-1 border-l border-[#1e222c] pl-3">
                    {theme.stages.map((stage) => (
                      <li key={stage.id}>
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              select({ kind: "stage", id: stage.id })
                            }
                            className={`${TREE_BUTTON_CLASS} text-white/85 ${
                              selection?.kind === "stage" &&
                              selection.id === stage.id
                                ? "bg-[#3E6BFF]/10"
                                : ""
                            }`}
                          >
                            <span className="block">
                              <span className="text-[#9AA1B2]">
                                Niveau {stage.levelNumber}
                              </span>
                              {" — "}
                              {stage.name}
                            </span>
                            <span className="mt-0.5 block text-xs text-[#9AA1B2]">
                              {stage.exercise?.name ?? "Aucun exercice"}
                              {stage.exercise?.prospectAvatarKey
                                ? ` · ${stage.exercise.prospectAvatarKey}`
                                : ""}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[#9AA1B2]">
                              {stage.exercise && (
                                <Badge
                                  tone={exerciseStatusTone(
                                    stage.exercise.status,
                                  )}
                                >
                                  {stage.exercise.status}
                                </Badge>
                              )}
                              <span>
                                personnalité{" "}
                                {stage.readiness.hasPersonality
                                  ? "OK"
                                  : "manquante"}
                              </span>
                              <span aria-hidden>·</span>
                              <span>
                                PromptBundle{" "}
                                {stage.readiness.hasPublishedPrompt
                                  ? "prêt"
                                  : "manquant"}
                              </span>
                            </span>
                          </button>
                          <Badge tone={missionStatusTone(stage.status)}>
                            {MISSION_STATUS_LABELS[stage.status] ??
                              stage.status}
                          </Badge>
                        </div>
                      </li>
                    ))}
                    {theme.status !== "ARCHIVED" && (
                      <li>
                        <button
                          type="button"
                          onClick={() => {
                            setCreateKind({
                              entity: "stage",
                              themeId: theme.id,
                              themeName: theme.name,
                            });
                            setCreateName("");
                            setCreateError(null);
                          }}
                          className="min-h-11 rounded-lg px-2 py-2 text-left text-xs text-[#3E6BFF] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3E6BFF]"
                        >
                          + Ajouter un niveau
                        </button>
                      </li>
                    )}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          {!selection ? (
            <Card className="border border-[#1e222c] bg-[#0d1017]">
              <p className="text-sm text-[#9AA1B2]">
                Sélectionne un thème ou un niveau pour le modifier.
              </p>
            </Card>
          ) : detailLoading ? (
            <Card className="border border-[#1e222c] bg-[#0d1017]">
              <p className="text-sm text-[#9AA1B2]">Chargement…</p>
            </Card>
          ) : (
            <Card className="space-y-4 border border-[#1e222c] bg-[#0d1017]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white">
                    {selection.kind === "theme" ? "Thème" : "Niveau"}
                  </h2>
                  <Badge tone={missionStatusTone(detailStatus)}>
                    {MISSION_STATUS_LABELS[detailStatus] ?? detailStatus}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {detailStatus === "DRAFT" && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void lifecycleAction("publish")}
                    >
                      Publier
                    </Button>
                  )}
                  {detailStatus === "PUBLISHED" && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void lifecycleAction("unpublish")}
                    >
                      Dépublier
                    </Button>
                  )}
                  {detailStatus !== "ARCHIVED" && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void lifecycleAction("archive")}
                    >
                      {confirming === "archive"
                        ? "Confirmer l'archivage ?"
                        : "Archiver"}
                    </Button>
                  )}
                  {detailStatus === "DRAFT" && (
                    <Button
                      type="button"
                      variant="danger"
                      disabled={busy}
                      onClick={() => void deleteSelection()}
                    >
                      {confirming === "delete"
                        ? "Confirmer la suppression ?"
                        : "Supprimer"}
                    </Button>
                  )}
                  {confirming && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setConfirming(null)}
                    >
                      Annuler
                    </Button>
                  )}
                </div>
              </div>

              {editorError && (
                <p className="text-sm text-[#FF5C5C]" role="alert">
                  {editorError}
                </p>
              )}
              {editorNotice && !editorError && (
                <p className="text-sm text-emerald-300">{editorNotice}</p>
              )}
              {readOnly && (
                <p className="text-sm text-[#9AA1B2]">
                  Contenu archivé : lecture seule.
                </p>
              )}
              {detailStatus === "PUBLISHED" && (
                <p className="text-sm text-[#9AA1B2]">
                  Contenu publié : dépublie-le (brouillon) pour le modifier.
                </p>
              )}

              {selection.kind === "theme" && themeForm && (
                <ThemeEditor
                  form={themeForm}
                  onChange={setThemeForm}
                  disabled={!editable || busy}
                />
              )}
              {selection.kind === "stage" && stageForm && (
                <>
                  {stageReadiness &&
                    stageReadiness.missing.length > 0 &&
                    detailStatus === "DRAFT" && (
                      <div
                        className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3"
                        role="status"
                      >
                        <p className="text-sm font-medium text-amber-100">
                          Avant publication — éléments manquants
                        </p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-50/90">
                          {stageReadiness.missing.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  {stageReadiness?.readyToPublish &&
                    detailStatus === "DRAFT" && (
                      <p className="text-sm text-emerald-300" role="status">
                        Niveau prêt à la publication.
                      </p>
                    )}

                  <StageEditor
                    form={stageForm}
                    onChange={setStageForm}
                    disabled={!editable || busy}
                  />

                  <div className="space-y-3 rounded-xl border border-[#1e222c] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-white">
                        Exercice associé
                      </h3>
                      {stageExercise && (
                        <Link
                          href={`/admin/exercises/${stageExercise.id}`}
                          className="text-xs text-[#3E6BFF] hover:underline"
                        >
                          Ouvrir l&apos;éditeur
                        </Link>
                      )}
                    </div>
                    {stageExercise ? (
                      <div className="flex flex-wrap items-center gap-2 text-sm text-[#9AA1B2]">
                        <span className="text-white">{stageExercise.name}</span>
                        <Badge
                          tone={exerciseStatusTone(stageExercise.status)}
                        >
                          {stageExercise.status}
                        </Badge>
                        {stageExercise.prospectAvatarKey && (
                          <span>{stageExercise.prospectAvatarKey}</span>
                        )}
                        <span>
                          personnalité{" "}
                          {stageExercise.hasPersonality ? "OK" : "manquante"}
                        </span>
                        <span>
                          PromptBundle{" "}
                          {stageExercise.hasPublishedPrompt
                            ? "prêt"
                            : "manquant"}
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm text-[#9AA1B2]">Aucun exercice</p>
                    )}

                    {editable && (
                      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                        <label className={LABEL_CLASS}>
                          Associer un exercice
                          <select
                            value={assignExerciseId}
                            disabled={busy || exercisesLoading}
                            onChange={(e) =>
                              setAssignExerciseId(e.target.value)
                            }
                            className={INPUT_CLASS}
                          >
                            <option value="">
                              {exercisesLoading
                                ? "Chargement…"
                                : "Choisir un exercice"}
                            </option>
                            {sortedExerciseOptions.map((ex) => {
                              const occupiedElsewhere =
                                Boolean(ex.missionStageId) &&
                                ex.missionStageId !== selection.id;
                              return (
                                <option
                                  key={ex.id}
                                  value={ex.id}
                                  disabled={occupiedElsewhere}
                                >
                                  {ex.name}
                                  {!ex.missionStageId
                                    ? " — non classé"
                                    : ex.missionStageId === selection.id
                                      ? " — actuel"
                                      : " — déjà utilisé"}
                                </option>
                              );
                            })}
                          </select>
                        </label>
                        <div className="flex items-end">
                          <Button
                            type="button"
                            disabled={
                              busy ||
                              !assignExerciseId ||
                              assignExerciseId === stageExercise?.id
                            }
                            onClick={() => void assignExercise()}
                          >
                            Associer
                          </Button>
                        </div>
                        <div className="flex items-end">
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busy || !stageExercise}
                            onClick={() => void unassignExercise()}
                          >
                            Retirer
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {editable && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveSelection()}
                  >
                    {busy ? "Enregistrement…" : "Enregistrer"}
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {createKind && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <Card className="w-full max-w-md space-y-4 border border-[#1e222c] bg-[#0d1017]">
            <h2 className="text-lg font-semibold text-white">
              {createKind.entity === "theme"
                ? "Nouveau thème"
                : `Nouveau niveau — ${createKind.themeName}`}
            </h2>
            <label className={LABEL_CLASS}>
              Nom *
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className={INPUT_CLASS}
                placeholder="Ex. Prise de rendez-vous"
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
                disabled={createBusy}
                onClick={() => setCreateKind(null)}
              >
                Annuler
              </Button>
              <Button
                type="button"
                disabled={createBusy || createName.trim().length < 2}
                onClick={() => void createEntity()}
              >
                {createBusy ? "Création…" : "Créer le brouillon"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function ThemeEditor({
  form,
  onChange,
  disabled,
}: {
  form: ThemeFormState;
  onChange: (f: ThemeFormState) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={LABEL_CLASS}>
        Nom *
        <input
          value={form.name}
          disabled={disabled}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>
      <label className={LABEL_CLASS}>
        Slug
        <input
          value={form.slug}
          disabled={disabled}
          onChange={(e) => onChange({ ...form, slug: e.target.value })}
          className={INPUT_CLASS}
          placeholder="kebab-case"
        />
      </label>
      <label className={`${LABEL_CLASS} sm:col-span-2`}>
        Description
        <textarea
          value={form.description}
          disabled={disabled}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          className={INPUT_CLASS}
          rows={2}
        />
      </label>
      <label className={LABEL_CLASS}>
        Icône
        <select
          value={form.iconKey}
          disabled={disabled}
          onChange={(e) => onChange({ ...form, iconKey: e.target.value })}
          className={INPUT_CLASS}
        >
          {MISSION_ICON_KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL_CLASS}>
        Ordre
        <input
          type="number"
          min={0}
          max={999}
          value={form.sortOrder}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...form, sortOrder: Number(e.target.value) })
          }
          className={INPUT_CLASS}
        />
      </label>
    </div>
  );
}

function StageEditor({
  form,
  onChange,
  disabled,
}: {
  form: StageFormState;
  onChange: (f: StageFormState) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={LABEL_CLASS}>
        Nom *
        <input
          value={form.name}
          disabled={disabled}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          className={INPUT_CLASS}
        />
      </label>
      <label className={LABEL_CLASS}>
        Slug
        <input
          value={form.slug}
          disabled={disabled}
          onChange={(e) => onChange({ ...form, slug: e.target.value })}
          className={INPUT_CLASS}
          placeholder="kebab-case"
        />
      </label>
      <label className={`${LABEL_CLASS} sm:col-span-2`}>
        Description
        <textarea
          value={form.description}
          disabled={disabled}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          className={INPUT_CLASS}
          rows={2}
        />
      </label>
      <label className={LABEL_CLASS}>
        N° de niveau
        <input
          type="number"
          min={1}
          max={9999}
          value={form.levelNumber}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...form, levelNumber: Number(e.target.value) })
          }
          className={INPUT_CLASS}
        />
      </label>
      <label className={LABEL_CLASS}>
        Ordre
        <input
          type="number"
          min={0}
          max={999}
          value={form.sortOrder}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...form, sortOrder: Number(e.target.value) })
          }
          className={INPUT_CLASS}
        />
      </label>
    </div>
  );
}
