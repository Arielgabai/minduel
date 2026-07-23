import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, ok, fail, getClientIp } from "@/lib/api";
import { verifyPassword, createSession } from "@/lib/auth";
import { Role } from "@/lib/enums";
import { dayKey, nowIso } from "@/lib/utils";
import { rateLimit } from "@/lib/ratelimit";
import { log } from "@/lib/log";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  return handle(async () => {
    const body = schema.parse(await req.json());
    const email = body.email.toLowerCase().trim();

    // Limitation de débit anti-force brute : par IP et par compte ciblé.
    const ip = getClientIp(req);
    if (!rateLimit(`login-ip:${ip}`, 30, 300_000).allowed) {
      return fail(429, "Trop de tentatives. Réessaie dans quelques minutes.");
    }
    if (!rateLimit(`login-email:${email}`, 10, 300_000).allowed) {
      return fail(429, "Trop de tentatives. Réessaie dans quelques minutes.");
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    });
    if (!user || !user.isActive) {
      return fail(401, "Identifiants invalides.");
    }
    if (user.organization && !user.organization.isActive) {
      return fail(403, "Votre organisation est désactivée.");
    }
    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) {
      return fail(401, "Identifiants invalides.");
    }

    // Mise à jour de la série de jours actifs (mécanique d'engagement).
    const today = dayKey();
    if (user.lastActiveDay !== today) {
      const yesterday = dayKey(new Date(Date.now() - 864e5));
      const newStreak = user.lastActiveDay === yesterday ? user.streakDays + 1 : 1;
      await prisma.user.update({
        where: { id: user.id },
        data: { streakDays: newStreak, lastActiveDay: today, updatedAt: nowIso() },
      });
    }

    await createSession(user.id);
    log.info("auth.login", {
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
    });
    const redirect =
      user.role === Role.MANAGER || user.role === Role.PLATFORM_ADMIN
        ? "/manager"
        : "/app";
    return ok({ role: user.role, redirect });
  });
}
