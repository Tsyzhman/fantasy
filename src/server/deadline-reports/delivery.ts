import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { sendTelegramMessage, TelegramApiError } from "@/server/telegram/bot-api";
import { telegramBotToken } from "@/server/telegram/config";
import { markTelegramBlocked } from "@/server/telegram/link-service";
import { DEADLINE_DEFAULT_BATCH, DEADLINE_EXPIRY_MARGIN_MS, DEADLINE_MAX_BATCH, deadlineClock, deadlineSendEnabled } from "./config";

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
 */
export interface DeliveryTickResult {
  skipped: boolean;
  claimed: number;
  sent: number;
  failed: number;
  blocked: number;
  expired: number;
  unknown: number;
  cancelled: number;
}

interface ClaimedOutboxRow {
  id: string;
  userId: string;
  campaignId: string;
  partNumber: number;
  reportVersion: number;
  linkVersion: number;
  text: string;
  attempts: number;
}

const OUTBOX_MAX_ATTEMPTS = 5;
const DELIVERY_PER_CHAT_MIN_INTERVAL_MS = 1000;
const OUTBOX_LEASE_MS = 2 * 60 * 1000;
const DELIVERABLE_CAMPAIGN_STATES = ["ACTIVE", "BUILT", "DELIVERING"];

function backoffMs(attempts: number): number {
  return Math.min(300_000, 30_000 * 2 ** Math.max(0, attempts - 1));
}

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
 */
