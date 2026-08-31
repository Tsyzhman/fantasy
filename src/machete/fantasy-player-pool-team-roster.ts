type TeamRosterMember = { playerId: bigint; teamId: bigint };

/** Use the same effective team roster as the full Sports.ru planner. */
export function fantasyPlayerPoolTeamRefreshPlayerIds(
  teamIds: readonly bigint[],
  memberships: readonly TeamRosterMember[],
  authoritativeRoster: readonly TeamRosterMember[]
): bigint[] {
  const requestedTeams = new Set(teamIds.map(String));
  const effectiveRoster = new Map(memberships.map((row) => [String(row.playerId), row]));
  for (const row of authoritativeRoster) effectiveRoster.set(String(row.playerId), row);
  return [...effectiveRoster.values()]
    .filter((row) => requestedTeams.has(String(row.teamId)))
    .map((row) => row.playerId);
}
