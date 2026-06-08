import { NextResponse } from "next/server";

import { run_incremental_update } from "@/core_data/ingestion-jobs";
import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const POST = withApiHandler(async () => {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  try {
    const result = await run_incremental_update(prisma, { startedByUserId: auth.user.id });
    return NextResponse.json(result, { status: result.started ? 202 : 200 });
  } catch (error) {
    return jsonError("INGESTION_INCREMENTAL_BLOCKED", error instanceof Error ? error.message : "Incremental update failed.", 409);
  }
});
