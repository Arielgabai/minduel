import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, ok, fail } from "@/lib/api";
import { requireManager, hashPassword } from "@/lib/auth";
import { nowIso } from "@/lib/utils";
import { Role } from "@/lib/enums";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email().max(200),
});

/** Génère un mot de passe temporaire lisible (invitation simulée). */
function tempPassword(): string {
  const words = ["duel", "pitch", "closing", "focus", "rebond", "cadence"];
  const w = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${w}-${n}`;
}

export async function POST(req: Request) {
  return handle(async () => {
    const manager = await requireManager();
    const body = schema.parse(await req.json());
    const email = body.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return fail(409, "Un compte existe déjà avec cet e-mail.");

    const pwd = tempPassword();
    const now = nowIso();

    const telepro = await prisma.user.create({
      data: {
        organizationId: manager.organizationId,
        email,
        passwordHash: await hashPassword(pwd),
        fullName: body.fullName.trim(),
        role: Role.TELEPRO,
        isActive: true,
        tempPassword: pwd, // affiché au manager (MVP : pas d'e-mail)
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.teamMembership.create({
      data: {
        organizationId: manager.organizationId,
        userId: telepro.id,
        role: Role.TELEPRO,
        createdAt: now,
      },
    });

    await logAudit({
      organizationId: manager.organizationId,
      actorId: manager.id,
      action: "CREATE_TELEPRO",
      targetType: "User",
      targetId: telepro.id,
    });

    return ok(
      { id: telepro.id, email, fullName: telepro.fullName, tempPassword: pwd },
      201,
    );
  });
}
