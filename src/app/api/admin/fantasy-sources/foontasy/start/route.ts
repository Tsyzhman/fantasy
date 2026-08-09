import { NextResponse } from "next/server";

import {
  foontasyScopeKey,
  loadFoontasySyncScopes,
  selectRequestedScopes
} from "@/machete/fantasy-source-sync-config";
import { foontasySyncConfigFromEnv } from "@/machete/foontasy_forecasts";
import { badRequest, jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runSelectedFoontasyForecastSyncNow } from "@/server/foontasy-forecast-scheduler";

export const POST = withApiHandler(async (request: Request) => {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;
  const keys = await requestedKeys(request);
  try {
    const available = await loadFoontasySyncScopes(prisma);
    const selected = selectRequestedScopes(available, keys, foontasyScopeKey);
    const credentials = foontasySyncConfigFromEnv();
    const result = await runSelectedFoontasyForecastSyncNow(selected.map((scope) => ({
      ...credentials,
      leagueId: scope.leagueId,
      season: scope.season,
      sourceKey: scope.sourceKey,
      sourceVariant: scope.sourceVariant,
      url: scope.url
    })));
    if (!result.started) return jsonError("FOONTASY_SYNC_BUSY", "Foontasy synchronization is already running.", 409);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError("FOONTASY_SYNC_INVALID", error instanceof Error ? error.message : "Foontasy synchronization failed.", 400);
  }
});

async function requestedKeys(request: Request) {
  const body = await request.json().catch(() => null) as { scopes?: unknown } | null;
  if (!Array.isArray(body?.scopes) || !body.scopes.every((value) => typeof value === "string" && value.length <= 128)) {
    throw badRequest("scopes must be an array of league scope keys.");
  }
  return body.scopes;
}
