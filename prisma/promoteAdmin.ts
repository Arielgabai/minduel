/**
 * Promotion contrôlée d'un utilisateur existant vers PLATFORM_ADMIN.
 *
 * Usage :
 *   npm run db:promote-admin -- --email=user@example.com
 *   PROMOTE_ADMIN_EMAIL=user@example.com npm run db:promote-admin
 *
 * Garde-fous :
 * - Aucun UUID / email admin en dur.
 * - Aucune auto-promotion au login.
 * - En production : exige ALLOW_PROMOTE_ADMIN=true.
 * - Journalise un AuditEvent PROMOTE_PLATFORM_ADMIN.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Role } from "../src/lib/enums";

const prisma = new PrismaClient();

function assertPromoteAllowed(): void {
  const isProd = process.env.NODE_ENV === "production";
  const allowed = ["true", "1", "yes"].includes(
    (process.env.ALLOW_PROMOTE_ADMIN ?? "").toLowerCase(),
  );
  if (isProd && !allowed) {
    console.error(
      "Promotion admin refusée en production.\n" +
        "Définissez ALLOW_PROMOTE_ADMIN=true uniquement pour une opération ops contrôlée.",
    );
    process.exit(1);
  }
}

function resolveEmail(): string {
  const fromEnv = (process.env.PROMOTE_ADMIN_EMAIL ?? "").trim();
  const arg = process.argv.find((a) => a.startsWith("--email="));
  const fromArg = arg ? arg.slice("--email=".length).trim() : "";
  const email = (fromArg || fromEnv).toLowerCase();
  if (!email || !email.includes("@")) {
    console.error(
      "Email requis : --email=user@example.com ou PROMOTE_ADMIN_EMAIL.",
    );
    process.exit(1);
  }
  return email;
}

async function main() {
  assertPromoteAllowed();
  const email = resolveEmail();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`Utilisateur introuvable : ${email}`);
    process.exit(1);
  }
  if (!user.organizationId) {
    console.error("L'utilisateur doit appartenir à une organisation.");
    process.exit(1);
  }
  const organizationId = user.organizationId;
  if (user.role === Role.PLATFORM_ADMIN) {
    console.log(`Déjà PLATFORM_ADMIN : ${email}`);
    return;
  }

  const previousRole = user.role;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { role: Role.PLATFORM_ADMIN },
    });

    await tx.auditEvent.create({
      data: {
        organizationId,
        actorId: user.id,
        action: "PROMOTE_PLATFORM_ADMIN",
        targetType: "User",
        targetId: user.id,
        metadata: JSON.stringify({ email, previousRole }),
        createdAt: new Date().toISOString(),
      },
    });
  });

  console.log(
    `Promu PLATFORM_ADMIN : ${email} (précédemment ${previousRole}).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
