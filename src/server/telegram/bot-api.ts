/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
 */
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
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`https://api.telegram.org/bot${input.token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: input.chatId,
      text: input.text,
      ...(input.parseMode ? { parse_mode: input.parseMode } : {}),
      disable_web_page_preview: true
    }),
    signal: AbortSignal.timeout(input.timeoutMs ?? DEFAULT_TIMEOUT_MS)
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
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`https://api.telegram.org/bot${input.token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: input.url,
      secret_token: input.secretToken,
      allowed_updates: ["message", "callback_query", "my_chat_member"]
    }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  });
  const payload = (await response.json().catch(() => null)) as TelegramApiResponse | null;
  if (!response.ok || !payload?.ok) {
    throw new TelegramApiError({
      message: payload?.description ?? `Telegram setWebhook failed with status ${response.status}`,
      status: response.status,
      retryAfterSeconds: payload?.parameters?.retry_after ?? null
    });
  }
}
