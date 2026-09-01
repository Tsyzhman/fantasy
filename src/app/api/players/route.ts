import { ImportStatus, Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { jsonError, withApiHandler } from "@/lib/api-handler";
import { requireApiUser } from "@/lib/auth";
import { finiteNumberQueryParam } from "@/lib/api-query";
import type { CsvColumn } from "@/lib/csv";
import { prisma } from "@/lib/db";
import {
  loadPlayerSnapshotPositionPage,
  playerSnapshotPositionSortDirection,
  playerSnapshotWithTeamLeagueInclude
} from "@/lib/players/player-snapshot-position-page";
import { parseTableExportFormat, tableExportResponse } from "@/lib/table-export";

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

type PlayerSnapshotApiRow = Prisma.PlayerSnapshotGetPayload<{
  include: {
    team: true;
    league: true;
  };
}>;

const playerCsvColumns: CsvColumn<PlayerSnapshotApiRow>[] = [
  { header: "Player", value: (player) => player.playerName },
  { header: "Team", value: (player) => player.team?.name ?? player.teamName },
  { header: "League", value: (player) => player.league?.name ?? "" },
  { header: "Position", value: (player) => player.positionGroup ?? player.positionRaw ?? "" },
  { header: "Starter", value: (player) => (player.isStarter ? "yes" : "no") },
  { header: "Age", value: (player) => player.age },
  { header: "Minutes", value: (player) => player.minutesPlayed },
  { header: "Goals", value: (player) => player.goals },
  { header: "xG", value: (player) => player.xg },
  { header: "Assists", value: (player) => player.assists },
  { header: "xA", value: (player) => player.xa },
  { header: "Market value", value: (player) => player.marketValue },
  { header: "Fantasy score", value: (player) => player.fantasyScore },
  { header: "Scoring score", value: (player) => player.scoringScore },
  { header: "Alternative score", value: (player) => player.alternativeScore },
  { header: "Value score", value: (player) => player.valueScore }
];

export const GET = withApiHandler(async (request: Request) => {
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
  const minMinutes = finiteNumberQueryParam(params.get("minMinutes"));

  if (leagueId) where.leagueId = leagueId;
  if (teamId) where.teamId = teamId;
  if (positionGroup) where.positionGroup = positionGroup;
  if (starterFilter === "starter" || starterOnly === "1") where.isStarter = true;
  if (starterFilter === "bench") where.isStarter = false;
  if (minMinutes !== null) where.minutesPlayed = { gte: minMinutes };

  const sort = params.get("sort") ?? "fantasyScore";
  const orderBy = playerSnapshotOrderBy(sort);
  const positionSortDirection = playerSnapshotPositionSortDirection(sort);

  const players = positionSortDirection && !positionGroup
    ? await loadPlayerSnapshotPositionPage(where, positionSortDirection, 0, 250)
    : await prisma.playerSnapshot.findMany({
        where,
        orderBy,
        take: 250,
        include: playerSnapshotWithTeamLeagueInclude
      });

  const exportFormat = parseTableExportFormat(params.get("format"), null);
  if (params.has("format")) {
    if (!exportFormat) return jsonError("INVALID_FORMAT", "format must be csv or xlsx.", 400);
    return tableExportResponse({
      rows: players,
      columns: playerCsvColumns,
      format: exportFormat,
      filename: "players",
      sheetName: "Players"
    });
  }

  return NextResponse.json({ players });
});

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
