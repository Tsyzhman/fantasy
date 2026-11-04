/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#data
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#recovery
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#data
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import { withEnv } from "@/test-utils/env";
import { pollTelegramUpdates } from "./polling";
import { processTelegramUpdate, TELEGRAM_INBOX_LEASE_MS, TELEGRAM_INBOX_RETRY_MS, type TelegramWebhookUpdate } from "./updates";

const skip = process.env.DATABASE_URL ? false : "DATABASE_URL is required for DB integration tests.";
after(() => prisma.$disconnect());

async function fixture(run: (ids: { userId: string; botId: string; update: TelegramWebhookUpdate }) => Promise<void>) {
  const botId = randomUUID();
  const user = await prisma.user.create({ data: { email: `polling-${botId}@example.test` } });
  const telegramUserId = String(Math.floor(Math.random() * 1_000_000_000));
  const update = { update_id: 101, message: { from: { id: Number(telegramUserId) }, chat: { id: Number(telegramUserId), type: "private" }, text: "/stop" } };
  try {
    await prisma.telegramLink.create({ data: { userId: user.id, telegramUserId, chatId: telegramUserId, state: "ACTIVE", consentAt: new Date() } });
    await withEnv({ TELEGRAM_LINK_ENABLED: "true", TELEGRAM_BOT_TOKEN: `${botId}:TEST` }, () => run({ userId: user.id, botId, update }));
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.telegramInbox.deleteMany({ where: { botId } });
  }
}

test("polling replays a failed /stop from durable inbox even after the Telegram offset advances", { skip }, async () => {
  await fixture(async ({ userId, botId, update }) => {
    let failOnce = true;
    const failingDb = prisma.$extends({ query: { telegramLink: { async update({ args, query }) {
      if (failOnce) { failOnce = false; throw new Error("mock transient DB failure during /stop"); }
      return query(args);
    } } } });
    let replies = 0;
    const processUpdate = async (_db: typeof prisma, value: TelegramWebhookUpdate) => processTelegramUpdate(failingDb as unknown as typeof prisma, value, { sendMessage: async () => {
      assert.equal((await prisma.telegramInbox.findUniqueOrThrow({ where: { botId_updateId: { botId, updateId: 101n } } })).state, "PROCESSED");
      replies++;
    } });
    const offsets: number[] = [];
    const first = await pollTelegramUpdates(prisma, { processUpdate, callGetUpdates: async offset => {
      offsets.push(offset);
      return { ok: true, status: 200, result: [update] };
    } });
    assert.equal(first.processed, 0);
    assert.equal((await prisma.telegramInbox.findUniqueOrThrow({ where: { botId_updateId: { botId, updateId: 101n } } })).state, "FAILED");
    assert.equal((await prisma.telegramLink.findUniqueOrThrow({ where: { userId } })).state, "ACTIVE");
    const second = await pollTelegramUpdates(prisma, { now: new Date(Date.now() + TELEGRAM_INBOX_RETRY_MS + 1), processUpdate,
      callGetUpdates: async offset => { offsets.push(offset); return { ok: true, status: 200, result: [] }; } });
    assert.equal(second.processed, 1);
    assert.equal((await prisma.telegramLink.findUniqueOrThrow({ where: { userId } })).state, "PAUSED");
    assert.deepEqual(offsets, [1, 102]);
    assert.equal(replies, 1);
    await pollTelegramUpdates(prisma, { processUpdate, callGetUpdates: async () => ({ ok: true, status: 200, result: [] }) });
    assert.equal(replies, 1);
  });
});

