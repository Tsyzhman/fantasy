export type FantasyPositionGroup = "GK" | "DEF" | "MID" | "FWD" | "UNK";

export type FantasySquadRules = {
  budgetLimit: number;
  squadSize: number;
  starterSize: number;
  benchSize: number;
  maxPlayersPerTeam: number;
  positionLimits: Record<Exclude<FantasyPositionGroup, "UNK">, number>;
  starterPositionLimits: Record<Exclude<FantasyPositionGroup, "UNK">, { min: number; max: number }>;
  horizonOptions: number[];
  sourceLabel: string;
};

export type FantasyRoundProjection = {
  id: string;
  label: string;
  startsAt: string | null;
  fixtureCount: number;
};

export type FantasyPlannerPlayer = {
  id: string;
  playerId: string;
  teamId: string | null;
  name: string;
  teamName: string;
  leagueName: string;
  position: string | null;
  positionGroup: FantasyPositionGroup;
  price: number;
  priceSource: "SPORTS_RU" | "ESTIMATED";
  predictedFp: number | null;
  expectedMinutes?: number | null;
  startProbability?: number | null;
  forecastConfidence?: number | null;
  forecastFactors?: string[];
  forecastRisks?: string[];
  forecastCalculatedAt?: string | null;
  forecastDataUpdatedAt?: string | null;
  forecastModelVersion?: string | null;
  valueScore: number;
  roundPoints: number[];
  fixtures: string[];
  fixtureDifficulties: (number | null)[];
  baltikaXg?: number | null;
  baltikaXa?: number | null;
  baltikaMatchesPlayed?: number | null;
  baltikaTeamName?: string | null;
};

export type FantasySquadSelection = {
  playerId: string;
  isStarter: boolean;
  isLocked: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  slotIndex: number;
  purchasePrice: number | null;
};

export type FantasySquadSummary = {
  selectedPlayers: FantasyPlannerPlayer[];
  starterPlayers: FantasyPlannerPlayer[];
  benchPlayers: FantasyPlannerPlayer[];
  spent: number;
  bank: number;
  projectedNext: number;
  projectedHorizon: number;
  byPosition: Record<FantasyPositionGroup, number>;
  startersByPosition: Record<FantasyPositionGroup, number>;
  benchByPosition: Record<FantasyPositionGroup, number>;
  byTeam: Record<string, number>;
  violations: string[];
  warnings: string[];
};

export type TransferSuggestion = {
  outPlayerId: string;
  inPlayerId: string;
  outName: string;
  inName: string;
  positionGroup: FantasyPositionGroup;
  outTeamName: string;
  inTeamName: string;
  priceDelta: number;
  nextDelta: number;
  horizonDelta: number;
  score: number;
};

export type TransferPlanMove = {
  outPlayerId: string;
  inPlayerId: string;
  outName: string;
  inName: string;
  positionGroup: FantasyPositionGroup;
  outTeamName: string;
  inTeamName: string;
  priceDelta: number;
  round1Delta: number;
  round3Delta: number | null;
  round5Delta: number | null;
};

export type TransferPlanSuggestion = {
  id: string;
  moves: TransferPlanMove[];
  transferCount: number;
  priceDelta: number;
  round1Delta: number;
  round3Delta: number | null;
  round5Delta: number | null;
  horizonDelta: number;
  paidTransferLoss: number | null;
  netHorizonDelta: number | null;
  reason: string;
  risks: string[];
  score: number;
};

export type FantasyStarterOptimizationBasis = "next" | "horizon";
export type FantasySquadStrategy = "balanced" | "reliable" | "upside";

export type FantasySquadSaveValidation =
  | {
      ok: true;
      selections: FantasySquadSelection[];
      summary: FantasySquadSummary;
    }
  | {
      ok: false;
      error: string;
    };

export const transfersPerFantasyRound = 3;
const fantasyOptimizerBudgetFrontierLimit = 32;
const fantasyOptimizerTeamBudgetFrontierLimit = 8;

export const defaultFantasySquadRules: FantasySquadRules = {
  budgetLimit: 100,
  squadSize: 15,
  starterSize: 11,
  benchSize: 4,
  maxPlayersPerTeam: 2,
  positionLimits: {
    GK: 2,
    DEF: 5,
    MID: 5,
    FWD: 3
  },
  starterPositionLimits: {
    GK: { min: 1, max: 1 },
    DEF: { min: 3, max: 5 },
    MID: { min: 2, max: 5 },
    FWD: { min: 1, max: 3 }
  },
  horizonOptions: [1, 3, 5, 10],
  sourceLabel: "Machete default"
};

export function normalizeFantasyPosition(position: string | null | undefined): FantasyPositionGroup {
  const value = position?.trim().toLowerCase() ?? "";
  const compact = value.replace(/[\s._/-]+/g, "");
  const primaryCode = value.split(/[,;|]+/)[0]?.trim().toUpperCase() ?? "";
  if (primaryCode === "GK" || ["gk", "\u0432", "\u0432\u0440", "\u0432\u0440\u0442", "\u0432\u0440\u0430\u0442\u0430\u0440\u044c", "\u0432\u0440\u0430\u0442\u0430\u0440\u0438"].includes(compact) || value.includes("keeper")) return "GK";
  if (
    ["CB", "LB", "RB", "LWB", "RWB", "SW"].includes(primaryCode) ||
    ["def", "\u0437", "\u0437\u0449", "\u0437\u0430\u0449", "\u0437\u0430\u0449\u0438\u0442\u043d\u0438\u043a", "\u0437\u0430\u0449\u0438\u0442\u043d\u0438\u043a\u0438"].includes(compact) ||
    value.includes("defender") ||
    value.includes("back")
  ) {
    return "DEF";
  }
  if (
    ["CM", "CDM", "CAM", "LM", "RM", "DM", "AM"].includes(primaryCode) ||
    ["mid", "\u043f", "\u043f\u0437", "\u043f\u043e\u043b\u0443\u0437\u0430\u0449\u0438\u0442\u043d\u0438\u043a", "\u043f\u043e\u043b\u0443\u0437\u0430\u0449\u0438\u0442\u043d\u0438\u043a\u0438"].includes(compact) ||
    value.includes("midfielder")
  ) {
    return "MID";
  }
  if (
    ["ST", "CF", "LW", "RW", "SS"].includes(primaryCode) ||
    ["fw", "fwd", "\u043d", "\u043d\u043f", "\u043d\u0430\u043f", "\u0444\u043e\u0440\u0432\u0430\u0440\u0434", "\u043d\u0430\u043f\u0430\u0434\u0430\u044e\u0449\u0438\u0439", "\u043d\u0430\u043f\u0430\u0434\u0430\u044e\u0449\u0438\u0435"].includes(compact) ||
    value.includes("forward") ||
    value.includes("attacker") ||
    value.includes("striker") ||
    value.includes("winger")
  ) {
    return "FWD";
  }
  return "UNK";
}

