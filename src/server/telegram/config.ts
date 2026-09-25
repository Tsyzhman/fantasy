/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#linking
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
 */
export const TELEGRAM_CODE_SLOT_MS = 15_000;
export const TELEGRAM_CODE_GRACE_MS = 15_000;
export const TELEGRAM_SESSION_TTL_MS = 10 * 60 * 1000;
export const TELEGRAM_PENDING_TTL_MS = 2 * 60 * 1000;
export const TELEGRAM_CODE_LENGTH = 12;

export function telegramLinkEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.TELEGRAM_LINK_ENABLED === "true";
}

export function telegramDeadlineEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.TELEGRAM_DEADLINE_ENABLED === "true";
}

export function telegramSendEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.TELEGRAM_SEND_ENABLED === "true";
}

export function telegramPaidBroadcastEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.TELEGRAM_PAID_BROADCAST_ENABLED === "true";
}

export function telegramBotToken(environment: NodeJS.ProcessEnv = process.env): string | null {
  const value = environment.TELEGRAM_BOT_TOKEN?.trim();
  return value ? value : null;
}

export function telegramWebhookSecret(environment: NodeJS.ProcessEnv = process.env): string | null {
  const value = environment.TELEGRAM_WEBHOOK_SECRET?.trim();
  return value ? value : null;
}

export function telegramBotUsername(environment: NodeJS.ProcessEnv = process.env): string | null {
  const value = environment.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
  return value ? value : null;
}

export function telegramBotId(environment: NodeJS.ProcessEnv = process.env): string {
  const token = telegramBotToken(environment);
  const prefix = token?.split(":", 1)[0]?.trim();
  return prefix ? prefix : "default";
}

export function telegramLinkSecret(environment: NodeJS.ProcessEnv = process.env): string | null {
  const configured = environment.TELEGRAM_LINK_SECRET?.trim();
  if (configured) return configured;
  return telegramBotToken(environment);
}

export function telegramPublicBaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  return (environment.TELEGRAM_PUBLIC_BASE_URL?.trim() || environment.NEXT_PUBLIC_APP_URL?.trim() || "https://fantasy.tsyzhman.ru").replace(/\/+$/, "");
}
