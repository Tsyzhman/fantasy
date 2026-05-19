import type { ActiveScoringModel } from "@/lib/scoring";
import { calculateAlternativeScore, calculateFantasyScore, calculateScoringScore } from "@/lib/scoring";
import { fixtureInMatchWindow, type MacheteMatchWindow } from "./match-window";

export type MacheteFixtureWindowInput = {
  id: string;
  status: string | null;
  kickoffAt: Date | null;
};

export type MacheteMatchStatWindowInput = {
  fixtureId: string;
  fixture: MacheteFixtureWindowInput;
  minutes: number | null;
  rating: number | null;
  goals: number | null;
  assists: number | null;
  shotsOnTarget: number | null;
  keyPasses: number | null;
  tackles: number | null;
  interceptions: number | null;
  saves: number | null;
  yellowCards: number | null;
  redCards: number | null;
};

export function recentTeamFixtureIds(fixtures: MacheteFixtureWindowInput[], limit: number) {
  return new Set(
    dedupeFixtures(fixtures)
      .filter(isPlayedFixture)
      .sort((left, right) => (right.kickoffAt?.getTime() ?? 0) - (left.kickoffAt?.getTime() ?? 0))
      .slice(0, limit)
      .map((fixture) => fixture.id)
  );
}

export function teamFixtureIdsForWindow(
  fixtures: MacheteFixtureWindowInput[],
  window: MacheteMatchWindow,
  currentSeason: string | null | undefined,
  providerLeagueId?: string | null
) {
  if (window.kind === "last") return recentTeamFixtureIds(fixtures, window.matches);

  return new Set(
    dedupeFixtures(fixtures)
      .filter(isPlayedFixture)
      .filter((fixture) => fixtureInMatchWindow(fixture, window, currentSeason, providerLeagueId))
      .map((fixture) => fixture.id)
  );
}

export function aggregateRecentMachetePlayerStats(
  matchStats: MacheteMatchStatWindowInput[],
  position: string | null | undefined,
  model: ActiveScoringModel,
  fixtureIds: Set<string>
) {
  const stats = matchStats.filter((stat) => fixtureIds.has(stat.fixtureId) && isPlayedFixture(stat.fixture));
  const matchesPlayed = stats.length;
  const minutesPlayed = sum(stats.map((stat) => stat.minutes));
  const goals = sum(stats.map((stat) => stat.goals));
  const assists = sum(stats.map((stat) => stat.assists));
  const shotsOnTarget = sum(stats.map((stat) => stat.shotsOnTarget));
  const keyPasses = sum(stats.map((stat) => stat.keyPasses));
  const tackles = sum(stats.map((stat) => stat.tackles));
  const interceptions = sum(stats.map((stat) => stat.interceptions));
  const saves = sum(stats.map((stat) => stat.saves));
  const yellowCards = sum(stats.map((stat) => stat.yellowCards));
  const redCards = sum(stats.map((stat) => stat.redCards));
  const ratings = stats.map((stat) => stat.rating).filter((rating): rating is number => rating !== null);
  const averageRating = ratings.length ? Number((sum(ratings) / ratings.length).toFixed(2)) : null;

  const rawMetrics = {
    matches_played: matchesPlayed,
    minutes_played: minutesPlayed,
    appearances_60: stats.filter((stat) => (stat.minutes ?? 0) >= 60).length,
    full_matches: stats.filter((stat) => (stat.minutes ?? 0) >= 90).length,
    goals,
    assists,
    shots_on_target: shotsOnTarget,
    key_passes: keyPasses,
    tackles,
    interceptions,
    saves,
    yellow_cards: yellowCards,
    red_cards: redCards,
    average_rating: averageRating
  };
  const positionGroup = machetePositionGroup(position);

  return {
    matchesPlayed,
    minutesPlayed,
    goals,
    assists,
    shotsOnTarget,
    keyPasses,
    tackles,
    interceptions,
    saves,
    yellowCards,
    redCards,
    averageRating,
    fantasyScore: calculateFantasyScore(rawMetrics, positionGroup, model),
    scoringScore: calculateScoringScore(rawMetrics, positionGroup, model),
    alternativeScore: calculateAlternativeScore(rawMetrics, positionGroup, model)
  };
}

function isPlayedFixture(fixture: MacheteFixtureWindowInput) {
  return fixture.status !== "SEASON_AGGREGATE" && fixture.status !== "SCHEDULED";
}

function dedupeFixtures(fixtures: MacheteFixtureWindowInput[]) {
  const seen = new Set<string>();
  const unique: MacheteFixtureWindowInput[] = [];

  for (const fixture of fixtures) {
    if (seen.has(fixture.id)) continue;
    seen.add(fixture.id);
    unique.push(fixture);
  }

  return unique;
}

function machetePositionGroup(position: string | null | undefined) {
  const value = position?.toLowerCase() ?? "";
  if (value.includes("keeper") || value === "gk") return "GK";
  if (value.includes("defender") || value.includes("back") || value === "def") return "DEF";
  if (value.includes("midfielder") || value === "mid") return "MID";
  if (value.includes("forward") || value.includes("striker") || value.includes("winger") || value === "fw") return "FWD";
  return "UNKNOWN";
}

function sum(values: Array<number | null | undefined>): number {
  let total = 0;
  for (const value of values) {
    total += value ?? 0;
  }
  return total;
}
