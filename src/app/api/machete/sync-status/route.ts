import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { macheteLeagueDisplayName } from "@/lib/leagues/display";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const jobs = await prisma.macheteSyncJob.findMany({
    where: {
      status: {
        in: ["PENDING", "RUNNING"]
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 5,
    include: {
      league: true,
      team: true
    }
  });

  return NextResponse.json({
    running: jobs.length > 0,
    jobs: jobs.map((job) => ({
      id: job.id,
      type: job.type,
      status: job.status,
      leagueName: job.league ? macheteLeagueDisplayName(job.league) : null,
      teamName: job.team?.name ?? null,
      startedAt: job.startedAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString()
    }))
  });
}
