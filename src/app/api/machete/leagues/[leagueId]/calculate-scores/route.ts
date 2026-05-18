import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { runMacheteJob } from "@/providers/fotmob/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { leagueId: string } }) {
  const result = await runMacheteJob(prisma, {
    type: "CALCULATE_FANTASY_SCORES",
    leagueId: params.leagueId
  });

  return NextResponse.json(result, { status: result.job.status === "ERROR" ? 500 : 200 });
}
