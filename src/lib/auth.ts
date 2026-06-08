import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

import { UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextResponse } from "next/server";

import { sessionCookieName } from "@/lib/auth-constants";
import { jsonError } from "@/lib/api-handler";
import { ensureDatabaseSchema, isDatabaseConfigured, prisma } from "@/lib/db";

const scrypt = promisify(scryptCallback);

const sessionDays = 30;
const passwordKeyLength = 64;

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  isActive: boolean;
};

export type ApiAuthSuccess = {
  user: AuthUser;
  response: null;
};

export type ApiAuthFailure = {
  user: null;
  response: NextResponse;
};

export type ApiAdminForbidden = {
  user: AuthUser;
  response: NextResponse;
};

export type ApiUserAuth = ApiAuthSuccess | ApiAuthFailure;
export type ApiAdminAuth = ApiAuthSuccess | ApiAuthFailure | ApiAdminForbidden;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, passwordKeyLength)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, passwordHash: string | null | undefined) {
  if (!passwordHash) return false;

  const [algorithm, salt, expectedHex] = passwordHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;

  const expected = Buffer.from(expectedHex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  await ensureDatabaseSchema();
  if (!isDatabaseConfigured()) return null;

  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;

  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true
        }
      }
    }
  });

  if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
    if (session) await prisma.userSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  return session.user;
}

export async function createUserSession(userId: string) {
  await ensureDatabaseSchema();
  if (!isDatabaseConfigured()) throw new Error("DATABASE_URL is not configured.");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);

  await prisma.userSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt
    }
  });

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export async function clearCurrentUserSession() {
  await ensureDatabaseSchema();

  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!isDatabaseConfigured()) {
    cookieStore.delete(sessionCookieName);
    return;
  }

  if (token) {
    await prisma.userSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }

  cookieStore.delete(sessionCookieName);
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdminUser() {
  const user = await requireCurrentUser();
  if (user.role !== UserRole.ADMIN) redirect("/");
  return user;
}

export async function requireApiUser(): Promise<ApiUserAuth> {
  if (!isDatabaseConfigured()) {
    return {
      user: null,
      response: jsonError("DATABASE_NOT_CONFIGURED", "Configure DATABASE_URL before using the API.", 503)
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      response: jsonError("UNAUTHORIZED", "Sign in to continue.", 401)
    };
  }

  return { user, response: null };
}

export async function requireApiAdmin(): Promise<ApiAdminAuth> {
  const auth = await requireApiUser();
  if (auth.response) return auth;

  if (auth.user.role !== UserRole.ADMIN) {
    return {
      user: auth.user,
      response: jsonError("FORBIDDEN", "Admin access is required.", 403)
    };
  }

  return auth;
}

export function isSafeRedirectPath(value: string | null | undefined): value is string {
  return Boolean(value && value.startsWith("/") && !value.startsWith("//"));
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
