import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  LIST_SENSITIVE_KEYS,
  listItemLooksSafe,
} from "@/app/admin/exercises/page";
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
  type MetaFormState,
  type PromptEditorState,
} from "@/app/admin/exercises/[id]/page";

function read(rel: string) {
  return readFileSync(path.resolve(rel), "utf8");
}

describe("Admin UI — garde PLATFORM_ADMIN", () => {
  it("layout admin appelle requirePlatformAdmin", () => {
    const src = read("src/app/admin/layout.tsx");
    expect(src).toContain("requirePlatformAdmin");
    expect(src).toContain('redirect("/login")');
  });

  it("accès non-admin : helpers existants refusent hors PLATFORM_ADMIN", async () => {
    const { assertPlatformAdmin, HttpError } = await import("@/lib/auth");
    expect(() => assertPlatformAdmin(null)).toThrow(HttpError);
    expect(() =>
      assertPlatformAdmin({
        id: "1",
        email: "m@x.com",
        fullName: "M",
        role: "MANAGER",
        organizationId: "o",
        organizationName: "O",
      }),
    ).toThrow(/administrateur plateforme/i);
    expect(() =>
      assertPlatformAdmin({
        id: "1",
        email: "t@x.com",
        fullName: "T",
        role: "TELEPRO",
        organizationId: "o",
        organizationName: "O",
      }),
    ).toThrow(/administrateur plateforme/i);
  });
});

describe("Admin UI — liste sans fuite", () => {
  it("liste source ne sérialise pas artifacts/prompts/hash", () => {
    const src = read("src/app/admin/exercises/page.tsx");
    for (const key of [
      "artifacts",
      "PROSPECT_PERSONA",
      "contentHash",
      "EVALUATION_SYSTEM",
    ]) {
      // Autorisé uniquement dans LIST_SENSITIVE_KEYS (garde), pas dans le rendu
      expect(src).not.toMatch(
        new RegExp(`item\\.${key}|items\\.${key}|json\\.data\\.${key}`),
      );
    }
    expect(src).toContain("LIST_SENSITIVE_KEYS");
    expect(src).toContain('router.push(`/admin/exercises/${id}`)');
    expect(src).toMatch(/if\s*\(\s*!res\.ok\s*\)[\s\S]*?return;/);
  });

  it("listItemLooksSafe rejette les clés sensibles", () => {
    expect(
      listItemLooksSafe({
        id: "1",
        name: "x",
        status: "DRAFT",
      }),
    ).toBe(true);
    expect(
      listItemLooksSafe({
        id: "1",
        name: "x",
        artifacts: {},
      }),
    ).toBe(false);
    expect(LIST_SENSITIVE_KEYS).toContain("contentHash");
  });

  it("création : redirection uniquement après succès (branche échec sans push)", () => {
    const src = read("src/app/admin/exercises/page.tsx");
    const failIdx = src.indexOf("if (!res.ok)");
    const createFailReturn = src.indexOf("return;", failIdx);
    const pushIdx = src.indexOf("router.push(`/admin/exercises/${id}`)");
    expect(failIdx).toBeGreaterThan(0);
    expect(createFailReturn).toBeGreaterThan(failIdx);
    expect(pushIdx).toBeGreaterThan(createFailReturn);
  });
});

