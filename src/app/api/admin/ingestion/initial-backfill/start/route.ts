import { NextResponse } from "next/server";

import { start_initial_backfill, type InitialBackfillMode } from "@/core_data/ingestion-jobs";
import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const result = await start_initial_backfill(prisma, {
    startedByUserId: auth.user.id,
    mode: parseInitialBackfillMode(body)
  });
  return NextResponse.json(result, { status: result.started ? 202 : 200 });
}

function parseInitialBackfillMode(body: unknown): InitialBackfillMode {
  if (body && typeof body === "object" && "mode" in body && (body as { mode?: unknown }).mode === "current_league_47") {
    return "current_league_47";
  }
  return "full";
}
