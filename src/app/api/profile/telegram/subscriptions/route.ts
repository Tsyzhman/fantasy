import { NextResponse } from "next/server";
import { jsonError, withApiHandler } from "@/lib/api-handler";
import { prisma } from "@/lib/db";
import { readJsonObject } from "@/lib/request-json";
import { requireTelegramUser } from "@/server/telegram/access";
import { replaceTelegramSubscriptions, TelegramLinkError, type TelegramSubscriptionInput } from "@/server/telegram/link-service";

/**
 * @spec spec://modules/telegram/FEAT-007-deadline-assistant#contracts
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PUT = withApiHandler(async (request: Request) => {
  const auth = await requireTelegramUser(request);
  if (auth.response) return auth.response;
  const body = await readJsonObject(request);
  const raw = Array.isArray(body.subscriptions) ? body.subscriptions : null;
  if (!raw) return jsonError("BAD_REQUEST", "subscriptions must be an array.", 400);
  if (raw.length > 50) return jsonError("BAD_REQUEST", "Too many subscriptions.", 400);
  const subscriptions: TelegramSubscriptionInput[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.contestId !== "string" || !record.contestId.trim()) continue;
    subscriptions.push({
      contestId: record.contestId.trim(),
      squadId: typeof record.squadId === "string" && record.squadId.trim() ? record.squadId.trim() : null,
      providerSquadId: typeof record.providerSquadId === "string" && record.providerSquadId.trim() ? record.providerSquadId.trim() : null,
      sourcePreference: typeof record.sourcePreference === "string" ? record.sourcePreference : undefined,
      enabled: record.enabled !== false
    });
  }
  try {
    const saved = await replaceTelegramSubscriptions(prisma, { userId: auth.user.id, subscriptions });
    return NextResponse.json({ subscriptions: saved }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof TelegramLinkError) return jsonError(error.code, error.message, error.status);
    throw error;
  }
});
