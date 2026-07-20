/**
 * Pure, deterministic fixture projection core.
 *
 * The module deliberately has no database, clock, rounding, formula-engine or
 * calibration dependencies. Callers must provide every forecast input and may
 * persist/round the returned audit-friendly components at the boundary.
 */

export type FantasyPosition = "GK" | "DEF" | "MID" | "FWD";

export type ProjectionInputIssue = {
  path: string;
  message: string;
};

export class ProjectionInputError extends Error {
  readonly issues: readonly ProjectionInputIssue[];

  constructor(issues: ProjectionInputIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "ProjectionInputError";
    this.issues = issues;
  }
}

export type FixtureTeamStrengthInput = {
  teamId: string;
  attackStrength: number | null | undefined;
  defenseStrength: number | null | undefined;
  expectedRecoveries: number | null | undefined;
  expectedSaves: number | null | undefined;
};

export type FixtureProjectionInput = {
  leagueExpectedGoals: {
    home: number | null | undefined;
    away: number | null | undefined;
  };
  /** Explicit rather than hidden: 0.8 reproduces the author formula. */
  expectedAssistsPerGoal: number | null | undefined;
  home: FixtureTeamStrengthInput;
  away: FixtureTeamStrengthInput;
};

export type ProjectedTeamTotals = {
  teamId: string;
  expectedGoals: number;
  expectedGoalsAgainst: number;
  expectedAssists: number;
  expectedRecoveries: number;
  expectedSaves: number;
  cleanSheetProbability: number;
};

export type FixtureTeamProjection = {
  home: ProjectedTeamTotals;
  away: ProjectedTeamTotals;
};

export type ParticipantProbabilityInput = {
  /** Unconditional P(player records any playing time). */
  appearance: number | null | undefined;
  /** Unconditional P(player plays at least 60 minutes). */
  sixtyMinutes: number | null | undefined;
  /** Unconditional P(player completes the match). */
  fullMatch: number | null | undefined;
};

export type ParticipantRatesPer90Input = {
  xg: number | null | undefined;
  xa: number | null | undefined;
  recoveries?: number | null;
  saves?: number | null;
  yellowCards: number | null | undefined;
  redCards: number | null | undefined;
};

export type ProbableParticipantInput = {
  playerId: string;
  position: FantasyPosition;
  /** Unconditional expected minutes, already accounting for non-appearance. */
  expectedMinutes: number | null | undefined;
  probabilities: ParticipantProbabilityInput;
  ratesPer90: ParticipantRatesPer90Input;
};

export type PlayerExpectedEvents = {
  goals: number;
  assists: number;
  recoveries: number;
  saves: number;
  yellowCards: number;
  redCards: number;
  goalsConceded: number;
  cleanSheets: number;
};

export type PlayerFantasyPointComponents = {
  appearance: number;
  sixtyMinutes: number;
  fullMatch: number;
  goals: number;
  assists: number;
  cleanSheet: number;
  saves: number;
  recoveries: number;
  goalsConceded: number;
  yellowCards: number;
  redCards: number;
  total: number;
};

export type PlayerFixtureProjection = {
  playerId: string;
  position: FantasyPosition;
  expectedMinutes: number;
  probabilities: {
    appearance: number;
    sixtyMinutes: number;
    fullMatch: number;
  };
  allocationWeights: {
    goals: number;
    assists: number;
    recoveries: number;
    saves: number;
  };
  expectedEvents: PlayerExpectedEvents;
  components: PlayerFantasyPointComponents;
};

export type MassBalance = {
  expected: number;
  allocated: number;
  residual: number;
};

export type TeamPlayerProjection = {
  teamId: string;
  players: PlayerFixtureProjection[];
  massBalance: {
    goals: MassBalance;
    assists: MassBalance;
    recoveries: MassBalance;
    saves: MassBalance;
  };
  totalExpectedFantasyPoints: number;
};

const MASS_BALANCE_EPSILON = 1e-12;

