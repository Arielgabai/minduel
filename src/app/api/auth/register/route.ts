import { z } from "zod";
import { prisma } from "@/lib/db";
import { handle, ok, fail } from "@/lib/api";
import { hashPassword, createSession } from "@/lib/auth";
import { nowIso } from "@/lib/utils";
import { Role } from "@/lib/enums";
import { DEFAULT_RUBRIC } from "@/lib/rubric";
import { stringifyJson } from "@/lib/utils";

const schema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email().max(200),
  password: z.string().min(6).max(200),
  organizationName: z.string().min(2).max(120),
});

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "org"
  );
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = schema.parse(await req.json());
    const email = body.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return fail(409, "Un compte existe déjà avec cet e-mail.");
    }

    let slug = slugify(body.organizationName);
    if (await prisma.organization.findUnique({ where: { slug } })) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const now = nowIso();
    const org = await prisma.organization.create({
      data: {
        name: body.organizationName.trim(),
        slug,
        isActive: true,
        isDemo: false,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Grille d'évaluation par défaut de l'organisation.
    await prisma.evaluationRubric.create({
      data: {
        organizationId: org.id,
        name: "Grille par défaut",
        criteria: stringifyJson(DEFAULT_RUBRIC),
        createdAt: now,
        updatedAt: now,
      },
    });

    const user = await prisma.user.create({
      data: {
        organizationId: org.id,
        email,
        passwordHash: await hashPassword(body.password),
        fullName: body.fullName.trim(),
        role: Role.MANAGER,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.teamMembership.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: Role.MANAGER,
        createdAt: now,
      },
    });

    await createSession(user.id);
    return ok({ role: user.role, redirect: "/manager" }, 201);
  });
}
