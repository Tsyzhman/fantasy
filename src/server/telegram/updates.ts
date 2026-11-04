import { Prisma, type PrismaClient } from "@prisma/client";
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

/**
 * While PROCESSING, processedAt is the attempt/lease start. Terminal states store
 * the completion time. The existing millisecond timestamp also fences the owner
 * without requiring a schema change.
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#data
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#recovery
 */
export const TELEGRAM_INBOX_LEASE_MS = 2 * 60_000;
export const TELEGRAM_INBOX_RETRY_MS = 30_000;

function inboxTransactionClient(tx: Prisma.TransactionClient): PrismaClient {
  // Handlers already group their DB writes through $transaction. During inbox
  // processing those callbacks join the outer receipt transaction. Replies are
  // deferred, so this transaction never spans a Telegram request.
  const client = new Proxy(tx, { get(target, key, receiver) {
    if (key === "$transaction") return async (run: (value: PrismaClient) => Promise<unknown>) => run(client);
    return Reflect.get(target, key, receiver);
  } }) as unknown as PrismaClient;
  return client;
}

const LINK_STATE_COMMANDS = ["/stop", "/resume", "/unlink"];

// ECMAScript WhiteSpace + LineTerminator code points used by String.trim().
// PostgreSQL's default btrim only removes spaces; pass the complete set so the
// durable ordering predicate recognizes exactly the commands the handler does.
const COMMAND_TRIM_CHARACTERS = "\u0009\u000b\u000c\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\ufeff\u000a\u000d\u2028\u2029";

function telegramConsentSubject(update: TelegramWebhookUpdate): string | null {
  const message = update.message;
  if (message?.chat?.type === "private" && message.from?.id && !message.from.is_bot
    && LINK_STATE_COMMANDS.includes((message.text ?? "").trim())) return String(message.from.id);
  const membership = update.my_chat_member;
  if (membership?.new_chat_member?.status === "kicked" && membership.chat?.id != null) return String(membership.chat.id);
  return null;
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
  await prisma.telegramInbox.createMany({
    data: { botId, updateId: BigInt(updateId), updateType: update.message ? "message" : update.my_chat_member ? "my_chat_member" : update.callback_query ? "callback_query" : "unknown", payload: update as object },
    skipDuplicates: true
  });

  // The durable receipt can be replayed independently of the Telegram offset.
  // Compare-and-swap admits one handler, including after a crash before claim.
  const claimedAt = new Date();
  const claimed = await prisma.telegramInbox.updateMany({
    where: { botId, updateId: BigInt(updateId), OR: [
      { state: { in: ["PENDING", "FAILED"] } },
      { state: "PROCESSING", OR: [{ processedAt: { lte: new Date(claimedAt.getTime() - TELEGRAM_INBOX_LEASE_MS) } }, { processedAt: null }] }
    ] },
    data: { state: "PROCESSING", processedAt: claimedAt, lastError: null }
  });
  if (claimed.count === 0) return { status: "DUPLICATE", reply: null };
  const owner = { botId, updateId: BigInt(updateId), state: "PROCESSING", processedAt: claimedAt };
  const replies: Array<{ chatId: string; text: string }> = [];
  try {
    const result = await prisma.$transaction(async tx => {
      const inbox = await tx.telegramInbox.findUniqueOrThrow({ where: { botId_updateId: { botId, updateId: BigInt(updateId) } } });
      update = inbox.payload as unknown as TelegramWebhookUpdate;
      const consentSubject = telegramConsentSubject(update);
      if (consentSubject) await tx.$queryRaw`
        SELECT "id" FROM "telegram_links" WHERE "telegram_user_id" = ${consentSubject} FOR UPDATE
      `;
      // This no-op CAS holds the receipt row through all command effects and its
      // completion, so a crashed command cannot commit only half its DB changes.
      const owns = await tx.telegramInbox.updateMany({ where: owner, data: { lastError: null } });
      if (owns.count === 0 || Date.now() >= claimedAt.getTime() + TELEGRAM_INBOX_LEASE_MS) return null;
      const superseded = consentSubject ? await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "telegram_inbox"
        WHERE "bot_id" = ${botId} AND "update_id" > ${BigInt(updateId)} AND "state" = 'PROCESSED'
          AND (
            ("payload" #>> '{message,chat,type}' = 'private'
              AND "payload" #>> '{message,from,id}' = ${consentSubject}
              AND ("payload" #>> '{message,from,is_bot}') IS DISTINCT FROM 'true'
              AND btrim("payload" #>> '{message,text}', ${COMMAND_TRIM_CHARACTERS}) IN (${Prisma.join(LINK_STATE_COMMANDS)}))
            OR ("payload" #>> '{my_chat_member,chat,id}' = ${consentSubject}
              AND "payload" #>> '{my_chat_member,new_chat_member,status}' = 'kicked')
          )
        ORDER BY "update_id" DESC LIMIT 1
      ` : [];
      const client = inboxTransactionClient(tx);
      let handled: TelegramUpdateResult = { status: "IGNORED", reply: null };
      if (superseded.length > 0) {
        handled = { status: "PROCESSED", reply: null }; // A newer explicit choice wins over an old retry.
      } else if (update.my_chat_member?.new_chat_member?.status === "kicked" && update.my_chat_member.chat?.id != null) {
        await markTelegramBlocked(client, String(update.my_chat_member.chat.id));
        handled = { status: "PROCESSED", reply: "blocked" };
      } else if (update.message) {
        handled = await handleMessage(client, update, { ...deps, sendMessage: async (chatId, text) => { replies.push({ chatId, text }); } });
      }
      await tx.telegramInbox.updateMany({ where: owner, data: { state: "PROCESSED", processedAt: new Date(), lastError: null } });
      return handled;
    });
    if (!result) return { status: "DUPLICATE", reply: null };
    // Commit before sending: replies have no provider idempotency key either.
    // A crash here may lose a reply, but replay never sends it a second time.
    for (const response of replies) await reply(deps, response.chatId, response.text);
    if (update.message?.from?.id) {
      // Ancillary activity metadata must not turn an already handled/replied
      // command into FAILED and cause its side effects to run again.
      await prisma.telegramLink.updateMany({ where: { telegramUserId: String(update.message.from.id) }, data: { lastInboundAt: new Date() } }).catch(() => undefined);
    }
    return result;
  } catch (error) {
    await prisma.telegramInbox
      .updateMany({ where: owner, data: { state: "FAILED", processedAt: new Date(), lastError: error instanceof Error ? error.message.slice(0, 500) : "unknown" } })
      .catch(() => undefined);
    return { status: "FAILED", reply: null };
  }
}