export function projectFixtureTeams(input: FixtureProjectionInput): FixtureTeamProjection {
  const issues: ProjectionInputIssue[] = [];
  const leagueHome = requiredNonNegative(input.leagueExpectedGoals.home, "leagueExpectedGoals.home", issues);
  const leagueAway = requiredNonNegative(input.leagueExpectedGoals.away, "leagueExpectedGoals.away", issues);
  const assistsPerGoal = requiredNonNegative(input.expectedAssistsPerGoal, "expectedAssistsPerGoal", issues);
  validateTeamStrength(input.home, "home", issues);
  validateTeamStrength(input.away, "away", issues);
  throwIfIssues(issues);

  const homeGoals = leagueHome * input.home.attackStrength! * input.away.defenseStrength!;
  const awayGoals = leagueAway * input.away.attackStrength! * input.home.defenseStrength!;

  return {
    home: projectedTeam(input.home, homeGoals, awayGoals, assistsPerGoal),
    away: projectedTeam(input.away, awayGoals, homeGoals, assistsPerGoal)
  };
}

export function projectTeamPlayers(team: ProjectedTeamTotals, participants: readonly ProbableParticipantInput[]): TeamPlayerProjection {
  const issues = validatePlayerProjectionInput(team, participants);
  if (issues.length === 0) {
    validateAllocationDenominator(team.expectedGoals, participants, "xg", "goals", issues);
    validateAllocationDenominator(team.expectedAssists, participants, "xa", "assists", issues);
    validateAllocationDenominator(team.expectedRecoveries, participants.filter((player) => player.position !== "GK"), "recoveries", "recoveries", issues);
    validateAllocationDenominator(team.expectedSaves, participants.filter((player) => player.position === "GK"), "saves", "saves", issues);
  }
  throwIfIssues(issues);

  const goalWeights = participants.map((player) => exposureWeight(player, player.ratesPer90.xg!));
  const assistWeights = participants.map((player) => exposureWeight(player, player.ratesPer90.xa!));
  const recoveryWeights = participants.map((player) =>
    player.position === "GK" ? 0 : exposureWeight(player, player.ratesPer90.recoveries!)
  );
  const saveWeights = participants.map((player) =>
    player.position === "GK" ? exposureWeight(player, player.ratesPer90.saves!) : 0
  );

  const goals = allocateExactly(team.expectedGoals, goalWeights);
  const assists = allocateExactly(team.expectedAssists, assistWeights);
  const recoveries = allocateExactly(team.expectedRecoveries, recoveryWeights);
  const saves = allocateExactly(team.expectedSaves, saveWeights);

  const players = participants.map((player, index): PlayerFixtureProjection => {
    const minutes = player.expectedMinutes!;
    const minutesFactor = minutes / 90;
    const probabilities = {
      appearance: player.probabilities.appearance!,
      sixtyMinutes: player.probabilities.sixtyMinutes!,
      fullMatch: player.probabilities.fullMatch!
    };
    const expectedEvents: PlayerExpectedEvents = {
      goals: goals[index],
      assists: assists[index],
      recoveries: recoveries[index],
      saves: saves[index],
      yellowCards: minutesFactor === 0 ? 0 : player.ratesPer90.yellowCards! * minutesFactor,
      redCards: minutesFactor === 0 ? 0 : player.ratesPer90.redCards! * minutesFactor,
      goalsConceded: player.position === "GK" || player.position === "DEF" ? team.expectedGoalsAgainst * minutesFactor : 0,
      cleanSheets: cleanSheetEligible(player.position) ? team.cleanSheetProbability * probabilities.sixtyMinutes : 0
    };
    const components = fantasyPointComponents(player.position, probabilities, expectedEvents);

    return {
      playerId: player.playerId,
      position: player.position,
      expectedMinutes: minutes,
      probabilities,
      allocationWeights: {
        goals: goalWeights[index],
        assists: assistWeights[index],
        recoveries: recoveryWeights[index],
        saves: saveWeights[index]
      },
      expectedEvents,
      components
    };
  });

  const massBalance = {
    goals: balance(team.expectedGoals, goals),
    assists: balance(team.expectedAssists, assists),
    recoveries: balance(team.expectedRecoveries, recoveries),
    saves: balance(team.expectedSaves, saves)
  };
  assertMassBalance(massBalance);

  return {
    teamId: team.teamId,
    players,
    massBalance,
    totalExpectedFantasyPoints: players.reduce((sum, player) => sum + player.components.total, 0)
  };
}

function projectedTeam(
  input: FixtureTeamStrengthInput,
  expectedGoals: number,
  expectedGoalsAgainst: number,
  expectedAssistsPerGoal: number
): ProjectedTeamTotals {
  return {
    teamId: input.teamId,
    expectedGoals,
    expectedGoalsAgainst,
    expectedAssists: expectedGoals * expectedAssistsPerGoal,
    expectedRecoveries: input.expectedRecoveries!,
    expectedSaves: input.expectedSaves!,
    cleanSheetProbability: Math.exp(-expectedGoalsAgainst)
  };
}

