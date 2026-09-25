import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { requireTelegramUser } from "@/server/telegram/access";
import { createTelegramLinkSession } from "@/server/telegram/link-service";

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#contracts
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiHandler(async (request: Request) => {
  const auth = await requireTelegramUser(request);
  if (auth.response) return auth.response;
  const session = await createTelegramLinkSession(prisma, auth.user.id);
  return NextResponse.json(
    { sessionId: session.id, expiresAt: session.expiresAt.toISOString() },
    { headers: { "Cache-Control": "private, no-store" } }
  );
});
