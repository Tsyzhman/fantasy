import { NextResponse } from "next/server";

import {
  loadSportsRuPriceSyncScopes,
  selectRequestedScopes,
  sportsRuScopeKey
} from "@/machete/fantasy-source-sync-config";
import { badRequest, jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runSportsRuFantasySyncNow } from "@/server/sports-ru-fantasy-sync-scheduler";

export const POST = withApiHandler(async (request: Request) => {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;
  const keys = await requestedKeys(request);
  try {
    const available = await loadSportsRuPriceSyncScopes(prisma);
    const selected = selectRequestedScopes(available, keys, sportsRuScopeKey);
    const result = await runSportsRuFantasySyncNow("manual", selected);
    if (!result.started) return jsonError("SPORTS_RU_SYNC_BUSY", "Sports.ru price synchronization is already running.", 409);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError("SPORTS_RU_SYNC_INVALID", error instanceof Error ? error.message : "Price synchronization failed.", 400);
  }
});

async function requestedKeys(request: Request) {
  const body = await request.json().catch(() => null) as { scopes?: unknown } | null;
  if (!Array.isArray(body?.scopes) || !body.scopes.every((value) => typeof value === "string" && value.length <= 128)) {
    throw badRequest("scopes must be an array of league scope keys.");
  }
  return body.scopes;
}