describe("Admin UI — éditeur et versions", () => {
  it("DRAFT → updateDraftPrompts ; absence DRAFT → createVersion", () => {
    expect(resolvePromptSaveAction(true)).toBe("updateDraftPrompts");
    expect(resolvePromptSaveAction(false)).toBe("createVersion");
  });

  it("retrait propre d'un prompt d'évaluation optionnel", () => {
    const state: PromptEditorState = {
      prospectPersona: "Tu incarnes {{prospectName}} avec assez de texte pour valider.",
      includeEvalSystem: false,
      evalSystem: "ancien systeme suffisamment long pour schema",
      includeEvalUser: false,
      evalUser: "ancien user suffisamment long pour schema xx",
      changeNote: "note",
    };
    const artifacts = buildArtifactsFromEditor(state);
    expect(artifacts).toHaveProperty("PROSPECT_PERSONA");
    expect(artifacts).not.toHaveProperty("EVALUATION_SYSTEM");
    expect(artifacts).not.toHaveProperty("EVALUATION_USER");
  });

  it("publication bundle puis exercice : actions distinctes dans le source", () => {
    const src = read("src/app/admin/exercises/[id]/page.tsx");
    expect(src).toContain('action: "publishBundle"');
    expect(src).toContain('action: "publish"');
    expect(src).toContain('"updateDraftPrompts"');
    expect(src).toContain('"createVersion"');
    expect(src).toContain("resolvePromptSaveAction");
    expect(src).toContain("fromVersion");
    expect(src).toContain('action: "restoreVersion"');
    expect(src).toContain('action: "preview"');
    expect(src).toContain('fixtureId: "default"');
    expect(src).toContain("Preview locale");
    expect(src).toContain("aucun appel IA");
    expect(src).not.toMatch(/openai/i);
    expect(src).not.toContain("getRealtimeSessionProvider");
  });

  it("restauration envoie fromVersion", () => {
    const src = read("src/app/admin/exercises/[id]/page.tsx");
    expect(src).toMatch(/fromVersion:\s*restoreVersion/);
    expect(src).toContain("Restaurer comme nouveau brouillon");
    expect(src).toContain("Confirmer restauration");
  });

  it("ARCHIVED en lecture seule", () => {
    expect(isArchivedReadOnly("ARCHIVED")).toBe(true);
    expect(isArchivedReadOnly("DRAFT")).toBe(false);
    const src = read("src/app/admin/exercises/[id]/page.tsx");
    expect(src).toContain("isArchivedReadOnly");
    expect(src).toContain("disabled={archived || busy}");
    expect(src).toContain("métadonnées et prompts en lecture seule");
  });

  it("editorStateFromBundle préremplit depuis le bundle courant", () => {
    const state = editorStateFromBundle({
      id: "b1",
      version: 2,
      status: "PUBLISHED",
      changeNote: "ok",
      createdById: null,
      createdAt: "2026-01-01",
      publishedAt: "2026-01-01",
      artifacts: {
        PROSPECT_PERSONA: {
          body: "Persona admin personnalisee suffisamment longue.",
          contentType: "text/plain",
        },
        EVALUATION_SYSTEM: {
          body: "Eval systeme suffisamment longue pour le schema.",
          contentType: "text/plain",
        },
      },
    });
    expect(state.prospectPersona).toContain("Persona admin");
    expect(state.includeEvalSystem).toBe(true);
    expect(state.includeEvalUser).toBe(false);
  });
});

describe("Admin UI — erreurs et duplication", () => {
  it("erreurs 409 : pas de faux succès (res.ok vérifié, pas de redirect aveugle)", () => {
    const src = read("src/app/admin/exercises/[id]/page.tsx");
    expect(src).toContain("if (!res.ok)");
    expect(src).toContain("setActionError");
    expect(src).toContain("setMetaError");
    expect(src).toContain("setPromptError");
    // duplication : push seulement si data?.id après succès
    expect(src).toMatch(/if\s*\(\s*data\?\.id\s*\)\s*router\.push/);
  });

  it("duplication avec confirmation et redirection conditionnelle", () => {
    const src = read("src/app/admin/exercises/[id]/page.tsx");
    expect(src).toContain('action: "duplicate"');
    expect(src).toContain('confirmKey: "duplicate"');
    expect(src).toContain("`/admin/exercises/${data.id}`");
  });

  it("aucune fuite prompts dans URL/localStorage/logs liste", () => {
    const list = read("src/app/admin/exercises/page.tsx");
    const detail = read("src/app/admin/exercises/[id]/page.tsx");
    expect(list).not.toContain("localStorage");
    expect(detail).not.toContain("localStorage");
    expect(list).not.toContain("sessionStorage");
    expect(detail).not.toContain("sessionStorage");
    expect(list).not.toMatch(/searchParams\.set\([^)]*prompt/i);
    expect(detail).not.toMatch(/router\.push\([^)]*artifacts/i);
    expect(list).not.toContain("console.log");
    expect(detail).not.toContain("console.log");
  });

  it("lien admin dans ManagerNav réservé via showAdminLink", () => {
    const nav = read("src/components/ManagerNav.tsx");
    const layout = read("src/app/manager/layout.tsx");
    expect(nav).toContain("showAdminLink");
    expect(nav).toContain("/admin/exercises");
    expect(layout).toContain("isPlatformAdmin(user)");
    expect(layout).toContain("showAdminLink={isPlatformAdmin(user)}");
  });
});

