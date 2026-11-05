import type { PrismaClient } from "@prisma/client";
import { clamp } from "./squad-team-strength";

const dayMs = 24 * 60 * 60 * 1000;
const defenseHalfLifeMs = 180 * dayMs;
const resultAvailabilityMs = 3 * 60 * 60 * 1000;
const leaguePriorMatches = 6;

type Venue = "home" | "away";

type HistoricalMatch = {
  id: bigint;
  leagueId: bigint;
  matchDate: Date;
  homeTeamId: bigint;
  awayTeamId: bigint;
  homeAttack: number | null;
  awayAttack: number | null;
};

type Allowance = {
  total: number;
  weight: number;
  observations: number;
  at: number;
};

type AttackHistoryRow = {
  matchId: bigint;
  teamId: bigint | null;
  minutes: number | null;
  xg: number | null;
  xa: number | null;
  goals?: number | null;
  assists?: number | null;
  transferHistoryPenaltyFactor?: number;
};

export type HistoricalOpponentFactors = ReadonlyMap<string, number>;

export type OpponentAttackAdjustment = {
  goalFactor: number;
  assistFactor: number;
  ratedMatches: number;
};

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#historical-opponent-forecast */
export async function loadHistoricalOpponentFactors(
  prisma: Pick<PrismaClient, "coreMatch">,
  leagueIds: readonly bigint[],
  now = new Date()
) {
  const scope = [...new Set(leagueIds)];
  if (scope.length === 0) return new Map<string, number>();
  const matches = await prisma.coreMatch.findMany({
    where: {
      leagueId: { in: scope },
      finished: true,
      cancelled: false,
      matchDate: { gte: new Date(now.getTime() - (365 * dayMs + defenseHalfLifeMs)), lt: now }
    },
    select: {
      id: true, leagueId: true, matchDate: true, homeTeamId: true, awayTeamId: true,
      homeScore: true, awayScore: true,
      teamStats: { select: { teamId: true, xg: true } }
    },
    orderBy: [{ matchDate: "desc" }, { id: "desc" }],
    take: Math.min(scope.length * 900, 18_000)
  });
  return buildHistoricalOpponentFactors(matches.flatMap((match): HistoricalMatch[] => {
    const { id, leagueId, matchDate, homeTeamId, awayTeamId } = match;
    if (!leagueId || !matchDate || !homeTeamId || !awayTeamId) return [];
    return [{
      id, leagueId, matchDate, homeTeamId, awayTeamId,
      homeAttack: match.teamStats.find((stat) => stat.teamId === homeTeamId)?.xg ?? match.homeScore,
      awayAttack: match.teamStats.find((stat) => stat.teamId === awayTeamId)?.xg ?? match.awayScore
    }];
  }));
}

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#historical-opponent-forecast */
export function buildHistoricalOpponentFactors(matches: readonly HistoricalMatch[]) {
  const ordered = [...new Map(matches.map((match) => [match.id, match])).values()]
    .filter((match) => Number.isFinite(match.matchDate.getTime()) && match.homeTeamId !== match.awayTeamId)
    .sort((left, right) => left.matchDate.getTime() - right.matchDate.getTime());
  const allowances = new Map<string, Allowance>();
  const factors = new Map<string, number>();
  const read = (key: string, at: number): Allowance => {
    const sample = allowances.get(key);
    if (!sample) return { total: 0, weight: 0, observations: 0, at };
    const decay = 2 ** ((sample.at - at) / defenseHalfLifeMs);
    return { total: sample.total * decay, weight: sample.weight * decay, observations: sample.observations, at };
  };
  const update = (leagueId: bigint, teamId: bigint, venue: Venue, at: number, allowed: number | null) => {
    if (allowed === null || !Number.isFinite(allowed) || allowed < 0) return;
    for (const key of [`${leagueId}:${venue}`, `${leagueId}:${venue}:${teamId}`]) {
      const sample = read(key, at);
      allowances.set(key, {
        total: sample.total + allowed, weight: sample.weight + 1, observations: sample.observations + 1, at
      });
    }
  };
  const rate = (match: HistoricalMatch, teamId: bigint, opponentId: bigint, venue: Venue, at: number) => {
    const leagueKey = `${match.leagueId}:${venue}`;
    const league = read(leagueKey, at);
    const opponent = read(`${leagueKey}:${opponentId}`, at);
    if (opponent.observations < 3 || league.observations < 16 || league.total <= 0 || league.weight <= 0) return;
    const leagueMean = league.total / league.weight;
    const allowed = (opponent.total + leaguePriorMatches * leagueMean) / (opponent.weight + leaguePriorMatches);
    const factor = clamp(leagueMean / allowed, 0.80, 1.25);
    factors.set(matchTeamKey(match.id, teamId), 1 + (factor - 1) / 2);
  };

  let pending = 0;
  for (const match of ordered) {
    const at = match.matchDate.getTime();
    // The database stores kickoff times. Give a completed result time to
    // become available before it contributes to another kickoff's rating.
    while (pending < ordered.length) {
      const previous = ordered[pending];
      const availableAt = previous.matchDate.getTime() + resultAvailabilityMs;
      if (availableAt >= at) break;
      update(previous.leagueId, previous.homeTeamId, "home", availableAt, previous.awayAttack);
      update(previous.leagueId, previous.awayTeamId, "away", availableAt, previous.homeAttack);
      pending += 1;
    }
    rate(match, match.homeTeamId, match.awayTeamId, "away", at);
    rate(match, match.awayTeamId, match.homeTeamId, "home", at);
  }
  return factors;
}

export function historicalOpponentAttackAdjustment(
  orderedHistory: readonly AttackHistoryRow[],
  factors: HistoricalOpponentFactors
): OpponentAttackAdjustment | undefined {
  let ratedMatches = 0;
  let ratedMinutes = 0;
  let goals = 0;
  let assists = 0;
  let adjustedGoals = 0;
  let adjustedAssists = 0;
  const seen = new Set<bigint>();
  for (const row of orderedHistory.slice(0, 10)) {
    const minutes = row.minutes ?? 0;
    if (minutes <= 0 || seen.has(row.matchId)) continue;
    seen.add(row.matchId);
    const factor = row.teamId === null ? undefined : factors.get(matchTeamKey(row.matchId, row.teamId));
    if (factor !== undefined) {
      ratedMatches += 1;
      ratedMinutes += Math.min(90, minutes);
    }
    const transfer = row.transferHistoryPenaltyFactor ?? 1;
    const xg = attackValue(row.xg, row.goals, transfer);
    const xa = attackValue(row.xa, row.assists, transfer);
    goals += xg;
    assists += xa;
    adjustedGoals += xg * (factor ?? 1);
    adjustedAssists += xa * (factor ?? 1);
  }
  if (ratedMatches < 3 || ratedMinutes < 180) return undefined;
  return {
    goalFactor: goals > 0 ? adjustedGoals / goals : 1,
    assistFactor: assists > 0 ? adjustedAssists / assists : 1,
    ratedMatches
  };
}

function attackValue(expected: number | null, observed: number | null | undefined, transfer: number) {
  return typeof expected === "number" && Number.isFinite(expected)
    ? Math.max(0, expected)
    : Math.max(0, (observed ?? 0) * transfer);
}

function matchTeamKey(matchId: bigint, teamId: bigint) {
  return `${matchId}:${teamId}`;
}
