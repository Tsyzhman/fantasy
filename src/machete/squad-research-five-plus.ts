// @spec spec://modules/machete/FEAT-001-global-ranking-strategy#research-forecasts
import type { PrismaClient } from "@prisma/client";
import type { ComponentProjectionIndex, PlannerRoundFixtures } from "./squad-projection";
import { fixturePlayerProjectionKey, fixtureTeamProjectionKey } from "./squad-projection";
import { fivePlusFixtureFeatures, fivePlusPlayerFeatures, type FivePlusPlayerContext } from "./squad-research-five-plus-features";
import { loadSquadFivePlusHistory } from "./squad-research-five-plus-history";
import { squadResearchForecasts, type SquadResearchRound } from "./squad-research-columns";
import { researchFixtureInputFromProjection, researchFixturePoints, type ResearchFixtureInput, type ResearchForecastHistory } from "./squad-research-forecast";
import { sportsRuResearchRidge } from "./squad-research-ridge";
import { squadFivePlusFeatureCount, squadFivePlusModels } from "./squad-research-five-plus-model";
import type { PlannerFixture } from "./squad-team-strength";

type Model = (typeof squadFivePlusModels)[number];
type Features = ReturnType<typeof fivePlusFixtureFeatures>;

export async function prepareSquadFivePlus(
  prisma: Pick<PrismaClient, "$queryRaw">,
  schedule: PlannerRoundFixtures,
  forecastable: readonly boolean[],
  asOf: Date,
  selectedTeams?: ReadonlySet<string>
) {
  const fixtures = schedule.rounds.flatMap((round, index) => forecastable[index]
    ? [...(schedule.fixturesByTeamRound.get(round.id)?.values() ?? [])].flat()
    : []);
  const relevant = selectedTeams ? fixtures.filter((fixture) => selectedTeams.has(fixture.teamId)) : fixtures;
  const teamIds = numericIds(relevant.flatMap(({ teamId, opponentTeamId }) => [teamId, opponentTeamId]));
  const matchIds = numericIds(relevant.map(({ coreMatchId }) => coreMatchId));
  const history = await loadSquadFivePlusHistory(prisma, teamIds, matchIds, asOf);
  const byFixtureTeam = new Map<string, Features>();
  for (const fixture of relevant) {
    const key = fixtureTeamProjectionKey(fixture.id, fixture.teamId);
    if (!byFixtureTeam.has(key)) {
      byFixtureTeam.set(key, fivePlusFixtureFeatures({ ...fixture, matchId: fixture.coreMatchId }, +asOf, history));
    }
  }
  return byFixtureTeam;
}

function numericIds(ids: Array<string | null | undefined>) {
  return [...new Set(ids.filter((id): id is string => !!id && /^\d+$/.test(id)))].map((id) => BigInt(id));
}

export function scoreSquadFivePlusRound(
  forecastable: boolean,
  fixtures: readonly PlannerFixture[],
  playerId: string,
  position: string,
  index: ComponentProjectionIndex,
  features: ReadonlyMap<string, Features>,
  player: FivePlusPlayerContext,
  history?: ResearchForecastHistory,
  recent?: readonly number[]
): SquadResearchRound | null {
  if (!forecastable || fixtures.length > 1) return null;
  if (fixtures.length === 0) return squadResearchForecasts.map(() => 0);
  const [fixture] = fixtures;
  const fixtureFeatures = features.get(fixtureTeamProjectionKey(fixture.id, fixture.teamId));
  if (!fixtureFeatures) return null;
  const projection = index.byFixturePlayer.get(fixturePlayerProjectionKey(fixture.id, playerId));
  const input = researchFixtureInputFromProjection(position, projection, history, recent);
  if (!input) return null;
  const vector = [
    null, ...fivePlusPlayerFeatures(input, player), ...fixtureFeatures.player(playerId),
    ...fixtureFeatures.team, ...fixtureFeatures.opponent
  ];
  const anchors = squadResearchForecasts.map(({ id }) => researchFixturePoints(id, input, sportsRuResearchRidge));
  return scoreSquadFivePlusFeatures(vector, anchors, fivePlusEventSignal(input));
}

export function scoreSquadFivePlusFeatures(vector: ReadonlyArray<number | null>, anchors: ReadonlyArray<number | null>, event: number) {
  if (vector.length !== squadFivePlusFeatureCount || anchors.length !== squadFivePlusModels.length) {
    throw new Error("Squad 5+ feature layout does not match the trained model");
  }
  return squadFivePlusModels.map((model, index) => {
    const anchor = anchors[index];
    if (anchor === null) return null;
    const raw = model.intercept + model.trees.reduce((sum, tree) => sum + scoreTree(tree, vector, anchor), 0);
    const signal = (1 - model.anchor) * raw + model.anchor * (Math.fround(anchor) - 4.25) * 1.6 + model.event * (event - 0.3) * 3;
    const p = 1 / (1 + Math.exp(-(model.slope * signal + model.offset)));
    return Math.round(p * 1000) / 10;
  });
}

function scoreTree(tree: Model["trees"][number], vector: ReadonlyArray<number | null>, anchor: number) {
  let node = tree[0];
  while (typeof node !== "number") {
    const [feature, boundary, left, right, missingLeft] = node;
    const value = feature === 0 ? Math.fround(anchor) : vector[feature];
    node = tree[(value == null ? missingLeft : Math.fround(value) <= boundary) ? left : right];
  }
  return node;
}

function fivePlusEventSignal(input: ResearchFixtureInput) {
  const defensive = input.position === "GK" || input.position === "DEF";
  const events = input.position === "GK" ? input.saves : input.recoveries;
  const threeEvents = 1 - Math.exp(-events) * (1 + events + events * events / 2);
  const attack = 1 - Math.exp(-input.goals - input.assists);
  const defence = defensive ? input.cleanSheets : input.position === "MID" ? threeEvents * input.cleanSheets : 0;
  return Math.min(input.appearance, attack + defence - attack * defence);
}
