import type { SharedLeagueSeasonOption, SharedPlayerRowsScope } from "./shared_read_model";

export function playerLeagueScopes(input: {
  selectedLeagueId: string;
  selectedSeason: string;
  readyLeagueScopes: SharedLeagueSeasonOption[];
  leagueSeasonOptions: SharedLeagueSeasonOption[];
}): SharedPlayerRowsScope[] {
  const selected = input.selectedLeagueId === "all"
    ? input.readyLeagueScopes
    : input.leagueSeasonOptions.filter(
        (league) =>
          String(league.leagueId) === input.selectedLeagueId &&
          (!input.selectedSeason || league.season === input.selectedSeason)
      );

  return selected.map((league) => ({ leagueId: league.leagueId, season: league.season }));
}
