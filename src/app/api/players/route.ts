import { ImportStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const where: Prisma.PlayerSnapshotWhereInput = {
    teamImport: {
      status: ImportStatus.PUBLISHED,
      isCurrentPublished: true
    }
  };

  const leagueId = params.get("leagueId");
  const teamId = params.get("teamId");
  const positionGroup = params.get("positionGroup");
  const starterOnly = params.get("starterOnly");
  const minMinutes = Number(params.get("minMinutes") ?? "");

  if (leagueId) where.leagueId = leagueId;
  if (teamId) where.teamId = teamId;
  if (positionGroup) where.positionGroup = positionGroup;
  if (starterOnly === "1") where.isStarter = true;
  if (Number.isFinite(minMinutes)) where.minutesPlayed = { gte: minMinutes };

  const sort = params.get("sort") ?? "fantasyScore";
  const orderBy: Prisma.PlayerSnapshotOrderByWithRelationInput =
    sort === "valueScore" ? { valueScore: { sort: "desc", nulls: "last" } } : { fantasyScore: { sort: "desc", nulls: "last" } };

  const players = await prisma.playerSnapshot.findMany({
    where,
    orderBy,
    take: 250,
    include: {
      team: true,
      league: true
    }
  });

  return NextResponse.json({ players });
}
