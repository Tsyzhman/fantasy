import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { sendTelegramMessage, TelegramApiError } from "@/server/telegram/bot-api";
import { telegramBotToken } from "@/server/telegram/config";
import { markTelegramBlocked } from "@/server/telegram/link-service";
import { DEADLINE_DEFAULT_BATCH, DEADLINE_EXPIRY_MARGIN_MS, DEADLINE_MAX_BATCH, deadlineSendEnabled } from "./config";

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
  } = {}
): Promise<DeliveryTickResult> {
  const result: DeliveryTickResult = { skipped: false, claimed: 0, sent: 0, failed: 0, blocked: 0, expired: 0, unknown: 0, cancelled: 0 };
  if (!deadlineSendEnabled()) return { ...result, skipped: true };
  const now = options.now ?? new Date();
  const token = telegramBotToken();
  const sender = options.sendMessage ?? (token ? (chatId: string, text: string) => sendTelegramMessage({ token, chatId, text, parseMode: "HTML", fetchImpl: options.fetchImpl }) : null);
  if (!sender) return { ...result, skipped: true };
  const batch = Math.max(1, Math.min(options.maxBatch ?? DEADLINE_DEFAULT_BATCH, DEADLINE_MAX_BATCH));
  const leaseToken = randomUUID();
  const leaseUntil = new Date(now.getTime() + 2 * 60 * 1000);
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
    const campaign = await prisma.deadlineCampaign.findUnique({ where: { id: row.campaignId }, select: { deadlineAt: true, status: true } });
    const link = await prisma.telegramLink.findUnique({ where: { userId: row.userId }, select: { chatId: true, state: true, linkVersion: true, telegramUserId: true } });
    const release = async (data: Prisma.TelegramOutboxUpdateManyMutationInput) => {
      await prisma.telegramOutbox.updateMany({ where: { id: row.id, leaseToken, state: "SENDING" }, data });
    };
    if (!campaign || !link || link.state !== "ACTIVE" || link.linkVersion !== row.linkVersion) {
      await release({ state: "CANCELLED", leaseToken: null, leaseUntil: null });
      result.cancelled += 1;
      continue;
    }
    if (campaign.deadlineAt && now.getTime() > campaign.deadlineAt.getTime() - DEADLINE_EXPIRY_MARGIN_MS) {
      await release({ state: "EXPIRED", leaseToken: null, leaseUntil: null });
      result.expired += 1;
      continue;
    }
    const last = lastSendByChat.get(link.chatId) ?? 0;
    const waitMs = last + DELIVERY_PER_CHAT_MIN_INTERVAL_MS - Date.now();
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    try {
      const sent = await sender(link.chatId, row.text);
      lastSendByChat.set(link.chatId, Date.now());
      await release({ state: "SENT", telegramMessageId: sent.messageId || null, sentAt: new Date(), leaseToken: null, leaseUntil: null, lastError: null });
      result.sent += 1;
    } catch (error) {
      lastSendByChat.set(link.chatId, Date.now());
      if (error instanceof TelegramApiError) {
        if (error.blocked) {
          await release({ state: "BLOCKED", leaseToken: null, leaseUntil: null, lastError: error.message.slice(0, 300) });
          await markTelegramBlocked(prisma, link.telegramUserId);
          result.blocked += 1;
        } else if (error.status === 429) {
          await release({
            state: "PENDING",
            leaseToken: null,
            leaseUntil: null,
            nextAttemptAt: new Date(Date.now() + (error.retryAfterSeconds ?? 5) * 1000),
            lastError: error.message.slice(0, 300)
          });
          result.failed += 1;
        } else if (error.permanent) {
          await release({ state: "FAILED", leaseToken: null, leaseUntil: null, lastError: error.message.slice(0, 300) });
          result.failed += 1;
        } else {
          await release({
            state: "PENDING",
            leaseToken: null,
            leaseUntil: null,
            attempts: row.attempts + 1,
            nextAttemptAt: new Date(Date.now() + backoffMs(row.attempts + 1)),
            lastError: error.message.slice(0, 300)
          });
          result.failed += 1;
        }
      } else {
        await release({
          state: "DELIVERY_UNKNOWN",
          leaseToken: null,
          leaseUntil: null,
          attempts: row.attempts + 1,
          lastError: error instanceof Error ? error.message.slice(0, 300) : "unknown transport error"
        });
        result.unknown += 1;
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
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
 */
export async function expireOverdueOutbox(prisma: PrismaClient, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() + DEADLINE_EXPIRY_MARGIN_MS);
  const result = await prisma.telegramOutbox.updateMany({
    where: { state: { in: ["PENDING", "SENDING"] }, campaign: { deadlineAt: { lt: cutoff } } },
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
