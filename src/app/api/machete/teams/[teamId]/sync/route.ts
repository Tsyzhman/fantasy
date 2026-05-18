import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { runMacheteJob } from "@/providers/fotmob/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { teamId: string } }) {
  const team = await prisma.macheteTeam.findUnique({ where: { id: params.teamId } });
  const result = await runMacheteJob(prisma, {
    type: "SYNC_TEAM",
    leagueId: team?.leagueId,
    teamId: params.teamId
  });

  return NextResponse.json(result, { status: result.job.status === "ERROR" ? 500 : 200 });
}