for (const crash of ["before claim", "abandoned claim", "live claim"]) {
  test(`polling recovers ${crash} without competing with a live handler`, { skip }, async () => {
    await fixture(async ({ userId, botId, update }) => {
      await prisma.telegramInbox.create({ data: { botId, updateId: 101n, payload: update as object,
        state: crash === "before claim" ? "PENDING" : "PROCESSING",
        processedAt: crash === "before claim" ? null : new Date(Date.now() - (crash === "abandoned claim" ? TELEGRAM_INBOX_LEASE_MS + 1000 : 0)) } });
      let replies = 0;
      const result = await pollTelegramUpdates(prisma, { processUpdate: (db, value) => processTelegramUpdate(db, value, { sendMessage: async () => { replies++; } }),
        callGetUpdates: async offset => { assert.equal(offset, 102); return { ok: true, status: 200, result: [] }; } });
      assert.equal(result.processed, crash === "live claim" ? 0 : 1);
      assert.equal(replies, crash === "live claim" ? 0 : 1);
      assert.equal((await prisma.telegramLink.findUniqueOrThrow({ where: { userId } })).state, crash === "live claim" ? "ACTIVE" : "PAUSED");
    });
  });
}

test("an unknown service-reply send is not repeated by inbox recovery", { skip }, async () => {
  await fixture(async ({ botId, update }) => {
    let replies = 0;
    const processUpdate = (db: typeof prisma, value: TelegramWebhookUpdate) => processTelegramUpdate(db, value, { sendMessage: async () => { replies++; throw new Error("mock response lost after send"); } });
    await pollTelegramUpdates(prisma, { processUpdate, callGetUpdates: async () => ({ ok: true, status: 200, result: [update] }) });
    await pollTelegramUpdates(prisma, { now: new Date(Date.now() + TELEGRAM_INBOX_LEASE_MS + 1000), processUpdate, callGetUpdates: async () => ({ ok: true, status: 200, result: [] }) });
    assert.equal(replies, 1);
    assert.equal((await prisma.telegramInbox.findUniqueOrThrow({ where: { botId_updateId: { botId, updateId: 101n } } })).state, "PROCESSED");
  });
});

test("a failed inbox completion rolls back /stop before polling retries it", { skip }, async () => {
  await fixture(async ({ userId, update }) => {
    let failOnce = true;
    const failingDb = prisma.$extends({ query: { telegramInbox: { async updateMany({ args, query }) {
      if (failOnce && args.data.state === "PROCESSED") { failOnce = false; throw new Error("mock inbox completion failure"); }
      return query(args);
    } } } });
    let replies = 0;
    const processUpdate = (_db: typeof prisma, value: TelegramWebhookUpdate) => processTelegramUpdate(failingDb as unknown as typeof prisma, value, { sendMessage: async () => { replies++; } });
    await pollTelegramUpdates(prisma, { processUpdate, callGetUpdates: async () => ({ ok: true, status: 200, result: [update] }) });
    assert.equal((await prisma.telegramLink.findUniqueOrThrow({ where: { userId } })).state, "ACTIVE");
    assert.equal(replies, 0);
    await pollTelegramUpdates(prisma, { now: new Date(Date.now() + TELEGRAM_INBOX_RETRY_MS + 1), processUpdate, callGetUpdates: async () => ({ ok: true, status: 200, result: [] }) });
    assert.equal((await prisma.telegramLink.findUniqueOrThrow({ where: { userId } })).state, "PAUSED");
    assert.equal(replies, 1);
  });
});

for (const newer of ["/stop", "/resume"]) {
  test(`an older failed command cannot override a newer ${newer}`, { skip }, async () => {
    await fixture(async ({ userId, botId, update }) => {
      const old = { ...update, message: { ...update.message!, text: newer === "/stop" ? "/resume" : "/stop" } };
      await prisma.telegramInbox.create({ data: { botId, updateId: 101n, payload: old as object, state: "FAILED", processedAt: new Date(Date.now() - TELEGRAM_INBOX_RETRY_MS - 1000) } });
      await processTelegramUpdate(prisma, { ...update, update_id: 102, message: { ...update.message!, text: newer } }, { sendMessage: async () => undefined });
      await pollTelegramUpdates(prisma, { processUpdate: (db, value) => processTelegramUpdate(db, value, { sendMessage: async () => undefined }),
        callGetUpdates: async () => ({ ok: true, status: 200, result: [] }) });
      assert.equal((await prisma.telegramLink.findUniqueOrThrow({ where: { userId } })).state, newer === "/stop" ? "PAUSED" : "ACTIVE");
      assert.equal((await prisma.telegramInbox.findUniqueOrThrow({ where: { botId_updateId: { botId, updateId: 101n } } })).state, "PROCESSED");
    });
  });
}

