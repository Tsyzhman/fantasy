import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiAdmin } from "@/lib/auth";
import { runFplPriceSyncNow } from "@/server/fpl-price-sync-scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiHandler(async () => {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;
  if (process.env.FPL_ENABLED === "false" || process.env.FPL_PRICE_SYNC_ENABLED === "false") {
    return jsonError("FPL_PRICE_SYNC_DISABLED", "FPL price synchronization is not enabled.", 404);
  }

  const result = await runFplPriceSyncNow("MANUAL");
  if (!result.started) return jsonError("FPL_SYNC_BUSY", "FPL synchronization is already running.", 409);
  if (result.error) return jsonError("FPL_SYNC_FAILED", "FPL price synchronization failed.", 502);
  return NextResponse.json(result);
});
