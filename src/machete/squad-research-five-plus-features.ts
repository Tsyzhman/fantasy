// @spec spec://modules/machete/FEAT-001-global-ranking-strategy#research-forecasts
import type { ResearchFixtureInput } from "./squad-research-forecast";
import type { PlannerFixture } from "./squad-team-strength";
import { squadFivePlusHistoryFeatureCounts, type SquadFivePlusHistory } from "./squad-research-five-plus-history";

export type FivePlusPlayerContext = {
  age?: number | null;
  price?: number | null;
  confidence?: number | null;
  starter?: boolean | null;
};
type FivePlusFixture = Pick<PlannerFixture, "teamId" | "opponentTeamId" | "side" | "kickoffAt"> & {
  matchId?: string;
};
const positions = ["GK", "DEF", "MID", "FWD"] as const;
const accumulated = [
  "goals", "assists", "xg", "xa", "xgot", "shots", "shots_on_target", "key_passes", "chances_created",
  "tackles_won", "interceptions", "clearances", "duels_won", "aerials_won", "recoveries", "saves",
  "goals_conceded", "clean_sheets", "yellow_cards", "red_cards", "touches_in_opposition_box", "fouls_won", "penalties_won"
] as const;
const profile = [
  "matches_played", "minutes_played", "appearance_probability", "sixty_minute_probability", "full_match_probability",
  "appearances_60", "full_matches", "average_rating", "average_rating_10_sample_size", "previous_club_fallback_matches",
  "previous_club_penalty_factor", "current_season_appearances", "current_season_minutes", "current_season_xg",
  "current_season_xa", "current_team_stat_matches", "archive_prior_appearances", "archive_prior_assists",
  "archive_prior_goals", "archive_prior_same_team", "archive_prior_team_matches", "archive_tier_factor"
] as const;
const numbers = (x: unknown) => typeof x === "number" && Number.isFinite(x) ? x : null;
const dayMs = 86_400_000;

export function fivePlusPlayerFeatures(input: ResearchFixtureInput, player: FivePlusPlayerContext) {
  const minutesPlayed = numbers(input.history?.minutes_played);
  const recent = (input.recent ?? []).filter(Number.isFinite);
  const form = [1, 3, 5, 10].flatMap((count) => {
    const window = recent.slice(-count);
    if (!window.length) return [null, null, null];
    const mean = window.reduce((sum, value) => sum + value, 0) / window.length;
    const spread = Math.sqrt(window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / window.length);
    return [mean, spread, window.filter((value) => value >= 5).length / window.length];
  });
  return [
    ...positions.map((position) => Number(input.position === position)),
    numbers(player.age), numbers(player.price), numbers(player.confidence),
    player.starter == null ? null : Number(player.starter),
    input.minutes, input.appearance, input.sixty, input.full, input.goals, input.assists, input.cleanSheets,
    input.conceded, input.saves, input.recoveries, input.yellow, input.red,
    input.goals + input.assists, input.goals * input.sixty, input.cleanSheets * input.sixty,
    recent.length, ...form,
    ...profile.map((name) => numbers(input.history?.[name])),
    ...accumulated.flatMap((name) => {
      const raw = numbers(input.history?.[name]);
      return [raw, raw === null || !minutesPlayed ? null : 90 * raw / Math.max(180, minutesPlayed)];
    })
  ];
}

export type FivePlusFixtureFeatures = {
  team: Array<number | null>;
  opponent: Array<number | null>;
  player: (playerId: string) => Array<number | null>;
};

export function fivePlusFixtureFeatures(
  fixture: FivePlusFixture, asOf: number, history: SquadFivePlusHistory
): FivePlusFixtureFeatures {
  const kickoff = +(fixture.kickoffAt ?? new Date(asOf));
  const home = fixture.side === "H";
  const team = [
    Number(home), Math.max(0, (kickoff - asOf) / dayMs),
    ...history.team(fixture.teamId, asOf, kickoff, home),
    ...history.market(fixture.matchId, asOf, home)
  ];
  const opponent = fixture.opponentTeamId
    ? history.team(fixture.opponentTeamId, asOf, kickoff, !home)
    : Array<null>(squadFivePlusHistoryFeatureCounts.team).fill(null);
  return { team, opponent, player: (id) => history.player(fixture.teamId, id, asOf, kickoff) };
}
