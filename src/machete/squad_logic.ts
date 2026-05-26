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

export type FantasyStarterOptimizationBasis = "next" | "horizon";

export const transfersPerFantasyRound = 3;

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
  if (["gk", "\u0432", "\u0432\u0440", "\u0432\u0440\u0442", "\u0432\u0440\u0430\u0442\u0430\u0440\u044c", "\u0432\u0440\u0430\u0442\u0430\u0440\u0438"].includes(compact) || value.includes("keeper")) return "GK";
  if (
    ["def", "\u0437", "\u0437\u0449", "\u0437\u0430\u0449", "\u0437\u0430\u0449\u0438\u0442\u043d\u0438\u043a", "\u0437\u0430\u0449\u0438\u0442\u043d\u0438\u043a\u0438"].includes(compact) ||
    value.includes("defender") ||
    value.includes("back")
  ) {
    return "DEF";
  }
  if (
    ["mid", "\u043f", "\u043f\u0437", "\u043f\u043e\u043b\u0443\u0437\u0430\u0449\u0438\u0442\u043d\u0438\u043a", "\u043f\u043e\u043b\u0443\u0437\u0430\u0449\u0438\u0442\u043d\u0438\u043a\u0438"].includes(compact) ||
    value.includes("midfielder")
  ) {
    return "MID";
  }
  if (
    ["fw", "fwd", "\u043d", "\u043d\u043f", "\u043d\u0430\u043f", "\u0444\u043e\u0440\u0432\u0430\u0440\u0434", "\u043d\u0430\u043f\u0430\u0434\u0430\u044e\u0449\u0438\u0439", "\u043d\u0430\u043f\u0430\u0434\u0430\u044e\u0449\u0438\u0435"].includes(compact) ||
    value.includes("forward") ||
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

export function optimizeFantasyStarters(input: {
  pool: FantasyPlannerPlayer[];
  selections: FantasySquadSelection[];
  rules: FantasySquadRules;
  horizon: number;
  basis?: FantasyStarterOptimizationBasis;
  respectLocks?: boolean;
}) {
  const { pool, selections, rules, horizon, basis = "horizon", respectLocks = true } = input;
  const playersById = new Map(pool.map((player) => [player.playerId, player]));
  const selectedPairs = selections
    .map((selection) => {
      const player = playersById.get(selection.playerId);
      return player ? { selection, player } : null;
    })
    .filter((pair): pair is { selection: FantasySquadSelection; player: FantasyPlannerPlayer } => Boolean(pair))
    .filter((pair) => pair.player.positionGroup !== "UNK");

  if (selectedPairs.length < rules.starterSize) return null;

  const scorePlayer = (player: FantasyPlannerPlayer) => (basis === "next" ? nextFantasyPoints(player) : playerHorizonPoints(player, horizon));
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

function outPlayerIndex(selections: FantasySquadSelection[], playerId: string) {
  const selection = selections.find((item) => item.playerId === playerId);
  return selection?.slotIndex ?? selections.length;
}

export function nextFantasyPoints(player: Pick<FantasyPlannerPlayer, "predictedFp" | "roundPoints">) {
  return player.roundPoints.length > 0 ? (player.roundPoints[0] ?? 0) : (player.predictedFp ?? 0);
}
