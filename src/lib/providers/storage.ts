import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { createHmac } from "crypto";
import { serverConfig } from "../config";
import type { AudioStorageProvider } from "./types";

/**
 * Stockage local sur disque, hors du dossier /public.
 * En production, remplacer par une implémentation S3 compatible (même interface).
 * Les fichiers ne sont jamais servis directement : uniquement via une URL signée
 * (route /api/recordings/[id]/audio?sig=...) validée côté serveur.
 */
class LocalAudioStorage implements AudioStorageProvider {
  private baseDir = path.resolve(process.cwd(), serverConfig.storage.dir);

  private full(key: string): string {
    // Empêche toute traversée de répertoire.
    const safe = key.replace(/[^a-zA-Z0-9._/-]/g, "_");
    return path.join(this.baseDir, safe);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.full(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
  }

  async getSignedUrl(key: string, expiresInSec = 300): Promise<string> {
    const expires = Date.now() + expiresInSec * 1000;
    const sig = createHmac("sha256", serverConfig.sessionSecret)
      .update(`${key}:${expires}`)
      .digest("hex");
    const params = new URLSearchParams({ key, expires: String(expires), sig });
    return `/api/storage/audio?${params.toString()}`;
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.full(key));
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await fs.unlink(this.full(key));
    } catch {
      /* déjà supprimé */
    }
  }
}

/** Vérifie une signature d'URL de stockage (utilisée par la route de lecture). */
export function verifyStorageSignature(
  key: string,
  expires: string,
  sig: string,
): boolean {
  if (Date.now() > Number(expires)) return false;
  const expected = createHmac("sha256", serverConfig.sessionSecret)
    .update(`${key}:${expires}`)
    .digest("hex");
  return expected === sig;
}

let instance: AudioStorageProvider | null = null;

export function getAudioStorage(): AudioStorageProvider {
  if (!instance) {
    // Un seul driver implémenté pour le MVP (local). L'interface permet d'ajouter S3.
    instance = new LocalAudioStorage();
  }
  return instance;
}
