/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
 */
import { fetchTelegramViaRelay, telegramRelaySocketPath } from "./vpn-transport";

export class TelegramApiError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number | null;
  readonly blocked: boolean;
  readonly permanent: boolean;

  constructor(input: { message: string; status: number; retryAfterSeconds?: number | null; blocked?: boolean; permanent?: boolean }) {
    super(input.message);
    this.name = "TelegramApiError";
    this.status = input.status;
    this.retryAfterSeconds = input.retryAfterSeconds ?? null;
    this.blocked = input.blocked ?? false;
    this.permanent = input.permanent ?? false;
  }
}

interface TelegramApiResponse {
  ok: boolean;
  result?: { message_id?: number };
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number; migrate_to_chat_id?: number };
}

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
 */
async function callTelegramApi(input: {
  token: string;
  method: "sendMessage" | "setWebhook";
  payload: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<TelegramApiResponse> {
  const methodPath = `/bot${input.token}/${input.method}`;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const relaySocketPath = telegramRelaySocketPath();
  if (!input.fetchImpl && relaySocketPath) {
    const response = await fetchTelegramViaRelay(relaySocketPath, methodPath, {
      method: "POST",
      body: JSON.stringify(input.payload),
      timeoutMs
    });
    const payload = (await response.json().catch(() => null)) as TelegramApiResponse | null;
    if (!response.ok || !payload?.ok) {
      throw new TelegramApiError({
        message: payload?.description ?? `Telegram relay returned status ${response.status}`,
        status: response.status,
        retryAfterSeconds: payload?.parameters?.retry_after ?? null,
        blocked: isBlockedDescription(payload?.description ?? "", response.status),
        permanent: response.status === 400
      });
    }
    return payload;
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`https://api.telegram.org${methodPath}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input.payload),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const payload = (await response.json().catch(() => null)) as TelegramApiResponse | null;
  if (!response.ok || !payload?.ok) {
    const description = payload?.description ?? `Telegram request failed with status ${response.status}`;
    throw new TelegramApiError({
      message: description,
      status: response.status,
      retryAfterSeconds: payload?.parameters?.retry_after ?? null,
      blocked: isBlockedDescription(description, response.status),
      permanent: response.status === 400
    });
  }
  return payload;
}

export interface SendTelegramMessageInput {
  token: string;
  chatId: string;
  text: string;
  parseMode?: "HTML";
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface SendTelegramMessageResult {
  messageId: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;

function isBlockedDescription(description: string, status: number): boolean {
  return status === 403 || /blocked|deactivated|user is deactivated|chat not found/i.test(description);
}

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
 */
export async function sendTelegramMessage(input: SendTelegramMessageInput): Promise<SendTelegramMessageResult> {
  const payload = await callTelegramApi({
    token: input.token,
    method: "sendMessage",
    payload: {
      chat_id: input.chatId,
      text: input.text,
      ...(input.parseMode ? { parse_mode: input.parseMode } : {}),
      disable_web_page_preview: true
    },
    fetchImpl: input.fetchImpl,
    timeoutMs: input.timeoutMs
  });
  const messageId = payload.result?.message_id;
  return { messageId: messageId == null ? "" : String(messageId) };
}

export interface SetTelegramWebhookInput {
  token: string;
  url: string;
  secretToken: string;
  fetchImpl?: typeof fetch;
}

export async function setTelegramWebhook(input: SetTelegramWebhookInput): Promise<void> {
  await callTelegramApi({
    token: input.token,
    method: "setWebhook",
    payload: {
      url: input.url,
      secret_token: input.secretToken,
      allowed_updates: ["message", "callback_query", "my_chat_member"]
    },
    fetchImpl: input.fetchImpl
  });
}
