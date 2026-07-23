import type { FantasyPlannerPlayer, FantasyPositionGroup, FantasySquadSelection } from "@/machete/squad_logic";

export type FixtureChipSide = "home" | "away" | null;

export type FixtureChipPresentation = {
  label: string;
  title: string;
  side: FixtureChipSide;
  difficulty: number | null | undefined;
};

type SquadForecastPlayer = Pick<
  FantasyPlannerPlayer,
  "playerId" | "predictedFp" | "roundPoints" | "alternativeRoundPoints" | "alternativePredictedFp"
>;

function captainMultiplier(playerId: string, captainId?: string | null) {
  return playerId === captainId ? 2 : 1;
}

export function startingXiRoundPoints(
  players: ReadonlyArray<Pick<SquadForecastPlayer, "playerId" | "predictedFp" | "roundPoints">>,
  roundIndex: number,
  captainId?: string | null
) {
  return players.reduce(
    (total, player) => total +
      (player.roundPoints[roundIndex] ?? (roundIndex === 0 ? player.predictedFp ?? 0 : 0)) * captainMultiplier(player.playerId, captainId),
    0
  );
}

export function startingXiAlternativeRoundPoints(
  players: ReadonlyArray<Pick<SquadForecastPlayer, "playerId" | "alternativeRoundPoints" | "alternativePredictedFp">>,
  roundIndex: number,
  captainId?: string | null
) {
  const values = players.map((player) => ({
    player,
    value: player.alternativeRoundPoints && player.alternativeRoundPoints.length > roundIndex
      ? player.alternativeRoundPoints[roundIndex]
      : roundIndex === 0 ? player.alternativePredictedFp ?? null : null
  }));
  if (values.some(({ value }) => typeof value !== "number" || !Number.isFinite(value))) return null;
  return values.reduce(
    (total, { player, value }) => total + (value as number) * captainMultiplier(player.playerId, captainId),
    0
  );
}

export function startingXiAlternativeHorizonPoints(
  players: ReadonlyArray<Pick<SquadForecastPlayer, "playerId" | "alternativeRoundPoints" | "alternativePredictedFp">>,
  horizon: number,
  captainId?: string | null
) {
  const safeHorizon = Number.isFinite(horizon) ? Math.max(0, Math.floor(horizon)) : 0;
  const values = Array.from({ length: safeHorizon }, (_, roundIndex) =>
    startingXiAlternativeRoundPoints(players, roundIndex, captainId)
  );
  if (values.some((value) => value === null)) return null;
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}

export function startingXiFoontasyPoints(
  players: ReadonlyArray<Pick<FantasyPlannerPlayer, "playerId" | "foontasyPoints">>,
  captainId?: string | null
) {
  const availablePlayers = players.filter((player) => typeof player.foontasyPoints === "number");
  return {
    available: availablePlayers.length,
    total: availablePlayers.length === players.length
      ? availablePlayers.reduce(
        (total, player) => total + (player.foontasyPoints ?? 0) * captainMultiplier(player.playerId, captainId),
        0
      )
      : null
  };
}

export function fixtureChipPresentations(
  fixtures: string[],
  difficulties: Array<number | null | undefined>,
  horizon: number,
  fixtureFullNames?: string[]
): FixtureChipPresentation[] {
  return fixtures.slice(0, horizon).flatMap((roundLabel, roundIndex) =>
    roundLabel
      .split(/\s*,\s*/)
      .map((label, fixtureIndex) => fixtureChipPresentation(
        label,
        difficulties[roundIndex],
        fixtureFullNames?.[roundIndex]?.split(/\s*,\s*/)[fixtureIndex]
      ))
      .filter((fixture): fixture is FixtureChipPresentation => fixture !== null)
  );
}

