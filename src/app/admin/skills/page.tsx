"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import {
  SKILL_BLOCK_TYPE_LABELS,
  buildArticlePayload,
  buildCategoryPayload,
  buildSectionPayload,
  emptyBlock,
  isSkillArchivedReadOnly,
  joinListInput,
  moveItem,
  removeItem,
  replaceItem,
  skillStatusTone,
  type ArticleFormState,
  type CategoryFormState,
  type SectionFormState,
  type SkillArticleDetail,
  type SkillSelection,
  type SkillTreeCategory,
} from "@/lib/adminSkillsUi";
import {
  SKILL_BLOCK_TYPES,
  SKILL_ICON_KEYS,
  SKILL_STATUS_LABELS,
  type SkillBlock,
  type SkillBlockType,
} from "@/lib/skillsContent";

type CategoryDetail = SkillTreeCategory & { sectionCount: number };
type SectionDetail = SkillTreeCategory["sections"][number] & {
  articleCount: number;
};

const INPUT_CLASS =
  "mt-1 w-full rounded-xl border border-[#1e222c] bg-[#12151d] px-3 py-2 text-sm text-white disabled:opacity-50";
const LABEL_CLASS = "block text-xs text-[#9AA1B2]";

async function readError(res: Response): Promise<string> {
  const json = await res.json().catch(() => null);
  return (
    json?.error?.message ??
    "Action impossible. Réessaie ou contacte un administrateur."
  );
}