for (const oldState of ["FAILED", "PROCESSING"]) {
  for (const text of ["/stop ", "\n/stop\n", "\t\u00a0\u2028/stop\ufeff\r\n"]) {
    test(`a ${oldState} resume cannot override a whitespace-normalized stop ${JSON.stringify(text)}`, { skip }, async () => {
      await fixture(async ({ userId, botId, update }) => {
        const old = { ...update, message: { ...update.message!, text: "/resume" } };
        await prisma.telegramInbox.create({ data: { botId, updateId: 101n, payload: old as object, state: oldState,
          processedAt: new Date(Date.now() - TELEGRAM_INBOX_LEASE_MS - 1000) } });
        const newer = await processTelegramUpdate(prisma, { ...update, update_id: 102, message: { ...update.message!, text } }, { sendMessage: async () => undefined });
        assert.equal(newer.status, "PROCESSED");
        assert.equal((await prisma.telegramLink.findUniqueOrThrow({ where: { userId } })).state, "PAUSED");
        let staleReplies = 0;
        await pollTelegramUpdates(prisma, { processUpdate: (db, value) => processTelegramUpdate(db, value, { sendMessage: async () => { staleReplies++; } }),
          callGetUpdates: async () => ({ ok: true, status: 200, result: [] }) });
        assert.equal((await prisma.telegramLink.findUniqueOrThrow({ where: { userId } })).state, "PAUSED");
        assert.equal(staleReplies, 0);
      });
    });
  }

  test(`a ${oldState} resume is superseded by a newer kicked event for its chat`, { skip }, async () => {
    await fixture(async ({ userId, botId, update }) => {
      const old = { ...update, message: { ...update.message!, text: "/resume" } };
      await prisma.telegramInbox.create({ data: { botId, updateId: 101n, payload: old as object, state: oldState,
        processedAt: new Date(Date.now() - TELEGRAM_INBOX_LEASE_MS - 1000) } });
      await processTelegramUpdate(prisma, { update_id: 102, my_chat_member: {
        from: { id: 999 }, chat: { ...update.message!.chat! }, new_chat_member: { status: "kicked" }
      } }, { sendMessage: async () => assert.fail("a block event has no service reply") });
      assert.equal((await prisma.telegramLink.findUniqueOrThrow({ where: { userId } })).state, "BLOCKED");
      let staleReplies = 0;
      await pollTelegramUpdates(prisma, { processUpdate: (db, value) => processTelegramUpdate(db, value, { sendMessage: async () => { staleReplies++; } }),
        callGetUpdates: async () => ({ ok: true, status: 200, result: [] }) });
      assert.equal((await prisma.telegramLink.findUniqueOrThrow({ where: { userId } })).state, "BLOCKED");
      assert.equal(staleReplies, 0);
      assert.equal((await prisma.telegramInbox.findUniqueOrThrow({ where: { botId_updateId: { botId, updateId: 101n } } })).state, "PROCESSED");
    });
  });
}

for (const text of ["/resume later", "/resume\u200b"]) {
  test(`an unrecognized command boundary does not supersede a failed stop ${JSON.stringify(text)}`, { skip }, async () => {
    await fixture(async ({ userId, botId, update }) => {
      await prisma.telegramInbox.create({ data: { botId, updateId: 101n, payload: update as object, state: "FAILED",
        processedAt: new Date(Date.now() - TELEGRAM_INBOX_RETRY_MS - 1000) } });
      await processTelegramUpdate(prisma, { ...update, update_id: 102, message: { ...update.message!, text } }, { sendMessage: async () => undefined });
      await pollTelegramUpdates(prisma, { processUpdate: (db, value) => processTelegramUpdate(db, value, { sendMessage: async () => undefined }),
        callGetUpdates: async () => ({ ok: true, status: 200, result: [] }) });
      assert.equal((await prisma.telegramLink.findUniqueOrThrow({ where: { userId } })).state, "PAUSED");
    });
  });
}
