import { NextResponse } from "next/server";
import { jsonError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { readJsonObject } from "@/lib/request-json";
import { requireTelegramUser } from "@/server/telegram/access";
import { confirmTelegramLink, loadTelegramOverview, TelegramLinkError } from "@/server/telegram/link-service";
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
    action: "telegram:confirm",
    subject: auth.user.id,
    limit: 5,
    windowMs: 60 * 1000,
    lockMs: 60 * 1000
  });
  if (!rate.allowed) {
    return jsonError("RATE_LIMITED", "Too many confirmation attempts.", 429, { retryAfterSeconds: rate.retryAfterSeconds });
  }

  const body = await readJsonObject(request);
  const approve = body.approve === true;
  try {
    const result = await confirmTelegramLink(prisma, { userId: auth.user.id, approve });
    const overview = await loadTelegramOverview(prisma, auth.user.id);
    return NextResponse.json({ result: result.status, overview }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof TelegramLinkError) return jsonError(error.code, error.message, error.status);
    throw error;
  }
});
