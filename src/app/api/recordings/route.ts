import { randomUUID } from "crypto";
import path from "path";
import { prisma } from "@/lib/db";
import { handle, ok, fail } from "@/lib/api";
import { requireManager } from "@/lib/auth";
import { getAudioStorage, isPersistentStorageConfigured } from "@/lib/providers";
import { serverConfig, ACCEPTED_AUDIO_MIME, ACCEPTED_AUDIO_EXT } from "@/lib/config";
import { nowIso, simpleHash } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { enqueueJob, JobType } from "@/lib/jobs";
import { log } from "@/lib/log";
import { buildAudioStorageKey } from "@/lib/storageKey";

export async function POST(req: Request) {
  return handle(async () => {
    const manager = await requireManager();

    // Rate limiting sur l'endpoint coûteux d'upload.
    const rl = rateLimit(`upload:${manager.id}`, 20, 60_000);
    if (!rl.allowed) return fail(429, "Trop d'imports. Réessaie dans une minute.");

    // En production, refuser proprement les uploads si le stockage n'est pas
    // persistant (le disque du conteneur est éphémère et perdrait les audios).
    if (serverConfig.nodeEnv === "production" && !isPersistentStorageConfigured()) {
      return fail(
        503,
        "Stockage objet non configuré (STORAGE_DRIVER=s3 requis en production).",
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    const title = String(form.get("title") ?? "").trim();
    const consent = String(form.get("consent") ?? "") === "true";
    const campaign = String(form.get("campaign") ?? "").trim() || null;
    const callOutcome = String(form.get("callOutcome") ?? "").trim() || null;
    const language = String(form.get("language") ?? "fr").trim() || "fr";
    const managerNote = String(form.get("managerNote") ?? "").trim() || null;
    const tagsRaw = String(form.get("tags") ?? "").trim();
    const tags = tagsRaw
      ? JSON.stringify(tagsRaw.split(",").map((t) => t.trim()).filter(Boolean))
      : null;

    if (!consent) {
      return fail(400, "Le consentement / la base légale de traitement est obligatoire.");
    }
    if (!title) return fail(422, "Le titre est requis.");
    if (!(file instanceof File)) return fail(422, "Fichier audio manquant.");

    // Validation MIME + extension côté serveur.
    const ext = path.extname(file.name).toLowerCase();
    const mimeOk = ACCEPTED_AUDIO_MIME.includes(file.type);
    const extOk = ACCEPTED_AUDIO_EXT.includes(ext);
    if (!mimeOk && !extOk) {
      return fail(415, "Format non supporté. Formats acceptés : MP3, WAV, M4A.");
    }

    // Limite de taille configurable.
    const maxBytes = serverConfig.storage.maxUploadMb * 1024 * 1024;
    if (file.size > maxBytes) {
      return fail(413, `Fichier trop volumineux (max ${serverConfig.storage.maxUploadMb} Mo).`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Idempotence : empreinte du contenu + org.
    const hash = simpleHash(`${manager.organizationId}:${file.size}:${title}:${buffer.length}`);
    const dup = await prisma.callRecording.findFirst({
      where: { organizationId: manager.organizationId, processingHash: hash },
    });
    if (dup) {
      return ok({ id: dup.id, duplicate: true }, 200);
    }

    // Stockage privé (hors /public). Clé : organizationId + UUID non prédictible
    // + extension validée. Le nom fourni par l'utilisateur n'est JAMAIS repris.
    const id = randomUUID();
    const contentType = file.type || "audio/mpeg";
    const storageKey = buildAudioStorageKey(manager.organizationId, ext);
    await getAudioStorage().put(storageKey, buffer, contentType);
    log.info("upload.stored", {
      organizationId: manager.organizationId,
      recordingId: id,
      sizeBytes: file.size,
    });

    // Compensation : si l'écriture DB échoue après un stockage réussi, on nettoie
    // l'objet pour ne pas laisser d'orphelin.
    const now = nowIso();
    let rec;
    try {
      rec = await prisma.callRecording.create({
        data: {
          id,
          organizationId: manager.organizationId,
          uploaderId: manager.id,
          title,
          campaign,
          callOutcome,
          language,
          tags,
          managerNote,
          consent,
          storageKey,
          mimeType: contentType,
          sizeBytes: file.size,
          durationSec: 0,
          status: "UPLOADED",
          enabled: true,
          processingHash: hash,
          createdAt: now,
          updatedAt: now,
        },
      });
    } catch (dbErr) {
      await getAudioStorage().deleteObject(storageKey).catch(() => {});
      throw dbErr;
    }

    // Journalise l'upload (sans le contenu de la conversation).
    await logAudit({
      organizationId: manager.organizationId,
      actorId: manager.id,
      action: "UPLOAD",
      targetType: "CallRecording",
      targetId: rec.id,
      metadata: { title, sizeBytes: file.size },
    });

    // Met le traitement en file (persistant) : le worker le prendra en charge ;
    // en dev, l'endpoint /process peut le déclencher en ligne.
    await enqueueJob({
      organizationId: manager.organizationId,
      type: JobType.RECORDING_PIPELINE,
      targetId: rec.id,
    });

    return ok({ id: rec.id, status: rec.status }, 201);
  });
}