function validateTeamStrength(input: FixtureTeamStrengthInput, path: string, issues: ProjectionInputIssue[]) {
  if (!input.teamId.trim()) issues.push({ path: `${path}.teamId`, message: "must be a non-empty string" });
  requiredNonNegative(input.attackStrength, `${path}.attackStrength`, issues);
  requiredNonNegative(input.defenseStrength, `${path}.defenseStrength`, issues);
  requiredNonNegative(input.expectedRecoveries, `${path}.expectedRecoveries`, issues);
  requiredNonNegative(input.expectedSaves, `${path}.expectedSaves`, issues);
}

function validatePlayerProjectionInput(team: ProjectedTeamTotals, participants: readonly ProbableParticipantInput[]) {
  const issues: ProjectionInputIssue[] = [];
  if (!team.teamId.trim()) issues.push({ path: "team.teamId", message: "must be a non-empty string" });
  requiredNonNegative(team.expectedGoals, "team.expectedGoals", issues);
  requiredNonNegative(team.expectedGoalsAgainst, "team.expectedGoalsAgainst", issues);
  requiredNonNegative(team.expectedAssists, "team.expectedAssists", issues);
  requiredNonNegative(team.expectedRecoveries, "team.expectedRecoveries", issues);
  requiredNonNegative(team.expectedSaves, "team.expectedSaves", issues);
  probability(team.cleanSheetProbability, "team.cleanSheetProbability", issues);
  if (participants.length === 0) issues.push({ path: "participants", message: "must contain probable participants" });

  const ids = new Set<string>();
  participants.forEach((player, index) => {
    const path = `participants[${index}]`;
    if (!player.playerId.trim()) issues.push({ path: `${path}.playerId`, message: "must be a non-empty string" });
    if (ids.has(player.playerId)) issues.push({ path: `${path}.playerId`, message: `duplicate playerId ${player.playerId}` });
    ids.add(player.playerId);

    const minutes = requiredNonNegative(player.expectedMinutes, `${path}.expectedMinutes`, issues);
    if (minutes > 90) issues.push({ path: `${path}.expectedMinutes`, message: "must be at most 90" });
    const appearance = probability(player.probabilities.appearance, `${path}.probabilities.appearance`, issues);
    const sixty = probability(player.probabilities.sixtyMinutes, `${path}.probabilities.sixtyMinutes`, issues);
    const full = probability(player.probabilities.fullMatch, `${path}.probabilities.fullMatch`, issues);
    if (sixty > appearance) issues.push({ path: `${path}.probabilities.sixtyMinutes`, message: "must not exceed appearance probability" });
    if (full > sixty) issues.push({ path: `${path}.probabilities.fullMatch`, message: "must not exceed sixty-minute probability" });
    if (minutes > 90 * appearance + MASS_BALANCE_EPSILON) {
      issues.push({ path: `${path}.expectedMinutes`, message: "must not exceed 90 * appearance probability" });
    }

    if (appearance > 0) {
      requiredNonNegative(player.ratesPer90.xg, `${path}.ratesPer90.xg`, issues);
      requiredNonNegative(player.ratesPer90.xa, `${path}.ratesPer90.xa`, issues);
      requiredNonNegative(player.ratesPer90.yellowCards, `${path}.ratesPer90.yellowCards`, issues);
      requiredNonNegative(player.ratesPer90.redCards, `${path}.ratesPer90.redCards`, issues);
      if (player.position === "GK") requiredNonNegative(player.ratesPer90.saves, `${path}.ratesPer90.saves`, issues);
      else requiredNonNegative(player.ratesPer90.recoveries, `${path}.ratesPer90.recoveries`, issues);
    }
  });

  return issues;
}

function validateAllocationDenominator(
  total: number,
  participants: readonly ProbableParticipantInput[],
  rate: keyof ParticipantRatesPer90Input,
  label: string,
  issues: ProjectionInputIssue[]
) {
  if (total === 0) return;
  const denominator = participants.reduce((sum, player) => sum + exposureWeight(player, player.ratesPer90[rate]!), 0);
  if (denominator <= 0) {
    issues.push({ path: `allocation.${label}`, message: `cannot allocate positive team total ${total}: exposure-weighted ${rate} denominator is zero` });
  }
}

