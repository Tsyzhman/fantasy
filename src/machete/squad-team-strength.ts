

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#contracts */


export type PlannerFixture = {
  id: string;
  roundId: string;
  teamId: string;
  teamName?: string;
  teamFullName?: string;
  opponentTeamId: string | null;
  opponentName: string;
  opponentFullName: string;
  side: "H" | "A";
  kickoffAt: Date | null;
  projectedXg: number | null;
  projectedXga: number | null;
  attackMultiplier: number | null;
  defenseMultiplier: number | null;
  teamOver15Probability?: number | null;
  cleanSheetProbability?: number | null;
  oddsFetchedAt?: Date | null;
  finished?: boolean;
};

export type TeamStrengthSide = "home" | "away";

export type TeamStrengthBlock = {
  matches: number;
  xgForPerMatch: number | null;
  xgAgainstPerMatch: number | null;
};

export type TeamStrengthProfile = {
  home: TeamStrengthBlock;
  away: TeamStrengthBlock;
  overall: TeamStrengthBlock;
};

export type TeamStrengthProfiles = {
  byTeamId: Map<string, TeamStrengthProfile>;
  league: TeamStrengthProfile;
};

export type TeamStrengthMatchInput = {
  homeTeamId: string | null;
  awayTeamId: string | null;
  matchDate?: Date | string | null;
  teamStats: Array<{
    teamId: string;
    opponentTeamId?: string | null;
    isHome?: boolean | null;
    goals?: number | null;
    xg?: number | null;
  }>;
};

export const defaultTeamXgPerMatch = 1.25;

export const promotedTeamPriorMatches = 8;

export const promotedTeamStrengthFactor = 0.81;

export const promotedTeamRatioExponent = 0.6;

export const fixtureOddsMaximumAgeMs = 35 * 24 * 60 * 60_000;

