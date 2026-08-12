import type { FantasyPositionGroup } from "@/machete/squad_logic";

import { FPL_LEAGUE_ID, FPL_PROVIDER, FPL_SEASON, fplChipCode, type FplOfficialChip } from "./fpl";

export const FPL_RULESET_NAME = "FPL";
export const FPL_RULESET_VERSION = "FPL_2026_27";

export type FplChipCode = "WILDCARD" | "FREE_HIT" | "BENCH_BOOST" | "TRIPLE_CAPTAIN";
export type FplChipHalf = "FIRST" | "SECOND";
export type FplChipWindow = { start: number; end: number };
export type FplChipAvailability = Partial<Record<FplChipCode, Partial<Record<FplChipHalf, FplChipWindow>>>>;

export const fpl202627Rules = {
  provider: FPL_PROVIDER,
  leagueId: FPL_LEAGUE_ID,
  season: FPL_SEASON,
  version: FPL_RULESET_VERSION,
  budgetLimit: 100,
  squadSize: 15,
  starterSize: 11,
  positionLimits: { GK: 2, DEF: 5, MID: 5, FWD: 3 },
  starterPositionLimits: {
    GK: { min: 1, max: 1 },
    DEF: { min: 3, max: 5 },
    MID: { min: 2, max: 5 },
    FWD: { min: 1, max: 3 }
  },
  maxPlayersPerTeam: 3,
  initialFreeTransfers: 1,
  maxBankedFreeTransfers: 5,
  extraTransferCost: -4,
  transferCap: 20,
  chipsPerHalf: 1,
  oneChipPerGameweek: true,
  halves: { first: { start: 1, end: 19 }, second: { start: 20, end: 38 } },
  chips: {
    WILDCARD: { permanentTransfers: true, preservesFreeTransfers: true },
    FREE_HIT: { unlimitedTransfers: true, restoresSquadAtNextDeadline: true, preservesFreeTransfers: true },
    TRIPLE_CAPTAIN: { captainMultiplier: 3 },
    BENCH_BOOST: { includesBenchPoints: true }
  },
  chipAvailability: {
    WILDCARD: { FIRST: { start: 2, end: 19 }, SECOND: { start: 20, end: 38 } },
    FREE_HIT: { FIRST: { start: 2, end: 19 }, SECOND: { start: 20, end: 38 } },
    TRIPLE_CAPTAIN: { FIRST: { start: 1, end: 19 }, SECOND: { start: 20, end: 38 } },
    BENCH_BOOST: { FIRST: { start: 1, end: 19 }, SECOND: { start: 20, end: 38 } }
  },
  chipConstraints: { freeHitCannotBeConsecutive: true },
  scoring: {
    appearance: { upTo60Minutes: 1, from60Minutes: 2 },
    goals: { GK: 10, DEF: 6, MID: 5, FWD: 4 },
    assists: 3,
    cleanSheets: { GK: 4, DEF: 4, MID: 1, FWD: 0 },
    savesPerPoint: 3,
    penaltySave: 5,
    penaltyMiss: -2,
    ownGoal: -2,
    yellowCard: -1,
    redCard: -3,
    goalsConcededPerPoint: 2,
    goalsConcededPoint: -1,
    bonus: { min: 1, max: 3 },
    defensiveContributions: {
      DEF: { threshold: 10, points: 2 },
      MID: { threshold: 12, points: 2 },
      FWD: { threshold: 12, points: 2 }
    }
  }
} as const;

export type FplRulesContract = typeof fpl202627Rules;

export type FplSquadEntry = {
  providerPlayerId: string;
  teamId: string;
  position: Exclude<FantasyPositionGroup, "UNK">;
  price: number;
  isStarter: boolean;
};

export type FplSquadValidation =
  | { ok: true; spent: number; byPosition: Record<Exclude<FantasyPositionGroup, "UNK">, number>; byTeam: Record<string, number> }
  | { ok: false; violations: string[] };