export function roundFantasyValue(value: number) {
  return Math.round(value * 10) / 10;
}

export function fantasyTransferLimitForHorizon(horizon: number) {
  const safeHorizon = Number.isFinite(horizon) ? Math.max(1, Math.floor(horizon)) : 1;
  return safeHorizon * transfersPerFantasyRound;
}

export function normalizeFantasyHorizon(value: unknown, options: readonly number[], fallback = 5) {
  const safeOptions = options.filter((option) => Number.isInteger(option) && option > 0);
  const fallbackHorizon = safeOptions.includes(fallback) ? fallback : (safeOptions[0] ?? Math.max(1, Math.floor(Number(fallback) || 1)));
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) return fallbackHorizon;
  return safeOptions.includes(parsed) ? parsed : fallbackHorizon;
}

export function countFantasySquadTransfers(
  savedSelections: Array<Pick<FantasySquadSelection, "playerId">>,
  currentSelections: Array<Pick<FantasySquadSelection, "playerId">>
) {
  const savedIds = new Set(savedSelections.map((selection) => selection.playerId));
  const currentIds = new Set(currentSelections.map((selection) => selection.playerId));
  let added = 0;
  let removed = 0;

  for (const playerId of currentIds) {
    if (!savedIds.has(playerId)) added += 1;
  }
  for (const playerId of savedIds) {
    if (!currentIds.has(playerId)) removed += 1;
  }

  return Math.max(added, removed);
}

export function playerHorizonPoints(player: Pick<FantasyPlannerPlayer, "roundPoints">, horizon: number) {
  return roundFantasyValue(player.roundPoints.slice(0, horizon).reduce((total, value) => total + value, 0));
}

export function summarizeFantasySquad(
  pool: FantasyPlannerPlayer[],
  selections: FantasySquadSelection[],
  rules: FantasySquadRules,
  horizon: number
): FantasySquadSummary {
  const playersById = new Map(pool.map((player) => [player.playerId, player]));
  const selectedPairs = selections
    .map((selection) => {
      const player = playersById.get(selection.playerId);
      return player ? { selection, player } : null;
    })
    .filter((pair): pair is { selection: FantasySquadSelection; player: FantasyPlannerPlayer } => Boolean(pair));
  const selectedPlayers = selectedPairs.map((pair) => pair.player);
  const starterPlayers = selectedPairs.filter((pair) => pair.selection.isStarter).map((pair) => pair.player);
  const benchPlayers = selectedPairs.filter((pair) => !pair.selection.isStarter).map((pair) => pair.player);
  const spent = roundFantasyValue(selectedPlayers.reduce((total, player) => total + player.price, 0));
  const bank = roundFantasyValue(rules.budgetLimit - spent);
  const byPosition: FantasySquadSummary["byPosition"] = { GK: 0, DEF: 0, MID: 0, FWD: 0, UNK: 0 };
  const startersByPosition: FantasySquadSummary["startersByPosition"] = { GK: 0, DEF: 0, MID: 0, FWD: 0, UNK: 0 };
  const benchByPosition: FantasySquadSummary["benchByPosition"] = { GK: 0, DEF: 0, MID: 0, FWD: 0, UNK: 0 };
  const byTeam: Record<string, number> = {};

  for (const player of selectedPlayers) {
    byPosition[player.positionGroup] += 1;
    if (player.teamId) byTeam[player.teamId] = (byTeam[player.teamId] ?? 0) + 1;
  }
  for (const player of starterPlayers) {
    startersByPosition[player.positionGroup] += 1;
  }
  for (const player of benchPlayers) {
    benchByPosition[player.positionGroup] += 1;
  }

  const violations: string[] = [];
  const warnings: string[] = [];
  const captainPairs = selectedPairs.filter((pair) => pair.selection.isCaptain);
  const viceCaptainPairs = selectedPairs.filter((pair) => pair.selection.isViceCaptain);
  if (captainPairs.length > 1) violations.push("Squad can contain only one captain");
  if (viceCaptainPairs.length > 1) violations.push("Squad can contain only one vice-captain");
  if (selectedPairs.some((pair) => pair.selection.isCaptain && pair.selection.isViceCaptain)) {
    violations.push("Captain and vice-captain must be different players");
  }
  if (captainPairs.some((pair) => !pair.selection.isStarter)) violations.push("Captain must be in the starting XI");
  if (viceCaptainPairs.some((pair) => !pair.selection.isStarter)) violations.push("Vice-captain must be in the starting XI");
  if (spent > rules.budgetLimit) violations.push(`Budget exceeded by ${roundFantasyValue(spent - rules.budgetLimit)}`);
  if (selectedPlayers.length > rules.squadSize) violations.push(`Squad has ${selectedPlayers.length}/${rules.squadSize} players`);
  if (starterPlayers.length > rules.starterSize) violations.push(`Starting XI has ${starterPlayers.length}/${rules.starterSize} players`);
  if (starterPlayers.length === rules.starterSize) {
    const starterFieldPlayers = starterPlayers.length - startersByPosition.GK;
    if (startersByPosition.GK !== 1) violations.push(`Starting XI GK must be 1: ${startersByPosition.GK}/1`);
    if (starterFieldPlayers !== 10) violations.push(`Starting XI field players must be 10: ${starterFieldPlayers}/10`);
  }
  if (selectedPlayers.length === rules.squadSize && benchPlayers.length !== rules.benchSize) {
    violations.push(`Bench has ${benchPlayers.length}/${rules.benchSize} players`);
  }
  if (selectedPlayers.length === rules.squadSize) {
    const benchFieldPlayers = benchPlayers.length - benchByPosition.GK;
    const requiredBenchFieldPlayers = rules.benchSize - 1;
    if (benchByPosition.GK !== 1) violations.push(`Bench GK must be 1: ${benchByPosition.GK}/1`);
    if (benchFieldPlayers !== requiredBenchFieldPlayers) {
      violations.push(`Bench field players must be ${requiredBenchFieldPlayers}: ${benchFieldPlayers}/${requiredBenchFieldPlayers}`);
    }
  }

  for (const [position, maxCount] of Object.entries(rules.positionLimits)) {
    const positionGroup = position as keyof typeof rules.positionLimits;
    if (byPosition[positionGroup] > maxCount) violations.push(`${position} limit exceeded: ${byPosition[positionGroup]}/${maxCount}`);
    if (selectedPlayers.length === rules.squadSize && byPosition[positionGroup] !== maxCount) {
      violations.push(`${position} slots incomplete: ${byPosition[positionGroup]}/${maxCount}`);
    }
  }
  for (const [position, limit] of Object.entries(rules.starterPositionLimits)) {
    const positionGroup = position as keyof typeof rules.starterPositionLimits;
    if (startersByPosition[positionGroup] > limit.max) {
      violations.push(`${position} starters exceeded: ${startersByPosition[positionGroup]}/${limit.max}`);
    }
    if (starterPlayers.length === rules.starterSize && startersByPosition[positionGroup] < limit.min) {
      violations.push(`${position} starters incomplete: ${startersByPosition[positionGroup]}/${limit.min}`);
    } else if (starterPlayers.length < rules.starterSize && startersByPosition[positionGroup] < limit.min) {
      warnings.push(`${position} starters needed: ${startersByPosition[positionGroup]}/${limit.min}`);
    }
  }

  for (const [teamId, count] of Object.entries(byTeam)) {
    if (count > rules.maxPlayersPerTeam) {
      const teamName = selectedPlayers.find((player) => player.teamId === teamId)?.teamName ?? "Team";
      violations.push(`${teamName} limit exceeded: ${count}/${rules.maxPlayersPerTeam}`);
    }
  }

  return {
    selectedPlayers,
    starterPlayers,
    benchPlayers,
    spent,
    bank,
    projectedNext: roundFantasyValue(starterPlayers.reduce((total, player) => total + nextFantasyPoints(player), 0)),
    projectedHorizon: roundFantasyValue(starterPlayers.reduce((total, player) => total + playerHorizonPoints(player, horizon), 0)),
    byPosition,
    startersByPosition,
    benchByPosition,
    byTeam,
    violations,
    warnings
  };
}

