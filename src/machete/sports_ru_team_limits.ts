/**
 * Explicit Sports.ru club limits keyed by CoreLeague id.
 * @spec spec://modules/machete/FEAT-001-global-ranking-strategy#club-limits
 */
export const sportsRuMaxPlayersPerTeamByLeagueId = {
  "42": 3,
  "47": 3,
  "48": 3,
  "53": 3,
  "54": 3,
  "55": 3,
  "57": 3,
  "61": 3,
  "63": 3,
  "71": 3,
  "73": 3,
  "77": 2,
  "87": 3
} as const satisfies Readonly<Record<string, 2 | 3>>;

export function sportsRuMaxPlayersPerTeamForLeague(leagueId: bigint | number | string) {
  const configured = sportsRuMaxPlayersPerTeamByLeagueId[String(leagueId) as keyof typeof sportsRuMaxPlayersPerTeamByLeagueId];
  return configured ?? 2;
}
