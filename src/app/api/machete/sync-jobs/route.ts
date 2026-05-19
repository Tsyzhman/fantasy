import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

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
