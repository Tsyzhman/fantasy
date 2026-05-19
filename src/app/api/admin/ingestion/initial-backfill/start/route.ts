import { NextResponse } from "next/server";

import { start_initial_backfill } from "@/core_data/ingestion-jobs";
import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST() {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;
  if (!auth.user) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in to continue." } }, { status: 401 });

  const result = await start_initial_backfill(prisma, { startedByUserId: auth.user.id });
  return NextResponse.json(result, { status: result.started ? 202 : 200 });
}

