import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = await prisma.macheteSyncJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      league: true,
      team: true
    }
  });

  return NextResponse.json({ jobs });
}
