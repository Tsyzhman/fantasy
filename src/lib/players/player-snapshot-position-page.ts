import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { compareFantasyPositions } from "@/lib/players/fantasy-position-order";

export const playerSnapshotWithTeamLeagueInclude = { league: true, team: true } satisfies Prisma.PlayerSnapshotInclude;

export async function loadPlayerSnapshotPositionPage(
  where: Prisma.PlayerSnapshotWhereInput,
  direction: "asc" | "desc",
  offset: number,
  pageSize: number
) {
  const groups = await prisma.playerSnapshot.groupBy({
    by: ["positionGroup"],
    where,
    _count: { _all: true }
  });
  groups.sort((left, right) =>
    compareFantasyPositions(left.positionGroup, right.positionGroup, direction)
      || String(left.positionGroup ?? "").localeCompare(String(right.positionGroup ?? ""))
  );

  let skip = offset;
  let remaining = pageSize;
  const rows: Prisma.PlayerSnapshotGetPayload<{ include: typeof playerSnapshotWithTeamLeagueInclude }>[] = [];
  for (const group of groups) {
    if (remaining === 0) break;
    if (skip >= group._count._all) {
      skip -= group._count._all;
      continue;
    }
    const chunk = await prisma.playerSnapshot.findMany({
      where: { AND: [where, { positionGroup: group.positionGroup }] },
      orderBy: { playerName: "asc" },
      skip,
      take: remaining,
      include: playerSnapshotWithTeamLeagueInclude
    });
    rows.push(...chunk);
    remaining -= chunk.length;
    skip = 0;
  }
  return rows;
}

export function playerSnapshotPositionSortDirection(sortValue: string) {
  const [key, rawDirection] = sortValue.split(":");
  if (key !== "positionGroup") return null;
  return rawDirection === "desc" ? "desc" : "asc";
}
