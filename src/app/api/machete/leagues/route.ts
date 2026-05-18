import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const league = await prisma.macheteLeague.create({
    data: {
      provider: "FOTMOB",
      providerLeagueId: typeof body.providerLeagueId === "string" ? body.providerLeagueId : null,
      name: typeof body.name === "string" ? body.name : "New Machete League",
      country: typeof body.country === "string" ? body.country : null,
      season: typeof body.season === "string" ? body.season : null,
      status: "NOT_CONFIGURED"
    }
  });

  return NextResponse.json({ league });
}
