import { createHash, timingSafeEqual } from "node:crypto";

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
 */
export const TELEGRAM_WEBHOOK_MAX_BODY_BYTES = 128 * 1024;

export function verifyTelegramWebhookSecret(request: Request, secret: string | null): boolean {
  if (!secret) return false;
  const provided = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(secret).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

export function isTelegramJsonContentType(request: Request): boolean {
  return (request.headers.get("content-type") ?? "").toLowerCase().includes("application/json");
}

export function telegramWebhookBodyAllowed(request: Request): boolean {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > TELEGRAM_WEBHOOK_MAX_BODY_BYTES) return false;
  return true;
}