describe("Admin UI — payloads et isolation formulaires", () => {
  const baseExercise: AdminExerciseDetail = {
    id: "ex-1",
    name: "Demo",
    slug: "demo",
    status: "DRAFT",
    level: "MOYEN",
    missionLevel: 2,
    sortOrder: 1,
    callType: "VENTE",
    campaign: "Campagne A",
    offer: "Offre A",
    prospectProfile: "Profil",
    initialSituation: "Situation",
    objective: "Objectif",
    personality: "Direct",
    allowedObjections: ["prix"],
    secretInfos: [{ question: "Budget ?", answer: "50k" }],
    successConditions: "ok",
    failureConditions: "ko",
    targetDurationSec: 300,
    traineeBrief: "Brief",
    currentBundle: {
      id: "b1",
      version: 1,
      status: "PUBLISHED",
      changeNote: "v1",
      createdById: null,
      createdAt: "2026-01-01",
      publishedAt: "2026-01-01",
      artifacts: {
        PROSPECT_PERSONA: {
          body: "Persona initiale suffisamment longue pour le schema.",
          contentType: "text/plain",
        },
      },
    },
    versions: [],
  };

  it("chaîne vide conservée dans le payload metadata", () => {
    const meta = metaFormFromExercise(baseExercise);
    meta.campaign = "";
    meta.offer = "";
    meta.prospectProfile = "";
    meta.initialSituation = "";
    meta.objective = "";
    meta.personality = "";
    meta.successConditions = "";
    meta.failureConditions = "";
    meta.traineeBrief = "";
    meta.slug = "";
    const payload = buildMetadataPatchPayload(meta);
    expect(payload.campaign).toBe("");
    expect(payload.offer).toBe("");
    expect(payload.prospectProfile).toBe("");
    expect(payload.initialSituation).toBe("");
    expect(payload.objective).toBe("");
    expect(payload.personality).toBe("");
    expect(payload.successConditions).toBe("");
    expect(payload.failureConditions).toBe("");
    expect(payload.traineeBrief).toBe("");
    expect(payload).not.toHaveProperty("slug");
    expect(payload.allowedObjections).toEqual(["prix"]);
  });

  it("secretInfos initialisés et inclus dans le payload", () => {
    const meta = metaFormFromExercise(baseExercise);
    expect(meta.secretInfos).toEqual([
      { question: "Budget ?", answer: "50k" },
    ]);
    const payload = buildMetadataPatchPayload(meta);
    expect(payload.secretInfos).toEqual([
      { question: "Budget ?", answer: "50k" },
    ]);
  });

  it("tableau secretInfos vide envoyé", () => {
    const meta: MetaFormState = {
      ...metaFormFromExercise(baseExercise),
      secretInfos: [],
      allowedObjections: "",
    };
    const payload = buildMetadataPatchPayload(meta);
    expect(payload.secretInfos).toEqual([]);
    expect(payload.allowedObjections).toEqual([]);
  });

  it("sauvegarde metadata ne réinitialise pas l'éditeur", () => {
    expect(resolveApplySync("saveMetadata")).toEqual({
      syncMeta: true,
      syncEditor: false,
    });
  });

  it("sauvegarde prompts ne réinitialise pas les métadonnées", () => {
    expect(resolveApplySync("savePrompts")).toEqual({
      syncMeta: false,
      syncEditor: true,
    });
  });

  it("chargement synchronise les deux ; lifecycle ne touche pas les formulaires", () => {
    expect(resolveApplySync("load")).toEqual({
      syncMeta: true,
      syncEditor: true,
    });
    expect(resolveApplySync("lifecycle")).toEqual({
      syncMeta: false,
      syncEditor: false,
    });
    expect(resolveApplySync("restore")).toEqual({
      syncMeta: false,
      syncEditor: true,
    });
  });
});

describe("Admin UI — restauration panneau", () => {
  it("restauration 409 : panneau/note conservés", () => {
    expect(shouldClearConfirmOnFailure("restoreVersion")).toBe(false);
    expect(shouldDismissRestoreUi(null)).toBe(false);
    expect(shouldDismissRestoreUi(undefined)).toBe(false);
  });

  it("restauration réussie : panneau vidé et fermé", () => {
    expect(shouldDismissRestoreUi({ id: "ex-1" })).toBe(true);
    expect(shouldClearConfirmOnFailure("publish")).toBe(true);
  });

  it("absence du .then() inconditionnel précédent", () => {
    const src = read("src/app/admin/exercises/[id]/page.tsx");
    expect(src).not.toMatch(
      /\.then\(\s*\(\s*\)\s*=>\s*\{\s*setRestoreVersion\(null\)/,
    );
    expect(src).toContain("shouldDismissRestoreUi");
    expect(src).toContain("shouldClearConfirmOnFailure");
    expect(src).toContain("async () =>");
    expect(src).toContain("buildMetadataPatchPayload");
    expect(src).toContain("secretInfos");
    expect(src).not.toMatch(/campaign:\s*meta\.campaign\s*\|\|\s*undefined/);
    expect(src).not.toMatch(/JSON\.stringify\(\s*meta\.secretInfos/);
  });
});