export function canAddFantasyPlayer(
  player: FantasyPlannerPlayer,
  pool: FantasyPlannerPlayer[],
  selections: FantasySquadSelection[],
  rules: FantasySquadRules
) {
  return fantasyAddBlockReason(player, pool, selections, rules) === null;
}

export function fantasyAddBlockReason(
  player: FantasyPlannerPlayer,
  pool: FantasyPlannerPlayer[],
  selections: FantasySquadSelection[],
  rules: FantasySquadRules
) {
  if (selections.some((selection) => selection.playerId === player.playerId)) return "Already in squad";
  const summary = summarizeFantasySquad(pool, selections, rules, 1);
  if (summary.selectedPlayers.length >= rules.squadSize) return "Squad is full";
  const positionLimit = player.positionGroup === "UNK" ? 0 : rules.positionLimits[player.positionGroup];
  if (player.positionGroup === "UNK" || summary.byPosition[player.positionGroup] >= positionLimit) {
    return `${player.positionGroup} limit reached`;
  }
  if (player.teamId && (summary.byTeam[player.teamId] ?? 0) >= rules.maxPlayersPerTeam) {
    return `${player.teamName} limit reached`;
  }
  if (roundFantasyValue(summary.spent + player.price) > rules.budgetLimit) return "Budget limit";

  const nextSelections = [...selections, selectionForNewPlayer(player, pool, selections, rules)];
  const violations = summarizeFantasySquad(pool, nextSelections, rules, 1).violations;
  return violations[0] ?? null;
}

export function selectionForNewPlayer(
  player: FantasyPlannerPlayer,
  pool: FantasyPlannerPlayer[],
  selections: FantasySquadSelection[],
  rules: FantasySquadRules
): FantasySquadSelection {
  return selectionForPlayer(player, selections.length, canStartFantasyPlayer(player, pool, selections, rules));
}

export function selectionForPlayer(player: FantasyPlannerPlayer, slotIndex: number, isStarter = true): FantasySquadSelection {
  return {
    playerId: player.playerId,
    isStarter,
    isLocked: false,
    isCaptain: false,
    isViceCaptain: false,
    slotIndex,
    purchasePrice: player.price
  };
}

export function canStartFantasyPlayer(
  player: FantasyPlannerPlayer,
  pool: FantasyPlannerPlayer[],
  selections: FantasySquadSelection[],
  rules: FantasySquadRules
) {
  const nextSelections = selections.map((selection) =>
    selection.playerId === player.playerId ? { ...selection, isStarter: true } : selection
  );
  if (!nextSelections.some((selection) => selection.playerId === player.playerId)) {
    nextSelections.push(selectionForPlayer(player, selections.length, true));
  }
  return summarizeFantasySquad(pool, nextSelections, rules, 1).violations.length === 0;
}

export function validateFantasySquadForSave(input: {
  pool: FantasyPlannerPlayer[];
  selections: FantasySquadSelection[];
  rules: FantasySquadRules;
  horizon: number;
}): FantasySquadSaveValidation {
  const { pool, selections, rules, horizon } = input;
  const playersById = new Map(pool.map((player) => [player.playerId, player]));
  const seen = new Set<string>();
  const canonicalSelections: FantasySquadSelection[] = [];

  for (const selection of selections) {
    if (seen.has(selection.playerId)) {
      return { ok: false, error: `Player ${selection.playerId} is selected more than once.` };
    }
    seen.add(selection.playerId);

    const player = playersById.get(selection.playerId);
    if (!player) {
      return { ok: false, error: `Player ${selection.playerId} is not active in the selected league and season.` };
    }
    if (player.positionGroup === "UNK") {
      return { ok: false, error: `${player.name} has no valid fantasy position.` };
    }
    if (!player.teamId) {
      return { ok: false, error: `${player.name} has no active fantasy team.` };
    }

    canonicalSelections.push({
      ...selection,
      purchasePrice: player.price
    });
  }

  const summary = summarizeFantasySquad(pool, canonicalSelections, rules, horizon);
  if (summary.violations.length > 0) {
    return { ok: false, error: summary.violations[0] };
  }

  return { ok: true, selections: canonicalSelections, summary };
}

export function fantasySquadStrategyPlayerScore(
  player: FantasyPlannerPlayer,
  horizon: number,
  strategy: FantasySquadStrategy,
  basis: FantasyStarterOptimizationBasis = "horizon"
) {
  const baseScore = finiteScore(basis === "next" ? nextFantasyPoints(player) : playerHorizonPoints(player, horizon));
  if (strategy === "balanced") return baseScore;

  if (strategy === "reliable") {
    const minutesReliability = normalizedReliability(player.expectedMinutes, 90, 0.55);
    const startReliability = normalizedReliability(player.startProbability, 1, 0.55);
    const confidenceReliability = normalizedReliability(player.forecastConfidence, 1, 0.55);
    const reliability = minutesReliability * 0.45 + startReliability * 0.3 + confidenceReliability * 0.25;
    const riskMultiplier = 1 - Math.min(0.24, (player.forecastRisks?.length ?? 0) * 0.04);
    const sourceMultiplier = player.priceSource === "SPORTS_RU" ? 1 : 0.96;
    return Math.max(0, baseScore * (0.55 + reliability * 0.45) * riskMultiplier * sourceMultiplier);
  }

  const roundScores = player.roundPoints.slice(0, Math.max(1, horizon)).filter(Number.isFinite);
  const samples = roundScores.length > 0 ? roundScores : [finiteScore(nextFantasyPoints(player))];
  const mean = samples.reduce((total, score) => total + score, 0) / samples.length;
  const ceiling = Math.max(...samples);
  const variance = samples.reduce((total, score) => total + (score - mean) ** 2, 0) / samples.length;
  const volatility = Math.sqrt(variance);
  return Math.max(0, baseScore + ceiling * 0.35 + volatility * 0.5);
}

