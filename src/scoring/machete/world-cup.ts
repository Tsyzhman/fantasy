export function isWorldCup2026(providerLeagueId: string | null | undefined, season: string | null | undefined) {
  return providerLeagueId === "77" && (!season || season === "2026");
}

export function shouldIgnoreProviderSeasonStats(providerLeagueId: string | null | undefined, season: string | null | undefined) {
  return isWorldCup2026(providerLeagueId, season);
}
