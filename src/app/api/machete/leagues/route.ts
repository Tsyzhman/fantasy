import { NextResponse } from "next/server";

import { requireApiAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readJsonObject } from "@/lib/request-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (auth.response) return auth.response;

  const body = await readJsonObject(request);
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
