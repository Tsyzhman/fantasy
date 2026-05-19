export function isWorldCup2026(providerLeagueId: string | null | undefined, season: string | null | undefined) {
  return providerLeagueId === "77" && isWorldCup2026Season(season);
}

export function shouldIgnoreProviderSeasonStats(providerLeagueId: string | null | undefined, season: string | null | undefined) {
  return isWorldCup2026(providerLeagueId, season);
}

function isWorldCup2026Season(season: string | null | undefined) {
  if (!season) return true;

  const normalized = season.trim();
  return normalized === "2026" || normalized === "2025/26" || normalized === "2025/2026" || normalized === "2026/27" || normalized === "2026/2027";
}
