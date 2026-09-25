import type { PrismaClient } from "@prisma/client";
import { telegramBotId, telegramBotToken, telegramLinkEnabled, telegramPublicBaseUrl } from "./config";
import { normalizeTelegramLinkCode } from "./crypto";
import { consumeTelegramChallenge, markTelegramBlocked, setTelegramLinkPaused, unlinkTelegram } from "./link-service";
import { consumeTelegramRateLimit } from "./rate-limit";
import { sendTelegramMessage } from "./bot-api";

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#linking
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#data
 */
export interface TelegramWebhookUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    from?: { id?: number; is_bot?: boolean; username?: string; first_name?: string };
    chat?: { id?: number; type?: string };
    text?: string;
  };
  callback_query?: {
    id?: string;
    from?: { id?: number; is_bot?: boolean; username?: string; first_name?: string };
    message?: { chat?: { id?: number; type?: string } };
    data?: string;
  };
  my_chat_member?: {
    from?: { id?: number };
    chat?: { id?: number; type?: string };
    new_chat_member?: { status?: string };
  };
}

export interface TelegramUpdateDependencies {
  sendMessage?: (chatId: string, text: string) => Promise<void>;
  now?: Date;
}

export interface TelegramUpdateResult {
  status: "PROCESSED" | "DUPLICATE" | "IGNORED" | "FAILED";
  reply: string | null;
}

function defaultSender(): (chatId: string, text: string) => Promise<void> {
  return async (chatId, text) => {
    const token = telegramBotToken();
    if (!token) return;
    await sendTelegramMessage({ token, chatId, text });
  };
}

function settingsUrl(): string {
  return `${telegramPublicBaseUrl()}/profile`;
}

async function reply(deps: TelegramUpdateDependencies, chatId: string, text: string): Promise<void> {
  const sender = deps.sendMessage ?? defaultSender();
  await sender(chatId, text).catch(() => undefined);
}

async function consumeWithLimits(
  prisma: PrismaClient,
  input: { telegramUserId: string; kind: "code" | "secret"; value: string; identity: { telegramUserId: string; chatId: string; username: string | null; firstName: string | null }; now: Date }
) {
  const minute = await consumeTelegramRateLimit(prisma, {
    action: "telegram:entry:minute",
    subject: input.telegramUserId,
    limit: 5,
    windowMs: 60 * 1000,
    lockMs: 60 * 1000
  });
  if (!minute.allowed) return { status: "RATE_LIMITED" as const, retryAfterSeconds: minute.retryAfterSeconds };
  const hour = await consumeTelegramRateLimit(prisma, {
    action: "telegram:entry:hour",
    subject: input.telegramUserId,
    limit: 20,
    windowMs: 60 * 60 * 1000,
    lockMs: 60 * 60 * 1000
  });
  if (!hour.allowed) return { status: "RATE_LIMITED" as const, retryAfterSeconds: hour.retryAfterSeconds };
  const result = await consumeTelegramChallenge(prisma, {
    kind: input.kind,
    value: input.value,
    identity: input.identity,
    now: input.now
  });
  return result;
}

const START_GREETING = [
  "👋 Привет! Я помощник Fantasy Scout: присылаю отчёт по твоему составу перед дедлайном.",
  "",
  "Чтобы подключиться:",
  "1. Открой свою страницу /profile на сайте Fantasy Scout.",
  "2. Нажми «Подключить Telegram» — появится код, он обновляется каждые 15 секунд.",
  "3. Отправь этот код сюда.",
  "",
  "Я проверю код и напишу, к какому аккаунту он подходит."
].join("\n");

const HELP_TEXT = [
  "Fantasy Scout: помощник перед дедлайном.",
  "/start — подключение и приветствие",
  "/status — состояние подписки",
  "/settings — настройки на сайте",
  "/stop — пауза",
  "/resume — возобновить",
  "/unlink — отвязать Telegram"
].join("\n");

