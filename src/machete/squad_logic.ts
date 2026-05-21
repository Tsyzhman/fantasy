export type FantasyPositionGroup = "GK" | "DEF" | "MID" | "FWD" | "UNK";

export type FantasySquadRules = {
  budgetLimit: number;
  squadSize: number;
  maxPlayersPerTeam: number;
  positionLimits: Record<Exclude<FantasyPositionGroup, "UNK">, number>;
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
  valueScore: number;
  roundPoints: number[];
  fixtures: string[];
};

export type FantasySquadSelection = {
  playerId: string;
  isStarter: boolean;
  isLocked: boolean;
  slotIndex: number;
  purchasePrice: number | null;
};

export type FantasySquadSummary = {
  selectedPlayers: FantasyPlannerPlayer[];
  spent: number;
  bank: number;
  projectedNext: number;
  projectedHorizon: number;
  byPosition: Record<FantasyPositionGroup, number>;
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
  reason: string;
};

export const defaultFantasySquadRules: FantasySquadRules = {
  budgetLimit: 100,
  squadSize: 15,
  maxPlayersPerTeam: 2,
  positionLimits: {
    GK: 2,
    DEF: 5,
    MID: 5,
    FWD: 3
  },
  horizonOptions: [1, 3, 5, 10],
  sourceLabel: "Machete default"
};

export function normalizeFantasyPosition(position: string | null | undefined): FantasyPositionGroup {
  const value = position?.toLowerCase() ?? "";
  if (value === "gk" || value.includes("keeper")) return "GK";
  if (value === "def" || value.includes("defender") || value.includes("back")) return "DEF";
  if (value === "mid" || value.includes("midfielder")) return "MID";
  if (value === "fw" || value === "fwd" || value.includes("forward") || value.includes("striker") || value.includes("winger")) return "FWD";
  return "UNK";
}

export function roundFantasyValue(value: number) {
  return Math.round(value * 10) / 10;
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
  const selectedPlayers = selections.map((selection) => playersById.get(selection.playerId)).filter((player): player is FantasyPlannerPlayer => Boolean(player));
  const spent = roundFantasyValue(selectedPlayers.reduce((total, player) => total + player.price, 0));
  const bank = roundFantasyValue(rules.budgetLimit - spent);
  const byPosition: FantasySquadSummary["byPosition"] = { GK: 0, DEF: 0, MID: 0, FWD: 0, UNK: 0 };
  const byTeam: Record<string, number> = {};

  for (const player of selectedPlayers) {
    byPosition[player.positionGroup] += 1;
    if (player.teamId) byTeam[player.teamId] = (byTeam[player.teamId] ?? 0) + 1;
  }

  const violations: string[] = [];
  const warnings: string[] = [];
  if (spent > rules.budgetLimit) violations.push(`Budget exceeded by ${roundFantasyValue(spent - rules.budgetLimit)}`);
  if (selectedPlayers.length > rules.squadSize) violations.push(`Squad has ${selectedPlayers.length}/${rules.squadSize} players`);

  for (const [position, maxCount] of Object.entries(rules.positionLimits)) {
    const positionGroup = position as keyof typeof rules.positionLimits;
    if (byPosition[positionGroup] > maxCount) violations.push(`${position} limit exceeded: ${byPosition[positionGroup]}/${maxCount}`);
    if (selectedPlayers.length === rules.squadSize && byPosition[positionGroup] < maxCount) {
      warnings.push(`${position} slots incomplete: ${byPosition[positionGroup]}/${maxCount}`);
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
    spent,
    bank,
    projectedNext: roundFantasyValue(selectedPlayers.reduce((total, player) => total + (player.roundPoints[0] ?? 0), 0)),
    projectedHorizon: roundFantasyValue(selectedPlayers.reduce((total, player) => total + playerHorizonPoints(player, horizon), 0)),
    byPosition,
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
  if (selections.some((selection) => selection.playerId === player.playerId)) return false;
  const nextSelections = [...selections, selectionForPlayer(player, selections.length)];
  return summarizeFantasySquad(pool, nextSelections, rules, 1).violations.length === 0;
}

export function selectionForPlayer(player: FantasyPlannerPlayer, slotIndex: number): FantasySquadSelection {
  return {
    playerId: player.playerId,
    isStarter: true,
    isLocked: false,
    slotIndex,
    purchasePrice: player.price
  };
}

export function buildTransferSuggestions(input: {
  pool: FantasyPlannerPlayer[];
  selections: FantasySquadSelection[];
  rules: FantasySquadRules;
  horizon: number;
  transferCount: number;
}) {
  const { pool, selections, rules, horizon, transferCount } = input;
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

      const nextSelections = [...remainingSelections, selectionForPlayer(inPlayer, outPlayerIndex(selections, outPlayer.playerId))];
      if (summarizeFantasySquad(pool, nextSelections, rules, horizon).violations.length > 0) continue;

      const nextDelta = roundFantasyValue((inPlayer.roundPoints[0] ?? 0) - (outPlayer.roundPoints[0] ?? 0));
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
        score,
        reason: `+${nextDelta} next round, +${horizonDelta} over ${horizon} rounds`
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
