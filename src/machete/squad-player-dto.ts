import { withoutRetiredFantasyForecasts } from "./retired-fantasy-forecasts";
import type {
  FantasyPlannerPlayer,
  FantasyProjectionFixtureInputs,
  FantasyProjectionListMetrics
} from "./squad_logic";

const projectionDetailKeys = [
  "projectedFixtureComponents",
  "projectionComponents",
  "projectionFormula",
  "alternativeProjectedFixtureComponents",
  "alternativeProjectionComponents",
  "alternativeProjectionFormula"
] as const satisfies ReadonlyArray<keyof FantasyPlannerPlayer>;

type FantasyPlayerProjectionDetailKey = typeof projectionDetailKeys[number];

export type FantasyPlayerPoolListItem = Omit<FantasyPlannerPlayer, FantasyPlayerProjectionDetailKey>;

export type FantasyPlayerProjectionDetails = Pick<
  FantasyPlannerPlayer,
  FantasyPlayerProjectionDetailKey | "playerId"
>;

export function toFantasyPlayerPoolListItem(
  player: FantasyPlannerPlayer
): FantasyPlayerPoolListItem {
  const compact: FantasyPlannerPlayer = {
    ...player,
    projectionListMetrics: projectionListMetrics(player.projectedFixtureComponents)
      ?? player.projectionListMetrics
      ?? null
  };
  for (const key of projectionDetailKeys) delete compact[key];
  return withoutRetiredFantasyForecasts(compact);
}

export function fantasyPlayerProjectionDetails(
  player: FantasyPlannerPlayer
): FantasyPlayerProjectionDetails {
  return {
    playerId: player.playerId,
    projectedFixtureComponents: player.projectedFixtureComponents,
    projectionComponents: player.projectionComponents,
    projectionFormula: player.projectionFormula,
    alternativeProjectedFixtureComponents: player.alternativeProjectedFixtureComponents,
    alternativeProjectionComponents: player.alternativeProjectionComponents,
    alternativeProjectionFormula: player.alternativeProjectionFormula
  };
}

function projectionListMetrics(
  input: FantasyProjectionFixtureInputs | null | undefined
): FantasyProjectionListMetrics | null | undefined {
  if (!input) return input;
  return {
    sixtyMinutesProbability: input.sixtyMinutesProbability,
    fullMatchProbability: input.fullMatchProbability,
    expectedGoals: input.expectedGoals,
    expectedAssists: input.expectedAssists,
    expectedRecoveries: input.expectedRecoveries,
    expectedSaves: input.expectedSaves,
    expectedYellowCards: input.expectedYellowCards,
    expectedRedCards: input.expectedRedCards,
    expectedGoalsConceded: input.expectedGoalsConceded,
    expectedCleanSheets: input.expectedCleanSheets
  };
}

export type SquadFoontasyUpdate = {
  revision: string;
  pointsByPlayerId: Record<string, number>;
};

/** @spec spec://modules/machete/FEAT-001-global-ranking-strategy#ffo-current-round */
export function applySquadFoontasyUpdate<
  T extends Pick<FantasyPlannerPlayer, "playerId" | "foontasyPoints" | "foontasyFetchedAt">
>(players: T[], update: SquadFoontasyUpdate): T[] {
  let changed = false;
  const updated = players.map((player) => {
    const points = update.pointsByPlayerId[player.playerId];
    const foontasyPoints = Number.isFinite(points) ? points : null;
    const foontasyFetchedAt = foontasyPoints === null ? null : update.revision;
    if (player.foontasyPoints === foontasyPoints && (player.foontasyFetchedAt ?? null) === foontasyFetchedAt) return player;
    changed = true;
    return { ...player, foontasyPoints, foontasyFetchedAt };
  });
  return changed ? updated : players;
}
