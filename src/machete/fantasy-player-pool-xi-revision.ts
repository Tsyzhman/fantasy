import { createHash } from "node:crypto";

export type FantasyStartingXiState = {
  revision: string;
  teamRevisions: Record<string, string>;
};

export function buildFantasyStartingXiState(
  rows: readonly { teamId: bigint; playerId: bigint; isStarter: boolean }[]
): FantasyStartingXiState {
  const teams = new Map<string, string[]>();
  for (const row of rows) {
    const teamId = String(row.teamId);
    const member = `${row.playerId}:${Number(row.isStarter)}`;
    const roster = teams.get(teamId);
    if (roster) roster.push(member);
    else teams.set(teamId, [member]);
  }
  const teamRevisions = Object.fromEntries([...teams]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([teamId, roster]) => [teamId, hash([...new Set(roster)].sort().join("|"))]));
  return { revision: hash(JSON.stringify(teamRevisions)), teamRevisions };
}

export function changedFantasyStartingXiTeams(
  previous: Record<string, string>,
  current: Record<string, string>
) {
  return [...new Set([...Object.keys(previous), ...Object.keys(current)])]
    .filter((teamId) => previous[teamId] !== current[teamId])
    .sort()
    .map(BigInt);
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