export type FantasySquadOptimizationInput = {
  pool: FantasyPlannerPlayer[];
  selections?: FantasySquadSelection[];
  rules: FantasySquadRules;
  horizon: number;
  basis?: FantasyStarterOptimizationBasis;
  strategy?: FantasySquadStrategy;
  excludedPlayerIds?: Iterable<string>;
  minimumBank?: number;
};

export function optimizeFantasySquad(input: FantasySquadOptimizationInput) {
  const {
    pool,
    selections = [],
    rules,
    horizon,
    basis = "horizon",
    strategy = "balanced",
    excludedPlayerIds = [],
    minimumBank = 0
  } = input;
  const positions = ["GK", "DEF", "MID", "FWD"] as const;
  const targets = positions.map((position) => rules.positionLimits[position]) as PositionCounts;
  if (targets.reduce((total, count) => total + count, 0) !== rules.squadSize) return null;

  const excludedIds = new Set(excludedPlayerIds);
  const existingById = new Map(selections.map((selection) => [selection.playerId, selection]));
  const lockedIds = new Set(selections.filter((selection) => selection.isLocked).map((selection) => selection.playerId));
  if ([...lockedIds].some((playerId) => excludedIds.has(playerId))) return null;

  const uniquePlayers = new Map<string, FantasyPlannerPlayer>();
  for (const player of pool) {
    if (uniquePlayers.has(player.playerId) || player.positionGroup === "UNK" || !player.teamId || excludedIds.has(player.playerId)) continue;
    if (!Number.isFinite(player.price) || player.price < 0) continue;
    uniquePlayers.set(player.playerId, player);
  }
  if ([...lockedIds].some((playerId) => !uniquePlayers.has(playerId))) return null;

  const budgetUnits = Math.floor((rules.budgetLimit - Math.max(0, minimumBank)) * 10 + 1e-7);
  if (budgetUnits < 0) return null;
  const scorePlayer = (player: FantasyPlannerPlayer) => fantasySquadStrategyPlayerScore(player, horizon, strategy, basis);
  const optimizerPool = [...uniquePlayers.values()];
  const candidates = optimizerPool.map((player) => ({
    player,
    positionIndex: positions.indexOf(player.positionGroup as (typeof positions)[number]),
    budgetUnits: Math.max(0, Math.round(player.price * 10)),
    score: finiteScore(scorePlayer(player)),
    teamKey: player.teamId ?? `__player_without_team__:${player.playerId}`
  }));
  if (candidates.length < rules.squadSize || candidates.some((candidate) => candidate.positionIndex < 0)) return null;

  const groupedCandidates = new Map<string, OptimizationCandidate[]>();
  for (const candidate of candidates) {
    const group = groupedCandidates.get(candidate.teamKey) ?? [];
    group.push(candidate);
    groupedCandidates.set(candidate.teamKey, group);
  }

  const teamOptions = [...groupedCandidates.values()]
    .map((teamCandidates) => buildTeamOptimizationOptions(teamCandidates, lockedIds, rules.maxPlayersPerTeam, targets, budgetUnits))
    .sort((left, right) => left.length - right.length);
  if (teamOptions.some((options) => options.length === 0)) return null;
  const remainingPositionCapacity = buildRemainingPositionCapacity(teamOptions);

  const budgetWidth = budgetUnits + 1;
  let states = new Map<number, SquadOptimizationState>();
  states.set(0, { counts: [0, 0, 0, 0], budgetUnits: 0, score: 0, previous: null, addedPlayerIds: [] });

  for (let teamIndex = 0; teamIndex < teamOptions.length; teamIndex += 1) {
    const options = teamOptions[teamIndex];
    const remainingCapacity = remainingPositionCapacity[teamIndex + 1];
    const nextStates = new Map<number, SquadOptimizationState>();
    for (const state of states.values()) {
      for (const option of options) {
        const counts = addPositionCounts(state.counts, option.counts);
        if (counts.some((count, index) => count > targets[index])) continue;
        if (counts.some((count, index) => count + remainingCapacity[index] < targets[index])) continue;
        const nextBudget = state.budgetUnits + option.budgetUnits;
        if (nextBudget > budgetUnits) continue;

        const score = state.score + option.score;
        const positionCode = encodePositionCounts(counts, targets);
        const key = positionCode * budgetWidth + nextBudget;
        const existing = nextStates.get(key);
        if (!existing || score > existing.score) {
          nextStates.set(key, {
            counts,
            budgetUnits: nextBudget,
            score,
            previous: state,
            addedPlayerIds: option.playerIds
          });
        }
      }
    }
    states = pruneOptimizationStates(nextStates, targets, budgetWidth);
    if (states.size === 0) return null;
  }

  const targetCode = encodePositionCounts(targets, targets);
  let best: SquadOptimizationState | null = null;
  for (const state of states.values()) {
    if (encodePositionCounts(state.counts, targets) !== targetCode) continue;
    if (!best || state.score > best.score || (state.score === best.score && state.budgetUnits < best.budgetUnits)) best = state;
  }
  if (!best) return null;
  const bestPlayerIds = optimizationStatePlayerIds(best);
  if (bestPlayerIds.length !== rules.squadSize) return null;

  const positionOrder = new Map(positions.map((position, index) => [position, index]));
  const selectedPlayers = bestPlayerIds
    .map((playerId) => uniquePlayers.get(playerId))
    .filter((player): player is FantasyPlannerPlayer => Boolean(player))
    .sort(
      (left, right) =>
        (positionOrder.get(left.positionGroup as (typeof positions)[number]) ?? positions.length) -
          (positionOrder.get(right.positionGroup as (typeof positions)[number]) ?? positions.length) ||
        scorePlayer(right) - scorePlayer(left) ||
        left.name.localeCompare(right.name)
    );
  if (selectedPlayers.length !== rules.squadSize) return null;

  const baseSelections = selectedPlayers.map((player, index) => {
    const existing = existingById.get(player.playerId);
    return {
      ...selectionForPlayer(player, index, existing?.isLocked ? existing.isStarter : false),
      isLocked: existing?.isLocked ?? false
    };
  });
  const optimized = optimizeFantasyStarters({ pool: optimizerPool, selections: baseSelections, rules, horizon, basis, strategy, respectLocks: true });
  if (!optimized) return null;

  const starters = optimized
    .filter((selection) => selection.isStarter)
    .sort((left, right) => {
      const leftPlayer = uniquePlayers.get(left.playerId);
      const rightPlayer = uniquePlayers.get(right.playerId);
      return (rightPlayer ? scorePlayer(rightPlayer) : 0) - (leftPlayer ? scorePlayer(leftPlayer) : 0);
    });
  const captainId = starters[0]?.playerId ?? null;
  const viceCaptainId = starters[1]?.playerId ?? null;
  const result = optimized.map((selection) => ({
    ...selection,
    isCaptain: selection.playerId === captainId,
    isViceCaptain: selection.playerId === viceCaptainId,
    purchasePrice: uniquePlayers.get(selection.playerId)?.price ?? selection.purchasePrice
  }));

  return summarizeFantasySquad(optimizerPool, result, rules, horizon).violations.length === 0 ? result : null;
}

