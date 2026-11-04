/** @spec spec://modules/telegram/INFRA-005-deadline-pipeline#data */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { prisma } from "@/lib/db";
import { withEnv } from "@/test-utils/env";
import { processTelegramUpdate } from "./updates";

const skip = process.env.DATABASE_URL ? false : "DATABASE_URL is required for DB integration tests.";
after(() => prisma.$disconnect());

test("one duplicate reclaims a FAILED inbox entry and completed updates remain deduplicated", { skip }, async () => {
  const botId = randomUUID();
  const updateId = 10;
  const update = { update_id: updateId, message: { from: { id: 42 }, chat: { id: 42, type: "private" }, text: "/help" } };
  await withEnv({ TELEGRAM_LINK_ENABLED: "true", TELEGRAM_BOT_TOKEN: `${botId}:TEST` }, async () => {
    try {
      await prisma.telegramInbox.create({ data: { botId, updateId: BigInt(updateId), payload: update, state: "FAILED", lastError: "mock DB failure" } });
      let replies = 0;
      const outcomes = await Promise.all(Array.from({ length: 8 }, () => processTelegramUpdate(prisma, update, { sendMessage: async () => { replies++; } })));
      assert.equal(outcomes.filter(result => result.status === "PROCESSED").length, 1);
      assert.equal(outcomes.filter(result => result.status === "DUPLICATE").length, 7);
      assert.equal(replies, 1);
      const row = await prisma.telegramInbox.findUniqueOrThrow({ where: { botId_updateId: { botId, updateId: BigInt(updateId) } } });
      assert.equal(row.state, "PROCESSED");
      assert.equal(row.lastError, null);
      assert.equal((await processTelegramUpdate(prisma, update, { sendMessage: async () => { replies++; } })).status, "DUPLICATE");
      assert.equal(replies, 1);
    } finally { await prisma.telegramInbox.deleteMany({ where: { botId } }); }
  });
});
