/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#recovery
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import { withEnv } from "@/test-utils/env";
import { setTelegramLinkPaused, unlinkTelegram } from "@/server/telegram/link-service";
import { expireOverdueOutbox, runDeadlineDeliveryTick } from "./delivery";
import { runDeadlineTick } from "./scheduler";

const skip = process.env.DATABASE_URL ? false : "DATABASE_URL is required for DB integration tests.";
const now = new Date("2026-11-04T06:00:00Z");
const enabled = { TELEGRAM_DEADLINE_ENABLED: "true", TELEGRAM_SEND_ENABLED: "true" };
after(() => prisma.$disconnect());

async function fixture(run: (ids: { userId: string; campaignId: string; outboxId: string; linkId: string }) => Promise<void>) {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { email: `delivery-${suffix}@example.test` } });
  const campaign = await prisma.deadlineCampaign.create({ data: {
    contestId: `delivery-${suffix}`, season: "test", providerRoundId: "1", status: "BUILT",
    deadlineAt: new Date(now.getTime() + 60 * 60_000)
  } });
  try {
    const link = await prisma.telegramLink.create({ data: { userId: user.id, telegramUserId: suffix, chatId: suffix, state: "ACTIVE", consentAt: now } });
    await prisma.telegramSubscription.create({ data: { userId: user.id, linkId: link.id, contestId: campaign.contestId, leagueId: 1n, season: "test" } });
    const outbox = await prisma.telegramOutbox.create({ data: { userId: user.id, campaignId: campaign.id, nextAttemptAt: now, text: "mock report" } });
    await withEnv(enabled, () => run({ userId: user.id, campaignId: campaign.id, outboxId: outbox.id, linkId: link.id }));
  } finally {
    await prisma.deadlineCampaign.delete({ where: { id: campaign.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

test("active delivery is sent once and stores the Telegram message id", { skip }, async () => {
  await fixture(async ({ outboxId }) => {
    let sends = 0;
    const sendMessage = async () => { sends++; return { messageId: "mock-message" }; };
    assert.equal((await runDeadlineDeliveryTick(prisma, { now, sendMessage })).sent, 1);
    assert.equal((await runDeadlineDeliveryTick(prisma, { now, sendMessage })).sent, 0);
    assert.equal(sends, 1);
    const row = await prisma.telegramOutbox.findUniqueOrThrow({ where: { id: outboxId } });
    assert.equal(row.state, "SENT");
    assert.equal(row.telegramMessageId, "mock-message");
  });
});

for (const status of ["CANCELLED", "BLOCKED"]) {
  test(`${status} campaigns never send pending reports`, { skip }, async () => {
    await fixture(async ({ campaignId, outboxId }) => {
      await prisma.deadlineCampaign.update({ where: { id: campaignId }, data: { status } });
      let sends = 0;
      await runDeadlineDeliveryTick(prisma, { now, sendMessage: async () => { sends++; return { messageId: "unexpected" }; } });
      assert.equal(sends, 0);
      assert.equal((await prisma.telegramOutbox.findUniqueOrThrow({ where: { id: outboxId } })).state, "CANCELLED");
    });
  });
}

for (const revoked of ["deleted", "disabled"]) {
  test(`${revoked} current subscription prevents delivery`, { skip }, async () => {
    await fixture(async ({ userId, outboxId }) => {
      if (revoked === "deleted") await prisma.telegramSubscription.deleteMany({ where: { userId } });
      else await prisma.telegramSubscription.updateMany({ where: { userId }, data: { enabled: false } });
      let sends = 0;
      await runDeadlineDeliveryTick(prisma, { now, sendMessage: async () => { sends++; return { messageId: "unexpected" }; } });
      assert.equal(sends, 0);
      assert.equal((await prisma.telegramOutbox.findUniqueOrThrow({ where: { id: outboxId } })).state, "CANCELLED");
    });
  });
}

test("pause cancels pending outbox and resume does not revive it", { skip }, async () => {
  await fixture(async ({ userId, outboxId }) => {
    await setTelegramLinkPaused(prisma, { userId, paused: true });
    assert.equal((await prisma.telegramOutbox.findUniqueOrThrow({ where: { id: outboxId } })).state, "CANCELLED");
    await setTelegramLinkPaused(prisma, { userId, paused: false });
    let sends = 0;
    await runDeadlineDeliveryTick(prisma, { now, sendMessage: async () => { sends++; return { messageId: "unexpected" }; } });
    assert.equal(sends, 0);
  });
});

test("unlink cancels pending outbox", { skip }, async () => {
  await fixture(async ({ userId, outboxId }) => {
    await unlinkTelegram(prisma, userId);
    assert.equal((await prisma.telegramOutbox.findUniqueOrThrow({ where: { id: outboxId } })).state, "CANCELLED");
  });
});

test("an abandoned SENDING lease becomes unknown before the deadline and never resends", { skip }, async () => {
  await fixture(async ({ outboxId }) => {
    await prisma.telegramOutbox.update({ where: { id: outboxId }, data: { state: "SENDING", leaseToken: "abandoned", leaseUntil: new Date(now.getTime() - 1) } });
    let sends = 0;
    await runDeadlineDeliveryTick(prisma, { now, sendMessage: async () => { sends++; return { messageId: "unexpected" }; } });
    assert.equal((await prisma.telegramOutbox.findUniqueOrThrow({ where: { id: outboxId } })).state, "DELIVERY_UNKNOWN");
    await expireOverdueOutbox(prisma, new Date(now.getTime() + 2 * 60 * 60_000));
    assert.equal((await prisma.telegramOutbox.findUniqueOrThrow({ where: { id: outboxId } })).state, "DELIVERY_UNKNOWN");
    assert.equal(sends, 0);
  });
});

test("expiry preserves a live SENDING lease and does not pretend an in-flight request was unsent", { skip }, async () => {
  await fixture(async ({ campaignId, outboxId }) => {
    await prisma.deadlineCampaign.update({ where: { id: campaignId }, data: { deadlineAt: now } });
    await prisma.telegramOutbox.update({ where: { id: outboxId }, data: { state: "SENDING", leaseToken: "live", leaseUntil: new Date(now.getTime() + 60_000) } });
    assert.equal(await expireOverdueOutbox(prisma, now), 0);
    assert.equal((await prisma.telegramOutbox.findUniqueOrThrow({ where: { id: outboxId } })).state, "SENDING");
    await expireOverdueOutbox(prisma, new Date(now.getTime() + 60_001));
    assert.equal((await prisma.telegramOutbox.findUniqueOrThrow({ where: { id: outboxId } })).state, "DELIVERY_UNKNOWN");
  });
});

test("a transport timeout is unknown and is never automatically resent", { skip }, async () => {
  await fixture(async ({ outboxId }) => {
    let sends = 0;
    const sendMessage = async (): Promise<{ messageId: string }> => { sends++; throw new Error("mock timeout after sending"); };
    assert.equal((await runDeadlineDeliveryTick(prisma, { now, sendMessage })).unknown, 1);
    await runDeadlineDeliveryTick(prisma, { now, sendMessage });
    assert.equal((await prisma.telegramOutbox.findUniqueOrThrow({ where: { id: outboxId } })).state, "DELIVERY_UNKNOWN");
    assert.equal(sends, 1);
  });
});

for (const offset of [-1, 0, 1]) {
  test(`delivery cutoff boundary at deadline minus five minutes (${offset}ms)`, { skip }, async () => {
    await fixture(async ({ campaignId, outboxId }) => {
      await prisma.deadlineCampaign.update({ where: { id: campaignId }, data: { deadlineAt: new Date(now.getTime() + 5 * 60_000 + offset) } });
      let sends = 0;
      await runDeadlineDeliveryTick(prisma, { clock: () => now, sendMessage: async () => { sends++; return { messageId: "boundary" }; } });
      assert.equal(sends, offset < 0 ? 0 : 1);
      assert.equal((await prisma.telegramOutbox.findUniqueOrThrow({ where: { id: outboxId } })).state, offset < 0 ? "EXPIRED" : "SENT");
    });
  });
}

test("each part rechecks consent after pacing; pause during the first send cancels the next", { skip }, async () => {
  await fixture(async ({ userId, campaignId }) => {
    await prisma.telegramOutbox.create({ data: { userId, campaignId, partNumber: 2, nextAttemptAt: now, text: "second mock part" } });
    let sends = 0;
    const result = await runDeadlineDeliveryTick(prisma, { now, sendMessage: async () => {
      sends++;
      await setTelegramLinkPaused(prisma, { userId, paused: true });
      return { messageId: "first" };
    } });
    assert.equal(sends, 1);
    assert.equal(result.sent, 1);
    assert.equal(result.cancelled, 1);
    assert.equal(await prisma.telegramOutbox.count({ where: { campaignId, state: "CANCELLED" } }), 1);
  });
});

test("each part checks the current deadline rather than the start time of the batch", { skip }, async () => {
  await fixture(async ({ userId, campaignId }) => {
    await prisma.telegramOutbox.create({ data: { userId, campaignId, partNumber: 2, nextAttemptAt: now, text: "second mock part" } });
    let current = now;
    let sends = 0;
    const result = await runDeadlineDeliveryTick(prisma, { clock: () => current, sendMessage: async () => {
      sends++;
      current = new Date(now.getTime() + 56 * 60_000);
      return { messageId: "first" };
    } });
    assert.equal(sends, 1);
    assert.equal(result.expired, 1);
  });
});

for (const delayed of ["subscription read", "authorization query"]) {
  test(`a delayed ${delayed} cannot send after the cutoff`, { skip }, async () => {
    await fixture(async ({ campaignId, outboxId }) => {
      await prisma.deadlineCampaign.update({ where: { id: campaignId }, data: { deadlineAt: new Date(now.getTime() + 5 * 60_000 + 1000) } });
      let current = now;
      const slowDb = prisma.$extends({ query: {
        telegramSubscription: { async findUnique({ args, query }) {
          const row = await query(args);
          if (delayed === "subscription read") current = new Date(now.getTime() + 2000);
          return row;
        } },
        telegramOutbox: { async updateMany({ args, query }) {
          const result = await query(args);
          if (delayed === "authorization query" && args.where?.leaseUntil) current = new Date(now.getTime() + 2000);
          return result;
        } }
      } });
      let sends = 0;
      const result = await runDeadlineDeliveryTick(slowDb as unknown as typeof prisma, { clock: () => current, sendMessage: async () => { sends++; return { messageId: "unexpected" }; } });
      assert.equal(sends, 0);
      assert.equal(result.expired, 1);
      assert.equal((await prisma.telegramOutbox.findUniqueOrThrow({ where: { id: outboxId } })).state, "EXPIRED");
    });
  });
}

test("a scheduler tick carries elapsed stage time through to delivery", { skip }, async () => {
  await fixture(async ({ campaignId, outboxId }) => {
    await prisma.deadlineCampaign.update({ where: { id: campaignId }, data: { deadlineAt: new Date(now.getTime() + 6 * 60_000) } });
    let current = now;
    let stageWaited = false;
    const slowStages = prisma.$extends({ query: { async $queryRaw({ args, query }) {
      const rows = await query(args);
      if (!stageWaited) {
        stageWaited = true;
        current = new Date(now.getTime() + 2 * 60_000);
      }
      return rows;
    } } });
    let sends = 0;
    const result = await runDeadlineTick(slowStages as unknown as typeof prisma, { clock: () => current, send: true,
      sendMessage: async () => { sends++; return { messageId: "unexpected" }; } });
    assert.equal(stageWaited, true);
    assert.equal(sends, 0);
    assert.equal(result.expired, 1);
    assert.equal((await prisma.telegramOutbox.findUniqueOrThrow({ where: { id: outboxId } })).state, "EXPIRED");
  });
});
