import { NextResponse } from "next/server";
import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiAdmin } from "@/lib/auth";
import { setTelegramWebhook } from "@/server/telegram/bot-api";
import { telegramBotToken, telegramLinkEnabled, telegramPublicBaseUrl, telegramWebhookSecret } from "@/server/telegram/config";

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#recovery
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiHandler(async () => {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;
  const token = telegramBotToken();
  const secret = telegramWebhookSecret();
  if (!telegramLinkEnabled() || !token || !secret) {
    return jsonError("TELEGRAM_NOT_CONFIGURED", "TELEGRAM_LINK_ENABLED, TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are required.", 503);
  }
  const url = `${telegramPublicBaseUrl()}/api/telegram/webhook`;
  await setTelegramWebhook({ token, url, secretToken: secret });
  return NextResponse.json({ ok: true, url });
});