export default function AdminSkillsPage() {
  const [tree, setTree] = useState<SkillTreeCategory[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState<string | null>(null);

  const [selection, setSelection] = useState<SkillSelection | null>(null);
  const [detailStatus, setDetailStatus] = useState<string>("DRAFT");
  const [detailLoading, setDetailLoading] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorNotice, setEditorNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<"archive" | "delete" | null>(
    null,
  );

  const [catForm, setCatForm] = useState<CategoryFormState | null>(null);
  const [secForm, setSecForm] = useState<SectionFormState | null>(null);
  const [artForm, setArtForm] = useState<ArticleFormState | null>(null);

  const [createKind, setCreateKind] = useState<
    | { entity: "category" }
    | { entity: "section"; categoryId: string; categoryName: string }
    | { entity: "article"; sectionId: string; sectionName: string }
    | null
  >(null);
  const [createName, setCreateName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    setTreeError(null);
    try {
      const res = await fetch("/api/admin/skills", { method: "GET" });
      if (!res.ok) {
        setTreeError(await readError(res));
        setTree([]);
        return;
      }
      const json = await res.json().catch(() => null);
      const list = (json?.data?.tree ?? []) as SkillTreeCategory[];
      setTree(Array.isArray(list) ? list : []);
    } catch {
      setTreeError("Chargement impossible.");
      setTree([]);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const loadDetail = useCallback(async (sel: SkillSelection) => {
    setDetailLoading(true);
    setEditorError(null);
    setEditorNotice(null);
    setConfirming(null);
    try {
      const res = await fetch(
        `/api/admin/skills/${sel.id}?type=${sel.kind}`,
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
      if (sel.kind === "category") {
        const d = data as CategoryDetail;
        setCatForm({
          name: d.name,
          slug: d.slug ?? "",
          description: d.description ?? "",
          iconKey: d.iconKey,
          sortOrder: d.sortOrder,
        });
      } else if (sel.kind === "section") {
        const d = data as SectionDetail;
        setSecForm({
          name: d.name,
          slug: d.slug ?? "",
          description: d.description ?? "",
          sortOrder: d.sortOrder,
        });
      } else {
        const d = data as SkillArticleDetail;
        setArtForm({
          title: d.title,
          slug: d.slug ?? "",
          summary: d.summary ?? "",
          tagsText: joinListInput(d.tags ?? []),
          skillKeysText: joinListInput(d.skillKeys ?? []),
          readingMinutes: d.readingMinutes,
          sortOrder: d.sortOrder,
          blocks: (d.blocks ?? []) as SkillBlock[],
        });
      }
    } catch {
      setEditorError("Chargement impossible.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  function select(sel: SkillSelection) {
    setSelection(sel);
    setCatForm(null);
    setSecForm(null);
    setArtForm(null);
    void loadDetail(sel);
  }

  async function createEntity() {
    if (!createKind || createBusy) return;
    setCreateBusy(true);
    setCreateError(null);
    try {
      const payload: Record<string, unknown> = { entity: createKind.entity };
      if (createKind.entity === "category") {
        payload.name = createName.trim();
      } else if (createKind.entity === "section") {
        payload.name = createName.trim();
        payload.categoryId = createKind.categoryId;
      } else {
        payload.title = createName.trim();
        payload.sectionId = createKind.sectionId;
      }
      const res = await fetch("/api/admin/skills", {
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
      setCreateKind(null);
      setCreateName("");
      await loadTree();
      if (id) select({ kind: createKind.entity, id });
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
      if (selection.kind === "category" && catForm) {
        payload = buildCategoryPayload(catForm);
      } else if (selection.kind === "section" && secForm) {
        payload = buildSectionPayload(secForm);
      } else if (selection.kind === "article" && artForm) {
        payload = buildArticlePayload(artForm);
      } else {
        return;
      }
      const res = await fetch(`/api/admin/skills/${selection.id}`, {
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
      const res = await fetch(`/api/admin/skills/${selection.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: selection.kind, action }),
      });
      if (!res.ok) {
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
        `/api/admin/skills/${selection.id}?type=${selection.kind}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setEditorError(await readError(res));
        return;
      }
      setSelection(null);
      setCatForm(null);
      setSecForm(null);
      setArtForm(null);
      await loadTree();
    } catch {
      setEditorError("Suppression impossible.");
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  const readOnly = isSkillArchivedReadOnly(detailStatus);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Skills</h1>
          <p className="mt-1 text-sm text-[#9AA1B2]">
            Bibliothèque pédagogique : catégories, sections et articles.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setCreateKind({ entity: "category" });
            setCreateName("");
            setCreateError(null);
          }}
        >
          Nouvelle catégorie
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
          ) : tree.length === 0 ? (
            <p className="text-sm text-[#9AA1B2]">
              Aucune catégorie. Crée la première pour démarrer la bibliothèque.
            </p>
          ) : (
            <ul className="space-y-4">
              {tree.map((cat) => (
                <li key={cat.id}>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => select({ kind: "category", id: cat.id })}
                      className={`min-h-11 flex-1 rounded-lg px-2 text-left text-sm font-semibold text-white hover:bg-white/5 ${
                        selection?.kind === "category" &&
                        selection.id === cat.id
                          ? "bg-[#3E6BFF]/10"
                          : ""
                      }`}
                    >
                      {cat.name}
                    </button>
                    <Badge tone={skillStatusTone(cat.status)}>
                      {SKILL_STATUS_LABELS[cat.status] ?? cat.status}
                    </Badge>
                  </div>
                  <ul className="mt-1 space-y-1 border-l border-[#1e222c] pl-3">
                    {cat.sections.map((sec) => (
                      <li key={sec.id}>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              select({ kind: "section", id: sec.id })
                            }
                            className={`min-h-11 flex-1 rounded-lg px-2 text-left text-sm text-white/85 hover:bg-white/5 ${
                              selection?.kind === "section" &&
                              selection.id === sec.id
                                ? "bg-[#3E6BFF]/10"
                                : ""
                            }`}
                          >
                            {sec.name}
                          </button>
                          <Badge tone={skillStatusTone(sec.status)}>
                            {SKILL_STATUS_LABELS[sec.status] ?? sec.status}
                          </Badge>
                        </div>
                        <ul className="mt-1 space-y-1 border-l border-[#1e222c] pl-3">
                          {sec.articles.map((art) => (
                            <li
                              key={art.id}
                              className="flex items-center justify-between gap-2"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  select({ kind: "article", id: art.id })
                                }
                                className={`min-h-11 flex-1 rounded-lg px-2 text-left text-xs text-white/70 hover:bg-white/5 ${
                                  selection?.kind === "article" &&
                                  selection.id === art.id
                                    ? "bg-[#3E6BFF]/10"
                                    : ""
                                }`}
                              >
                                {art.title}
                              </button>
                              <Badge tone={skillStatusTone(art.status)}>
                                {SKILL_STATUS_LABELS[art.status] ?? art.status}
                              </Badge>
                            </li>
                          ))}
                          {sec.status !== "ARCHIVED" && (
                            <li>
                              <button
                                type="button"
                                onClick={() => {
                                  setCreateKind({
                                    entity: "article",
                                    sectionId: sec.id,
                                    sectionName: sec.name,
                                  });
                                  setCreateName("");
                                  setCreateError(null);
                                }}
                                className="min-h-11 rounded-lg px-2 text-left text-xs text-[#3E6BFF] hover:underline"
                              >
                                + Nouvel article
                              </button>
                            </li>
                          )}
                        </ul>
                      </li>
                    ))}
                    {cat.status !== "ARCHIVED" && (
                      <li>
                        <button
                          type="button"
                          onClick={() => {
                            setCreateKind({
                              entity: "section",
                              categoryId: cat.id,
                              categoryName: cat.name,
                            });
                            setCreateName("");
                            setCreateError(null);
                          }}
                          className="min-h-11 rounded-lg px-2 text-left text-xs text-[#3E6BFF] hover:underline"
                        >
                          + Nouvelle section
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
                Sélectionne une catégorie, une section ou un article pour le
                modifier.
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
                    {selection.kind === "category"
                      ? "Catégorie"
                      : selection.kind === "section"
                        ? "Section"
                        : "Article"}
                  </h2>
                  <Badge tone={skillStatusTone(detailStatus)}>
                    {SKILL_STATUS_LABELS[detailStatus] ?? detailStatus}
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

              {selection.kind === "category" && catForm && (
                <CategoryEditor
                  form={catForm}
                  onChange={setCatForm}
                  disabled={readOnly || detailStatus === "PUBLISHED" || busy}
                />
              )}
              {selection.kind === "section" && secForm && (
                <SectionEditor
                  form={secForm}
                  onChange={setSecForm}
                  disabled={readOnly || detailStatus === "PUBLISHED" || busy}
                />
              )}
              {selection.kind === "article" && artForm && (
                <ArticleEditor
                  form={artForm}
                  onChange={setArtForm}
                  disabled={readOnly || detailStatus === "PUBLISHED" || busy}
                />
              )}

              {detailStatus === "DRAFT" && (
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
              {createKind.entity === "category"
                ? "Nouvelle catégorie"
                : createKind.entity === "section"
                  ? `Nouvelle section — ${createKind.categoryName}`
                  : `Nouvel article — ${createKind.sectionName}`}
            </h2>
            <label className={LABEL_CLASS}>
              {createKind.entity === "article" ? "Titre *" : "Nom *"}
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className={INPUT_CLASS}
                placeholder="Ex. Traitement des objections"
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

function CategoryEditor({
  form,
  onChange,
  disabled,
}: {
  form: CategoryFormState;
  onChange: (f: CategoryFormState) => void;
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
          {SKILL_ICON_KEYS.map((k) => (
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

function SectionEditor({
  form,
  onChange,
  disabled,
}: {
  form: SectionFormState;
  onChange: (f: SectionFormState) => void;
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

function ArticleEditor({
  form,
  onChange,
  disabled,
}: {
  form: ArticleFormState;
  onChange: (f: ArticleFormState) => void;
  disabled: boolean;
}) {
  const [newBlockType, setNewBlockType] = useState<SkillBlockType>("paragraph");

  function setBlocks(blocks: SkillBlock[]) {
    onChange({ ...form, blocks });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL_CLASS}>
          Titre *
          <input
            value={form.title}
            disabled={disabled}
            onChange={(e) => onChange({ ...form, title: e.target.value })}
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
          Résumé
          <textarea
            value={form.summary}
            disabled={disabled}
            onChange={(e) => onChange({ ...form, summary: e.target.value })}
            className={INPUT_CLASS}
            rows={2}
          />
        </label>
        <label className={LABEL_CLASS}>
          Tags (un par ligne — vide pour tout effacer)
          <textarea
            value={form.tagsText}
            disabled={disabled}
            onChange={(e) => onChange({ ...form, tagsText: e.target.value })}
            className={INPUT_CLASS}
            rows={3}
          />
        </label>
        <label className={LABEL_CLASS}>
          Clés de compétences (une par ligne — vide pour tout effacer)
          <textarea
            value={form.skillKeysText}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...form, skillKeysText: e.target.value })
            }
            className={INPUT_CLASS}
            rows={3}
            placeholder="ex. decouverte, objections"
          />
        </label>
        <label className={LABEL_CLASS}>
          Durée de lecture (minutes)
          <input
            type="number"
            min={1}
            max={60}
            value={form.readingMinutes}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...form, readingMinutes: Number(e.target.value) })
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

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-white">
          Blocs de contenu ({form.blocks.length})
        </h3>
        {form.blocks.length === 0 && (
          <p className="text-sm text-[#9AA1B2]">
            Aucun bloc. Un article doit contenir au moins un bloc valide pour
            être publié.
          </p>
        )}
        {form.blocks.map((block, i) => (
          <div
            key={i}
            className="space-y-2 rounded-xl border border-[#1e222c] bg-[#12151d] p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#9AA1B2]">
                {SKILL_BLOCK_TYPE_LABELS[block.type]}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={disabled || i === 0}
                  onClick={() => setBlocks(moveItem(form.blocks, i, -1))}
                  className="min-h-11 min-w-11 rounded-lg border border-[#1e222c] text-xs text-white/70 hover:bg-white/5 disabled:opacity-40"
                  aria-label="Monter le bloc"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={disabled || i === form.blocks.length - 1}
                  onClick={() => setBlocks(moveItem(form.blocks, i, 1))}
                  className="min-h-11 min-w-11 rounded-lg border border-[#1e222c] text-xs text-white/70 hover:bg-white/5 disabled:opacity-40"
                  aria-label="Descendre le bloc"
                >
                  ↓
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setBlocks(removeItem(form.blocks, i))}
                  className="min-h-11 min-w-11 rounded-lg border border-red-500/40 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                  aria-label="Supprimer le bloc"
                >
                  ✕
                </button>
              </div>
            </div>
            <BlockEditor
              block={block}
              disabled={disabled}
              onChange={(b) => setBlocks(replaceItem(form.blocks, i, b))}
            />
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2">
          <label className={LABEL_CLASS}>
            Type de bloc
            <select
              value={newBlockType}
              disabled={disabled}
              onChange={(e) =>
                setNewBlockType(e.target.value as SkillBlockType)
              }
              className={INPUT_CLASS}
            >
              {SKILL_BLOCK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SKILL_BLOCK_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={() => setBlocks([...form.blocks, emptyBlock(newBlockType)])}
          >
            Ajouter un bloc
          </Button>
        </div>
      </div>
    </div>
  );
}

function BlockEditor({
  block,
  disabled,
  onChange,
}: {
  block: SkillBlock;
  disabled: boolean;
  onChange: (b: SkillBlock) => void;
}) {
  if (block.type === "heading") {
    return (
      <div className="grid gap-2 sm:grid-cols-[100px_1fr]">
        <label className={LABEL_CLASS}>
          Niveau
          <select
            value={block.level}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...block, level: Number(e.target.value) as 2 | 3 })
            }
            className={INPUT_CLASS}
          >
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
        </label>
        <label className={LABEL_CLASS}>
          Texte
          <input
            value={block.text}
            disabled={disabled}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            className={INPUT_CLASS}
          />
        </label>
      </div>
    );
  }
  if (block.type === "paragraph") {
    return (
      <label className={LABEL_CLASS}>
        Texte
        <textarea
          value={block.text}
          disabled={disabled}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          className={INPUT_CLASS}
          rows={3}
        />
      </label>
    );
  }
  if (block.type === "list") {
    return (
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs text-[#9AA1B2]">
          <input
            type="checkbox"
            checked={block.ordered}
            disabled={disabled}
            onChange={(e) => onChange({ ...block, ordered: e.target.checked })}
          />
          Liste numérotée
        </label>
        <label className={LABEL_CLASS}>
          Éléments (un par ligne)
          <textarea
            value={block.items.join("\n")}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...block,
                items: e.target.value.split("\n"),
              })
            }
            className={INPUT_CLASS}
            rows={4}
          />
        </label>
      </div>
    );
  }
  if (block.type === "callout") {
    return (
      <div className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={LABEL_CLASS}>
            Ton
            <select
              value={block.tone}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...block,
                  tone: e.target.value as "info" | "warning" | "success",
                })
              }
              className={INPUT_CLASS}
            >
              <option value="info">Info</option>
              <option value="warning">Attention</option>
              <option value="success">Succès</option>
            </select>
          </label>
          <label className={LABEL_CLASS}>
            Titre (optionnel)
            <input
              value={block.title ?? ""}
              disabled={disabled}
              onChange={(e) => {
                const title = e.target.value;
                if (title.trim()) {
                  onChange({ ...block, title });
                } else {
                  const rest = { ...block };
                  delete rest.title;
                  onChange(rest);
                }
              }}
              className={INPUT_CLASS}
            />
          </label>
        </div>
        <label className={LABEL_CLASS}>
          Texte
          <textarea
            value={block.text}
            disabled={disabled}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            className={INPUT_CLASS}
            rows={3}
          />
        </label>
      </div>
    );
  }
  if (block.type === "example") {
    return (
      <div className="space-y-2">
        <label className={LABEL_CLASS}>
          Libellé (optionnel)
          <input
            value={block.label ?? ""}
            disabled={disabled}
            onChange={(e) => {
              const label = e.target.value;
              if (label.trim()) {
                onChange({ ...block, label });
              } else {
                const rest = { ...block };
                delete rest.label;
                onChange(rest);
              }
            }}
            className={INPUT_CLASS}
          />
        </label>
        {block.lines.map((line, li) => (
          <div key={li} className="grid gap-2 sm:grid-cols-[140px_1fr_44px]">
            <select
              value={line.speaker}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...block,
                  lines: replaceItem(block.lines, li, {
                    ...line,
                    speaker: e.target.value as "TELEPRO" | "PROSPECT" | "NONE",
                  }),
                })
              }
              className={INPUT_CLASS}
            >
              <option value="TELEPRO">Télépro</option>
              <option value="PROSPECT">Prospect</option>
              <option value="NONE">Neutre</option>
            </select>
            <input
              value={line.text}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...block,
                  lines: replaceItem(block.lines, li, {
                    ...line,
                    text: e.target.value,
                  }),
                })
              }
              className={INPUT_CLASS}
            />
            <button
              type="button"
              disabled={disabled || block.lines.length <= 1}
              onClick={() =>
                onChange({ ...block, lines: removeItem(block.lines, li) })
              }
              className="mt-1 min-h-11 rounded-lg border border-red-500/40 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-40"
              aria-label="Supprimer la réplique"
            >
              ✕
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="ghost"
          disabled={disabled || block.lines.length >= 10}
          onClick={() =>
            onChange({
              ...block,
              lines: [...block.lines, { speaker: "NONE", text: "…" }],
            })
          }
        >
          Ajouter une réplique
        </Button>
      </div>
    );
  }
  return (
    <label className={LABEL_CLASS}>
      Texte
      <textarea
        value={block.text}
        disabled={disabled}
        onChange={(e) => onChange({ ...block, text: e.target.value })}
        className={INPUT_CLASS}
        rows={2}
      />
    </label>
  );
}
