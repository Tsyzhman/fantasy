export const fantasyPositionOrder = ["FWD", "MID", "DEF", "GK", "UNK"] as const;

const fantasyPositionRanks = new Map<string, number>([
  ["FWD", 0],
  ["FW", 0],
  ["F", 0],
  ["FORWARD", 0],
  ["FORWARDS", 0],
  ["STRIKER", 0],
  ["MID", 1],
  ["M", 1],
  ["MIDFIELDER", 1],
  ["MIDFIELDERS", 1],
  ["DEF", 2],
  ["D", 2],
  ["DEFENDER", 2],
  ["DEFENDERS", 2],
  ["GK", 3],
  ["G", 3],
  ["GOALKEEPER", 3],
  ["GOALKEEPERS", 3]
]);

export function fantasyPositionRank(position: string | null | undefined) {
  return fantasyPositionRanks.get(position?.trim().toUpperCase() ?? "") ?? fantasyPositionOrder.length - 1;
}

export function compareFantasyPositions(
  left: string | null | undefined,
  right: string | null | undefined,
  direction: "asc" | "desc" = "asc"
) {
  const leftRank = fantasyPositionRank(left);
  const rightRank = fantasyPositionRank(right);
  const unknownRank = fantasyPositionOrder.length - 1;
  if (leftRank === unknownRank && rightRank !== unknownRank) return 1;
  if (rightRank === unknownRank && leftRank !== unknownRank) return -1;
  const difference = leftRank - rightRank;
  return direction === "asc" ? difference : -difference;
}

export function isFantasyPositionSortKey(key: string | null | undefined) {
  const normalized = key?.replace(/[^a-z]/gi, "").toLowerCase() ?? "";
  return normalized === "position" || normalized === "positiongroup";
}
