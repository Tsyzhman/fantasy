type LeagueDisplayInput = {
  id?: string | null;
  name?: string | null;
  code?: string | null;
  country?: string | null;
};

export function leagueSubtitle(league: LeagueDisplayInput, seasonName?: string | null) {
  const name = league.name ?? "";
  const season = seasonName ?? "";
  const isChampionship =
    league.id === "championship" || league.code === "CHA" || name.toLowerCase().includes("championship");

  if (isChampionship) return [name, season].filter(Boolean).join(" ");

  return [league.country, season].filter(Boolean).join(" · ");
}