function consumeReply(result: { status: string; accountEmail: string | null }): string {
  switch (result.status) {
    case "PENDING":
    case "PENDING_EXISTS":
      return `✅ Код подошёл: аккаунт ${result.accountEmail ?? "Fantasy Scout"}. Вернись на сайт и нажми «Подтвердить» в течение 2 минут.`;
    case "EXPIRED":
      return "❌ Код не подошёл: он истёк или уже использован. Обнови код на сайте и попробуй снова.";
    case "ALREADY_LINKED":
      return `ℹ️ Telegram уже подключён к аккаунту ${result.accountEmail ?? "Fantasy Scout"}. Открой /status.`;
    case "CONFLICT":
      return "❌ Код не подошёл: этот Telegram уже привязан к другому аккаунту Fantasy Scout. Сначала отвяжи его в настройках того аккаунта.";
    default:
      return "❌ Код не подошёл. Обнови код на сайте и попробуй снова.";
  }
}

async function handleMessage(
  prisma: PrismaClient,
  update: TelegramWebhookUpdate,
  deps: TelegramUpdateDependencies
): Promise<TelegramUpdateResult> {
  const message = update.message;
  if (!message) return { status: "IGNORED", reply: null };
  const from = message.from;
  const chat = message.chat;
  if (!from?.id || from.is_bot || !chat?.id) return { status: "IGNORED", reply: null };
  if (chat.type !== "private") {
    await reply(deps, String(chat.id), "Привязка работает только в личном чате.");
    return { status: "PROCESSED", reply: "private-only" };
  }
  const now = deps.now ?? new Date();
  const telegramUserId = String(from.id);
  const chatId = String(chat.id);
  const text = (message.text ?? "").trim();
  const identity = {
    telegramUserId,
    chatId,
    username: from.username ?? null,
    firstName: from.first_name ?? null
  };

  if (!text) return { status: "IGNORED", reply: null };

  if (text === "/help") {
    await reply(deps, chatId, HELP_TEXT);
    return { status: "PROCESSED", reply: HELP_TEXT };
  }

  if (text.startsWith("/start")) {
    const payload = text.slice("/start".length).trim();
    if (payload) {
      const kind = normalizeTelegramLinkCode(payload) ? "code" : "secret";
      const value = kind === "code" ? normalizeTelegramLinkCode(payload)! : payload;
      const result = await consumeWithLimits(prisma, { telegramUserId, kind, value, identity, now });
      const replyText = result.status === "RATE_LIMITED"
        ? `Слишком много попыток. Повтори через ${result.retryAfterSeconds} с.`
        : consumeReply(result);
      await reply(deps, chatId, replyText);
      return { status: "PROCESSED", reply: replyText };
    }
    const link = await prisma.telegramLink.findUnique({ where: { telegramUserId } });
    const replyText = link?.state === "ACTIVE"
      ? `✅ Telegram уже подключён. Открой /settings, чтобы изменить турниры, или /status для состояния.`
      : link?.state === "PAUSED"
        ? "Подписка на паузе. Отправь /resume, чтобы возобновить."
        : link?.state === "PENDING"
          ? "Подключение ожидает подтверждения на сайте. Открой /profile и нажми «Подтвердить»."
          : START_GREETING;
    await reply(deps, chatId, replyText);
    return { status: "PROCESSED", reply: replyText };
  }

  if (text === "/stop") {
    const result = await setTelegramLinkPaused(prisma, { userId: await userIdForTelegram(prisma, telegramUserId) ?? "", paused: true });
    const replyText = result.status === "PAUSED" ? "Подписка на паузе. /resume возобновит её." : "Активная привязка не найдена.";
    await reply(deps, chatId, replyText);
    return { status: "PROCESSED", reply: replyText };
  }

  if (text === "/resume") {
    const result = await setTelegramLinkPaused(prisma, { userId: await userIdForTelegram(prisma, telegramUserId) ?? "", paused: false });
    const replyText = result.status === "ACTIVE" ? "Подписка возобновлена." : "Активная привязка не найдена.";
    await reply(deps, chatId, replyText);
    return { status: "PROCESSED", reply: replyText };
  }

  if (text === "/unlink") {
    const userId = await userIdForTelegram(prisma, telegramUserId);
    if (userId) await unlinkTelegram(prisma, userId);
    const replyText = "Telegram отвязан. Отчёты больше не отправляются.";
    await reply(deps, chatId, replyText);
    return { status: "PROCESSED", reply: replyText };
  }

  if (text === "/status") {
    const link = await prisma.telegramLink.findUnique({ where: { telegramUserId }, include: { subscriptions: true } });
    const replyText = link
      ? `Состояние: ${link.state}. Турниров выбрано: ${link.subscriptions.filter((subscription) => subscription.enabled).length}.`
      : "Привязка не найдена. Откройте настройки Fantasy Scout.";
    await reply(deps, chatId, replyText);
    return { status: "PROCESSED", reply: replyText };
  }

  if (text === "/settings") {
    const replyText = `Настройки: ${settingsUrl()}`;
    await reply(deps, chatId, replyText);
    return { status: "PROCESSED", reply: replyText };
  }

  const code = normalizeTelegramLinkCode(text);
  if (code) {
    const result = await consumeWithLimits(prisma, { telegramUserId, kind: "code", value: code, identity, now });
    const replyText = result.status === "RATE_LIMITED"
      ? `Слишком много попыток. Повтори через ${result.retryAfterSeconds} с.`
      : consumeReply(result);
    await reply(deps, chatId, replyText);
    return { status: "PROCESSED", reply: replyText };
  }

  const replyText = "Неизвестная команда. Отправь /start — покажу, как подключиться, или /help.";
  await reply(deps, chatId, replyText);
  return { status: "PROCESSED", reply: replyText };
}

