import { NextResponse } from "next/server";

import { run_incremental_update } from "@/core_data/ingestion-jobs";
import { requireCronAccess } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const cronAccessResponse = requireCronAccess(request);
  if (cronAccessResponse) return cronAccessResponse;

  try {
    const result = await run_incremental_update(prisma, { startedByUserId: null });
    return NextResponse.json(
      {
        ...result,
        schedule: "03:00 Europe/Moscow",
        mode: "incremental_update"
      },
      { status: result.started ? 202 : 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: { code: "CRON_INGESTION_FAILED", message: error instanceof Error ? error.message : "Cron ingestion failed." } },
      { status: 409 }
    );
  }
}
