import { apiError } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { telegramLinkEnabled } from "./config";

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#linking
 */
export function requireTelegramEnabled(): void {
  if (!telegramLinkEnabled()) throw apiError("NOT_FOUND", "Telegram linking is disabled.", 404);
}

export async function requireTelegramUser(request: Request) {
  requireTelegramEnabled();
  const auth = await requireApiUser(request);
  if (auth.response) return auth;
  if (!["GET", "HEAD"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const expectedHost = request.headers.get("host") ?? new URL(request.url).host;
    let sameHost = false;
    try {
      sameHost = Boolean(origin && ["http:", "https:"].includes(new URL(origin).protocol) && new URL(origin).host === expectedHost);
    } catch {
      sameHost = false;
    }
    if (!sameHost) throw apiError("FORBIDDEN", "Требуется same-origin запрос", 403);
    if (!["GET", "HEAD", "DELETE"].includes(request.method)) {
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) throw apiError("UNSUPPORTED_MEDIA_TYPE", "Ожидается JSON.", 415);
    }
  }
  return auth;
}
