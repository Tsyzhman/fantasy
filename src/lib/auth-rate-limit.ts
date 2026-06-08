import { createHash } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { createLogger } from "@/lib/logger";

const logger = createLogger("auth");

type HeaderReader = {
  get(name: string): string | null;
};

type AuthRateLimitBucket = {
  action: string;
  subject: string;
};

type AuthRateLimitRow = {
  failedCount: number;
  lastFailedAt: Date | null;
  lockedUntil: Date | null;
};

type AuthRateLimitOptions = {
  maxFailures?: number;
  windowMs?: number;
  lockMs?: number;
};

const defaultMaxFailures = 5;
const defaultWindowMs = 15 * 60 * 1000;
const defaultLockMs = 15 * 60 * 1000;

const globalForAuthRateLimit = globalThis as unknown as {
  authRateLimitSchemaPromise?: Promise<void>;
};

export function authRateLimitBuckets(input: { action: string; email?: string | null; clientIp?: string | null }) {
  const buckets: AuthRateLimitBucket[] = [];
  const normalizedEmail = input.email?.trim().toLowerCase();
  if (normalizedEmail) buckets.push({ action: `${input.action}:email`, subject: normalizedEmail });
  buckets.push({ action: `${input.action}:ip`, subject: input.clientIp?.trim() || "unknown" });
  return buckets;
}

export function getClientIpFromHeaders(headers: HeaderReader) {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFor) return forwardedFor;
  return headers.get("x-real-ip")?.trim() || null;
}

export async function checkAuthRateLimits(
  prisma: PrismaClient,
  buckets: AuthRateLimitBucket[]
) {
  await ensureAuthRateLimitSchema(prisma);

  const now = new Date();
  for (const bucket of buckets) {
    const row = await findBucket(prisma, bucket);
    if (row?.lockedUntil && row.lockedUntil > now) {
      return {
        allowed: false as const,
        retryAfterSeconds: Math.max(1, Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000))
      };
    }
  }

  return { allowed: true as const };
}

export async function recordFailedAuthAttempt(
  prisma: PrismaClient,
  buckets: AuthRateLimitBucket[],
  options: AuthRateLimitOptions = {}
) {
  await ensureAuthRateLimitSchema(prisma);

  const maxFailures = options.maxFailures ?? defaultMaxFailures;
  const windowMs = options.windowMs ?? defaultWindowMs;
  const lockMs = options.lockMs ?? defaultLockMs;
  const now = new Date();

  for (const bucket of buckets) {
    const row = await findBucket(prisma, bucket);
    const lastFailedAt = row?.lastFailedAt ?? null;
    const existingCount = lastFailedAt && now.getTime() - lastFailedAt.getTime() <= windowMs ? row?.failedCount ?? 0 : 0;
    const failedCount = existingCount + 1;
    const lockedUntil = failedCount >= maxFailures ? new Date(now.getTime() + lockMs) : null;
    const id = bucketId(bucket);
    const subjectHash = hashSubject(bucket.subject);

    await prisma.$executeRaw`
      INSERT INTO "AuthRateLimit" ("id", "action", "subjectHash", "failedCount", "lastFailedAt", "lockedUntil", "createdAt", "updatedAt")
      VALUES (${id}, ${bucket.action}, ${subjectHash}, ${failedCount}, ${now}, ${lockedUntil}, ${now}, ${now})
      ON CONFLICT ("action", "subjectHash")
      DO UPDATE SET
        "failedCount" = ${failedCount},
        "lastFailedAt" = ${now},
        "lockedUntil" = ${lockedUntil},
        "updatedAt" = ${now}
    `;
  }
}

export async function clearAuthRateLimits(prisma: PrismaClient, buckets: AuthRateLimitBucket[]) {
  await ensureAuthRateLimitSchema(prisma);

  for (const bucket of buckets) {
    await prisma.$executeRaw`
      DELETE FROM "AuthRateLimit"
      WHERE "action" = ${bucket.action} AND "subjectHash" = ${hashSubject(bucket.subject)}
    `;
  }
}

async function findBucket(prisma: PrismaClient, bucket: AuthRateLimitBucket) {
  const rows = await prisma.$queryRaw<AuthRateLimitRow[]>`
    SELECT "failedCount", "lastFailedAt", "lockedUntil"
    FROM "AuthRateLimit"
    WHERE "action" = ${bucket.action} AND "subjectHash" = ${hashSubject(bucket.subject)}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function ensureAuthRateLimitSchema(prisma: PrismaClient) {
  globalForAuthRateLimit.authRateLimitSchemaPromise ??= createAuthRateLimitSchema(prisma)
    .catch((error) => {
      logger.error("Failed to ensure auth rate-limit schema.", { error });
    });

  return globalForAuthRateLimit.authRateLimitSchemaPromise;
}

async function createAuthRateLimitSchema(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "AuthRateLimit" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "subjectHash" TEXT NOT NULL,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "lastFailedAt" TIMESTAMP(3),
  "lockedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("id")
)`);
  await prisma.$executeRawUnsafe(`
CREATE UNIQUE INDEX IF NOT EXISTS "AuthRateLimit_action_subjectHash_key"
ON "AuthRateLimit"("action", "subjectHash")`);
  await prisma.$executeRawUnsafe(`
CREATE INDEX IF NOT EXISTS "AuthRateLimit_lockedUntil_idx"
ON "AuthRateLimit"("lockedUntil")`);
}

function bucketId(bucket: AuthRateLimitBucket) {
  return `${bucket.action}:${hashSubject(bucket.subject)}`;
}

function hashSubject(subject: string) {
  return createHash("sha256").update(subject).digest("hex");
}
