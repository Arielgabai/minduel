import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { nowIso } from "./utils";
import { Role } from "./enums";
import { HttpError } from "./httpError";

export { HttpError };

const SESSION_COOKIE = "minduel_session";
const SESSION_TTL_DAYS = 7;

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  organizationId: string | null;
  organizationName: string | null;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Crée une session en base et pose le cookie httpOnly. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 864e5);
  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt: expires.toISOString(),
      createdAt: nowIso(),
    },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
    store.delete(SESSION_COOKIE);
  }
}

/** Récupère l'utilisateur courant depuis le cookie de session (ou null). */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { include: { organization: true } } },
  });
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  const u = session.user;
  if (!u.isActive) return null;

  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    organizationId: u.organizationId,
    organizationName: u.organization?.name ?? null,
  };
}

export function isManager(user: SessionUser | null): boolean {
  return user?.role === Role.MANAGER || user?.role === Role.PLATFORM_ADMIN;
}

export function isPlatformAdmin(user: SessionUser | null): boolean {
  return user?.role === Role.PLATFORM_ADMIN;
}

export function isTelepro(user: SessionUser | null): boolean {
  return user?.role === Role.TELEPRO;
}

/** Exige un utilisateur connecté, sinon lève une HttpError 401. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Authentification requise.");
  return user;
}

/** Exige un manager appartenant à une organisation. */
export async function requireManager(): Promise<
  SessionUser & { organizationId: string }
> {
  const user = await requireUser();
  if (!isManager(user)) throw new HttpError(403, "Accès réservé au manager.");
  if (!user.organizationId)
    throw new HttpError(403, "Aucune organisation associée.");
  return user as SessionUser & { organizationId: string };
}

/** Exige un téléprospecteur appartenant à une organisation. */
export async function requireTelepro(): Promise<
  SessionUser & { organizationId: string }
> {
  const user = await requireUser();
  if (!isTelepro(user)) throw new HttpError(403, "Accès réservé au téléprospecteur.");
  if (!user.organizationId)
    throw new HttpError(403, "Aucune organisation associée.");
  return user as SessionUser & { organizationId: string };
}

/**
 * Garde pure (testable) : PLATFORM_ADMIN strict + organisation.
 * Pas d'auto-promotion : voir `npm run db:promote-admin`.
 */
export function assertPlatformAdmin(
  user: SessionUser | null,
): SessionUser & { organizationId: string } {
  if (!user) throw new HttpError(401, "Authentification requise.");
  if (!isPlatformAdmin(user)) {
    throw new HttpError(403, "Accès réservé à l'administrateur plateforme.");
  }
  if (!user.organizationId) {
    throw new HttpError(403, "Aucune organisation associée.");
  }
  return user as SessionUser & { organizationId: string };
}

/** Exige un PLATFORM_ADMIN via la session courante. */
export async function requirePlatformAdmin(): Promise<
  SessionUser & { organizationId: string }
> {
  return assertPlatformAdmin(await getCurrentUser());
}
