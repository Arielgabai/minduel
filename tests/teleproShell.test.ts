import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  TELEPRO_HISTORY_PATH,
  TELEPRO_HISTORY_REDIRECT,
  TELEPRO_NAV_ITEMS,
  isTeleproNavActive,
  shouldShowTeleproNav,
  teleproNavHrefs,
  teleproNavLabels,
} from "@/lib/teleproNav";

function read(rel: string) {
  return readFileSync(path.resolve(rel), "utf8");
}

describe("Telepro shell ? cinq destinations", () => {
  it("expose Accueil, Missions, Skills, Progression, Profil", () => {
    expect(TELEPRO_NAV_ITEMS).toHaveLength(5);
    expect(teleproNavLabels()).toEqual([
      "Accueil",
      "Missions",
      "Skills",
      "Progression",
      "Profil",
    ]);
    expect(teleproNavHrefs()).toEqual([
      "/app",
      "/app/missions",
      "/app/skills",
      "/app/progression",
      "/app/profile",
    ]);
  });

  it("pages destinations existent et appellent requireTelepro", () => {
    for (const rel of [
      "src/app/app/page.tsx",
      "src/app/app/missions/page.tsx",
      "src/app/app/skills/page.tsx",
      "src/app/app/progression/page.tsx",
      "src/app/app/profile/page.tsx",
    ]) {
      const src = read(rel);
      expect(src).toContain("requireTelepro");
      expect(src).toMatch(/export\s+default\s+(async\s+)?function/);
    }
  });
});

describe("Telepro shell ? ?tat actif", () => {
  it("marque Accueil uniquement sur /app exact", () => {
    expect(isTeleproNavActive("/app", "/app")).toBe(true);
    expect(isTeleproNavActive("/app", "/app/missions")).toBe(false);
    expect(isTeleproNavActive("/app", "/app/profile")).toBe(false);
  });

  it("marque les sous-routes et /app/history comme Progression", () => {
    expect(isTeleproNavActive("/app/missions", "/app/missions")).toBe(true);
    expect(isTeleproNavActive("/app/progression", "/app/progression")).toBe(true);
    expect(isTeleproNavActive("/app/progression", TELEPRO_HISTORY_PATH)).toBe(true);
    expect(isTeleproNavActive("/app/profile", "/app/profile")).toBe(true);
    expect(isTeleproNavActive("/app/skills", "/app/skills")).toBe(true);
  });

  it("TeleproNav utilise aria-current=page sur l'onglet actif", () => {
    const src = read("src/components/TeleproNav.tsx");
    expect(src).toContain('aria-current={active ? "page" : undefined}');
    expect(src).toContain("isTeleproNavActive");
    expect(src).toContain('aria-label="Navigation principale"');
  });
});

describe("Telepro shell ? compatibilit? /app/history", () => {
  it("redirige history vers progression", () => {
    expect(TELEPRO_HISTORY_REDIRECT).toBe("/app/progression");
    const src = read("src/app/app/history/page.tsx");
    expect(src).toContain("redirect");
    expect(src).toContain("TELEPRO_HISTORY_REDIRECT");
    expect(src).not.toContain("prisma");
  });
});

describe("Telepro shell ? Progression r?utilise l'historique", () => {
  it("Progression liste les simulations et liens d?brief", () => {
    const src = read("src/app/app/progression/page.tsx");
    expect(src).toContain("prisma.simulation.findMany");
    expect(src).toContain("`/app/analysis/${s.id}`");
    expect(src).toContain("skillScore.findMany");
    expect(src).toContain("requireTelepro");
  });
});

describe("Telepro shell ? absence de fuite prompts/artifacts/hash", () => {
  it("modules shell et destinations ne mentionnent pas les secrets", () => {
    const files = [
      "src/lib/teleproNav.ts",
      "src/components/TeleproNav.tsx",
      "src/components/TeleproShell.tsx",
      "src/app/app/layout.tsx",
      "src/app/app/missions/page.tsx",
      "src/app/app/skills/page.tsx",
      "src/app/app/progression/page.tsx",
      "src/app/app/history/page.tsx",
    ];
    for (const rel of files) {
      const src = read(rel);
      for (const needle of [
        "artifacts",
        "contentHash",
        "PROSPECT_PERSONA",
        "EVALUATION_SYSTEM",
        "promptBundle",
        "openai",
        "OpenAI",
      ]) {
        expect(src.toLowerCase()).not.toContain(needle.toLowerCase());
      }
    }
  });
});

