import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { withEnv } from "@/test-utils/env";
import { pollTelegramUpdates, telegramPollOffset } from "./polling";
import type { TelegramWebhookUpdate } from "./updates";

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
 */
function fakePrisma(maxUpdateId: bigint | null): PrismaClient {
  return {
    telegramInbox: {
      aggregate: async () => ({ _max: { updateId: maxUpdateId } })
    }
  } as unknown as PrismaClient;
}

test("poll offset starts at one for an empty inbox and continues after the maximum", async () => {
  assert.equal(await telegramPollOffset(fakePrisma(null)), 1);
  assert.equal(await telegramPollOffset(fakePrisma(9n)), 10);
});

test("polling processes a batch once and advances the offset", async () => {
  await withEnv({ TELEGRAM_LINK_ENABLED: "true" }, async () => {
    const offsets: number[] = [];
    const processed: number[] = [];
    const fullBatch: TelegramWebhookUpdate[] = Array.from({ length: 100 }, (_, index) => ({
      update_id: index + 1,
      message: { from: { id: 1 }, chat: { id: 1, type: "private" }, text: "/start" }
    }));
    const result = await pollTelegramUpdates(fakePrisma(null), {
      callGetUpdates: async (offset) => {
        offsets.push(offset);
        return { ok: true, status: 200, result: offset === 1 ? fullBatch : [] };
      },
      processUpdate: async (_prisma, update) => {
        processed.push(update.update_id ?? -1);
        return { status: "PROCESSED" };
      }
    });
    assert.deepEqual(offsets, [1, 101]);
    assert.equal(processed.length, 100);
    assert.equal(result.updates, 100);
    assert.equal(result.processed, 100);
    assert.equal(result.lastUpdateId, "100");
  });
});

test("polling resumes after the stored inbox maximum and does not replay old updates", async () => {
  await withEnv({ TELEGRAM_LINK_ENABLED: "true" }, async () => {
    const offsets: number[] = [];
    const processed: number[] = [];
    const result = await pollTelegramUpdates(fakePrisma(9n), {
      callGetUpdates: async (offset) => {
        offsets.push(offset);
        return { ok: true, status: 200, result: offset === 10 ? [{ update_id: 10 }] : [] };
      },
      processUpdate: async (_prisma, update) => {
        processed.push(update.update_id ?? -1);
        return { status: "PROCESSED" };
      }
    });
    assert.deepEqual(offsets, [10]);
    assert.deepEqual(processed, [10]);
    assert.equal(result.lastUpdateId, "10");
  });
});

test("a webhook conflict stops polling instead of retrying blindly", async () => {
  await withEnv({ TELEGRAM_LINK_ENABLED: "true" }, async () => {
    const result = await pollTelegramUpdates(fakePrisma(null), {
      callGetUpdates: async () => ({ ok: false, status: 409, description: "Conflict: can't use getUpdates method while webhook is active" }),
      processUpdate: async () => ({ status: "PROCESSED" })
    });
    assert.equal(result.updates, 0);
  });
});
