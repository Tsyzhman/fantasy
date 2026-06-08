import { NextResponse } from "next/server";

import { withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiHandler(async () => {
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
});
