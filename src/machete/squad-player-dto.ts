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
  return compact;
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
