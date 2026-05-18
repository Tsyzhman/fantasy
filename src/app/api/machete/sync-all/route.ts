import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { runMacheteJob } from "@/providers/fotmob/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await runMacheteJob(prisma, {
    type: "SYNC_ALL_LEAGUES"
  });

  return NextResponse.json(result, { status: result.job.status === "ERROR" ? 500 : 200 });
}
