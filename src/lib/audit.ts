import "server-only";
import { prisma } from "./db";
import { nowIso, stringifyJson } from "./utils";

/** Journalise un événement d'audit (upload, validation, export, suppression…). */
export async function logAudit(input: {
  organizationId: string;
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ? stringifyJson(input.metadata) : null,
      createdAt: nowIso(),
    },
  });
}