function fixtureChipPresentation(rawLabel: string, difficulty: number | null | undefined, rawTitle?: string): FixtureChipPresentation | null {
  const labelText = rawLabel.trim();
  if (!labelText) return null;
  const title = rawTitle?.trim() || labelText;

  const leadingSide = labelText.match(/^([HA])\s+(.+)$/i);
  if (leadingSide) {
    return {
      label: leadingSide[2].trim(),
      title,
      side: leadingSide[1].toUpperCase() === "H" ? "home" : "away",
      difficulty
    };
  }

  const trailingSide = labelText.match(/^(.+?)\s*\(([HA])\)$/i);
  if (trailingSide) {
    return {
      label: trailingSide[1].trim(),
      title,
      side: trailingSide[2].toUpperCase() === "H" ? "home" : "away",
      difficulty
    };
  }

  return { label: labelText, title, side: null, difficulty };
}

export type SquadCardSwapResult =
  | { ok: true; selections: FantasySquadSelection[] }
  | { ok: false; reason: "PLAYER_NOT_FOUND" | "GOALKEEPER_MISMATCH" };

export function isSquadReplacementTarget(
  source: Pick<FantasySquadSelection, "isStarter"> | undefined,
  target: Pick<FantasySquadSelection, "isStarter"> | undefined,
  sourcePosition: FantasyPositionGroup | undefined,
  targetPosition: FantasyPositionGroup
) {
  if (!source || !target || !sourcePosition) return false;
  if (source.isStarter === target.isStarter) return false;
  return (sourcePosition === "GK") === (targetPosition === "GK");
}

export function swapSquadSelectionCards(
  selections: FantasySquadSelection[],
  players: ReadonlyArray<Pick<FantasyPlannerPlayer, "playerId" | "positionGroup">>,
  sourcePlayerId: string,
  targetPlayerId: string
): SquadCardSwapResult {
  const playersById = new Map(players.map((player) => [player.playerId, player]));
  const source = selections.find((selection) => selection.playerId === sourcePlayerId);
  const target = selections.find((selection) => selection.playerId === targetPlayerId);
  const sourcePlayer = playersById.get(sourcePlayerId);
  const targetPlayer = playersById.get(targetPlayerId);
  if (!source || !target || !sourcePlayer || !targetPlayer) return { ok: false, reason: "PLAYER_NOT_FOUND" };

  const sourceIsGoalkeeper = sourcePlayer.positionGroup === "GK";
  const targetIsGoalkeeper = targetPlayer.positionGroup === "GK";
  if (sourceIsGoalkeeper !== targetIsGoalkeeper) return { ok: false, reason: "GOALKEEPER_MISMATCH" };
  if (sourcePlayerId === targetPlayerId) return { ok: true, selections };

  const swapped = selections.map((selection) => {
    if (selection.playerId === sourcePlayerId) {
      return { ...selection, isStarter: target.isStarter, slotIndex: target.slotIndex };
    }
    if (selection.playerId === targetPlayerId) {
      return { ...selection, isStarter: source.isStarter, slotIndex: source.slotIndex };
    }
    return selection;
  });

  return { ok: true, selections: orderSquadSelectionsWithBenchGoalkeeperLast(swapped, players) };
}

export function orderSquadSelectionsWithBenchGoalkeeperLast(
  selections: FantasySquadSelection[],
  players: ReadonlyArray<Pick<FantasyPlannerPlayer, "playerId" | "positionGroup">>
) {
  const positionsByPlayerId = new Map(players.map((player) => [player.playerId, player.positionGroup]));
  const ordered = [...selections].sort((left, right) => left.slotIndex - right.slotIndex);
  const starters = ordered.filter((selection) => selection.isStarter);
  const bench = ordered.filter((selection) => !selection.isStarter);
  const benchOutfield = bench.filter((selection) => positionsByPlayerId.get(selection.playerId) !== "GK");
  const benchGoalkeepers = bench.filter((selection) => positionsByPlayerId.get(selection.playerId) === "GK");

  return [...starters, ...benchOutfield, ...benchGoalkeepers].map((selection, slotIndex) => ({
    ...selection,
    slotIndex
  }));
}
