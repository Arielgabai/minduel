import { randomUUID } from "crypto";
import path from "path";
import { prisma } from "@/lib/db";
import { handle, ok, fail } from "@/lib/api";
import { requireManager } from "@/lib/auth";
import { getAudioStorage } from "@/lib/providers";
import { serverConfig, ACCEPTED_AUDIO_MIME, ACCEPTED_AUDIO_EXT } from "@/lib/config";
import { nowIso, simpleHash } from "@/lib/utils";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(req: Request) {
  return handle(async () => {
    const manager = await requireManager();

    // Rate limiting sur l'endpoint coûteux d'upload.
    const rl = rateLimit(`upload:${manager.id}`, 20, 60_000);
    if (!rl.allowed) return fail(429, "Trop d'imports. Réessaie dans une minute.");

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

    // Stockage privé (hors /public), clé opaque.
    const id = randomUUID();
    const storageKey = `${manager.organizationId}/${id}${ext || ".audio"}`;
    await getAudioStorage().put(storageKey, buffer, file.type || "audio/mpeg");

    const now = nowIso();
    const rec = await prisma.callRecording.create({
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
        mimeType: file.type || "audio/mpeg",
        sizeBytes: file.size,
        durationSec: 0,
        status: "UPLOADED",
        enabled: true,
        processingHash: hash,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Journalise l'upload (sans le contenu de la conversation).
    await logAudit({
      organizationId: manager.organizationId,
      actorId: manager.id,
      action: "UPLOAD",
      targetType: "CallRecording",
      targetId: rec.id,
      metadata: { title, sizeBytes: file.size },
    });

    return ok({ id: rec.id, status: rec.status }, 201);
  });
}