export function validateFplSquad(entries: readonly FplSquadEntry[], rules: FplRulesContract = fpl202627Rules): FplSquadValidation {
  const violations: string[] = [];
  const byPosition = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const startersByPosition = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  const byTeam: Record<string, number> = {};
  const ids = new Set<string>();
  let spent = 0;
  for (const entry of entries) {
    if (ids.has(entry.providerPlayerId)) violations.push(`Duplicate FPL player ${entry.providerPlayerId}.`);
    ids.add(entry.providerPlayerId);
    if (!(entry.position in byPosition)) violations.push(`Unknown FPL position ${entry.position}.`);
    else {
      byPosition[entry.position] += 1;
      if (entry.isStarter) startersByPosition[entry.position] += 1;
    }
    if (!Number.isFinite(entry.price) || entry.price < 0) violations.push(`Invalid price for FPL player ${entry.providerPlayerId}.`);
    spent += entry.price;
    byTeam[entry.teamId] = (byTeam[entry.teamId] ?? 0) + 1;
  }
  if (entries.length !== rules.squadSize) violations.push(`FPL squad must contain exactly ${rules.squadSize} players.`);
  if (spent > rules.budgetLimit + 1e-9) violations.push(`FPL budget exceeded: ${spent.toFixed(1)} > ${rules.budgetLimit.toFixed(1)}.`);
  for (const position of ["GK", "DEF", "MID", "FWD"] as const) {
    if (byPosition[position] !== rules.positionLimits[position]) violations.push(`FPL squad requires ${rules.positionLimits[position]} ${position}, got ${byPosition[position]}.`);
    const starterRule = rules.starterPositionLimits[position];
    if (startersByPosition[position] < starterRule.min || startersByPosition[position] > starterRule.max) {
      violations.push(`FPL starting XI ${position} count must be ${starterRule.min}..${starterRule.max}, got ${startersByPosition[position]}.`);
    }
  }
  const starterCount = entries.filter((entry) => entry.isStarter).length;
  if (starterCount !== rules.starterSize) violations.push(`FPL starting XI must contain exactly ${rules.starterSize} players.`);
  for (const [teamId, count] of Object.entries(byTeam)) {
    if (count > rules.maxPlayersPerTeam) violations.push(`FPL club ${teamId} has ${count} players; maximum is ${rules.maxPlayersPerTeam}.`);
  }
  return violations.length > 0 ? { ok: false, violations } : { ok: true, spent, byPosition, byTeam };
}

export type FplChipUsage = {
  gameweek: number;
  code: FplChipCode;
  status?: "PLANNED" | "OBSERVED" | "CANCELLED";
};

export function fplHalfForGameweek(gameweek: number, rules: FplRulesContract = fpl202627Rules): FplChipHalf | null {
  if (!Number.isInteger(gameweek)) return null;
  if (gameweek >= rules.halves.first.start && gameweek <= rules.halves.first.end) return "FIRST";
  if (gameweek >= rules.halves.second.start && gameweek <= rules.halves.second.end) return "SECOND";
  return null;
}

export function validateFplChipUsage(
  usage: FplChipUsage,
  previousUsages: readonly FplChipUsage[] = [],
  rules: FplRulesContract = fpl202627Rules,
  availability: FplChipAvailability = rules.chipAvailability
) {
  const violations: string[] = [];
  const half = fplHalfForGameweek(usage.gameweek, rules);
  if (!half) violations.push(`FPL gameweek ${usage.gameweek} is outside the configured season.`);
  if (!Object.hasOwn(rules.chips, usage.code)) violations.push(`Unknown FPL chip ${usage.code}.`);
  const window = half ? availability[usage.code]?.[half] : null;
  if (half && (!window || usage.gameweek < window.start || usage.gameweek > window.end)) {
    violations.push(`FPL chip ${usage.code} is not available in gameweek ${usage.gameweek}.`);
  }
  if (previousUsages.some((item) => item.gameweek === usage.gameweek && item.status !== "CANCELLED")) {
    violations.push(`FPL permits only one chip in gameweek ${usage.gameweek}.`);
  }
  if (half && previousUsages.some((item) => item.code === usage.code && fplHalfForGameweek(item.gameweek, rules) === half && item.status !== "CANCELLED")) {
    violations.push(`FPL chip ${usage.code} has already been used in the ${half.toLowerCase()} half.`);
  }
  if (
    usage.code === "FREE_HIT"
    && rules.chipConstraints.freeHitCannotBeConsecutive
    && previousUsages.some((item) => item.code === "FREE_HIT" && item.status !== "CANCELLED" && Math.abs(item.gameweek - usage.gameweek) === 1)
  ) {
    violations.push("FPL Free Hit cannot be played in consecutive gameweeks.");
  }
  return violations.length > 0 ? { ok: false as const, violations } : { ok: true as const, half };
}

export function fplChipAvailabilityFromOfficial(
  chips: readonly FplOfficialChip[]
): FplChipAvailability {
  const availability: FplChipAvailability = {};
  for (const chip of chips) {
    const code = fplChipCode(chip.name);
    if (!code || !Number.isInteger(chip.startEvent) || !Number.isInteger(chip.stopEvent)) continue;
    const half = chip.startEvent <= fpl202627Rules.halves.first.end ? "FIRST" : "SECOND";
    availability[code] = {
      ...(availability[code] ?? {}),
      [half]: { start: chip.startEvent, end: chip.stopEvent }
    };
  }
  return availability;
}

