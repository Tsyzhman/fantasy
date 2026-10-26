import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

type AuthRateLimitClient = Pick<PrismaClient, "$executeRaw" | "$queryRaw">;

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

/** @spec spec://common/FEAT-009-session-authentication#attempts */
export async function checkAuthRateLimits(
  prisma: AuthRateLimitClient,
  buckets: AuthRateLimitBucket[]
) {
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

/** @spec spec://common/FEAT-009-session-authentication#attempts */
export async function recordFailedAuthAttempt(
  prisma: AuthRateLimitClient,
  buckets: AuthRateLimitBucket[],
  options: AuthRateLimitOptions = {}
) {
  const maxFailures = options.maxFailures ?? defaultMaxFailures;
  const windowMs = options.windowMs ?? defaultWindowMs;
  const lockMs = options.lockMs ?? defaultLockMs;
  const now = new Date();

  for (const bucket of buckets) {
    const cutoff = new Date(now.getTime() - windowMs);
    const lockedUntil = maxFailures <= 1 ? new Date(now.getTime() + lockMs) : null;
    const id = bucketId(bucket);
    const subjectHash = hashSubject(bucket.subject);

    await prisma.$executeRaw`
      INSERT INTO "AuthRateLimit" ("id", "action", "subjectHash", "failedCount", "lastFailedAt", "lockedUntil", "createdAt", "updatedAt")
      VALUES (${id}, ${bucket.action}, ${subjectHash}, 1, ${now}, ${lockedUntil}, ${now}, ${now})
      ON CONFLICT ("action", "subjectHash")
      DO UPDATE SET
        "failedCount" = CASE WHEN "AuthRateLimit"."lastFailedAt" >= ${cutoff}
          THEN "AuthRateLimit"."failedCount" + 1 ELSE 1 END,
        "lastFailedAt" = ${now},
        "lockedUntil" = CASE
          WHEN (CASE WHEN "AuthRateLimit"."lastFailedAt" >= ${cutoff}
            THEN "AuthRateLimit"."failedCount" + 1 ELSE 1 END) >= ${maxFailures}
          THEN ${new Date(now.getTime() + lockMs)}
          ELSE "AuthRateLimit"."lockedUntil" END,
        "updatedAt" = ${now}
    `;
  }
}

export async function clearAuthRateLimits(prisma: AuthRateLimitClient, buckets: AuthRateLimitBucket[]) {
  for (const bucket of buckets) {
    await prisma.$executeRaw`
      DELETE FROM "AuthRateLimit"
      WHERE "action" = ${bucket.action} AND "subjectHash" = ${hashSubject(bucket.subject)}
    `;
  }
}

/** @spec spec://common/FEAT-009-session-authentication#attempts */
export async function runLimitedAuthAttempt<T>(
  prisma: PrismaClient,
  buckets: AuthRateLimitBucket[],
  attempt: (tx: Prisma.TransactionClient) => Promise<{ success: boolean; value: T }>
) {
  return prisma.$transaction(async (tx) => {
    const ordered = [...new Map(buckets.map((bucket) => [bucketId(bucket), bucket])).values()]
      .sort((left, right) => bucketId(left).localeCompare(bucketId(right)));
    for (const bucket of ordered) {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${bucketId(bucket)}, 0))`);
    }
    const limit = await checkAuthRateLimits(tx, ordered);
    if (!limit.allowed) return { allowed: false as const, retryAfterSeconds: limit.retryAfterSeconds };
    const result = await attempt(tx);
    if (result.success) await clearAuthRateLimits(tx, ordered);
    else await recordFailedAuthAttempt(tx, ordered);
    return { allowed: true as const, ...result };
  }, { maxWait: 30_000, timeout: 30_000 });
}

async function findBucket(prisma: AuthRateLimitClient, bucket: AuthRateLimitBucket) {
  const rows = await prisma.$queryRaw<AuthRateLimitRow[]>`
    SELECT "failedCount", "lastFailedAt", "lockedUntil"
    FROM "AuthRateLimit"
    WHERE "action" = ${bucket.action} AND "subjectHash" = ${hashSubject(bucket.subject)}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

function bucketId(bucket: AuthRateLimitBucket) {
  return `${bucket.action}:${hashSubject(bucket.subject)}`;
}

function hashSubject(subject: string) {
  return createHash("sha256").update(subject).digest("hex");
}