type PositionCounts = [number, number, number, number];

type OptimizationCandidate = {
  player: FantasyPlannerPlayer;
  positionIndex: number;
  budgetUnits: number;
  score: number;
  teamKey: string;
};

type TeamOptimizationOption = {
  counts: PositionCounts;
  budgetUnits: number;
  score: number;
  playerIds: string[];
};

type SquadOptimizationState = {
  counts: PositionCounts;
  budgetUnits: number;
  score: number;
  previous: SquadOptimizationState | null;
  addedPlayerIds: string[];
};

function buildTeamOptimizationOptions(
  candidates: OptimizationCandidate[],
  lockedIds: Set<string>,
  maxPlayers: number,
  targets: PositionCounts,
  budgetLimit: number
) {
  const locked = candidates.filter((candidate) => lockedIds.has(candidate.player.playerId));
  if (locked.length > maxPlayers) return [];

  const lockedOption = locked.reduce<TeamOptimizationOption>(
    (option, candidate) => {
      option.counts[candidate.positionIndex] += 1;
      option.budgetUnits += candidate.budgetUnits;
      option.score += candidate.score;
      option.playerIds.push(candidate.player.playerId);
      return option;
    },
    { counts: [0, 0, 0, 0], budgetUnits: 0, score: 0, playerIds: [] }
  );
  if (lockedOption.budgetUnits > budgetLimit || lockedOption.counts.some((count, index) => count > targets[index])) return [];

  const optional = candidates.filter((candidate) => !lockedIds.has(candidate.player.playerId));
  const options = new Map<string, TeamOptimizationOption>();
  const visit = (startIndex: number, option: TeamOptimizationOption) => {
    const key = `${option.counts.join(":")}:${option.budgetUnits}`;
    const existing = options.get(key);
    if (!existing || option.score > existing.score) {
      options.set(key, {
        counts: [...option.counts] as PositionCounts,
        budgetUnits: option.budgetUnits,
        score: option.score,
        playerIds: [...option.playerIds]
      });
    }
    if (option.playerIds.length >= maxPlayers) return;

    for (let index = startIndex; index < optional.length; index += 1) {
      const candidate = optional[index];
      if (option.counts[candidate.positionIndex] >= targets[candidate.positionIndex]) continue;
      if (option.budgetUnits + candidate.budgetUnits > budgetLimit) continue;
      const counts = [...option.counts] as PositionCounts;
      counts[candidate.positionIndex] += 1;
      visit(index + 1, {
        counts,
        budgetUnits: option.budgetUnits + candidate.budgetUnits,
        score: option.score + candidate.score,
        playerIds: [...option.playerIds, candidate.player.playerId]
      });
    }
  };
  visit(0, lockedOption);

  return pruneTeamOptimizationOptions([...options.values()]);
}

function pruneTeamOptimizationOptions(options: TeamOptimizationOption[]) {
  const grouped = new Map<string, TeamOptimizationOption[]>();
  for (const option of options) {
    const key = option.counts.join(":");
    const group = grouped.get(key) ?? [];
    group.push(option);
    grouped.set(key, group);
  }

  const result: TeamOptimizationOption[] = [];
  for (const group of grouped.values()) {
    let bestScore = Number.NEGATIVE_INFINITY;
    const frontier: TeamOptimizationOption[] = [];
    for (const option of group.sort((left, right) => left.budgetUnits - right.budgetUnits || right.score - left.score)) {
      if (option.score <= bestScore) continue;
      bestScore = option.score;
      frontier.push(option);
    }
    result.push(...evenlySampleOptimizationFrontier(frontier, fantasyOptimizerTeamBudgetFrontierLimit));
  }
  return result;
}

function buildRemainingPositionCapacity(teamOptions: TeamOptimizationOption[][]) {
  const remaining = Array.from({ length: teamOptions.length + 1 }, () => [0, 0, 0, 0] as PositionCounts);
  for (let index = teamOptions.length - 1; index >= 0; index -= 1) {
    const teamMaximums = teamOptions[index].reduce<PositionCounts>(
      (maximums, option) => maximums.map((value, positionIndex) => Math.max(value, option.counts[positionIndex])) as PositionCounts,
      [0, 0, 0, 0]
    );
    remaining[index] = addPositionCounts(teamMaximums, remaining[index + 1]);
  }
  return remaining;
}

function pruneOptimizationStates(states: Map<number, SquadOptimizationState>, targets: PositionCounts, budgetWidth: number) {
  const grouped = new Map<number, SquadOptimizationState[]>();
  for (const state of states.values()) {
    const positionCode = encodePositionCounts(state.counts, targets);
    const group = grouped.get(positionCode) ?? [];
    group.push(state);
    grouped.set(positionCode, group);
  }

  const result = new Map<number, SquadOptimizationState>();
  for (const [positionCode, group] of grouped) {
    let bestScore = Number.NEGATIVE_INFINITY;
    const frontier: SquadOptimizationState[] = [];
    for (const state of group.sort((left, right) => left.budgetUnits - right.budgetUnits || right.score - left.score)) {
      if (state.score <= bestScore) continue;
      bestScore = state.score;
      frontier.push(state);
    }

    const retained = evenlySampleOptimizationFrontier(frontier, fantasyOptimizerBudgetFrontierLimit);
    for (const state of retained) {
      result.set(positionCode * budgetWidth + state.budgetUnits, state);
    }
  }
  return result;
}

function evenlySampleOptimizationFrontier<T>(frontier: T[], limit: number) {
  if (frontier.length <= limit) return frontier;
  const retained: T[] = [];
  const indices = new Set<number>();
  for (let index = 0; index < limit; index += 1) {
    indices.add(Math.round((index * (frontier.length - 1)) / (limit - 1)));
  }
  for (const index of indices) retained.push(frontier[index]);
  return retained;
}

function encodePositionCounts(counts: PositionCounts, targets: PositionCounts) {
  return (((counts[0] * (targets[1] + 1) + counts[1]) * (targets[2] + 1) + counts[2]) * (targets[3] + 1) + counts[3]);
}

function addPositionCounts(left: PositionCounts, right: PositionCounts): PositionCounts {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2], left[3] + right[3]];
}

function optimizationStatePlayerIds(state: SquadOptimizationState) {
  const chunks: string[][] = [];
  let current: SquadOptimizationState | null = state;
  while (current) {
    if (current.addedPlayerIds.length > 0) chunks.push(current.addedPlayerIds);
    current = current.previous;
  }
  return chunks.reverse().flat();
}

