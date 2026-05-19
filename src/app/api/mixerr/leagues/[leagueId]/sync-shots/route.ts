import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runMacheteJob } from "@/providers/fotmob/jobs";

type RouteProps = {
  params: Promise<{ leagueId: string }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const { leagueId } = await params;
  const result = await runMacheteJob(prisma, {
    type: "SYNC_SHOTS",
    leagueId
  });

  if ("error" in result) {
    return NextResponse.json({ error: { code: "MIXERR_SYNC_SHOTS_FAILED", message: result.error }, job: result.job }, { status: 500 });
  }

  return NextResponse.json(result);
}
