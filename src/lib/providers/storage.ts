import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { createHmac } from "crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { serverConfig } from "../config";
import type { AudioStorageProvider, StoredObjectInfo } from "./types";

/**
 * Stockage local sur disque (dev uniquement), hors du dossier /public.
 * Les fichiers ne sont jamais servis directement : uniquement via une URL signée
 * (route /api/storage/audio?sig=...) validée côté serveur.
 * NB : NON PERSISTANT sur un conteneur — interdit en production (voir upload route).
 */
class LocalAudioStorage implements AudioStorageProvider {
  private get baseDir(): string {
    return path.resolve(process.cwd(), serverConfig.storage.dir);
  }

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

  async createDownloadUrl(key: string, ttlSec?: number): Promise<string> {
    const expiresInSec = ttlSec ?? serverConfig.storage.signedUrlTtlSec;
    const expires = Date.now() + expiresInSec * 1000;
    const sig = createHmac("sha256", serverConfig.sessionSecret)
      .update(`${key}:${expires}`)
      .digest("hex");
    const params = new URLSearchParams({ key, expires: String(expires), sig });
    return `/api/storage/audio?${params.toString()}`;
  }

  async headObject(key: string): Promise<StoredObjectInfo> {
    try {
      const st = await fs.stat(this.full(key));
      return { exists: true, size: st.size };
    } catch {
      return { exists: false };
    }
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.full(key));
    } catch {
      return null;
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await fs.unlink(this.full(key));
    } catch {
      /* déjà supprimé */
    }
  }
}

/**
 * Stockage objet privé compatible S3 (AWS S3 et services compatibles : R2, MinIO…).
 * Bucket privé, aucun accès public. Téléchargement via URL pré-signée de courte durée.
 */
class S3AudioStorage implements AudioStorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    const s3 = serverConfig.storage.s3;
    this.bucket = s3.bucket;
    this.client = new S3Client({
      region: s3.region,
      ...(s3.endpoint ? { endpoint: s3.endpoint } : {}),
      forcePathStyle: s3.forcePathStyle,
      credentials: {
        accessKeyId: s3.accessKeyId,
        secretAccessKey: s3.secretAccessKey,
      },
    });
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
  }

  async createDownloadUrl(key: string, ttlSec?: number): Promise<string> {
    const expiresIn = ttlSec ?? serverConfig.storage.signedUrlTtlSec;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }

  async createUploadUrl(
    key: string,
    contentType: string,
    ttlSec?: number,
  ): Promise<string> {
    const expiresIn = ttlSec ?? serverConfig.storage.signedUrlTtlSec;
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn },
    );
  }

  async headObject(key: string): Promise<StoredObjectInfo> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        exists: true,
        size: res.ContentLength,
        contentType: res.ContentType,
      };
    } catch {
      return { exists: false };
    }
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

/** Vérifie une signature d'URL de stockage local (utilisée par la route de lecture). */
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

/** Le stockage est-il persistant (objet) ? Requis pour les uploads en production. */
export function isPersistentStorageConfigured(): boolean {
  return serverConfig.storage.driver === "s3";
}

let instance: AudioStorageProvider | null = null;

export function getAudioStorage(): AudioStorageProvider {
  if (!instance) {
    instance =
      serverConfig.storage.driver === "s3"
        ? new S3AudioStorage()
        : new LocalAudioStorage();
  }
  return instance;
}