export function inversePoissonOver15Probability(probabilityValue: number | null | undefined) {
  if (typeof probabilityValue !== "number" || !Number.isFinite(probabilityValue) || probabilityValue <= 0 || probabilityValue >= 1) return null;
  let low = 0;
  let high = 8;
  for (let index = 0; index < 60; index += 1) {
    const middle = (low + high) / 2;
    if ((poissonOver15Probability(middle) ?? 0) < probabilityValue) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export function fixtureStrengthProjection(
  fixture: Pick<PlannerFixture, "teamId" | "opponentTeamId" | "side">,
  profiles: TeamStrengthProfiles
) {
  const side = fixture.side === "H" ? "home" : "away";
  const opponentSide = fixture.side === "H" ? "away" : "home";
  const teamProfile = profiles.byTeamId.get(fixture.teamId);
  const opponentProfile = fixture.opponentTeamId ? profiles.byTeamId.get(fixture.opponentTeamId) : undefined;
  const own = strengthBlockForSide(teamProfile, side, profiles.league);
  const opponent = strengthBlockForSide(opponentProfile, opponentSide, profiles.league);
  const leagueSide = strengthBlockForSide(undefined, side, profiles.league);
  const leagueOpponentSide = strengthBlockForSide(undefined, opponentSide, profiles.league);
  const leagueAttackAverage = profiles.league.overall.xgForPerMatch ?? defaultTeamXgPerMatch;
  const leagueDefenseAverage = profiles.league.overall.xgAgainstPerMatch ?? defaultTeamXgPerMatch;
  const attackBase = leagueSide.xgForPerMatch ?? leagueAttackAverage;
  const defenseBase = leagueSide.xgAgainstPerMatch ?? leagueDefenseAverage;
  const opponentAttackBase = leagueOpponentSide.xgForPerMatch ?? profiles.league.overall.xgForPerMatch ?? defaultTeamXgPerMatch;
  const opponentDefenseBase = leagueOpponentSide.xgAgainstPerMatch ?? profiles.league.overall.xgAgainstPerMatch ?? defaultTeamXgPerMatch;
  const projectedXg = attackBase
    * strengthRatio(own.xgForPerMatch, attackBase)
    * strengthRatio(opponent.xgAgainstPerMatch, opponentDefenseBase);
  const projectedXga = opponentAttackBase
    * strengthRatio(opponent.xgForPerMatch, opponentAttackBase)
    * strengthRatio(own.xgAgainstPerMatch, defenseBase);

  return {
    projectedXg,
    projectedXga,
    attackBase: leagueAttackAverage,
    defenseBase: leagueDefenseAverage,
    attackMultiplier: ratioMultiplier(projectedXg, leagueAttackAverage),
    defenseMultiplier: ratioMultiplier(leagueDefenseAverage, projectedXga)
  };
}

export function fixtureStrengthWithBookmaker(
  projection: Pick<ReturnType<typeof fixtureStrengthProjection>, "projectedXg" | "projectedXga" | "attackBase" | "defenseBase">,
  odds: Pick<PlannerFixture, "teamOver15Probability" | "cleanSheetProbability">
) {
  const bookmakerXg = inversePoissonOver15Probability(odds.teamOver15Probability);
  const bookmakerXga = bookmakerImpliedGoalsAgainst(odds.cleanSheetProbability);
  const marketProjectedXg = blendModelAndBookmakerExpectation(projection.projectedXg, bookmakerXg);
  const marketProjectedXga = blendModelAndBookmakerExpectation(projection.projectedXga, bookmakerXga);

  return {
    marketProjectedXg,
    marketProjectedXga,
    attackMultiplier: ratioMultiplier(marketProjectedXg, projection.attackBase),
    defenseMultiplier: ratioMultiplier(projection.defenseBase, marketProjectedXga)
  };
}

export function bookmakerImpliedGoalsAgainst(cleanSheetProbability: number | null | undefined) {
  if (typeof cleanSheetProbability !== "number" || !Number.isFinite(cleanSheetProbability) || cleanSheetProbability <= 0 || cleanSheetProbability > 1) {
    return null;
  }
  return -Math.log(cleanSheetProbability);
}

export function blendModelAndBookmakerExpectation(model: number, bookmaker: number | null) {
  if (bookmaker === null) return model;
  return clamp(model * 0.55 + bookmaker * 0.45, model * 0.7, model * 1.35);
}

export function fillTeamStrengthStatsFromScore(
  match: TeamStrengthMatchInput & { homeScore?: number | null; awayScore?: number | null }
): TeamStrengthMatchInput {
  const homeTeamId = match.homeTeamId?.trim() || null;
  const awayTeamId = match.awayTeamId?.trim() || null;
  const scoreRows = homeTeamId && awayTeamId && match.homeScore !== null && match.homeScore !== undefined
    && match.awayScore !== null && match.awayScore !== undefined
    ? [
        { teamId: homeTeamId, opponentTeamId: awayTeamId, isHome: true, xg: null, goals: match.homeScore },
        { teamId: awayTeamId, opponentTeamId: homeTeamId, isHome: false, xg: null, goals: match.awayScore }
      ]
    : [];
  const byTeamId = new Map<string, TeamStrengthMatchInput["teamStats"][number]>(scoreRows.map((row) => [row.teamId, row]));

  for (const stat of match.teamStats) {
    const scoreRow = byTeamId.get(stat.teamId);
    byTeamId.set(stat.teamId, {
      ...scoreRow,
      ...stat,
      goals: numericOrNull(stat.goals) ?? scoreRow?.goals ?? null
    });
  }

  return {
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    matchDate: match.matchDate,
    teamStats: [...byTeamId.values()]
  };
}

export function addPromotedTeamStrengthProfiles(topLeague: TeamStrengthProfiles, feederLeague: TeamStrengthProfiles): TeamStrengthProfiles {
  const byTeamId = new Map(topLeague.byTeamId);
  for (const [teamId, feederProfile] of feederLeague.byTeamId) {
    if (byTeamId.has(teamId) || !hasStrengthSignal(feederProfile.overall)) continue;
    byTeamId.set(teamId, {
      home: promotedStrengthBlock(feederProfile.home, feederLeague.league.home, topLeague.league.home),
      away: promotedStrengthBlock(feederProfile.away, feederLeague.league.away, topLeague.league.away),
      overall: promotedStrengthBlock(feederProfile.overall, feederLeague.league.overall, topLeague.league.overall)
    });
  }
  return { byTeamId, league: topLeague.league };
}

export function promotedStrengthBlock(source: TeamStrengthBlock, feederAverage: TeamStrengthBlock, topAverage: TeamStrengthBlock): TeamStrengthBlock {
  const attackRatio = strengthRatio(source.xgForPerMatch, feederAverage.xgForPerMatch);
  const defenseRatio = strengthRatio(feederAverage.xgAgainstPerMatch, source.xgAgainstPerMatch);
  const adjustedAttack = promotedStrengthRatio(attackRatio, source.matches);
  const adjustedDefense = promotedStrengthRatio(defenseRatio, source.matches);
  return {
    matches: source.matches,
    xgForPerMatch: (topAverage.xgForPerMatch ?? defaultTeamXgPerMatch) * adjustedAttack,
    xgAgainstPerMatch: (topAverage.xgAgainstPerMatch ?? defaultTeamXgPerMatch) / adjustedDefense
  };
}

export function promotedStrengthRatio(ratio: number, matches: number) {
  const sampleMatches = Math.max(0, matches);
  const shrunkRatio = (sampleMatches * ratio + promotedTeamPriorMatches) / (sampleMatches + promotedTeamPriorMatches);
  return promotedTeamStrengthFactor * shrunkRatio ** promotedTeamRatioExponent;
}

export function strengthRatio(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator <= 0) return 1;
  return clamp(numerator / denominator, 0.5, 2);
}

export function strengthBlockForSide(
  profile: TeamStrengthProfile | undefined,
  side: TeamStrengthSide | null,
  leagueProfile: TeamStrengthProfile
): TeamStrengthBlock {
  const preferred = side ? profile?.[side] : profile?.overall;
  if (preferred && hasStrengthSignal(preferred)) return preferred;
  if (profile?.overall && hasStrengthSignal(profile.overall)) return profile.overall;
  if (side && hasStrengthSignal(leagueProfile[side])) return leagueProfile[side];
  if (hasStrengthSignal(leagueProfile.overall)) return leagueProfile.overall;

  return {
    matches: 0,
    xgForPerMatch: defaultTeamXgPerMatch,
    xgAgainstPerMatch: defaultTeamXgPerMatch
  };
}

export function hasStrengthSignal(block: TeamStrengthBlock) {
  return block.matches > 0 && (block.xgForPerMatch !== null || block.xgAgainstPerMatch !== null);
}

export function ratioMultiplier(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return clamp(numerator / denominator, 0.72, 1.28);
}

export function numericOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, "").replace(/%$/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function poissonOver15Probability(projectedXg: number | null) {
  if (projectedXg === null || !Number.isFinite(projectedXg) || projectedXg < 0) return null;
  return 1 - Math.exp(-projectedXg) * (1 + projectedXg);
}

export function fixtureOddsAreFresh(fetchedAt: Date | null | undefined, now = new Date()) {
  if (!fetchedAt) return false;
  const ageMs = now.getTime() - fetchedAt.getTime();
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= fixtureOddsMaximumAgeMs;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
