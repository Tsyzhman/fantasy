import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runMacheteJob } from "@/providers/fotmob/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ leagueId: string }> }) {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const { leagueId } = await params;
  const result = await runMacheteJob(prisma, {
    type: "SYNC_LEAGUE_FULL",
    leagueId
  });

  return NextResponse.json(result, { status: result.job.status === "ERROR" ? 500 : 200 });
}
