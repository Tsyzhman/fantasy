import { NextResponse } from "next/server";

import { run_incremental_update } from "@/core_data/ingestion-jobs";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!expectedSecret || authorization !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Cron access is not allowed." } }, { status: 403 });
  }

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

