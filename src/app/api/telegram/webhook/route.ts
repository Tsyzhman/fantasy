import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { telegramLinkEnabled, telegramWebhookSecret } from "@/server/telegram/config";
import { processTelegramUpdate, type TelegramWebhookUpdate } from "@/server/telegram/updates";
import { isTelegramJsonContentType, TELEGRAM_WEBHOOK_MAX_BODY_BYTES, telegramWebhookBodyAllowed, verifyTelegramWebhookSecret } from "@/server/telegram/webhook";

/**
 * @spec spec://modules/telegram/INFRA-005-deadline-pipeline#delivery
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#contracts
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!telegramLinkEnabled()) return NextResponse.json({ ok: false }, { status: 404 });
  const secret = telegramWebhookSecret();
  if (!secret) return NextResponse.json({ ok: false }, { status: 503 });
  if (!verifyTelegramWebhookSecret(request, secret)) return NextResponse.json({ ok: false }, { status: 403 });
  if (!isTelegramJsonContentType(request)) return NextResponse.json({ ok: false }, { status: 415 });
  if (!telegramWebhookBodyAllowed(request)) return NextResponse.json({ ok: false }, { status: 413 });

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > TELEGRAM_WEBHOOK_MAX_BODY_BYTES) return NextResponse.json({ ok: false }, { status: 413 });
  let update: TelegramWebhookUpdate;
  try {
    update = JSON.parse(raw) as TelegramWebhookUpdate;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const result = await processTelegramUpdate(prisma, update);
  return NextResponse.json({ ok: true, status: result.status });
}
