import { NextResponse } from "next/server";
import { jsonError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { requireTelegramUser } from "@/server/telegram/access";
import { issueTelegramLinkChallenge, TelegramLinkError } from "@/server/telegram/link-service";
import { consumeTelegramRateLimit } from "@/server/telegram/rate-limit";

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#contracts
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiHandler(async (request: Request) => {
  const auth = await requireTelegramUser(request);
  if (auth.response) return auth.response;

  const rate = await consumeTelegramRateLimit(prisma, {
    action: "telegram:issue",
    subject: auth.user.id,
    limit: 6,
    windowMs: 60 * 1000,
    lockMs: 60 * 1000
  });
  if (!rate.allowed) {
    return jsonError("RATE_LIMITED", "Too many code requests. Try again later.", 429, { retryAfterSeconds: rate.retryAfterSeconds });
  }

  try {
    const challenge = await issueTelegramLinkChallenge(prisma, { userId: auth.user.id });
    return NextResponse.json(
      {
        code: challenge.code,
        deepLink: challenge.deepLink,
        slot: challenge.slot,
        expiresAt: challenge.expiresAt.toISOString(),
        graceExpiresAt: challenge.graceExpiresAt.toISOString()
      },
      { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } }
    );
  } catch (error) {
    if (error instanceof TelegramLinkError) return jsonError(error.code, error.message, error.status);
    throw error;
  }
});