function finiteScore(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function normalizedReliability(value: number | null | undefined, scale: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value / scale));
}

export function optimizeFantasyStarters(input: {
  pool: FantasyPlannerPlayer[];
  selections: FantasySquadSelection[];
  rules: FantasySquadRules;
  horizon: number;
  basis?: FantasyStarterOptimizationBasis;
  strategy?: FantasySquadStrategy;
  respectLocks?: boolean;
}) {
  const { pool, selections, rules, horizon, basis = "horizon", strategy = "balanced", respectLocks = true } = input;
  const playersById = new Map(pool.map((player) => [player.playerId, player]));
  const selectedPairs = selections
    .map((selection) => {
      const player = playersById.get(selection.playerId);
      return player ? { selection, player } : null;
    })
    .filter((pair): pair is { selection: FantasySquadSelection; player: FantasyPlannerPlayer } => Boolean(pair))
    .filter((pair) => pair.player.positionGroup !== "UNK");

  if (selectedPairs.length < rules.starterSize) return null;

  const scorePlayer = (player: FantasyPlannerPlayer) => fantasySquadStrategyPlayerScore(player, horizon, strategy, basis);
  const forcedStarterIds = new Set(
    selectedPairs
      .filter((pair) => respectLocks && pair.selection.isLocked && pair.selection.isStarter)
      .map((pair) => pair.player.playerId)
  );
  const forcedBenchIds = new Set(
    selectedPairs
      .filter((pair) => respectLocks && pair.selection.isLocked && !pair.selection.isStarter)
      .map((pair) => pair.player.playerId)
  );
  const formationOptions: Array<Record<Exclude<FantasyPositionGroup, "UNK">, number>> = [];

  for (let def = rules.starterPositionLimits.DEF.min; def <= rules.starterPositionLimits.DEF.max; def += 1) {
    for (let mid = rules.starterPositionLimits.MID.min; mid <= rules.starterPositionLimits.MID.max; mid += 1) {
      for (let fwd = rules.starterPositionLimits.FWD.min; fwd <= rules.starterPositionLimits.FWD.max; fwd += 1) {
        if (def + mid + fwd !== rules.starterSize - 1) continue;
        formationOptions.push({ GK: 1, DEF: def, MID: mid, FWD: fwd });
      }
    }
  }

  let best: { ids: Set<string>; score: number } | null = null;
  for (const formation of formationOptions) {
    const starterIds = new Set<string>();
    let score = 0;
    let valid = true;

    for (const position of ["GK", "DEF", "MID", "FWD"] as const) {
      const targetCount = formation[position];
      const forced = selectedPairs
        .filter((pair) => pair.player.positionGroup === position && forcedStarterIds.has(pair.player.playerId))
        .sort((left, right) => scorePlayer(right.player) - scorePlayer(left.player));
      const candidates = selectedPairs
        .filter((pair) => pair.player.positionGroup === position && !forcedStarterIds.has(pair.player.playerId) && !forcedBenchIds.has(pair.player.playerId))
        .sort((left, right) => scorePlayer(right.player) - scorePlayer(left.player));

      if (forced.length > targetCount || forced.length + candidates.length < targetCount) {
        valid = false;
        break;
      }

      for (const pair of [...forced, ...candidates.slice(0, targetCount - forced.length)]) {
        starterIds.add(pair.player.playerId);
        score += scorePlayer(pair.player);
      }
    }

    if (!valid || starterIds.size !== rules.starterSize) continue;
    const optimized = selections.map((selection) => ({ ...selection, isStarter: starterIds.has(selection.playerId) }));
    if (summarizeFantasySquad(pool, optimized, rules, horizon).violations.length > 0) continue;
    if (!best || score > best.score) best = { ids: starterIds, score };
  }

  if (!best) return null;
  return selections.map((selection) => ({ ...selection, isStarter: best.ids.has(selection.playerId) }));
}

export function buildTransferSuggestions(input: {
  pool: FantasyPlannerPlayer[];
  selections: FantasySquadSelection[];
  rules: FantasySquadRules;
  horizon: number;
  transferCount: number;
}) {
  const { pool, selections, rules, horizon, transferCount } = input;
  if (transferCount <= 0) return [];

  const selectedIds = new Set(selections.map((selection) => selection.playerId));
  const playersById = new Map(pool.map((player) => [player.playerId, player]));
  const lockedIds = new Set(selections.filter((selection) => selection.isLocked).map((selection) => selection.playerId));
  const selectedPlayers = selections.map((selection) => playersById.get(selection.playerId)).filter((player): player is FantasyPlannerPlayer => Boolean(player));
  const suggestions: TransferSuggestion[] = [];

  for (const outPlayer of selectedPlayers) {
    if (lockedIds.has(outPlayer.playerId)) continue;

    const remainingSelections = selections.filter((selection) => selection.playerId !== outPlayer.playerId);
    for (const inPlayer of pool) {
      if (selectedIds.has(inPlayer.playerId)) continue;
      if (inPlayer.positionGroup !== outPlayer.positionGroup) continue;

      const outSelection = selections.find((selection) => selection.playerId === outPlayer.playerId);
      const nextSelections = [
        ...remainingSelections,
        selectionForPlayer(inPlayer, outPlayerIndex(selections, outPlayer.playerId), outSelection?.isStarter ?? true)
      ];
      if (summarizeFantasySquad(pool, nextSelections, rules, horizon).violations.length > 0) continue;

      const nextDelta = roundFantasyValue(nextFantasyPoints(inPlayer) - nextFantasyPoints(outPlayer));
      const horizonDelta = roundFantasyValue(playerHorizonPoints(inPlayer, horizon) - playerHorizonPoints(outPlayer, horizon));
      if (nextDelta <= 0 || horizonDelta < 0) continue;

      const priceDelta = roundFantasyValue(inPlayer.price - outPlayer.price);
      const score = roundFantasyValue(nextDelta * 1.8 + horizonDelta + Math.max(0, -priceDelta) * 0.15);
      suggestions.push({
        outPlayerId: outPlayer.playerId,
        inPlayerId: inPlayer.playerId,
        outName: outPlayer.name,
        inName: inPlayer.name,
        positionGroup: outPlayer.positionGroup,
        outTeamName: outPlayer.teamName,
        inTeamName: inPlayer.teamName,
        priceDelta,
        nextDelta,
        horizonDelta,
        score
      });
    }
  }

  const usedOut = new Set<string>();
  const usedIn = new Set<string>();
  const result: TransferSuggestion[] = [];
  for (const suggestion of suggestions.sort((left, right) => right.score - left.score)) {
    if (usedOut.has(suggestion.outPlayerId) || usedIn.has(suggestion.inPlayerId)) continue;
    result.push(suggestion);
    usedOut.add(suggestion.outPlayerId);
    usedIn.add(suggestion.inPlayerId);
    if (result.length >= transferCount) break;
  }

  return result;
}

