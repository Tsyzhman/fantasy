import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiAdmin } from "@/lib/auth";
import { PROBABLE_LINEUP_SOURCE_DEFINITIONS } from "@/machete/probable-lineup-sync";
import { runProbableLineupSyncNow } from "@/server/probable-lineup-scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    source: string;
  }>;
};

export const POST = withApiHandler(async (_request: Request, { params }: Params) => {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const { source } = await params;
  const definition = PROBABLE_LINEUP_SOURCE_DEFINITIONS.find((candidate) => candidate.key === source);
  if (!definition) {
    return jsonError("PROBABLE_LINEUP_SOURCE_INVALID", "Unknown probable-lineup source.", 404);
  }

  const result = await runProbableLineupSyncNow("MANUAL", [definition.key]);
  if (!result.started) {
    return jsonError("PROBABLE_LINEUP_SYNC_BUSY", "Probable-lineup synchronization is already running.", 409);
  }
  return NextResponse.json(result);
});