function exposureWeight(player: ProbableParticipantInput, ratePer90: number) {
  if ((player.expectedMinutes ?? 0) === 0) return 0;
  return ratePer90 * (player.expectedMinutes! / 90);
}

function allocateExactly(total: number, weights: readonly number[]) {
  const allocated = weights.map(() => 0);
  if (total === 0) return allocated;
  const denominator = weights.reduce((sum, weight) => sum + weight, 0);
  let allocatedSum = 0;
  let finalPositiveIndex = -1;
  for (let index = 0; index < weights.length; index += 1) {
    if (weights[index] <= 0) continue;
    finalPositiveIndex = index;
    allocated[index] = total * (weights[index] / denominator);
    allocatedSum += allocated[index];
  }
  // Floating-point remainder is assigned deterministically; nothing is rounded.
  allocated[finalPositiveIndex] += total - allocatedSum;
  return allocated;
}

function fantasyPointComponents(
  position: FantasyPosition,
  probabilities: { appearance: number; sixtyMinutes: number; fullMatch: number },
  events: PlayerExpectedEvents
): PlayerFantasyPointComponents {
  const components = {
    appearance: probabilities.appearance,
    sixtyMinutes: probabilities.sixtyMinutes,
    fullMatch: position === "MID" || position === "FWD" ? probabilities.fullMatch : 0,
    goals: events.goals * goalWeight(position),
    assists: events.assists * 3,
    cleanSheet: events.cleanSheets * cleanSheetWeight(position),
    saves: position === "GK" ? expectedPoissonGroups(events.saves, 3) : 0,
    recoveries: position === "GK" ? 0 : expectedPoissonGroups(events.recoveries, 3),
    goalsConceded: position === "GK" || position === "DEF" ? -expectedPoissonGroups(events.goalsConceded, 2) : 0,
    yellowCards: -events.yellowCards,
    redCards: -events.redCards * 3
  };
  return {
    ...components,
    total: Object.values(components).reduce((sum, value) => sum + value, 0)
  };
}

/** E[floor(N / groupSize)] for N ~ Poisson(lambda). */
export function expectedPoissonGroups(lambda: number, groupSize: number) {
  if (!Number.isFinite(lambda) || lambda <= 0 || !Number.isInteger(groupSize) || groupSize <= 0) return 0;
  let probability = Math.exp(-lambda);
  let cumulative = probability;
  let expected = 0;
  const hardLimit = Math.max(100, Math.ceil(lambda + 20 * Math.sqrt(lambda + 1)));
  for (let count = 1; count <= hardLimit; count += 1) {
    probability *= lambda / count;
    cumulative += probability;
    expected += Math.floor(count / groupSize) * probability;
    if (count > lambda && 1 - cumulative < 1e-14) break;
  }
  return expected;
}

function goalWeight(position: FantasyPosition) {
  if (position === "GK" || position === "DEF") return 6;
  if (position === "MID") return 5;
  return 4;
}

function cleanSheetWeight(position: FantasyPosition) {
  if (position === "GK" || position === "DEF") return 4;
  if (position === "MID") return 1;
  return 0;
}

function cleanSheetEligible(position: FantasyPosition) {
  return position === "GK" || position === "DEF" || position === "MID";
}

function requiredNonNegative(value: number | null | undefined, path: string, issues: ProjectionInputIssue[]) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push({ path, message: "is required and must be a finite number" });
    return 0;
  }
  if (value < 0) issues.push({ path, message: "must be non-negative" });
  return value;
}

function probability(value: number | null | undefined, path: string, issues: ProjectionInputIssue[]) {
  const numeric = requiredNonNegative(value, path, issues);
  if (numeric > 1) issues.push({ path, message: "must be at most 1" });
  return numeric;
}

function throwIfIssues(issues: ProjectionInputIssue[]) {
  if (issues.length > 0) throw new ProjectionInputError(issues);
}

function balance(expected: number, values: readonly number[]): MassBalance {
  const allocated = values.reduce((sum, value) => sum + value, 0);
  return { expected, allocated, residual: expected - allocated };
}

function assertMassBalance(balances: TeamPlayerProjection["massBalance"]) {
  for (const [metric, value] of Object.entries(balances)) {
    if (Math.abs(value.residual) > MASS_BALANCE_EPSILON * Math.max(1, Math.abs(value.expected))) {
      throw new Error(`Internal ${metric} mass-balance violation: residual ${value.residual}`);
    }
  }
}
