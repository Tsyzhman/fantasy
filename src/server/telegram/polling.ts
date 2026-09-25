import type { PrismaClient } from "@prisma/client";
import { createLogger } from "@/lib/logger";
import { telegramBotId, telegramBotToken, telegramLinkEnabled } from "./config";
import { processTelegramUpdate, type TelegramWebhookUpdate } from "./updates";
import { fetchTelegramViaRelay, telegramRelaySocketPath } from "./vpn-transport";

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#actors
 */
const POLL_INTERVAL_MS = 2_500;
const POLL_STARTUP_DELAY_MS = 15_000;
const POLL_BATCH_LIMIT = 100;
const logger = createLogger("telegram:polling");

type SchedulerState = {
  started: boolean;
  running: boolean;
  timer?: ReturnType<typeof setTimeout>;
};

const globalForScheduler = globalThis as unknown as {
  telegramPollingScheduler?: SchedulerState;
};

export function telegramPollingEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return telegramLinkEnabled(environment) && environment.TELEGRAM_POLLING_ENABLED === "true";
}

export interface TelegramPollResult {
  updates: number;
  processed: number;
  lastUpdateId: string | null;
}

export interface TelegramPollOptions {
  callGetUpdates?: (offset: number) => Promise<{ ok: boolean; result?: TelegramWebhookUpdate[]; description?: string; status: number }>;
  processUpdate?: (prisma: PrismaClient, update: TelegramWebhookUpdate) => Promise<{ status: string }>;
  maxBatches?: number;
}

async function defaultGetUpdates(offset: number): Promise<{ ok: boolean; result?: TelegramWebhookUpdate[]; description?: string; status: number }> {
  const token = telegramBotToken();
  if (!token) return { ok: false, status: 0, description: "TELEGRAM_BOT_TOKEN is not configured." };
  const body = JSON.stringify({
    offset,
    timeout: 0,
    limit: POLL_BATCH_LIMIT,
    allowed_updates: ["message", "callback_query", "my_chat_member"]
  });
  const socketPath = telegramRelaySocketPath();
  const response = socketPath
    ? await fetchTelegramViaRelay(socketPath, `/bot${token}/getUpdates`, { method: "POST", body, timeoutMs: 15_000 })
    : await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(15_000)
      });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; result?: TelegramWebhookUpdate[]; description?: string } | null;
  return { ok: payload?.ok === true, result: payload?.result ?? [], description: payload?.description, status: response.status };
}

export async function telegramPollOffset(prisma: PrismaClient): Promise<number> {
  const aggregated = await prisma.telegramInbox.aggregate({
    where: { botId: telegramBotId() },
    _max: { updateId: true }
  });
  const maximum = aggregated._max.updateId;
  if (maximum == null) return 1;
  const numeric = Number(maximum);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric + 1 : 1;
}

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#data
 */
export async function pollTelegramUpdates(
  prisma: PrismaClient,
  options: TelegramPollOptions = {}
): Promise<TelegramPollResult> {
  if (!telegramLinkEnabled()) return { updates: 0, processed: 0, lastUpdateId: null };
  const callGetUpdates = options.callGetUpdates ?? defaultGetUpdates;
  const processUpdate = options.processUpdate ?? processTelegramUpdate;
  let offset = await telegramPollOffset(prisma);
  let processed = 0;
  let updates = 0;
  let lastUpdateId: string | null = null;
  const maxBatches = options.maxBatches ?? 4;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const response = await callGetUpdates(offset);
    if (!response.ok) {
      if (response.status === 409) logger.warn("Telegram returned a webhook conflict; delete the webhook before polling.", { description: response.description });
      return { updates, processed, lastUpdateId };
    }
    const batchUpdates = response.result ?? [];
    if (batchUpdates.length === 0) break;
    for (const update of batchUpdates) {
      updates += 1;
      const updateId = update.update_id;
      if (typeof updateId === "number" && Number.isFinite(updateId)) {
        offset = updateId + 1;
        lastUpdateId = String(updateId);
      }
      const result = await processUpdate(prisma, update);
      if (result.status === "PROCESSED") processed += 1;
    }
    if (batchUpdates.length < POLL_BATCH_LIMIT) break;
  }
  return { updates, processed, lastUpdateId };
}

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
 */
export function startTelegramPollingScheduler(prismaClient?: PrismaClient) {
  if (!telegramPollingEnabled()) return;
  const state = schedulerState();
  if (state.started) return;
  state.started = true;
  scheduleNextRun(state, prismaClient, POLL_STARTUP_DELAY_MS);
}

export async function runTelegramPollingNow(prismaClient: PrismaClient, trigger: "startup" | "interval" | "manual" = "manual"): Promise<TelegramPollResult | null> {
  const state = schedulerState();
  if (state.running) return null;
  state.running = true;
  try {
    const result = await pollTelegramUpdates(prismaClient);
    if (result.updates > 0) logger.info("Processed Telegram updates.", { trigger, ...result });
    return result;
  } catch (error) {
    logger.error("Telegram polling failed.", { trigger, error });
    return null;
  } finally {
    state.running = false;
  }
}

function scheduleNextRun(state: SchedulerState, prismaClient: PrismaClient | undefined, delayMs = POLL_INTERVAL_MS) {
  state.timer = setTimeout(async () => {
    const { prisma } = prismaClient ? { prisma: prismaClient } : await import("@/lib/db");
    await runTelegramPollingNow(prisma, delayMs === POLL_STARTUP_DELAY_MS ? "startup" : "interval");
    scheduleNextRun(state, prismaClient);
  }, delayMs);
  state.timer.unref?.();
}

function schedulerState() {
  return globalForScheduler.telegramPollingScheduler ?? (globalForScheduler.telegramPollingScheduler = { started: false, running: false });
}
