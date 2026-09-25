import { NextResponse } from "next/server";
import { jsonError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { readJsonObject } from "@/lib/request-json";
import { requireTelegramUser } from "@/server/telegram/access";
import { loadTelegramOverview, setTelegramLinkPaused, unlinkTelegram } from "@/server/telegram/link-service";

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#contracts
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiHandler(async (request: Request) => {
  const auth = await requireTelegramUser(request);
  if (auth.response) return auth.response;
  const overview = await loadTelegramOverview(prisma, auth.user.id);
  return NextResponse.json(overview, { headers: { "Cache-Control": "private, no-store" } });
});

export const PATCH = withApiHandler(async (request: Request) => {
  const auth = await requireTelegramUser(request);
  if (auth.response) return auth.response;
  const body = await readJsonObject(request);
  if (typeof body.paused !== "boolean") return jsonError("BAD_REQUEST", "paused must be a boolean.", 400);
  const result = await setTelegramLinkPaused(prisma, { userId: auth.user.id, paused: body.paused });
  const overview = await loadTelegramOverview(prisma, auth.user.id);
  return NextResponse.json({ result: result.status, overview }, { headers: { "Cache-Control": "private, no-store" } });
});

export const DELETE = withApiHandler(async (request: Request) => {
  const auth = await requireTelegramUser(request);
  if (auth.response) return auth.response;
  await unlinkTelegram(prisma, auth.user.id);
  const overview = await loadTelegramOverview(prisma, auth.user.id);
  return NextResponse.json(overview, { headers: { "Cache-Control": "private, no-store" } });
});