describe("Telepro shell ? authentification", () => {
  it("layout refuse anonyme et non-t?l?pro", () => {
    const src = read("src/app/app/layout.tsx");
    expect(src).toContain("getCurrentUser");
    expect(src).toContain("isTelepro");
    expect(src).toContain('redirect("/login")');
    expect(src).toContain('redirect("/manager")');
  });

  it("ne d?tend pas requireTelepro dans les pages m?tiers", () => {
    for (const rel of [
      "src/app/app/missions/page.tsx",
      "src/app/app/skills/page.tsx",
      "src/app/app/progression/page.tsx",
    ]) {
      expect(read(rel)).toContain("requireTelepro");
    }
  });
});

describe("Telepro shell ? Skills sans donn?es fictives", () => {
  it("affiche un ?tat vide sans scores invent?s", () => {
    const src = read("src/app/app/skills/page.tsx");
    expect(src).toContain("EmptyState");
    expect(src).toContain("Aucun contenu Skills");
    expect(src).not.toMatch(/\b\d+\s*%/);
    expect(src).not.toMatch(/overallScore|skillScore|niveau\s+\d/i);
    expect(src).not.toContain("prisma");
  });
});

describe("Telepro shell ? liens pr?paration / d?brief pr?serv?s", () => {
  it("Missions lien vers prepare ; Progression vers analysis", () => {
    const missionsEngine = read("src/lib/teleproMissions.ts");
    expect(missionsEngine).toContain("`/app/prepare/${exerciseId}`");
    expect(missionsEngine).toContain("`/app/call/${activeSimulationId}`");
    expect(missionsEngine).toContain("`/app/analysis/${attempt.id}`");
    expect(read("src/app/app/missions/page.tsx")).toContain("loadTeleproMissionsView");
    expect(read("src/app/app/progression/page.tsx")).toContain(
      "`/app/analysis/${s.id}`",
    );
    expect(read("src/app/app/page.tsx")).toContain("loadTeleproMissionsView");
  });

  it("masque la tab-bar sur prepare/call/analysis", () => {
    expect(shouldShowTeleproNav("/app/prepare/abc")).toBe(false);
    expect(shouldShowTeleproNav("/app/call/xyz")).toBe(false);
    expect(shouldShowTeleproNav("/app/analysis/1")).toBe(false);
    expect(shouldShowTeleproNav("/app")).toBe(true);
    expect(shouldShowTeleproNav("/app/missions")).toBe(true);
  });
});

describe("Telepro shell ? responsive statique", () => {
  it("cadre 480px et tab-bar sticky dans le shell", () => {
    const shell = read("src/components/TeleproShell.tsx");
    expect(shell).toContain("max-w-[480px]");
    expect(shell).toContain("md:rounded-[28px]");
    expect(shell).toContain("overflow-x-hidden");
    expect(shell).toContain("shouldShowTeleproNav");
    expect(shell).toContain("<main");

    const nav = read("src/components/TeleproNav.tsx");
    expect(nav).toContain("sticky bottom-0");
    expect(nav).toContain("min-h-11");
    expect(nav).not.toContain("fixed inset-x-0");
  });
});

describe("Telepro shell ? pas d'import OpenAI", () => {
  it("nouveaux modules UI sans openai", () => {
    for (const rel of [
      "src/lib/teleproNav.ts",
      "src/components/TeleproNav.tsx",
      "src/components/TeleproShell.tsx",
      "src/app/app/missions/page.tsx",
      "src/app/app/skills/page.tsx",
      "src/app/app/progression/page.tsx",
      "src/app/app/history/page.tsx",
    ]) {
      const src = read(rel);
      expect(src).not.toMatch(/from\s+["']openai["']/);
      expect(src).not.toMatch(/openai/i);
    }
  });
});
