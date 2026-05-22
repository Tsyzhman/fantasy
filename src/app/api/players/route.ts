import { ImportStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const playerSnapshotSortColumns = {
  playerName: { field: "playerName", defaultDirection: "asc", nullable: false },
  teamName: { field: "teamName", defaultDirection: "asc", nullable: false },
  positionGroup: { field: "positionGroup", defaultDirection: "asc", nullable: true },
  isStarter: { field: "isStarter", defaultDirection: "desc", nullable: false },
  age: { field: "age", defaultDirection: "desc", nullable: true },
  minutesPlayed: { field: "minutesPlayed", defaultDirection: "desc", nullable: true },
  goals: { field: "goals", defaultDirection: "desc", nullable: true },
  xg: { field: "xg", defaultDirection: "desc", nullable: true },
  assists: { field: "assists", defaultDirection: "desc", nullable: true },
  xa: { field: "xa", defaultDirection: "desc", nullable: true },
  marketValue: { field: "marketValue", defaultDirection: "desc", nullable: true },
  fantasyScore: { field: "fantasyScore", defaultDirection: "desc", nullable: true },
  scoringScore: { field: "scoringScore", defaultDirection: "desc", nullable: true },
  alternativeScore: { field: "alternativeScore", defaultDirection: "desc", nullable: true },
  valueScore: { field: "valueScore", defaultDirection: "desc", nullable: true }
} as const;

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

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
  const starterFilter = params.get("starterFilter");
  const starterOnly = params.get("starterOnly");
  const minMinutes = Number(params.get("minMinutes") ?? "");

  if (leagueId) where.leagueId = leagueId;
  if (teamId) where.teamId = teamId;
  if (positionGroup) where.positionGroup = positionGroup;
  if (starterFilter === "starter" || starterOnly === "1") where.isStarter = true;
  if (starterFilter === "bench") where.isStarter = false;
  if (Number.isFinite(minMinutes)) where.minutesPlayed = { gte: minMinutes };

  const sort = params.get("sort") ?? "fantasyScore";
  const orderBy = playerSnapshotOrderBy(sort);

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

function playerSnapshotOrderBy(sortValue: string): Prisma.PlayerSnapshotOrderByWithRelationInput[] {
  const [rawKey, rawDirection] = sortValue.split(":");
  const key = rawKey in playerSnapshotSortColumns ? (rawKey as keyof typeof playerSnapshotSortColumns) : "fantasyScore";
  const column = playerSnapshotSortColumns[key];
  const direction = rawDirection === "asc" || rawDirection === "desc" ? rawDirection : column.defaultDirection;
  const primary = column.nullable
    ? { [column.field]: { sort: direction, nulls: "last" } }
    : { [column.field]: direction };

  return [primary as Prisma.PlayerSnapshotOrderByWithRelationInput, { playerName: "asc" }];
}