export function buildTransferPlanSuggestions(input: {
  pool: FantasyPlannerPlayer[];
  selections: FantasySquadSelection[];
  rules: FantasySquadRules;
  horizon: number;
  transferCount: number;
  maximumPlans?: number;
  freeTransfers?: number | null;
  paidTransferPointCost?: number | null;
}) {
  const { pool, selections, rules, horizon } = input;
  const maximumPlans = Math.max(3, Math.min(12, Math.floor(input.maximumPlans ?? 6)));
  const maximumMoves = Math.min(3, Math.max(0, Math.floor(input.transferCount)));
  if (maximumMoves === 0 || selections.length === 0) return [];

  const currentSummary = summarizeFantasySquad(pool, selections, rules, horizon);
  const validationContext: TransferPlanValidationContext | null =
    currentSummary.violations.length === 0
      ? {
          spent: currentSummary.spent,
          byTeam: currentSummary.byTeam
        }
      : null;

  const selectedIds = new Set(selections.map((selection) => selection.playerId));
  const playersById = new Map(pool.map((player) => [player.playerId, player]));
  const outgoing = selections
    .filter((selection) => !selection.isLocked)
    .map((selection) => {
      const player = playersById.get(selection.playerId);
      return player ? { selection, player } : null;
    })
    .filter((pair): pair is { selection: FantasySquadSelection; player: FantasyPlannerPlayer } => Boolean(pair));
  const candidatesByPosition = new Map<FantasyPositionGroup, FantasyPlannerPlayer[]>();
  for (const position of ["GK", "DEF", "MID", "FWD"] as const) {
    candidatesByPosition.set(
      position,
      pool
        .filter((player) => !selectedIds.has(player.playerId) && player.positionGroup === position)
        .sort((left, right) => transferCandidateScore(right, horizon) - transferCandidateScore(left, horizon) || left.price - right.price)
        .slice(0, 8)
    );
  }

  const retained: TransferPlanSuggestion[] = [];
  const seen = new Set<string>();
  let evaluated = 0;
  const evaluationLimit = 120_000;

  for (let moveCount = 1; moveCount <= Math.min(maximumMoves, outgoing.length); moveCount += 1) {
    for (const outgoingSet of combinations(outgoing, moveCount)) {
      const incomingSets = outgoingSet.map((pair) => candidatesByPosition.get(pair.player.positionGroup) ?? []);
      if (incomingSets.some((values) => values.length === 0)) continue;

      visitIncomingCombinations(incomingSets, 0, [], new Set(), (incoming) => {
        if (evaluated >= evaluationLimit) return false;
        evaluated += 1;
        const plan = evaluateTransferPlan({
          pool,
          selections,
          rules,
          horizon,
          outgoing: outgoingSet,
          incoming,
          validationContext,
          freeTransfers: input.freeTransfers,
          paidTransferPointCost: input.paidTransferPointCost
        });
        if (!plan || seen.has(plan.id)) return true;
        seen.add(plan.id);
        retainBestTransferPlan(retained, plan, maximumPlans * 12);
        return true;
      });
      if (evaluated >= evaluationLimit) break;
    }
    if (evaluated >= evaluationLimit) break;
  }

  const sorted = retained.sort(compareTransferPlans);
  const selectedPlans: TransferPlanSuggestion[] = [];
  const add = (plan: TransferPlanSuggestion | undefined) => {
    if (plan && !selectedPlans.some((current) => current.id === plan.id)) selectedPlans.push(plan);
  };
  add(sorted[0]);
  if (maximumMoves >= 2) add(sorted.find((plan) => plan.transferCount === 2));
  if (maximumMoves >= 3) add(sorted.find((plan) => plan.transferCount === 3));
  for (const plan of sorted) {
    add(plan);
    if (selectedPlans.length >= maximumPlans) break;
  }
  return selectedPlans.slice(0, maximumPlans);
}

type TransferPlanValidationContext = {
  spent: number;
  byTeam: Record<string, number>;
};

function evaluateTransferPlan(input: {
  pool: FantasyPlannerPlayer[];
  selections: FantasySquadSelection[];
  rules: FantasySquadRules;
  horizon: number;
  outgoing: Array<{ selection: FantasySquadSelection; player: FantasyPlannerPlayer }>;
  incoming: FantasyPlannerPlayer[];
  validationContext: TransferPlanValidationContext | null;
  freeTransfers?: number | null;
  paidTransferPointCost?: number | null;
}): TransferPlanSuggestion | null {
  const replacementByOutgoingId = new Map(input.outgoing.map((pair, index) => [pair.player.playerId, input.incoming[index]]));
  const nextSelections = input.selections.map((selection) => {
    const incoming = replacementByOutgoingId.get(selection.playerId);
    return incoming
      ? {
          ...selection,
          playerId: incoming.playerId,
          purchasePrice: incoming.price,
          isLocked: false
        }
      : selection;
  });
  const isValid = input.validationContext
    ? transferPlanFitsValidatedSquad(input.validationContext, input.outgoing, input.incoming, input.rules)
    : summarizeFantasySquad(input.pool, nextSelections, input.rules, input.horizon).violations.length === 0;
  if (!isValid) return null;

  const moves = input.outgoing.map((pair, index): TransferPlanMove => {
    const incoming = input.incoming[index];
    return {
      outPlayerId: pair.player.playerId,
      inPlayerId: incoming.playerId,
      outName: pair.player.name,
      inName: incoming.name,
      positionGroup: pair.player.positionGroup,
      outTeamName: pair.player.teamName,
      inTeamName: incoming.teamName,
      priceDelta: roundFantasyValue(incoming.price - pair.player.price),
      round1Delta: roundFantasyValue(nextFantasyPoints(incoming) - nextFantasyPoints(pair.player)),
      round3Delta: projectionDelta(incoming, pair.player, 3),
      round5Delta: projectionDelta(incoming, pair.player, 5)
    };
  });
  const round1Delta = roundFantasyValue(sumPlanValues(moves.map((move) => move.round1Delta)) ?? 0);
  const rawRound3Delta = sumPlanValues(moves.map((move) => move.round3Delta));
  const rawRound5Delta = sumPlanValues(moves.map((move) => move.round5Delta));
  const round3Delta = rawRound3Delta === null ? null : roundFantasyValue(rawRound3Delta);
  const round5Delta = rawRound5Delta === null ? null : roundFantasyValue(rawRound5Delta);
  const horizonDelta = roundFantasyValue(
    input.incoming.reduce((total, player) => total + playerHorizonPoints(player, input.horizon), 0) -
      input.outgoing.reduce((total, pair) => total + playerHorizonPoints(pair.player, input.horizon), 0)
  );
  if (horizonDelta <= 0 && round1Delta <= 0 && (round3Delta ?? 0) <= 0 && (round5Delta ?? 0) <= 0) return null;

  const priceDelta = roundFantasyValue(sumPlanValues(moves.map((move) => move.priceDelta)) ?? 0);
  const transferCostConfigured = isNonNegativeInteger(input.freeTransfers) && isNonNegativeNumber(input.paidTransferPointCost);
  const paidTransferLoss = transferCostConfigured
    ? roundFantasyValue(Math.max(0, moves.length - (input.freeTransfers ?? 0)) * (input.paidTransferPointCost ?? 0))
    : null;
  const netHorizonDelta = paidTransferLoss === null ? null : roundFantasyValue(horizonDelta - paidTransferLoss);
  if (netHorizonDelta !== null && netHorizonDelta <= 0) return null;

  const risks = transferPlanRisks(input.incoming, moves, paidTransferLoss);
  const reason = `Projected gain ${signedFantasyValue(horizonDelta)} over ${input.horizon} round${input.horizon === 1 ? "" : "s"}${priceDelta <= 0 ? ` while saving ${roundFantasyValue(-priceDelta)}` : ""}`;
  const score = roundFantasyValue(
    (netHorizonDelta ?? horizonDelta) + round1Delta * 0.7 + (round3Delta ?? 0) * 0.15 + (round5Delta ?? 0) * 0.08 + Math.max(0, -priceDelta) * 0.05 - risks.length * 0.05
  );
  const id = moves
    .map((move) => `${move.outPlayerId}>${move.inPlayerId}`)
    .sort()
    .join("|");

  return {
    id,
    moves,
    transferCount: moves.length,
    priceDelta,
    round1Delta,
    round3Delta,
    round5Delta,
    horizonDelta,
    paidTransferLoss,
    netHorizonDelta,
    reason,
    risks,
    score
  };
}

