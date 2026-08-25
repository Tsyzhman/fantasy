export const sportsRuMaxPlayersPerTeamByLeagueId = {
  "42": 2,
  "47": 3,
  "48": 2,
  "53": 3,
  "54": 3,
  "55": 3,
  "57": 2,
  "61": 2,
  "63": 3,
  "71": 2,
  "73": 2,
  "77": 2,
  "87": 3
} as const satisfies Readonly<Record<string, 2 | 3>>;

export function sportsRuMaxPlayersPerTeamForLeague(leagueId: bigint | number | string) {
  const configured = sportsRuMaxPlayersPerTeamByLeagueId[String(leagueId) as keyof typeof sportsRuMaxPlayersPerTeamByLeagueId];
  return configured ?? 2;
}