export async function runDeadlineDeliveryTick(
  prisma: PrismaClient,
  options: {
    now?: Date;
    maxBatch?: number;
    fetchImpl?: typeof fetch;
    sendMessage?: (chatId: string, text: string) => Promise<{ messageId: string }>;
    clock?: () => Date;
  } = {}
): Promise<DeliveryTickResult> {
  const result: DeliveryTickResult = { skipped: false, claimed: 0, sent: 0, failed: 0, blocked: 0, expired: 0, unknown: 0, cancelled: 0 };
  if (!deadlineSendEnabled()) return { ...result, skipped: true };
  const clock = options.clock ?? deadlineClock(options.now);
  const now = clock();
  result.unknown = await recoverAbandonedOutbox(prisma, now);
  const token = telegramBotToken();
  const sender = options.sendMessage ?? (token ? (chatId: string, text: string) => sendTelegramMessage({ token, chatId, text, parseMode: "HTML", fetchImpl: options.fetchImpl }) : null);
  if (!sender) return { ...result, skipped: true };
  const batch = Math.max(1, Math.min(options.maxBatch ?? DEADLINE_DEFAULT_BATCH, DEADLINE_MAX_BATCH));
  const leaseToken = randomUUID();
  const leaseUntil = new Date(now.getTime() + OUTBOX_LEASE_MS);
  const claimed = await prisma.$queryRaw<ClaimedOutboxRow[]>`
    UPDATE "telegram_outbox"
    SET "state" = 'SENDING', "lease_token" = ${leaseToken}, "lease_until" = ${leaseUntil}, "updated_at" = ${now}
    WHERE "id" IN (
      SELECT "id" FROM "telegram_outbox"
      WHERE "state" = 'PENDING' AND "next_attempt_at" <= ${now} AND "attempts" < ${OUTBOX_MAX_ATTEMPTS}
      ORDER BY "next_attempt_at" ASC
      LIMIT ${batch}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "user_id" AS "userId", "campaign_id" AS "campaignId", "part_number" AS "partNumber",
      "report_version" AS "reportVersion", "link_version" AS "linkVersion", "text", "attempts"
  `;
  result.claimed = claimed.length;
  const lastSendByChat = new Map<string, number>();
  const touchedCampaigns = new Set<string>();

  for (const row of claimed) {
    touchedCampaigns.add(row.campaignId);
    const release = async (data: Prisma.TelegramOutboxUpdateManyMutationInput) => {
      const updated = await prisma.telegramOutbox.updateMany({ where: { id: row.id, leaseToken, state: "SENDING" }, data });
      return updated.count === 1;
    };
    const pacingLink = await prisma.telegramLink.findUnique({ where: { userId: row.userId }, select: { chatId: true } });
    const last = pacingLink ? lastSendByChat.get(pacingLink.chatId) ?? 0 : 0;
    const waitMs = last + DELIVERY_PER_CHAT_MIN_INTERVAL_MS - Date.now();
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

    // Consent and lease are checked after pacing, immediately before the external
    // effect. A batch may have waited long enough for its campaign or link to change.
    const [campaign, link] = await Promise.all([
      prisma.deadlineCampaign.findUnique({ where: { id: row.campaignId }, select: { contestId: true, season: true, inputVersion: true, deadlineAt: true, status: true } }),
      prisma.telegramLink.findUnique({ where: { userId: row.userId }, select: { id: true, chatId: true, state: true, consentAt: true, linkVersion: true, telegramUserId: true } })
    ]);
    const subscription = campaign && link ? await prisma.telegramSubscription.findUnique({
      where: { userId_contestId: { userId: row.userId, contestId: campaign.contestId } },
      select: { enabled: true, linkId: true, season: true }
    }) : null;
    const sendAt = clock();
    if (!campaign?.deadlineAt || !DELIVERABLE_CAMPAIGN_STATES.includes(campaign.status)
      || campaign.inputVersion !== row.reportVersion
      || !link || link.state !== "ACTIVE" || !link.consentAt || link.linkVersion !== row.linkVersion
      || !subscription?.enabled || subscription.linkId !== link.id || subscription.season !== campaign.season) {
      if (await release({ state: "CANCELLED", leaseToken: null, leaseUntil: null })) result.cancelled += 1;
      continue;
    }
    if (sendAt.getTime() > campaign.deadlineAt.getTime() - DEADLINE_EXPIRY_MARGIN_MS) {
      if (await release({ state: "EXPIRED", leaseToken: null, leaseUntil: null })) result.expired += 1;
      continue;
    }
    const authorizedUntil = new Date(sendAt.getTime() + OUTBOX_LEASE_MS);
    const authorized = await prisma.telegramOutbox.updateMany({
      where: {
        id: row.id, leaseToken, state: "SENDING", leaseUntil: { gt: sendAt },
        campaign: { inputVersion: row.reportVersion, status: { in: DELIVERABLE_CAMPAIGN_STATES }, deadlineAt: { gte: new Date(sendAt.getTime() + DEADLINE_EXPIRY_MARGIN_MS) } },
        user: {
          telegramLink: { id: link.id, state: "ACTIVE", consentAt: { not: null }, linkVersion: row.linkVersion, chatId: link.chatId },
          telegramSubscriptions: { some: { contestId: campaign.contestId, season: campaign.season, linkId: link.id, enabled: true } }
        }
      },
      data: { leaseUntil: authorizedUntil }
    });
    if (authorized.count === 0) {
      if (await release({ state: "CANCELLED", leaseToken: null, leaseUntil: null })) result.cancelled += 1;
      continue;
    }
    // The authorization query itself can wait on the pool or row locks. Check
    // time again after it returns, directly before calling the external sender.
    const externalAt = clock();
    if (externalAt.getTime() > campaign.deadlineAt.getTime() - DEADLINE_EXPIRY_MARGIN_MS) {
      if (await release({ state: "EXPIRED", leaseToken: null, leaseUntil: null })) result.expired += 1;
      continue;
    }
    if (externalAt >= authorizedUntil) {
      if (await release({ state: "CANCELLED", leaseToken: null, leaseUntil: null, lastError: "DELIVERY_AUTHORIZATION_EXPIRED" })) result.cancelled += 1;
      continue;
    }
    try {
      const sent = await sender(link.chatId, row.text);
      lastSendByChat.set(link.chatId, Date.now());
      if (await release({ state: "SENT", telegramMessageId: sent.messageId || null, sentAt: clock(), leaseToken: null, leaseUntil: null, lastError: null })) result.sent += 1;
    } catch (error) {
      lastSendByChat.set(link.chatId, Date.now());
      if (error instanceof TelegramApiError) {
        if (error.blocked) {
          if (await release({ state: "BLOCKED", leaseToken: null, leaseUntil: null, lastError: error.message.slice(0, 300) })) result.blocked += 1;
          await markTelegramBlocked(prisma, link.telegramUserId);
        } else if (error.status === 429) {
          if (await release({
            state: "PENDING",
            leaseToken: null,
            leaseUntil: null,
            nextAttemptAt: new Date(clock().getTime() + (error.retryAfterSeconds ?? 5) * 1000),
            lastError: error.message.slice(0, 300)
          })) result.failed += 1;
        } else if (error.permanent) {
          if (await release({ state: "FAILED", leaseToken: null, leaseUntil: null, lastError: error.message.slice(0, 300) })) result.failed += 1;
        } else {
          if (await release({
            state: row.attempts + 1 < OUTBOX_MAX_ATTEMPTS ? "PENDING" : "FAILED",
            leaseToken: null,
            leaseUntil: null,
            attempts: row.attempts + 1,
            nextAttemptAt: new Date(clock().getTime() + backoffMs(row.attempts + 1)),
            lastError: error.message.slice(0, 300)
          })) result.failed += 1;
        }
      } else {
        if (await release({
          state: "DELIVERY_UNKNOWN",
          leaseToken: null,
          leaseUntil: null,
          attempts: row.attempts + 1,
          lastError: error instanceof Error ? error.message.slice(0, 300) : "unknown transport error"
        })) result.unknown += 1;
      }
    }
  }

  for (const campaignId of touchedCampaigns) {
    const pending = await prisma.telegramOutbox.count({ where: { campaignId, state: { in: ["PENDING", "SENDING"] } } });
    if (pending === 0) {
      await prisma.deadlineCampaign.updateMany({ where: { id: campaignId, status: { in: ["BUILT", "DELIVERING"] } }, data: { status: "DONE" } });
    }
  }
  return result;
}