function transferPlanFitsValidatedSquad(
  context: TransferPlanValidationContext,
  outgoing: Array<{ player: FantasyPlannerPlayer }>,
  incoming: FantasyPlannerPlayer[],
  rules: FantasySquadRules
) {
  if (outgoing.length !== incoming.length || new Set(incoming.map((player) => player.playerId)).size !== incoming.length) return false;

  let spent = context.spent;
  const byTeam = { ...context.byTeam };
  for (const pair of outgoing) {
    spent -= pair.player.price;
    if (pair.player.teamId) byTeam[pair.player.teamId] = Math.max(0, (byTeam[pair.player.teamId] ?? 0) - 1);
  }

  for (let index = 0; index < incoming.length; index += 1) {
    const player = incoming[index];
    if (!player.teamId || player.positionGroup === "UNK" || player.positionGroup !== outgoing[index].player.positionGroup) return false;
    spent += player.price;
    byTeam[player.teamId] = (byTeam[player.teamId] ?? 0) + 1;
  }

  if (roundFantasyValue(spent) > rules.budgetLimit) return false;
  return Object.values(byTeam).every((count) => count <= rules.maxPlayersPerTeam);
}

function transferPlanRisks(incoming: FantasyPlannerPlayer[], moves: TransferPlanMove[], paidTransferLoss: number | null) {
  const risks: string[] = [];
  if (paidTransferLoss === null) risks.push("Paid-transfer point cost is not configured");
  if (moves.some((move) => move.round1Delta < 0)) risks.push("At least one move loses projected points next round");
  if (moves.some((move) => move.round3Delta === null || move.round5Delta === null)) risks.push("The loaded schedule does not cover every 3/5-round comparison");
  if (incoming.some((player) => player.forecastConfidence !== null && player.forecastConfidence !== undefined && player.forecastConfidence < 0.6)) {
    risks.push("At least one incoming player has low forecast confidence");
  }
  if (incoming.some((player) => player.expectedMinutes !== null && player.expectedMinutes !== undefined && player.expectedMinutes < 60)) {
    risks.push("At least one incoming player has fewer than 60 expected minutes");
  }
  return risks;
}

function projectionDelta(incoming: FantasyPlannerPlayer, outgoing: FantasyPlannerPlayer, rounds: number) {
  if (incoming.roundPoints.length < rounds || outgoing.roundPoints.length < rounds) return null;
  return roundFantasyValue(
    incoming.roundPoints.slice(0, rounds).reduce((total, value) => total + value, 0) -
      outgoing.roundPoints.slice(0, rounds).reduce((total, value) => total + value, 0)
  );
}

function sumPlanValues(values: Array<number | null>) {
  if (values.some((value) => value === null)) return null;
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

function transferCandidateScore(player: FantasyPlannerPlayer, horizon: number) {
  return playerHorizonPoints(player, horizon) + nextFantasyPoints(player) * 1.5 + (player.forecastConfidence ?? 0) - player.price * 0.02;
}

function combinations<T>(values: T[], count: number): T[][] {
  const result: T[][] = [];
  const visit = (start: number, current: T[]) => {
    if (current.length === count) {
      result.push([...current]);
      return;
    }
    for (let index = start; index <= values.length - (count - current.length); index += 1) {
      current.push(values[index]);
      visit(index + 1, current);
      current.pop();
    }
  };
  visit(0, []);
  return result;
}

function visitIncomingCombinations(
  choices: FantasyPlannerPlayer[][],
  index: number,
  current: FantasyPlannerPlayer[],
  used: Set<string>,
  visit: (players: FantasyPlannerPlayer[]) => boolean
): boolean {
  if (index === choices.length) return visit([...current]);
  for (const player of choices[index]) {
    if (used.has(player.playerId)) continue;
    used.add(player.playerId);
    current.push(player);
    const shouldContinue = visitIncomingCombinations(choices, index + 1, current, used, visit);
    current.pop();
    used.delete(player.playerId);
    if (!shouldContinue) return false;
  }
  return true;
}

function retainBestTransferPlan(plans: TransferPlanSuggestion[], plan: TransferPlanSuggestion, limit: number) {
  plans.push(plan);
  if (plans.length <= limit) return;
  let worstIndex = 0;
  for (let index = 1; index < plans.length; index += 1) {
    if (compareTransferPlans(plans[index], plans[worstIndex]) > 0) worstIndex = index;
  }
  plans.splice(worstIndex, 1);
}

function compareTransferPlans(left: TransferPlanSuggestion, right: TransferPlanSuggestion) {
  return right.score - left.score || right.horizonDelta - left.horizonDelta || left.transferCount - right.transferCount || left.id.localeCompare(right.id);
}

function signedFantasyValue(value: number) {
  return `${value >= 0 ? "+" : ""}${roundFantasyValue(value)}`;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function outPlayerIndex(selections: FantasySquadSelection[], playerId: string) {
  const selection = selections.find((item) => item.playerId === playerId);
  return selection?.slotIndex ?? selections.length;
}

export function nextFantasyPoints(player: Pick<FantasyPlannerPlayer, "predictedFp" | "roundPoints">) {
  return player.roundPoints.length > 0 ? (player.roundPoints[0] ?? 0) : (player.predictedFp ?? 0);
}