async function userIdForTelegram(prisma: PrismaClient, telegramUserId: string): Promise<string | null> {
  const link = await prisma.telegramLink.findUnique({ where: { telegramUserId }, select: { userId: true, state: true } });
  if (!link || link.state === "REVOKED") return null;
  return link.userId;
}

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#linking
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#data
 */
export async function processTelegramUpdate(
  prisma: PrismaClient,
  update: TelegramWebhookUpdate,
  deps: TelegramUpdateDependencies = {}
): Promise<TelegramUpdateResult> {
  if (!telegramLinkEnabled()) return { status: "IGNORED", reply: null };
  const updateId = update.update_id;
  if (updateId == null || !Number.isFinite(updateId)) return { status: "IGNORED", reply: null };
  const botId = telegramBotId();
  try {
    await prisma.telegramInbox.create({
      data: { botId, updateId: BigInt(updateId), updateType: update.message ? "message" : update.my_chat_member ? "my_chat_member" : update.callback_query ? "callback_query" : "unknown", payload: update as object }
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "P2002") {
      return { status: "DUPLICATE", reply: null };
    }
    throw error;
  }

  try {
    let result: TelegramUpdateResult = { status: "IGNORED", reply: null };
    if (update.my_chat_member?.new_chat_member?.status === "kicked" && update.my_chat_member.chat?.id != null) {
      await markTelegramBlocked(prisma, String(update.my_chat_member.chat.id));
      result = { status: "PROCESSED", reply: "blocked" };
    } else if (update.message) {
      result = await handleMessage(prisma, update, deps);
    }
    await prisma.telegramInbox.updateMany({ where: { botId, updateId: BigInt(updateId) }, data: { state: "PROCESSED", processedAt: new Date() } });
    if (update.message?.from?.id) {
      await prisma.telegramLink.updateMany({ where: { telegramUserId: String(update.message.from.id) }, data: { lastInboundAt: new Date() } });
    }
    return result;
  } catch (error) {
    await prisma.telegramInbox
      .updateMany({ where: { botId, updateId: BigInt(updateId) }, data: { state: "FAILED", processedAt: new Date(), lastError: error instanceof Error ? error.message.slice(0, 500) : "unknown" } })
      .catch(() => undefined);
    return { status: "FAILED", reply: null };
  }
}
