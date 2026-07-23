import { describe, it, expect } from "vitest";
import {
  buildAudioStorageKey,
  normalizeAudioExt,
} from "@/lib/storageKey";

describe("génération de clé d'objet de stockage", () => {
  it("préfixe par organizationId et un UUID non prédictible", () => {
    const org = "org-123";
    const key = buildAudioStorageKey(org, ".mp3");
    expect(key.startsWith(`${org}/`)).toBe(true);
    expect(key.endsWith(".mp3")).toBe(true);
    // Format : org/<uuid>.mp3
    const uuidPart = key.slice(org.length + 1, -".mp3".length);
    expect(uuidPart).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("génère des clés uniques", () => {
    const a = buildAudioStorageKey("org", ".wav");
    const b = buildAudioStorageKey("org", ".wav");
    expect(a).not.toBe(b);
  });

  it("ne reprend jamais un nom de fichier utilisateur douteux", () => {
    const key = buildAudioStorageKey("org", "../../etc/passwd");
    expect(key).not.toContain("..");
    expect(key).not.toContain("passwd");
    expect(key.endsWith(".audio")).toBe(true);
  });

  it("normalise les extensions invalides en .audio", () => {
    expect(normalizeAudioExt("")).toBe(".audio");
    expect(normalizeAudioExt(".MP3")).toBe(".mp3");
    expect(normalizeAudioExt("no-dot")).toBe(".audio");
    expect(normalizeAudioExt("../evil")).toBe(".audio");
  });
});
