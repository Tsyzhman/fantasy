import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#linking
 */
export interface TelegramRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface TelegramRateLimitInput {
  action: string;
  subject: string;
  limit: number;
  windowMs: number;
  lockMs?: number;
}

interface TelegramRateLimitRow {
  failedCount: number;
  windowStartedAt: Date;
  lockedUntil: Date | null;
}

export function telegramRateLimitSubject(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#linking
 */
export async function consumeTelegramRateLimit(prisma: PrismaClient, input: TelegramRateLimitInput): Promise<TelegramRateLimitResult> {
  const subjectHash = telegramRateLimitSubject(input.subject);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<TelegramRateLimitRow[]>`
      SELECT "failed_count" AS "failedCount", "window_started_at" AS "windowStartedAt", "locked_until" AS "lockedUntil"
      FROM "telegram_rate_limits"
      WHERE "action" = ${input.action} AND "subject_hash" = ${subjectHash}
      FOR UPDATE
    `;
    let row = rows[0] ?? null;
    if (row?.lockedUntil && row.lockedUntil > now) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000)) };
    }
    let windowStartedAt = row?.windowStartedAt ?? now;
    let count = row?.failedCount ?? 0;
    let lockedUntil: Date | null = row?.lockedUntil ?? null;
    if (!row || now.getTime() - windowStartedAt.getTime() >= input.windowMs) {
      windowStartedAt = now;
      count = 0;
      lockedUntil = null;
    }
    count += 1;
    if (count > input.limit) {
      const windowEnd = windowStartedAt.getTime() + input.windowMs;
      const lockEnd = Math.max(windowEnd, now.getTime() + (input.lockMs ?? 0));
      lockedUntil = new Date(lockEnd);
      await upsertRow(tx, input.action, subjectHash, count, windowStartedAt, lockedUntil, now);
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000)) };
    }
    await upsertRow(tx, input.action, subjectHash, count, windowStartedAt, lockedUntil, now);
    return { allowed: true, retryAfterSeconds: 0 };
  });
}

export async function clearTelegramRateLimit(prisma: PrismaClient, action: string, subject: string): Promise<void> {
  const subjectHash = telegramRateLimitSubject(subject);
  await prisma.$executeRaw`DELETE FROM "telegram_rate_limits" WHERE "action" = ${action} AND "subject_hash" = ${subjectHash}`;
}

type TransactionClient = Prisma.TransactionClient;

async function upsertRow(
  tx: TransactionClient,
  action: string,
  subjectHash: string,
  count: number,
  windowStartedAt: Date,
  lockedUntil: Date | null,
  now: Date
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "telegram_rate_limits" ("id", "action", "subject_hash", "failed_count", "window_started_at", "locked_until", "created_at", "updated_at")
    VALUES (${`${action}:${subjectHash}`}, ${action}, ${subjectHash}, ${count}, ${windowStartedAt}, ${lockedUntil}, ${now}, ${now})
    ON CONFLICT ("action", "subject_hash")
    DO UPDATE SET
      "failed_count" = ${count},
      "window_started_at" = ${windowStartedAt},
      "locked_until" = ${lockedUntil},
      "updated_at" = ${now}
  `;
}