/**
 * A crashed sender may already have reached Telegram. Never put it back in the
 * pending queue, including when its campaign has passed the delivery deadline.
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#recovery
 */
export async function recoverAbandonedOutbox(prisma: PrismaClient, now = new Date()): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "telegram_outbox"
    SET "state" = 'DELIVERY_UNKNOWN', "lease_token" = NULL, "lease_until" = NULL,
      "last_error" = 'DELIVERY_LEASE_EXPIRED', "updated_at" = ${now}
    WHERE "id" IN (
      SELECT "id" FROM "telegram_outbox"
      WHERE "state" = 'SENDING' AND ("lease_until" <= ${now} OR "lease_until" IS NULL)
      LIMIT ${DEADLINE_MAX_BATCH} FOR UPDATE SKIP LOCKED
    )
  `;
}

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
 */
export async function expireOverdueOutbox(prisma: PrismaClient, now = new Date()): Promise<number> {
  await recoverAbandonedOutbox(prisma, now);
  const cutoff = new Date(now.getTime() + DEADLINE_EXPIRY_MARGIN_MS);
  const result = await prisma.telegramOutbox.updateMany({
    where: { state: "PENDING", campaign: { deadlineAt: { lt: cutoff } } },
    data: { state: "EXPIRED", leaseToken: null, leaseUntil: null }
  });
  return result.count;
}

export async function markBuiltCampaignsDelivering(prisma: PrismaClient, now = new Date()): Promise<number> {
  const result = await prisma.deadlineCampaign.updateMany({
    where: { status: "BUILT", deadlineAt: { lte: now }, outbox: { some: { state: { in: ["PENDING", "SENDING"] } } } },
    data: { status: "DELIVERING" }
  });
  return result.count;
}