export function fplChipAvailabilityFromStoredDefinitions(
  definitions: readonly { code: string; half: string; rules: unknown }[]
): FplChipAvailability {
  const availability: FplChipAvailability = {};
  for (const definition of definitions) {
    const code = fplChipCode(definition.code);
    if (!code || (definition.half !== "FIRST" && definition.half !== "SECOND") || !definition.rules || typeof definition.rules !== "object" || Array.isArray(definition.rules)) continue;
    const rules = definition.rules as Record<string, unknown>;
    const start = integerRuleValue(rules.startEvent);
    const end = integerRuleValue(rules.stopEvent);
    if (start === null || end === null || start > end) continue;
    availability[code] = {
      ...(availability[code] ?? {}),
      [definition.half]: { start, end }
    };
  }
  return availability;
}

function integerRuleValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export type FplTransferState = {
  gameweek: number;
  bankedFreeTransfers: number;
  transfersMade: number;
  transferCost: number;
};

export function nextFplTransferState(
  previous: Pick<FplTransferState, "bankedFreeTransfers"> | null,
  transfersMade: number,
  chip: "WILDCARD" | "FREE_HIT" | null = null,
  rules: FplRulesContract = fpl202627Rules
): Pick<FplTransferState, "bankedFreeTransfers" | "transfersMade" | "transferCost"> {
  const banked = previous?.bankedFreeTransfers ?? rules.initialFreeTransfers;
  const safeTransfers = Math.max(0, Math.floor(transfersMade));
  const freeTransfersUsed = Math.min(banked, safeTransfers);
  const paidTransfers = safeTransfers - freeTransfersUsed;
  return {
    bankedFreeTransfers: chip === "WILDCARD" || chip === "FREE_HIT"
      ? Math.min(rules.maxBankedFreeTransfers, banked)
      : Math.min(rules.maxBankedFreeTransfers, Math.max(1, banked - freeTransfersUsed + 1)),
    transfersMade: safeTransfers,
    transferCost: chip === "WILDCARD" || chip === "FREE_HIT" ? 0 : paidTransfers * rules.extraTransferCost
  };
}

export type FplMatchScoreInput = {
  position: Exclude<FantasyPositionGroup, "UNK">;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  saves: number;
  penaltySaves: number;
  penaltyMisses: number;
  ownGoals: number;
  yellowCards: number;
  redCards: number;
  goalsConceded: number;
  bonus: number;
  defensiveContributions: number;
};

export function calculateFplOfficialPoints(input: FplMatchScoreInput, rules: FplRulesContract = fpl202627Rules) {
  const breakdown: Record<string, number> = {};
  const add = (key: string, points: number) => {
    if (points !== 0) breakdown[key] = points;
  };
  if (input.minutes > 0) add("appearance", input.minutes >= 60 ? rules.scoring.appearance.from60Minutes : rules.scoring.appearance.upTo60Minutes);
  add("goals", input.goals * rules.scoring.goals[input.position]);
  add("assists", input.assists * rules.scoring.assists);
  if (input.minutes >= 60 && input.cleanSheet) add("clean_sheets", rules.scoring.cleanSheets[input.position]);
  if (input.position === "GK") add("saves", Math.floor(Math.max(0, input.saves) / rules.scoring.savesPerPoint));
  if (input.position === "GK") add("penalty_saves", input.penaltySaves * rules.scoring.penaltySave);
  add("penalty_misses", input.penaltyMisses * rules.scoring.penaltyMiss);
  add("own_goals", input.ownGoals * rules.scoring.ownGoal);
  add("yellow_cards", input.yellowCards * rules.scoring.yellowCard);
  add("red_cards", input.redCards * rules.scoring.redCard);
  if (input.position === "GK" || input.position === "DEF") {
    add("goals_conceded", Math.floor(Math.max(0, input.goalsConceded) / rules.scoring.goalsConcededPerPoint) * rules.scoring.goalsConcededPoint);
  }
  if (input.bonus > 0) add("bonus", Math.max(rules.scoring.bonus.min, Math.min(rules.scoring.bonus.max, input.bonus)));
  const defensiveRule = input.position === "DEF" || input.position === "MID" || input.position === "FWD"
    ? rules.scoring.defensiveContributions[input.position]
    : null;
  if (defensiveRule && input.defensiveContributions >= defensiveRule.threshold) add("defensive_contributions", defensiveRule.points);
  const points = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  return { points, breakdown };
}

export function fplRulesetJson(rules: FplRulesContract = fpl202627Rules) {
  return {
    contract: { ...rules, leagueId: String(rules.leagueId) },
    source: "official_fpl_bootstrap_and_premier_league_rules",
    actualPointsSource: "FPL_OFFICIAL_RESULTS",
    forecastStatus: "BETA_UNLESS_ROLLING_ORIGIN_ACCEPTANCE_PASSES"
  };
}

export function chipDefinitionsFromOfficial(officialChips: readonly FplOfficialChip[]) {
  return officialChips.flatMap((chip) => {
    const code = fplChipCode(chip.name);
    return code ? [{ code, half: chip.startEvent <= 19 ? "FIRST" : "SECOND", maxUses: 1, rules: chip }] : [];
  });
}
