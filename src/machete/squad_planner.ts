import { ImportStatus, Prisma, type PrismaClient } from "@prisma/client";

import { formatDate } from "@/lib/format";
import { ExpiringPromiseCache } from "@/lib/expiring-promise-cache";
import { macheteLeagueDisplayName } from "@/lib/leagues/display";
import { normalizeSportsRuPlayerName } from "@/lib/providers/sports-ru-fantasy";
import { calculateAlternativeScore, calculateFantasyScore, getActiveScoringModelBundleForSource, type ActiveScoringModel } from "@/lib/scoring";
import {
  calculateCustomFormulaScore,
  calculateCustomFormulaScoreWithBreakdown
} from "@/lib/scoring/formula";
import { friendAlternativeFormulaDefaults } from "@/lib/scoring/formula-display";
import type { UserScoringFormulaPreference } from "@/lib/scoring/user-preferences";
import { providerTeamShortName } from "@/lib/teams/display";
import { playerPhotoPublicUrl } from "./player-photo-cache";
import {
  expectedProjectionFormulaConfig,
  friendAltProjectionFormulaConfig,
  parseProjectionFormulaConfig,
  type ProjectionFormulaConfig
} from "./projection-formula-config";
import {
  ProjectionInputError,
  projectTeamPlayers,
  type PlayerFixtureProjection,
  type ProbableParticipantInput,
  type ProjectedTeamTotals
} from "./deterministic_fantasy_projection";

import type { FantasyBacktestSample } from "./fantasy_backtest";
import {
  FANTASY_PROJECTION_CALIBRATION,
  predictCalibratedFantasyPoints,
  type FantasyProjectionCalibrationModel
} from "./fantasy_projection_calibration";
import { loadFantasyProjectionCalibration } from "./fantasy_projection_service";
import { FANTASY_MODEL_VERSION } from "./foontasy_style_model";
import { loadPlannerReadinessByScope, plannerReadinessKey, type PlannerReadiness } from "./planner_readiness";
import {
  defaultFantasyHistorySettings,
  fantasyHistorySettingsKey,
  resolveFantasyHistory,
  type FantasyHistorySettings,
  type ResolvedFantasyHistory
} from "./squad-history";
import {
  loadSharedMachetePlayerRows,
  type SharedLeagueSeasonOption,
  type SharedMachetePlayerRow,
  type SharedPlayerRowsScope
} from "./shared_read_model";
import {
  defaultFantasySquadRules,
  countFantasySquadTransfers,
  fantasyTransferLimitForHorizon,
  normalizeFantasyHorizon,
  normalizeFantasyPosition,
  roundFantasyValue,
  summarizeFantasySquad,
  createFantasySquadRoundPlans,
  validateFantasySquadForSave,
  type FantasyProjectionFixtureInputs,
  type FantasyPlannerPlayer,
  type FantasyPositionGroup,
  type FantasyRoundProjection,
  type FantasySquadRules,
  type FantasySquadSelection,
  type FantasySquadRoundPlan
} from "./squad_logic";

export type SavedFantasySquad = {
  id: string | null;
  name: string;
  leagueId: string;
  season: string;
  horizonRounds: number;
  selections: FantasySquadSelection[];
  roundPlans: FantasySquadRoundPlan[];
};

export type SavedFantasySquadOption = {
  id: string;
  name: string;
  playersCount: number;
  updatedAt: string;
};

export type FantasySquadPlannerData = {
  readiness: PlannerReadiness;
  rules: FantasySquadRules;
  rounds: FantasyRoundProjection[];
  players: FantasyPlannerPlayer[];
  squad: SavedFantasySquad;
  squads: SavedFantasySquadOption[];
  priceStatus: {
    sportsRuPrices: number;
    estimatedPrices: number;
    lastSyncedAt: string | null;
  };
  historySeasonOptions: string[];
};

export type PlannerFixture = {
  id: string;
  roundId: string;
  teamId: string;
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
};

function buildFixtureComponentInputs(projection: PlayerFixtureProjection | null): FantasyProjectionFixtureInputs | null {
  if (!projection) return null;

  return {
    expectedMinutes: projection.expectedMinutes ?? null,
    appearanceProbability: projection.probabilities?.appearance ?? null,
    sixtyMinutesProbability: projection.probabilities?.sixtyMinutes ?? null,
    fullMatchProbability: projection.probabilities?.fullMatch ?? null,
    expectedGoals: projection.expectedEvents?.goals ?? null,
    expectedAssists: projection.expectedEvents?.assists ?? null,
    expectedRecoveries: projection.expectedEvents?.recoveries ?? null,
    expectedSaves: projection.expectedEvents?.saves ?? null,
    expectedYellowCards: projection.expectedEvents?.yellowCards ?? null,
    expectedRedCards: projection.expectedEvents?.redCards ?? null,
    expectedGoalsConceded: projection.expectedEvents?.goalsConceded ?? null,
    expectedCleanSheets: projection.expectedEvents?.cleanSheets ?? null
  };
}

type PlannerMatch = {
  id: string;
  round: string | null;
  matchDate: Date | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeTeamFullName?: string | null;
  awayTeamFullName?: string | null;
  finished: boolean;
  cancelled: boolean;
  homeOver15Probability?: number | null;
  awayOver15Probability?: number | null;
  homeCleanSheetProbability?: number | null;
  awayCleanSheetProbability?: number | null;
  oddsFetchedAt?: Date | null;
};

export type FantasyFixtureProjection = Pick<PlannerFixture, "side" | "attackMultiplier" | "defenseMultiplier">;

export type PlannerRoundFixtures = {
  rounds: FantasyRoundProjection[];
  fixturesByTeamRound: Map<string, Map<string, PlannerFixture[]>>;
  teamShortNameById: Map<string, string>;
};

export type FantasyProjectionEngine = "COMPONENT_XFP_V1" | "LEGACY_RIDGE19_V1";

type ComponentProjectionIndex = {
  byFixturePlayer: Map<string, PlayerFixtureProjection>;
  formulaMetricsByFixturePlayer: Map<string, Record<string, unknown>>;
  errorsByFixtureTeam: Map<string, string>;
};

type ComponentProjectionMode = "PRIMARY" | "FRIEND_ALT";

type TeamStrengthSide = "home" | "away";

type TeamStrengthSample = {
  teamId: string;
  side: TeamStrengthSide;
  xgFor: number | null;
  xgAgainst: number | null;
  weight: number;
};

type TeamStrengthBlock = {
  matches: number;
  xgForPerMatch: number | null;
  xgAgainstPerMatch: number | null;
};

type TeamStrengthProfile = {
  home: TeamStrengthBlock;
  away: TeamStrengthBlock;
  overall: TeamStrengthBlock;
};

type TeamStrengthProfiles = {
  byTeamId: Map<string, TeamStrengthProfile>;
  league: TeamStrengthProfile;
};

type TeamStrengthMatchInput = {
  homeTeamId: string | null;
  awayTeamId: string | null;
  matchDate?: Date | string | null;
  teamStats: Array<{
    teamId: string;
    opponentTeamId?: string | null;
    isHome?: boolean | null;
    xg?: number | null;
    goals?: number | null;
  }>;
};

type SportsRuPositionPriceRow = {
  id: string;
  playerId: bigint | null;
  position: string | null;
  positionLabel?: string | null;
  sourceKind?: string | null;
  sourceRowIndex?: number | null;
};

type SportsRuPositionMapRow = {
  providerEntityId: string;
  internalEntityId: string | null;
};

type SportsRuScopedPriceRow = SportsRuPositionPriceRow & {
  leagueId: bigint;
  season: string;
  playerName: string;
  price: number;
};

type BaltikaPlayerMetric = {
  xg: number | null;
  xa: number | null;
  matchesPlayed: number | null;
  minutesPlayed: number | null;
  teamName: string;
};

export type SportsRuFantasyPriceRef = {
  playerId: string;
  leagueId: string;
  season: string;
  playerName: string;
  position: string | null;
  price: number;
};

const maxProjectionRounds = 10;
const defaultTeamXgPerMatch = 1.25;
const teamStrengthHalfLifeDays = 180;
const teamStrengthOverallPriorMatches = 6;
const teamStrengthVenuePriorMatches = 8;
const promotedTeamPriorMatches = 8;
const promotedTeamStrengthFactor = 0.81;
const promotedTeamRatioExponent = 0.6;
const teamStrengthFeederLeagueByTopLeague = new Map<string, bigint>([["63", 338n]]);
const fantasyPlayerPoolCacheTtlMs = 5 * 60_000;
const fantasyPlayerPoolCache = new ExpiringPromiseCache<string, FantasyPlannerPlayer[]>(20);
const upcomingRoundFixturesCacheTtlMs = 5 * 60_000;
const upcomingRoundFixturesCache = new ExpiringPromiseCache<string, PlannerRoundFixtures>(20);
export const maxFantasySquadNameLength = 80;

export async function loadCachedFantasySquadPlayerPool(
  prisma: PrismaClient,
  userId: string,
  league: SharedLeagueSeasonOption,
  historySettings: FantasyHistorySettings = defaultFantasyHistorySettings
) {
  const preference = await prisma.userScoringPreference.findUnique({
    where: { userId_modelSource: { userId, modelSource: "MACHETE" } },
    select: { id: true, updatedAt: true }
  });
  const preferenceKey = preference ? `${preference.id}:${preference.updatedAt.toISOString()}` : "global";
  const key = `${league.leagueId}:${league.season}:${league.updatedAt.toISOString()}:${preferenceKey}:${fantasyHistorySettingsKey(historySettings)}`;
  return fantasyPlayerPoolCache.getOrCreate(key, fantasyPlayerPoolCacheTtlMs, async () => {
    const data = await loadFantasySquadPlannerData(prisma, userId, league, null, { historySettings });
    return data.players;
  });
}

export async function loadFantasySquadPlannerData(
  prisma: PrismaClient,
  userId: string,
  league: SharedLeagueSeasonOption,
  squadId?: string | null,
  options?: {
    playerIds?: bigint[];
    readiness?: PlannerReadiness;
    historySettings?: FantasyHistorySettings;
    deferFormulaProjections?: boolean;
  }
): Promise<FantasySquadPlannerData> {
  const readiness = options?.readiness ?? (await loadPlannerReadinessByScope(prisma, [league])).get(plannerReadinessKey(league));
  if (!readiness) throw new Error(`Planner readiness could not be evaluated for ${league.leagueId}:${league.season}.`);
  const history = await resolveFantasyHistory(prisma, league, options?.historySettings ?? defaultFantasyHistorySettings);
  const sportsRuSeasons = sportsRuSeasonAliases(league.season);
  const [contest, savedSquads, rosterRows, playerRows, roundsAndFixtures, priceRows, foontasyRows, modelForecastRows, baltikaMetricsByName, rosterPlayerCount] = await Promise.all([
    prisma.sportsRuFantasyContest.findFirst({
      where: {
        provider: "SPORTS_RU",
        leagueId: league.leagueId,
        season: { in: sportsRuSeasons }
      },
      orderBy: { lastSyncedAt: "desc" }
    }),
    prisma.userFantasySquad.findMany({
      where: {
        userId,
        leagueId: league.leagueId,
        season: league.season
      },
      include: {
        players: {
          orderBy: { slotIndex: "asc" }
        }
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    }),
    prisma.teamPlayerSeason.findMany({
      where: {
        leagueId: league.leagueId,
        season: league.season,
        active: true,
        ...(options?.playerIds !== undefined ? { playerId: { in: options.playerIds } } : {})
      },
      include: {
        player: true,
        team: true
      },
      orderBy: [{ team: { name: "asc" } }, { player: { name: "asc" } }]
    }),
    loadProjectedPlayerRows(prisma, userId, league, history, options?.playerIds, options?.deferFormulaProjections),
    loadUpcomingRoundFixtures(prisma, league),
    prisma.fantasyPlayerPrice.findMany({
      where: {
        provider: "SPORTS_RU",
        leagueId: league.leagueId,
        season: { in: sportsRuSeasons }
      },
      orderBy: { lastSeenAt: "desc" }
    }),
    prisma.foontasyForecast.findMany({
      where: { leagueId: league.leagueId, season: league.season, playerId: { not: null } },
      orderBy: [{ fetchedAt: "desc" }, { updatedAt: "desc" }],
      distinct: ["playerId"],
      select: { playerId: true, points: true, fetchedAt: true }
    }),
    prisma.fantasyModelForecast?.findMany({
      where: { leagueId: league.leagueId, season: league.season, modelVersion: FANTASY_MODEL_VERSION, horizon: { in: [3, 5] } },
      select: { playerId: true, horizon: true, points: true, status: true, calculatedAt: true }
    }) ?? Promise.resolve([]),
    loadBaltikaPlayerMetricsByName(prisma, sportsRuSeasons),
    prisma.teamPlayerSeason.count({
      where: {
        leagueId: league.leagueId,
        season: league.season,
        active: true
      }
    })
  ]);
  const savedSquad = (squadId ? savedSquads.find((squad) => squad.id === squadId) : null) ?? savedSquads[0] ?? null;

  const priceMaps =
    priceRows.length > 0
      ? await prisma.providerEntityMap.findMany({
          where: {
            provider: "SPORTS_RU",
            providerEntityType: "FANTASY_PLAYER_PRICE",
            providerEntityId: { in: priceRows.map((row) => row.id) },
            internalEntityType: "PLAYER",
            internalEntityId: { not: null }
          },
          select: {
            providerEntityId: true,
            internalEntityId: true
          }
        })
      : [];
  const rules = fantasyRulesForLeague(league, contest ?? null);
  const projectedByPlayerTeam = new Map(playerRows.rows.map((row) => [playerTeamKey(row.playerId, row.teamId), row]));
  const prices = priceLookup(priceRows, priceMaps);
  const foontasyByPlayerId = new Map(foontasyRows.flatMap((row) => row.playerId ? [[String(row.playerId), row] as const] : []));
  const modelForecastByPlayerHorizon = new Map(modelForecastRows.map((row) => [`${row.playerId}:${row.horizon}`, row] as const));
  const sportsPositionsByPlayerId = sportsRuFantasyPositionsByPlayerId(priceRows, priceMaps);
  const componentProjections = options?.deferFormulaProjections
    ? emptyComponentProjectionIndex()
    : buildFormulaProjectionIndex(
        playerRows.friendRows,
        roundsAndFixtures,
        sportsPositionsByPlayerId,
        playerRows.expectedProjectionConfig
      );
  const friendAlternativeProjections = options?.deferFormulaProjections
    ? emptyComponentProjectionIndex()
    : buildFormulaProjectionIndex(
        playerRows.friendRows,
        roundsAndFixtures,
        sportsPositionsByPlayerId,
        playerRows.alternativeProjectionConfig,
        true
      );
  const preferredProjectionEngine = configuredFantasyProjectionEngine();
  const rosterPlayers: FantasyPlannerPlayer[] = rosterRows.flatMap((row) => {
    const projected = projectedByPlayerTeam.get(playerTeamKey(row.playerId, row.teamId));
    const nextFixture = roundsAndFixtures.rounds
      .flatMap((round) => roundsAndFixtures.fixturesByTeamRound.get(round.id)?.get(String(row.teamId)) ?? [])
      .at(0) ?? null;
    const legacyPredictedFp = projected
      ? calibratedPlayerFixturePoints(projected, nextFixture, playerRows.calibration?.model ?? null, playerRows.scoringModel)
      : null;
    const priceRow = prices.byPlayerId.get(String(row.playerId));
    const sportsPosition = sportsPositionsByPlayerId.get(String(row.playerId)) ?? (priceRow ? sportsRuPricePosition(priceRow) : null);
    const position = fantasyPlannerPosition(sportsPosition, row.position, projected?.position ?? null);
    const positionGroup = normalizeFantasyPosition(position);
    const foontasy = foontasyByPlayerId.get(String(row.playerId)) ?? null;
    const modelT3 = modelForecastByPlayerHorizon.get(`${row.playerId}:3`) ?? null;
    const modelT5 = modelForecastByPlayerHorizon.get(`${row.playerId}:5`) ?? null;
    const nextComponentProjection = nextFixture
      ? componentProjections.byFixturePlayer.get(fixturePlayerProjectionKey(nextFixture.id, String(row.playerId))) ?? null
      : null;
    const nextComponentFormula = nextComponentProjection
      ? projectionFormulaWithBreakdown(
          nextComponentProjection,
          nextFixture,
          playerRows.expectedProjectionConfig,
          componentProjections.formulaMetricsByFixturePlayer.get(fixturePlayerProjectionKey(nextFixture?.id ?? "", String(row.playerId)))
        )
      : null;
    const componentPredictedFp = nextComponentFormula?.total ?? null;
    const projectionEngine: FantasyProjectionEngine =
      preferredProjectionEngine === "COMPONENT_XFP_V1" && componentPredictedFp !== null
        ? "COMPONENT_XFP_V1"
        : "LEGACY_RIDGE19_V1";
    const predictedFp = projectionEngine === "COMPONENT_XFP_V1" ? componentPredictedFp : legacyPredictedFp;
    const nextFriendProjection = nextFixture
      ? friendAlternativeProjections.byFixturePlayer.get(fixturePlayerProjectionKey(nextFixture.id, String(row.playerId))) ?? null
      : null;
    const nextFriendFormula = nextFriendProjection
      ? projectionFormulaWithBreakdown(
          nextFriendProjection,
          nextFixture,
          playerRows.alternativeProjectionConfig,
          friendAlternativeProjections.formulaMetricsByFixturePlayer.get(fixturePlayerProjectionKey(nextFixture?.id ?? "", String(row.playerId)))
        )
      : null;
    const nextRoundFixtures = roundsAndFixtures.rounds.length > 0
      ? roundsAndFixtures.fixturesByTeamRound.get(roundsAndFixtures.rounds[0].id)?.get(String(row.teamId)) ?? []
      : [];
    const nextComponentRoundFormula = projectionRoundFormulaWithBreakdown(
      nextRoundFixtures,
      String(row.playerId),
      componentProjections,
      playerRows.expectedProjectionConfig
    );
    const nextFriendRoundFormula = projectionRoundFormulaWithBreakdown(
      nextRoundFixtures,
      String(row.playerId),
      friendAlternativeProjections,
      playerRows.alternativeProjectionConfig
    );
    const alternativePredictedFp = nextFriendFormula?.total ?? null;
    const price = resolveFantasyPlannerPrice(priceRow, predictedFp, positionGroup);
    const playerName = priceRow?.playerName ?? row.player.name;
    const baltikaMetric = baltikaMetricsByName.get(normalizeSportsRuPlayerName(playerName));
    const legacyRoundPoints = roundsAndFixtures.rounds.map((round) => {
      const fixtures = roundsAndFixtures.fixturesByTeamRound.get(round.id)?.get(String(row.teamId)) ?? [];
      return roundFantasyValue(
        fixtures.reduce((total, fixture) => {
          const fixturePoints = projected ? calibratedPlayerFixturePoints(projected, fixture, playerRows.calibration?.model ?? null, playerRows.scoringModel) ?? 0 : 0;
          return total + (playerRows.calibration ? fixturePoints : projectFixtureFantasyPoints(fixturePoints, positionGroup, fixture));
        }, 0)
      );
    });
    const componentRoundPoints = roundsAndFixtures.rounds.map((round) => {
      const fixtures = roundsAndFixtures.fixturesByTeamRound.get(round.id)?.get(String(row.teamId)) ?? [];
      if (fixtures.length === 0) return 0;
      const values = fixtures.map((fixture) => {
        const projection = componentProjections.byFixturePlayer.get(fixturePlayerProjectionKey(fixture.id, String(row.playerId)));
        const key = fixturePlayerProjectionKey(fixture.id, String(row.playerId));
        return projection ? projectionFormulaFantasyPoints(
          projection,
          fixture,
          playerRows.expectedProjectionConfig,
          componentProjections.formulaMetricsByFixturePlayer.get(key)
        ) : null;
      });
      return values.some((value) => value === null)
        ? null
        : roundFantasyValue(values.reduce<number>((total, value) => total + (value ?? 0), 0));
    });
    const roundPoints = roundsAndFixtures.rounds.map((_, index) =>
      projectionEngine === "COMPONENT_XFP_V1" && componentRoundPoints[index] !== null
        ? componentRoundPoints[index] ?? 0
        : legacyRoundPoints[index] ?? 0
    );
    const alternativeRoundPoints = roundsAndFixtures.rounds.map((round) => {
      const fixtures = roundsAndFixtures.fixturesByTeamRound.get(round.id)?.get(String(row.teamId)) ?? [];
      if (fixtures.length === 0) return 0;
      const values = fixtures.map((fixture) => {
        const projection = friendAlternativeProjections.byFixturePlayer.get(fixturePlayerProjectionKey(fixture.id, String(row.playerId)));
        const key = fixturePlayerProjectionKey(fixture.id, String(row.playerId));
        return projection ? projectionFormulaFantasyPoints(
          projection,
          fixture,
          playerRows.alternativeProjectionConfig,
          friendAlternativeProjections.formulaMetricsByFixturePlayer.get(key)
        ) : null;
      });
      return values.some((value) => value === null)
        ? null
        : roundFantasyValue(values.reduce<number>((total, value) => total + (value ?? 0), 0));
    });
    const fixtures = roundsAndFixtures.rounds.map((round) => {
      const teamFixtures = roundsAndFixtures.fixturesByTeamRound.get(round.id)?.get(String(row.teamId)) ?? [];
      return teamFixtures.map((fixture) => `${fixture.side} ${fixture.opponentName}`).join(", ");
    });
    const fixtureFullNames = roundsAndFixtures.rounds.map((round) => {
      const teamFixtures = roundsAndFixtures.fixturesByTeamRound.get(round.id)?.get(String(row.teamId)) ?? [];
      return teamFixtures.map((fixture) => `${fixture.side} ${fixture.opponentFullName}`).join(", ");
    });
    const fixtureDifficulties = roundsAndFixtures.rounds.map((round) => {
      const teamFixtures = roundsAndFixtures.fixturesByTeamRound.get(round.id)?.get(String(row.teamId)) ?? [];
      return aggregateRoundDifficulty(teamFixtures, positionGroup);
    });
    const forecastExplanation = buildFantasyForecastExplanation({
      matchesPlayed: projected?.matchesPlayed ?? 0,
      expectedMinutes: nextComponentProjection?.expectedMinutes ?? projected?.expectedMinutes ?? null,
      forecastConfidence: projected?.forecastConfidence ?? null,
      recentFp: projected?.recentFp ?? [],
      fixtureDifficulties,
      isStarter: row.isStarter
    });
    if (projectionEngine === "COMPONENT_XFP_V1") {
      forecastExplanation.factors.unshift("Component xFP: team forecast allocated by player xG/xA and expected minutes");
      if (nextFixture?.teamOver15Probability !== null && nextFixture?.teamOver15Probability !== undefined) {
        forecastExplanation.factors.push("Fresh bookmaker team-goal probability included");
      }
      if (nextFixture?.cleanSheetProbability !== null && nextFixture?.cleanSheetProbability !== undefined) {
        forecastExplanation.factors.push("Fresh bookmaker clean-sheet probability included");
      }
    } else if (preferredProjectionEngine === "COMPONENT_XFP_V1") {
      const reason = nextFixture
        ? componentProjections.errorsByFixtureTeam.get(fixtureTeamProjectionKey(nextFixture.id, String(row.teamId)))
        : "No upcoming fixture";
      forecastExplanation.risks.unshift(`Component xFP unavailable; legacy fallback${reason ? `: ${reason}` : ""}`);
    }

    return [
      {
        id: String(row.playerId),
        playerId: String(row.playerId),
        teamId: String(row.teamId),
        name: playerName,
        fotmobName: row.player.name,
        teamName: row.team.name,
        projectedFixtureComponents: buildFixtureComponentInputs(nextComponentProjection),
        teamShortName: roundsAndFixtures.teamShortNameById.get(String(row.teamId)) ?? row.team.name,
        photoUrl: row.photoUrl ? playerPhotoPublicUrl(String(row.playerId)) : null,
        leagueName: league.displayName,
        position,
        positionGroup,
        age: projected?.age ?? null,
        nationality: projected?.nationality ?? null,
        isStarter: row.isStarter,
        price: price.price,
        priceSource: price.priceSource,
        predictedFp,
        legacyPredictedFp,
        componentPredictedFp,
        projectionEngine,
        projectionComponents: nextComponentProjection?.components ?? null,
        projectionFormula: projectionEngine === "COMPONENT_XFP_V1" ? nextComponentRoundFormula : null,
        alternativeProjectedFixtureComponents: buildFixtureComponentInputs(nextFriendProjection),
        alternativeProjectionComponents: nextFriendProjection?.components ?? null,
        alternativeProjectionFormula: nextFriendRoundFormula,
        alternativePredictedFp,
        alternativeRoundPoints,
        foontasyPoints: foontasy?.points ?? null,
        // Foontasy publishes its current round only. Do not invent a T3/T5
        // total from one matchweek; this becomes numeric only when the source
        // supplies projections for every round in the selected horizon.
        foontasyHorizonPoints: null,
        foontasyFetchedAt: foontasy?.fetchedAt.toISOString() ?? null,
        modelT3Points: modelT3?.points ?? null,
        modelT5Points: modelT5?.points ?? null,
        modelT3Status: modelT3?.status ?? null,
        modelT5Status: modelT5?.status ?? null,
        modelForecastCalculatedAt: (modelT5?.calculatedAt ?? modelT3?.calculatedAt)?.toISOString() ?? null,
        expectedMinutes: nextComponentProjection?.expectedMinutes ?? projected?.expectedMinutes ?? null,
        startProbability: nextComponentProjection?.probabilities.appearance ?? projected?.startProbability ?? null,
        forecastConfidence: projected?.forecastConfidence ?? null,
        forecastFactors: forecastExplanation.factors,
        forecastRisks: forecastExplanation.risks,
        forecastCalculatedAt: playerRows.calculatedAt,
        forecastDataUpdatedAt: projected?.dataUpdatedAt?.toISOString() ?? null,
        forecastModelVersion: projectionEngine === "COMPONENT_XFP_V1" ? "COMPONENT_XFP_V1" : playerRows.modelVersion,
        recentFp: projected?.recentFp ?? [],
        historicalStats: numericHistoricalStats(projected?.rawMetrics),
        valueScore: price.price > 0 ? roundFantasyValue((roundPoints[0] ?? predictedFp ?? 0) / price.price) : 0,
        roundPoints,
        fixtures,
        fixtureFullNames,
        fixtureDifficulties,
        baltikaXg: baltikaMetric?.xg ?? null,
        baltikaXa: baltikaMetric?.xa ?? null,
        baltikaMatchesPlayed: baltikaMetric?.matchesPlayed ?? null,
        baltikaTeamName: baltikaMetric?.teamName ?? null
      }
    ];
  });

  const players = sportsRuPricedFantasyPlayers(rosterPlayers);
  const sportsRuPrices = options?.playerIds !== undefined
    ? new Set(priceMaps.map((row) => row.internalEntityId).filter((playerId): playerId is string => Boolean(playerId))).size
    : players.filter((player) => player.priceSource === "SPORTS_RU").length;
  const estimatedPrices = Math.max(0, rosterPlayerCount - sportsRuPrices);
  const latestPriceSync = priceRows.reduce<Date | null>((latest, row) => {
    if (!latest || row.lastSeenAt > latest) return row.lastSeenAt;
    return latest;
  }, null);
  const playersById = new Map(players.map((player) => [player.playerId, player]));
  const horizonRounds = normalizeFantasyHorizon(savedSquad?.horizonRounds, rules.horizonOptions);
  const savedSelections =
    savedSquad?.players.filter((player) => playersById.has(String(player.playerId))).map((player) => ({
      playerId: String(player.playerId),
      isStarter: player.isStarter,
      isLocked: player.isLocked,
      isCaptain: player.isCaptain,
      isViceCaptain: player.isViceCaptain,
      slotIndex: player.slotIndex,
      purchasePrice: playersById.get(String(player.playerId))?.price ?? player.purchasePrice
    })) ?? [];
  const storedRoundPlans = fantasySquadRoundPlansFromFilters(savedSquad?.filters, savedSelections, playersById);
  const roundShift = fantasySquadRoundShift(
    fantasySquadRoundIdsFromFilters(savedSquad?.filters),
    roundsAndFixtures.rounds.map((round) => round.id)
  );
  const roundPlans = rolloverFantasySquadRoundPlans({
    plans: storedRoundPlans,
    shift: roundShift,
    fallbackSelections: savedSelections,
    pool: players,
    rules
  });
  const currentSelections = roundPlans[0]?.selections ?? savedSelections;

  return {
    readiness,
    rules,
    rounds: roundsAndFixtures.rounds,
    players: players.sort(compareFantasyPlannerPlayers),
    squads: savedSquads.map((squad) => ({
      id: squad.id,
      name: squad.name,
      playersCount: squad.players.length,
      updatedAt: squad.updatedAt.toISOString()
    })),
    squad: {
      id: savedSquad?.id ?? null,
      name: savedSquad?.name ?? "My squad",
      leagueId: String(league.leagueId),
      season: league.season,
      horizonRounds,
      selections: currentSelections,
      roundPlans
    },
    priceStatus: {
      sportsRuPrices,
      estimatedPrices,
      lastSyncedAt: latestPriceSync?.toISOString() ?? null
    },
    historySeasonOptions: history.availableSeasons
  };
}

function numericHistoricalStats(metrics: Record<string, unknown> | undefined) {
  if (!metrics) return {};
  return Object.fromEntries(Object.entries(metrics).flatMap(([key, value]) =>
    typeof value === "number" && Number.isFinite(value) ? [[key, value]] : []
  ));
}

export function sportsRuPricedFantasyPlayers(players: FantasyPlannerPlayer[]) {
  return players.filter((player) => player.priceSource === "SPORTS_RU");
}

async function loadBaltikaPlayerMetricsByName(prisma: PrismaClient, seasonNames: string[]) {
  const rows = await prisma.playerSnapshot.findMany({
    where: {
      teamImport: {
        status: ImportStatus.PUBLISHED,
        isCurrentPublished: true
      },
      season: {
        name: { in: seasonNames }
      }
    },
    select: {
      normalizedName: true,
      playerName: true,
      teamName: true,
      xg: true,
      xa: true,
      matchesPlayed: true,
      minutesPlayed: true
    },
    orderBy: [{ minutesPlayed: "desc" }, { playerName: "asc" }]
  });

  const grouped = new Map<string, BaltikaPlayerMetric[]>();
  for (const row of rows) {
    const key = row.normalizedName || normalizeSportsRuPlayerName(row.playerName);
    if (!key) continue;
    const metrics = grouped.get(key) ?? [];
    metrics.push({
      xg: row.xg,
      xa: row.xa,
      matchesPlayed: row.matchesPlayed,
      minutesPlayed: row.minutesPlayed,
      teamName: row.teamName
    });
    grouped.set(key, metrics);
  }

  const unique = new Map<string, BaltikaPlayerMetric>();
  for (const [key, metrics] of grouped) {
    const teams = new Set(metrics.map((metric) => metric.teamName));
    if (metrics.length > 1 && teams.size > 1) continue;
    unique.set(key, metrics[0]);
  }

  return unique;
}

export async function saveFantasySquad(
  prisma: PrismaClient,
  input: {
    userId: string;
    leagueId: bigint;
    season: string;
    squadId?: string | null;
    name?: string;
    horizonRounds: number;
    selections: FantasySquadSelection[];
    roundPlans?: FantasySquadRoundPlan[];
    roundPlanRoundIds?: string[];
    rules: FantasySquadRules;
  }
) {
  const horizonRounds = normalizeFantasyHorizon(input.horizonRounds, input.rules.horizonOptions);
  const name = normalizeFantasySquadName(input.name);
  return prisma.$transaction(async (tx) => {
    const selectedPlayerIds = [...new Set(input.selections.map((selection) => selection.playerId))].map(BigInt);
    const rosterRows = selectedPlayerIds.length === 0
      ? []
      : await tx.$queryRaw<Array<{ playerId: bigint; teamId: bigint; position: string | null }>>(Prisma.sql`
          SELECT
            "player_id" AS "playerId",
            "team_id" AS "teamId",
            "position"
          FROM "team_player_seasons"
          WHERE "league_id" = ${input.leagueId}
            AND "season" = ${input.season}
            AND "player_id" IN (${Prisma.join(selectedPlayerIds)})
            AND "active" = TRUE
          FOR SHARE
        `);
    if (selectedPlayerIds.length !== input.selections.length || rosterRows.length !== selectedPlayerIds.length) {
      throw new Error("Fantasy squad contains a player who is no longer active in the selected league and season.");
    }
    const sportsPositionsByPlayerId = await loadSportsRuFantasyPositionsByPlayerId(tx, {
      leagueId: input.leagueId,
      season: input.season
    });
    const rosterByPlayerId = new Map(rosterRows.map((row) => [String(row.playerId), row]));
    const positionByPlayerId = new Map(
      input.selections.map((selection) => [
        selection.playerId,
        sportsPositionsByPlayerId.get(selection.playerId) ?? rosterByPlayerId.get(selection.playerId)?.position ?? null
      ])
    );
    if (input.selections.some((selection) => normalizeFantasyPosition(positionByPlayerId.get(selection.playerId)) === "UNK")) {
      throw new Error("Fantasy squad contains a player without an authoritative fantasy position.");
    }
    const resolvedPool = input.selections.map((selection) => {
      const position = positionByPlayerId.get(selection.playerId)!;
      const teamId = String(rosterByPlayerId.get(selection.playerId)!.teamId);
      return {
        id: selection.playerId,
        playerId: selection.playerId,
        teamId,
        name: `Player ${selection.playerId}`,
        teamName: `Team ${teamId}`,
        leagueName: String(input.leagueId),
        position,
        positionGroup: normalizeFantasyPosition(position),
        price: selection.purchasePrice ?? 0,
        priceSource: "ESTIMATED" as const,
        predictedFp: null,
        valueScore: 0,
        roundPoints: [],
        fixtures: [],
        fixtureDifficulties: []
      };
    });
    const resolvedSummary = summarizeFantasySquad(resolvedPool, input.selections, input.rules, horizonRounds);
    if (resolvedSummary.violations.length > 0) {
      throw new Error(`Fantasy squad changed during save: ${resolvedSummary.violations[0]}`);
    }
    const bank = resolvedSummary.bank;
    let squad: { id: string; name: string };
    if (input.squadId) {
      const ownedSquad = await tx.userFantasySquad.findFirst({
        where: {
          id: input.squadId,
          userId: input.userId,
          leagueId: input.leagueId,
          season: input.season
        },
        select: { id: true }
      });
      if (!ownedSquad) throw new Error("Fantasy squad does not belong to the selected user, league, and season.");
      squad = await tx.userFantasySquad.update({
        where: { id: ownedSquad.id },
        data: {
          name,
          budgetLimit: input.rules.budgetLimit,
          bank,
          horizonRounds,
          filters: {
            roundPlans: input.roundPlans ?? createFantasySquadRoundPlans(input.selections),
            roundPlanRoundIds: normalizeFantasySquadRoundIds(input.roundPlanRoundIds)
          }
        },
        select: { id: true, name: true }
      });
    } else {
      squad = await tx.userFantasySquad.create({
        data: {
          userId: input.userId,
          leagueId: input.leagueId,
          season: input.season,
          name,
          budgetLimit: input.rules.budgetLimit,
          bank,
          horizonRounds,
          filters: {
            roundPlans: input.roundPlans ?? createFantasySquadRoundPlans(input.selections),
            roundPlanRoundIds: normalizeFantasySquadRoundIds(input.roundPlanRoundIds)
          }
        },
        select: { id: true, name: true }
      });
    }

    await tx.userFantasySquadPlayer.deleteMany({ where: { squadId: squad.id } });
    await tx.userFantasySquadPlayer.createMany({
      data: input.selections.map((selection, index) => ({
        squadId: squad.id,
        playerId: BigInt(selection.playerId),
        teamId: rosterByPlayerId.get(selection.playerId)!.teamId,
        position: positionByPlayerId.get(selection.playerId)!,
        isStarter: selection.isStarter,
        isLocked: selection.isLocked,
        isCaptain: selection.isCaptain,
        isViceCaptain: selection.isViceCaptain,
        slotIndex: selection.slotIndex ?? index,
        purchasePrice: selection.purchasePrice
      }))
    });

    return squad;
  });
}

export function fantasySquadRoundPlansFromFilters(
  filters: unknown,
  fallbackSelections: FantasySquadSelection[],
  playersById?: ReadonlyMap<string, FantasyPlannerPlayer>
) {
  const fallback = createFantasySquadRoundPlans(fallbackSelections);
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return fallback;
  const rawPlans = (filters as { roundPlans?: unknown }).roundPlans;
  if (!Array.isArray(rawPlans)) return fallback;

  return fallback.map((fallbackPlan, roundOffset) => {
    const raw = rawPlans.find((item) => item && typeof item === "object" && !Array.isArray(item) && Number((item as { roundOffset?: unknown }).roundOffset) === roundOffset);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallbackPlan;
    const rawSelections = Array.isArray((raw as { selections?: unknown }).selections) ? (raw as { selections: unknown[] }).selections : [];
    const seen = new Set<string>();
    const selections = rawSelections.flatMap((item, index): FantasySquadSelection[] => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const playerId = typeof record.playerId === "string" && /^\d+$/.test(record.playerId) ? record.playerId : null;
      if (!playerId || seen.has(playerId) || (playersById && !playersById.has(playerId))) return [];
      seen.add(playerId);
      const purchasePrice = Number(record.purchasePrice);
      return [{
        playerId,
        isStarter: record.isStarter !== false,
        isLocked: record.isLocked === true,
        isCaptain: record.isCaptain === true,
        isViceCaptain: record.isViceCaptain === true,
        slotIndex: Number.isInteger(Number(record.slotIndex)) ? Math.max(0, Number(record.slotIndex)) : index,
        purchasePrice: Number.isFinite(purchasePrice) ? purchasePrice : null
      }];
    });
    return {
      roundOffset,
      linkedToPrevious: roundOffset > 0 && (raw as { linkedToPrevious?: unknown }).linkedToPrevious !== false,
      selections: selections.length > 0 || fallbackSelections.length === 0 ? selections : fallbackPlan.selections
    };
  });
}

export function fantasySquadRoundIdsFromFilters(filters: unknown) {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return [];
  return normalizeFantasySquadRoundIds((filters as { roundPlanRoundIds?: unknown }).roundPlanRoundIds);
}

export function fantasySquadRoundShift(storedRoundIds: string[], currentRoundIds: string[]) {
  const currentRoundId = currentRoundIds[0];
  if (!currentRoundId || storedRoundIds.length === 0 || storedRoundIds[0] === currentRoundId) return 0;

  const exactIndex = storedRoundIds.indexOf(currentRoundId);
  if (exactIndex > 0) return exactIndex;

  const storedRoundNumber = fantasyRoundNumber(storedRoundIds[0]);
  const currentRoundNumber = fantasyRoundNumber(currentRoundId);
  if (storedRoundNumber === null || currentRoundNumber === null || currentRoundNumber <= storedRoundNumber) return 0;
  return currentRoundNumber - storedRoundNumber;
}

export function rolloverFantasySquadRoundPlans(input: {
  plans: FantasySquadRoundPlan[];
  shift: number;
  fallbackSelections: FantasySquadSelection[];
  pool: FantasyPlannerPlayer[];
  rules: FantasySquadRules;
}) {
  const plans = input.plans.length > 0 ? input.plans : createFantasySquadRoundPlans(input.fallbackSelections);
  const shift = Math.max(0, Math.floor(input.shift));
  if (shift === 0) return plans.map(cloneFantasySquadRoundPlan);

  const validate = (selections: FantasySquadSelection[]) =>
    validateFantasySquadForSave({ pool: input.pool, selections, rules: input.rules, horizon: 1 });
  const preferredStartIndex = Math.min(shift, plans.length - 1);
  const startCandidates = [
    ...plans.slice(0, preferredStartIndex + 1).reverse(),
    ...plans.slice(preferredStartIndex + 1),
    { roundOffset: 0, linkedToPrevious: false, selections: input.fallbackSelections }
  ];
  const validStart = startCandidates
    .map((plan) => validate(plan.selections))
    .find((result) => result.ok);
  const startSelections = validStart?.ok ? validStart.selections : [];
  const rolled = createFantasySquadRoundPlans(startSelections);
  const perRoundTransferLimit = fantasyTransferLimitForHorizon(1);

  for (let roundOffset = 1; roundOffset < rolled.length; roundOffset += 1) {
    const sourceIndex = roundOffset + shift;
    if (sourceIndex >= plans.length) {
      rolled[roundOffset].selections = rolled[roundOffset - 1].selections.map((selection) => ({ ...selection }));
      continue;
    }

    const sourcePlan = plans[sourceIndex];
    const validated = validate(sourcePlan.selections);
    const previousSelections = rolled[roundOffset - 1].selections;
    if (!validated.ok || countFantasySquadTransfers(previousSelections, validated.selections) > perRoundTransferLimit) {
      rolled[roundOffset].selections = previousSelections.map((selection) => ({ ...selection }));
      rolled[roundOffset].linkedToPrevious = true;
      continue;
    }

    rolled[roundOffset] = {
      roundOffset,
      linkedToPrevious: sourcePlan.linkedToPrevious,
      selections: validated.selections.map((selection) => ({ ...selection }))
    };
  }

  return rolled;
}

function normalizeFantasySquadRoundIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 128))
    .slice(0, 5);
}

function fantasyRoundNumber(roundId: string) {
  const match = roundId.match(/^round:(\d+)$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

function cloneFantasySquadRoundPlan(plan: FantasySquadRoundPlan): FantasySquadRoundPlan {
  return {
    ...plan,
    selections: plan.selections.map((selection) => ({ ...selection }))
  };
}

export function normalizeFantasySquadName(value: string | null | undefined, fallback = "My squad") {
  const normalized = value?.replace(/\s+/g, " ").trim() || fallback;
  return normalized.slice(0, maxFantasySquadNameLength).trim() || fallback;
}

export function uniqueFantasySquadName(existingNames: Iterable<string>, requestedName: string | null | undefined) {
  const baseName = normalizeFantasySquadName(requestedName);
  const used = new Set([...existingNames].map((name) => normalizeFantasySquadName(name).toLocaleLowerCase()));
  if (!used.has(baseName.toLocaleLowerCase())) return baseName;

  for (let index = 2; index < 10_000; index += 1) {
    const suffix = ` (${index})`;
    const stem = baseName.slice(0, Math.max(1, maxFantasySquadNameLength - suffix.length)).trimEnd();
    const candidate = `${stem}${suffix}`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }

  return `${baseName.slice(0, maxFantasySquadNameLength - 14)} ${Date.now()}`;
}

export function fantasyRulesForLeague(
  league: SharedLeagueSeasonOption,
  contest: {
    budgetLimit: number;
    squadSize: number;
    maxPlayersPerTeam: number;
    name: string;
  } | null
): FantasySquadRules {
  const inferredMaxPlayers = isTopFiveLeague(league) ? 3 : 2;
  return {
    ...defaultFantasySquadRules,
    budgetLimit: contest?.budgetLimit ?? 100,
    squadSize: contest?.squadSize ?? defaultFantasySquadRules.squadSize,
    maxPlayersPerTeam: contest?.maxPlayersPerTeam ?? inferredMaxPlayers,
    sourceLabel: contest ? `Sports.ru: ${contest.name}` : isTopFiveLeague(league) ? "Inferred top-five league rules" : "Inferred default Sports.ru rules"
  };
}

export function friendAlternativeScoringModel(
  baseModel: ActiveScoringModel,
  preference: UserScoringFormulaPreference | null | undefined
): ActiveScoringModel {
  const personalEnabled = Boolean(
    preference?.alternativeFormulaEnabled &&
    [
      preference.alternativeFormulaGk,
      preference.alternativeFormulaDef,
      preference.alternativeFormulaMid,
      preference.alternativeFormulaFwd
    ].some((formula) => formula?.trim())
  );
  const formula = (personal: string | null | undefined, fallback: string) =>
    personalEnabled ? personal?.trim() || fallback : fallback;

  return {
    ...baseModel,
    alternativeFormulaGk: formula(preference?.alternativeFormulaGk, friendAlternativeFormulaDefaults.alternativeFormulaGk),
    alternativeFormulaDef: formula(preference?.alternativeFormulaDef, friendAlternativeFormulaDefaults.alternativeFormulaDef),
    alternativeFormulaMid: formula(preference?.alternativeFormulaMid, friendAlternativeFormulaDefaults.alternativeFormulaMid),
    alternativeFormulaFwd: formula(preference?.alternativeFormulaFwd, friendAlternativeFormulaDefaults.alternativeFormulaFwd),
    alternativeFormulaEnabled: true
  };
}

export function resolvedExpectedProjectionConfig(model: ActiveScoringModel) {
  const parsed = parseProjectionFormulaConfig(model.projectionFormulaConfig, expectedProjectionFormulaConfig).config;
  if (model.projectionFormulaConfig || !model.customFormulaEnabled) return parsed;

  return {
    ...parsed,
    scoreByPosition: {
      GK: model.customFormulaGk?.trim() || model.customFormula?.trim() || parsed.scoreByPosition.GK,
      DEF: model.customFormulaDef?.trim() || model.customFormula?.trim() || parsed.scoreByPosition.DEF,
      MID: model.customFormulaMid?.trim() || model.customFormula?.trim() || parsed.scoreByPosition.MID,
      FWD: model.customFormulaFwd?.trim() || model.customFormula?.trim() || parsed.scoreByPosition.FWD
    }
  };
}

export function resolvedAlternativeProjectionConfig(preference: UserScoringFormulaPreference | null | undefined) {
  const parsed = parseProjectionFormulaConfig(
    preference?.alternativeProjectionFormulaConfig,
    friendAltProjectionFormulaConfig
  ).config;
  if (preference?.alternativeProjectionFormulaConfig || !preference?.alternativeFormulaEnabled) return parsed;

  return {
    ...parsed,
    scoreByPosition: {
      GK: preference.alternativeFormulaGk?.trim() || parsed.scoreByPosition.GK,
      DEF: preference.alternativeFormulaDef?.trim() || parsed.scoreByPosition.DEF,
      MID: preference.alternativeFormulaMid?.trim() || parsed.scoreByPosition.MID,
      FWD: preference.alternativeFormulaFwd?.trim() || parsed.scoreByPosition.FWD
    }
  };
}

async function loadProjectedPlayerRows(
  prisma: PrismaClient,
  userId: string,
  league: SharedLeagueSeasonOption,
  history: ResolvedFantasyHistory,
  playerIds?: bigint[],
  deferFormulaProjections = false
) {
  const [modelBundle, preference] = await Promise.all([
    getActiveScoringModelBundleForSource("MACHETE", prisma),
    prisma.userScoringPreference.findUnique({ where: { userId_modelSource: { userId, modelSource: "MACHETE" } } })
  ]);
  const readTimeScoringModel = friendAlternativeScoringModel(modelBundle.model, preference);
  const expectedProjectionConfig = resolvedExpectedProjectionConfig(modelBundle.model);
  const alternativeProjectionConfig = resolvedAlternativeProjectionConfig(preference);
  const baseModelVersion = `${modelBundle.identity.configuredModelSource}:${modelBundle.identity.configuredModelId ?? "built-in"}:v${modelBundle.identity.configuredModelVersion}`;
  const [rows, friendRows, calibration] = await Promise.all([
    loadSharedMachetePlayerRows(prisma, {
      scopes: history.historyScopes,
      rosterScopes: history.rosterScopes,
      matchWindow: history.matchWindow,
      combineTeamCompetitions: true,
      fallbackToRecentPlayerHistory: history.includePlayerHistory,
      scoringModel: modelBundle.model,
      playerIds
    }),
    deferFormulaProjections
      ? Promise.resolve([])
      : loadSharedMachetePlayerRows(prisma, {
          scopes: history.historyScopes,
          rosterScopes: history.rosterScopes,
          matchWindow: { kind: "days", days: 365 },
          combineTeamCompetitions: true,
          fallbackToRecentPlayerHistory: history.includePlayerHistory,
          scoringModel: modelBundle.model
        }),
    loadFantasyProjectionCalibration(prisma, {
      leagueId: league.leagueId,
      currentSeason: league.season,
      scoringModel: modelBundle.model,
      modelCacheKey: `${baseModelVersion}:${modelBundle.identity.configuredModelUpdatedAt?.toISOString() ?? "built-in"}`
    })
  ]);

  return {
    calculatedAt: new Date().toISOString(),
    modelVersion: calibration
      ? `${baseModelVersion}+${FANTASY_PROJECTION_CALIBRATION.featureVersion}@${calibration.trainingSeason}`
      : `${baseModelVersion}+uncalibrated`,
    calibration,
    scoringModel: readTimeScoringModel,
    expectedProjectionConfig,
    alternativeProjectionConfig,
    friendRows: friendRows.map((row) => {
      const { teamId, playerId } = fantasyPlannerSharedRowIdentity(row.id);
      return { ...row, teamId, playerId };
    }),
    rows: rows.map((row) => {
      const { teamId, playerId } = fantasyPlannerSharedRowIdentity(row.id);
      return {
        ...row,
        teamId,
        playerId
      };
    })
  };
}

export function fantasyPlannerSharedRowIdentity(rowId: string) {
  const parts = rowId.split(":");
  return parts[0] === "combined"
    ? { teamId: parts[1] ?? "", playerId: parts[2] ?? "" }
    : { teamId: parts[2] ?? "", playerId: parts[3] ?? "" };
}

export function configuredFantasyProjectionEngine(envValue = process.env.FANTASY_PROJECTION_ENGINE): FantasyProjectionEngine {
  return envValue?.trim().toLowerCase() === "legacy" ? "LEGACY_RIDGE19_V1" : "COMPONENT_XFP_V1";
}

function buildComponentProjectionIndex(
  rows: Array<SharedMachetePlayerRow & { teamId: string; playerId: string }>,
  roundsAndFixtures: PlannerRoundFixtures,
  sportsPositionsByPlayerId: Map<string, string>,
  mode: ComponentProjectionMode = "PRIMARY"
): ComponentProjectionIndex {
  const byFixturePlayer = new Map<string, PlayerFixtureProjection>();
  const formulaMetricsByFixturePlayer = new Map<string, Record<string, unknown>>();
  const errorsByFixtureTeam = new Map<string, string>();
  const rowsByTeam = new Map<string, Array<SharedMachetePlayerRow & { teamId: string; playerId: string }>>();
  for (const row of rows) {
    const teamRows = rowsByTeam.get(row.teamId) ?? [];
    teamRows.push(row);
    rowsByTeam.set(row.teamId, teamRows);
  }

  const uniqueFixtures = new Map<string, PlannerFixture>();
  for (const fixturesByTeam of roundsAndFixtures.fixturesByTeamRound.values()) {
    for (const fixtures of fixturesByTeam.values()) {
      for (const fixture of fixtures) uniqueFixtures.set(fixtureTeamProjectionKey(fixture.id, fixture.teamId), fixture);
    }
  }

  for (const [fixtureTeamKey, fixture] of uniqueFixtures) {
    const teamRows = rowsByTeam.get(fixture.teamId) ?? [];
    const projectionRows = mode === "FRIEND_ALT" ? friendStartingRows(teamRows) : teamRows;
    const participants = projectionRows
      .map((row) => componentParticipant(row, sportsPositionsByPlayerId.get(row.playerId), mode))
      .filter((row): row is ProbableParticipantInput => row !== null);
    const team = componentTeamTotals(fixture, participants, mode);
    if (!team) {
      errorsByFixtureTeam.set(fixtureTeamKey, "team xG/xGA is missing");
      continue;
    }

    try {
      const projection = projectTeamPlayers(team, participants);
      for (const player of projection.players) {
        byFixturePlayer.set(fixturePlayerProjectionKey(fixture.id, player.playerId), player);
      }
    } catch (error) {
      const message = error instanceof ProjectionInputError
        ? error.issues.slice(0, 2).map((issue) => `${issue.path} ${issue.message}`).join("; ")
        : error instanceof Error ? error.message : "unknown projection error";
      errorsByFixtureTeam.set(fixtureTeamKey, message);
    }
  }

  return { byFixturePlayer, formulaMetricsByFixturePlayer, errorsByFixtureTeam };
}

type PipelineParticipant = {
  row: SharedMachetePlayerRow & { teamId: string; playerId: string };
  input: ProbableParticipantInput;
  metrics: Record<string, unknown>;
};

export function buildFormulaProjectionIndex(
  rows: Array<SharedMachetePlayerRow & { teamId: string; playerId: string }>,
  roundsAndFixtures: PlannerRoundFixtures,
  sportsPositionsByPlayerId: Map<string, string>,
  config: ProjectionFormulaConfig,
  probableXiOnly = false
): ComponentProjectionIndex {
  const byFixturePlayer = new Map<string, PlayerFixtureProjection>();
  const formulaMetricsByFixturePlayer = new Map<string, Record<string, unknown>>();
  const errorsByFixtureTeam = new Map<string, string>();
  const rowsByTeam = new Map<string, Array<SharedMachetePlayerRow & { teamId: string; playerId: string }>>();
  for (const row of rows) {
    const teamRows = rowsByTeam.get(row.teamId) ?? [];
    teamRows.push(row);
    rowsByTeam.set(row.teamId, teamRows);
  }

  const uniqueFixtures = new Map<string, PlannerFixture>();
  for (const fixturesByTeam of roundsAndFixtures.fixturesByTeamRound.values()) {
    for (const fixtures of fixturesByTeam.values()) {
      for (const fixture of fixtures) uniqueFixtures.set(fixtureTeamProjectionKey(fixture.id, fixture.teamId), fixture);
    }
  }

  for (const [fixtureTeamKey, fixture] of uniqueFixtures) {
    try {
      const rankedCandidates = (rowsByTeam.get(fixture.teamId) ?? [])
        .map((row) => pipelineParticipant(row, sportsPositionsByPlayerId.get(row.playerId), config))
        .filter((entry): entry is PipelineParticipant => entry !== null)
        .sort((left, right) =>
          Number(right.row.isStarter) - Number(left.row.isStarter) ||
          right.input.probabilities.appearance! - left.input.probabilities.appearance! ||
          right.input.expectedMinutes! - left.input.expectedMinutes! ||
          right.row.minutesPlayed - left.row.minutesPlayed
        );
      const historyCandidates = probableXiOnly ? rankedCandidates.slice(0, 11) : rankedCandidates;
      const teamContext = pipelineTeamContext(fixture, config);
      const candidates = historyCandidates.map((entry) => pipelineAllocationParticipant(entry, teamContext, config));
      const participants = candidates.map((entry) => entry.input);
      const team = pipelineTeamTotals(fixture, participants, teamContext);
      const projection = projectTeamPlayers(team, participants);

      for (const player of projection.players) {
        const key = fixturePlayerProjectionKey(fixture.id, player.playerId);
        const candidate = candidates.find((entry) => entry.input.playerId === player.playerId);
        byFixturePlayer.set(key, player);
        formulaMetricsByFixturePlayer.set(key, {
          ...(candidate?.metrics ?? {}),
          ...teamContext,
          goal_allocation_weight: player.allocationWeights.goals,
          assist_allocation_weight: player.allocationWeights.assists,
          recovery_allocation_weight: player.allocationWeights.recoveries,
          save_allocation_weight: player.allocationWeights.saves
        });
      }
    } catch (error) {
      const message = error instanceof ProjectionInputError
        ? error.issues.slice(0, 3).map((issue) => `${issue.path} ${issue.message}`).join("; ")
        : error instanceof Error ? error.message : "unknown formula projection error";
      errorsByFixtureTeam.set(fixtureTeamKey, message);
    }
  }

  return { byFixturePlayer, formulaMetricsByFixturePlayer, errorsByFixtureTeam };
}

function emptyComponentProjectionIndex(): ComponentProjectionIndex {
  return {
    byFixturePlayer: new Map(),
    formulaMetricsByFixturePlayer: new Map(),
    errorsByFixtureTeam: new Map()
  };
}

function pipelineParticipant(
  row: SharedMachetePlayerRow & { teamId: string; playerId: string },
  sportsPosition: string | undefined,
  config: ProjectionFormulaConfig
): PipelineParticipant | null {
  const position = normalizeFantasyPosition(fantasyPlannerPosition(sportsPosition ?? null, null, row.position));
  if (position === "UNK") return null;
  const metrics: Record<string, unknown> = { ...(row.rawMetrics ?? {}) };
  const expectedMinutes = clamp(formulaValue(config.history.expectedMinutes, metrics), 0, 90);
  metrics.expected_minutes = expectedMinutes;
  const countsAsFullMatch = countsAsFullFantasyMatch(expectedMinutes);
  const appearance = countsAsFullMatch ? 1 : clamp(formulaValue(config.history.appearanceProbability, metrics), 0, 1);
  metrics.appearance_probability = appearance;
  const sixtyMinutes = countsAsFullMatch ? 1 : clamp(formulaValue(config.history.sixtyProbability, metrics), 0, appearance);
  metrics.sixty_minute_probability = sixtyMinutes;
  metrics["60_minute_probability"] = sixtyMinutes;
  const fullMatch = countsAsFullMatch ? 1 : clamp(formulaValue(config.history.fullMatchProbability, metrics), 0, sixtyMinutes);
  metrics.full_match_probability = fullMatch;
  const xg = nonNegativeFormulaValue(config.history.xgRate, metrics, "history.xgRate");
  const xa = nonNegativeFormulaValue(config.history.xaRate, metrics, "history.xaRate");
  const recoveries = nonNegativeFormulaValue(config.history.recoveryRate, metrics, "history.recoveryRate");
  const saves = nonNegativeFormulaValue(config.history.saveRate, metrics, "history.saveRate");
  const yellowCards = nonNegativeFormulaValue(config.history.yellowRate, metrics, "history.yellowRate");
  const redCards = nonNegativeFormulaValue(config.history.redRate, metrics, "history.redRate");
  Object.assign(metrics, {
    blended_xg_per_90: xg,
    blended_xa_per_90: xa,
    blended_recoveries_per_90: recoveries,
    blended_saves_per_90: saves,
    blended_yellow_cards_per_90: yellowCards,
    blended_red_cards_per_90: redCards
  });

  return {
    row,
    metrics,
    input: {
      playerId: row.playerId,
      position,
      expectedMinutes,
      probabilities: { appearance, sixtyMinutes, fullMatch },
      ratesPer90: { xg, xa, recoveries, saves, yellowCards, redCards }
    }
  };
}

export function countsAsFullFantasyMatch(expectedMinutes: number) {
  return Number.isFinite(expectedMinutes) && expectedMinutes >= 80;
}

function pipelineAllocationParticipant(
  participant: PipelineParticipant,
  teamContext: Record<string, unknown>,
  config: ProjectionFormulaConfig
): PipelineParticipant {
  const metrics = { ...participant.metrics, ...teamContext };
  const position = participant.input.position;
  const allocationWeights = {
    goals: per90AwareAllocationValue(config.allocation.goals, metrics, "allocation.goals"),
    assists: per90AwareAllocationValue(config.allocation.assists, metrics, "allocation.assists"),
    recoveries: position === "GK" ? 0 : per90AwareAllocationValue(config.allocation.recoveries, metrics, "allocation.recoveries"),
    saves: position === "GK" ? per90AwareAllocationValue(config.allocation.saves, metrics, "allocation.saves") : 0
  };
  const minutesExposure = (numericOrNull(metrics.expected_minutes) ?? 0) / 90;
  const cardExposureFactor = Math.min(
    nonNegativeFormulaValue(config.allocation.cardExposure, metrics, "allocation.cardExposure"),
    minutesExposure
  );
  Object.assign(metrics, {
    goal_allocation_weight: allocationWeights.goals,
    assist_allocation_weight: allocationWeights.assists,
    recovery_allocation_weight: allocationWeights.recoveries,
    save_allocation_weight: allocationWeights.saves,
    card_exposure_factor: cardExposureFactor
  });
  return {
    ...participant,
    metrics,
    input: { ...participant.input, allocationWeights, cardExposureFactor }
  };
}

function pipelineTeamContext(
  fixture: PlannerFixture,
  config: ProjectionFormulaConfig
) {
  if (fixture.projectedXg === null || fixture.projectedXga === null) {
    throw new Error("team xG/xGA is missing");
  }
  const bookmakerImpliedXg = inversePoissonOver15Probability(fixture.teamOver15Probability);
  const bookmakerAvailable = bookmakerImpliedXg !== null && fixture.cleanSheetProbability !== null && fixture.cleanSheetProbability !== undefined;
  const metrics: Record<string, unknown> = {
    projected_xg: fixture.projectedXg,
    projected_xga: fixture.projectedXga,
    fotmob_team_xg: fixture.projectedXg,
    fotmob_team_xga: fixture.projectedXga,
    bookmaker_implied_xg: bookmakerImpliedXg ?? 0,
    bookmaker_odds_available: bookmakerAvailable ? 1 : 0,
    fixture_clean_sheet_probability: fixture.cleanSheetProbability ?? 0,
    fixture_team_over_1_5_probability: fixture.teamOver15Probability ?? 0,
    fixture_attack_multiplier: fixture.attackMultiplier ?? 1,
    fixture_defense_multiplier: fixture.defenseMultiplier ?? 1,
    is_home: fixture.side === "H" ? 1 : 0,
    is_away: fixture.side === "A" ? 1 : 0
  };
  metrics.expected_goals = nonNegativeFormulaValue(config.team.expectedGoals, metrics, "team.expectedGoals");
  metrics.expected_goals_against = nonNegativeFormulaValue(config.team.expectedGoalsAgainst, metrics, "team.expectedGoalsAgainst");
  metrics.assists_per_goal = nonNegativeFormulaValue(config.team.assistsPerGoal, metrics, "team.assistsPerGoal");
  metrics.clean_sheet_probability = clamp(formulaValue(config.team.cleanSheetProbability, metrics), 0, 1);
  return metrics;
}

function pipelineTeamTotals(
  fixture: PlannerFixture,
  participants: ProbableParticipantInput[],
  metrics: Record<string, unknown>
): ProjectedTeamTotals {
  const expectedGoals = numericOrNull(metrics.expected_goals) ?? 0;
  return {
    teamId: fixture.teamId,
    expectedGoals,
    expectedGoalsAgainst: numericOrNull(metrics.expected_goals_against) ?? 0,
    expectedAssists: expectedGoals * (numericOrNull(metrics.assists_per_goal) ?? 0),
    expectedRecoveries: participants.reduce((total, player) => total + (player.allocationWeights?.recoveries ?? 0), 0),
    expectedSaves: participants.reduce((total, player) => total + (player.allocationWeights?.saves ?? 0), 0),
    cleanSheetProbability: numericOrNull(metrics.clean_sheet_probability) ?? 0
  };
}

function formulaValue(formula: string, metrics: Record<string, unknown>) {
  return calculateCustomFormulaScore(formula, metrics);
}

function nonNegativeFormulaValue(formula: string, metrics: Record<string, unknown>, path: string) {
  const value = formulaValue(formula, metrics);
  if (value < 0) throw new Error(`${path} must return a non-negative number, received ${value}`);
  return value;
}

function per90AwareAllocationValue(formula: string, metrics: Record<string, unknown>, path: string) {
  const value = nonNegativeFormulaValue(formula, metrics, path);
  const usesPer90 = /\{[^}]*per 90[^}]*\}/i.test(formula);
  const alreadyUsesExpectedMinutes = /\{Expected minutes\}/i.test(formula);
  if (!usesPer90 || alreadyUsesExpectedMinutes) return value;
  return value * ((numericOrNull(metrics.expected_minutes) ?? 0) / 90);
}

function componentParticipant(
  row: SharedMachetePlayerRow & { teamId: string; playerId: string },
  sportsPosition?: string,
  mode: ComponentProjectionMode = "PRIMARY"
): ProbableParticipantInput | null {
  const position = normalizeFantasyPosition(fantasyPlannerPosition(sportsPosition ?? null, null, row.position));
  if (position === "UNK") return null;
  const friendMode = mode === "FRIEND_ALT";
  const expectedMinutes = clamp(
    friendMode ? componentMetric(row, "friend_expected_minutes") : row.expectedMinutes ?? 0,
    0,
    90
  );
  const appearance = friendMode
    ? (expectedMinutes > 0 ? 1 : 0)
    : clamp(Math.max(componentMetric(row, "appearance_probability"), expectedMinutes / 90), 0, 1);
  const sixtyMinutes = friendMode
    ? (expectedMinutes >= 60 ? 1 : 0)
    : clamp(Math.min(componentMetric(row, "sixty_minute_probability"), appearance), 0, 1);
  const fullMatch = friendMode
    ? (countsAsFullFantasyMatch(expectedMinutes) ? 1 : 0)
    : clamp(Math.min(componentMetric(row, "full_match_probability"), sixtyMinutes), 0, 1);
  const rate = (key: string) => friendMode
    ? componentMetric(row, `friend_${key}_per_90`)
    : componentRatePer90(row, key);

  return {
    playerId: row.playerId,
    position,
    expectedMinutes,
    per90ExposureFactor: friendMode ? expectedMinutes / 90 : undefined,
    probabilities: { appearance, sixtyMinutes, fullMatch },
    ratesPer90: {
      xg: expectedMinutes > 0 ? rate("xg") : undefined,
      xa: expectedMinutes > 0 ? rate("xa") : undefined,
      recoveries: position !== "GK" && expectedMinutes > 0 ? rate("recoveries") : undefined,
      saves: position === "GK" && expectedMinutes > 0 ? rate("saves") : undefined,
      yellowCards: expectedMinutes > 0 ? rate("yellow_cards") : undefined,
      redCards: expectedMinutes > 0 ? rate("red_cards") : undefined
    }
  };
}

function componentTeamTotals(
  fixture: PlannerFixture,
  participants: ProbableParticipantInput[],
  mode: ComponentProjectionMode = "PRIMARY"
): ProjectedTeamTotals | null {
  if (fixture.projectedXg === null || fixture.projectedXga === null) return null;
  const modelGoals = fixture.projectedXg;
  const oddsGoals = inversePoissonOver15Probability(fixture.teamOver15Probability);
  const expectedGoals = mode === "FRIEND_ALT" || oddsGoals === null
    ? modelGoals
    : clamp(modelGoals * 0.55 + oddsGoals * 0.45, modelGoals * 0.7, modelGoals * 1.35);
  const expectedRecoveries = participants.reduce((total, player) =>
    total + (player.position === "GK" ? 0 : (player.ratesPer90.recoveries ?? 0) * participantExposureFactor(player)), 0);
  const expectedSaves = participants.reduce((total, player) =>
    total + (player.position === "GK" ? (player.ratesPer90.saves ?? 0) * participantExposureFactor(player) : 0), 0);

  return {
    teamId: fixture.teamId,
    expectedGoals,
    expectedGoalsAgainst: fixture.projectedXga,
    expectedAssists: expectedGoals * 0.8,
    expectedRecoveries,
    expectedSaves,
    cleanSheetProbability: mode === "FRIEND_ALT"
      ? Math.exp(-fixture.projectedXga)
      : fixture.cleanSheetProbability ?? Math.exp(-fixture.projectedXga)
  };
}

function participantExposureFactor(player: ProbableParticipantInput) {
  return player.per90ExposureFactor ?? (player.expectedMinutes ?? 0) / 90;
}

export function friendStartingRows<T extends SharedMachetePlayerRow>(rows: T[]) {
  return [...rows]
    .sort((left, right) =>
      Number(right.isStarter) - Number(left.isStarter) ||
      (right.startProbability ?? 0) - (left.startProbability ?? 0) ||
      (right.expectedMinutes ?? 0) - (left.expectedMinutes ?? 0) ||
      right.minutesPlayed - left.minutesPlayed
    )
    .slice(0, 11);
}

function componentMetric(row: Pick<SharedMachetePlayerRow, "rawMetrics">, key: string) {
  return numericOrNull(row.rawMetrics?.[key]) ?? 0;
}

function componentRatePer90(row: Pick<SharedMachetePlayerRow, "rawMetrics" | "minutesPlayed">, key: string) {
  if (row.minutesPlayed <= 0) return 0;
  return componentMetric(row, key) * 90 / row.minutesPlayed;
}

function inversePoissonOver15Probability(probabilityValue: number | null | undefined) {
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

function fixtureTeamProjectionKey(fixtureId: string, teamId: string) {
  return `${fixtureId}:${teamId}`;
}

function fixturePlayerProjectionKey(fixtureId: string, playerId: string) {
  return `${fixtureId}:${playerId}`;
}

export function fixtureFormulaMetrics(
  rawMetrics: Record<string, unknown> | undefined,
  fixture: PlannerFixture | null,
  now = new Date()
): Record<string, unknown> {
  const oddsAgeHours = fixture?.oddsFetchedAt
    ? Math.max(0, (now.getTime() - fixture.oddsFetchedAt.getTime()) / (60 * 60 * 1_000))
    : 0;
  const oddsAvailable = fixture?.teamOver15Probability !== null && fixture?.teamOver15Probability !== undefined &&
    fixture.cleanSheetProbability !== null && fixture.cleanSheetProbability !== undefined;

  return {
    ...(rawMetrics ?? {}),
    fixture_team_over_1_5_probability: fixture?.teamOver15Probability ?? 0,
    fixture_clean_sheet_probability: fixture?.cleanSheetProbability ?? 0,
    fixture_bookmaker_odds_available: oddsAvailable ? 1 : 0,
    fixture_bookmaker_odds_age_hours: oddsAvailable ? oddsAgeHours : 0,
    fixture_projected_xg: fixture?.projectedXg ?? 0,
    fixture_projected_xga: fixture?.projectedXga ?? 0,
    next_projected_xg: fixture?.projectedXg ?? 0,
    next_projected_xga: fixture?.projectedXga ?? 0,
    next_fixture_count: fixture ? 1 : 0,
    next_is_home: fixture?.side === "H" ? 1 : 0,
    next_is_away: fixture?.side === "A" ? 1 : 0
  };
}

export function componentProjectionFormulaMetrics(
  projection: PlayerFixtureProjection,
  fixture: PlannerFixture | null,
  extraMetrics?: Record<string, unknown>
): Record<string, unknown> {
  const { components, expectedEvents, probabilities } = projection;

  return fixtureFormulaMetrics({
    ...(extraMetrics ?? {}),
    matches_played: 1,
    minutes_played: projection.expectedMinutes,
    appearance_probability: probabilities.appearance,
    sixty_minute_probability: probabilities.sixtyMinutes,
    full_match_probability: probabilities.fullMatch,
    xg: expectedEvents.goals,
    xa: expectedEvents.assists,
    recoveries: expectedEvents.recoveries,
    saves: expectedEvents.saves,
    goals_conceded: expectedEvents.goalsConceded,
    clean_sheets: expectedEvents.cleanSheets,
    yellow_cards: expectedEvents.yellowCards,
    red_cards: expectedEvents.redCards,
    expected_goals: expectedEvents.goals,
    expected_assists: expectedEvents.assists,
    expected_recoveries: expectedEvents.recoveries,
    expected_saves: expectedEvents.saves,
    expected_goals_conceded: expectedEvents.goalsConceded,
    expected_clean_sheets: expectedEvents.cleanSheets,
    expected_yellow_cards: expectedEvents.yellowCards,
    expected_red_cards: expectedEvents.redCards,
    appearance_fp: components.appearance,
    "60_minutes_fp": components.sixtyMinutes,
    full_match_fp: components.fullMatch,
    goal_fp: components.goals,
    assist_fp: components.assists,
    clean_sheet_fp: components.cleanSheet,
    save_fp: components.saves,
    recovery_fp: components.recoveries,
    goals_conceded_fp: components.goalsConceded,
    yellow_card_fp: components.yellowCards,
    red_card_fp: components.redCards
  }, fixture);
}

export function projectionFormulaFantasyPoints(
  projection: PlayerFixtureProjection,
  fixture: PlannerFixture | null,
  config: ProjectionFormulaConfig,
  extraMetrics?: Record<string, unknown>
) {
  return roundFantasyValue(calculateCustomFormulaScore(
    config.scoreByPosition[projection.position],
    componentProjectionFormulaMetrics(projection, fixture, extraMetrics)
  ));
}

function projectionFormulaWithBreakdown(
  projection: PlayerFixtureProjection,
  fixture: PlannerFixture | null,
  config: ProjectionFormulaConfig,
  extraMetrics?: Record<string, unknown>
) {
  const formula = config.scoreByPosition[projection.position];
  const breakdown = calculateCustomFormulaScoreWithBreakdown(
    formula,
    componentProjectionFormulaMetrics(projection, fixture, extraMetrics)
  );
  return {
    formula,
    total: roundFantasyValue(breakdown.value),
    terms: breakdown.terms
  };
}

function projectionRoundFormulaWithBreakdown(
  fixtures: PlannerFixture[],
  playerId: string,
  index: ReturnType<typeof buildFormulaProjectionIndex>,
  config: ProjectionFormulaConfig
) {
  const fixtureBreakdowns = fixtures.flatMap((fixture) => {
    const key = fixturePlayerProjectionKey(fixture.id, playerId);
    const projection = index.byFixturePlayer.get(key);
    if (!projection) return [];
    const breakdown = projectionFormulaWithBreakdown(
      projection,
      fixture,
      config,
      index.formulaMetricsByFixturePlayer.get(key)
    );
    return [{ fixture, breakdown }];
  });
  if (fixtureBreakdowns.length === 0) return null;

  const hasMultipleFixtures = fixtureBreakdowns.length > 1;
  return {
    formula: fixtureBreakdowns[0].breakdown.formula,
    total: roundFantasyValue(fixtureBreakdowns.reduce((total, item) => total + item.breakdown.total, 0)),
    terms: fixtureBreakdowns.flatMap(({ fixture, breakdown }) => breakdown.terms.map((term) => ({
      ...term,
      fixtureLabel: hasMultipleFixtures ? `${fixture.side} ${fixture.opponentName}` : undefined
    })))
  };
}

export function componentProjectionFantasyPoints(
  projection: PlayerFixtureProjection,
  fixture: PlannerFixture | null,
  scoringModel: ActiveScoringModel
) {
  const positionFormula =
    projection.position === "GK"
      ? scoringModel.customFormulaGk
      : projection.position === "DEF"
        ? scoringModel.customFormulaDef
        : projection.position === "MID"
          ? scoringModel.customFormulaMid
          : scoringModel.customFormulaFwd;
  const formula = positionFormula?.trim() || scoringModel.customFormula?.trim();

  if (!scoringModel.customFormulaEnabled || !formula) return projection.components.total;
  return calculateFantasyScore(componentProjectionFormulaMetrics(projection, fixture), projection.position, scoringModel);
}

export function friendAlternativeProjectionFantasyPoints(
  projection: PlayerFixtureProjection,
  fixture: PlannerFixture | null,
  scoringModel: ActiveScoringModel
) {
  return calculateAlternativeScore(
    componentProjectionFormulaMetrics(projection, fixture),
    projection.position,
    scoringModel
  );
}

export function bookmakerFixtureMultiplier(
  fixture: Pick<PlannerFixture, "projectedXg" | "projectedXga" | "teamOver15Probability" | "cleanSheetProbability"> | null,
  positionGroup: FantasyPositionGroup
) {
  if (!fixture) return 1;
  const attackSignal = relativeProbabilitySignal(
    fixture.teamOver15Probability,
    poissonOver15Probability(fixture.projectedXg)
  );
  const defenseSignal = relativeProbabilitySignal(
    fixture.cleanSheetProbability,
    poissonCleanSheetProbability(fixture.projectedXga)
  );
  const weights = bookmakerSignalWeights(positionGroup);
  return clamp(1 + (attackSignal - 1) * weights.attack + (defenseSignal - 1) * weights.defense, 0.85, 1.15);
}

export function calibratedPlayerFixturePoints(
  row: SharedMachetePlayerRow & { teamId: string; playerId: string },
  fixture: PlannerFixture | null,
  calibration: FantasyProjectionCalibrationModel | null,
  scoringModel?: ActiveScoringModel
) {
  const rawFixtureScore = scoringModel
    ? calculateFantasyScore(fixtureFormulaMetrics(row.rawMetrics, fixture), row.position, scoringModel)
    : row.fantasyScore;
  if (typeof rawFixtureScore !== "number" || !Number.isFinite(rawFixtureScore)) return null;
  const position = normalizeFantasyPosition(row.position);
  const fixtureScore = rawFixtureScore * (
    scoringModel && expectedFormulaUsesBookmaker(scoringModel, position)
      ? 1
      : bookmakerFixtureMultiplier(fixture, position)
  );
  if (!calibration) return fixtureScore;

  if (position === "UNK") return fixtureScore;
  const recentPoints = row.recentFp.filter(Number.isFinite);
  const baselinePoints = recentPoints.length > 0 ? average(recentPoints) : fixtureScore;
  const expectedMinutes = row.expectedMinutes ?? 0;
  const startRate = row.startProbability ?? 0;
  const minutesDeviation = row.minutesDeviation ?? 0;
  const sample: FantasyBacktestSample = {
    matchId: fixture?.id ?? `upcoming:${row.teamId}:${row.playerId}`,
    playerId: row.playerId,
    teamId: row.teamId,
    opponentTeamId: fixture?.opponentTeamId ?? null,
    isHome: fixture ? fixture.side === "H" : null,
    homeTeamId: fixture?.side === "A" ? fixture.opponentTeamId : row.teamId,
    awayTeamId: fixture?.side === "H" ? fixture.opponentTeamId : row.teamId,
    homeScore: null,
    awayScore: null,
    homeXg: null,
    awayXg: null,
    matchDate: fixture?.kickoffAt?.toISOString() ?? new Date().toISOString(),
    position,
    playingTimeGroup:
      startRate >= 0.8 && expectedMinutes >= 60
        ? "STABLE_STARTER"
        : (startRate >= 0.2 && startRate < 0.8) || minutesDeviation >= 25
          ? "UNCERTAIN_MINUTES"
          : "OTHER",
    historyMatchIds: recentPoints.map((_, index) => `history:${index}`),
    historyFeatures: {
      expectedMinutes,
      startRate,
      minutesDeviation,
      averageRating: row.averageRating ?? 0,
      recentPointsDeviation: standardDeviation(recentPoints, baselinePoints),
      recentPointsTrend: recentTrend(recentPoints)
    },
    predictedPoints: fixtureScore,
    baselinePoints,
    seasonBaselinePoints: baselinePoints,
    actualPoints: 0
  };

  return predictCalibratedFantasyPoints(calibration, sample);
}

export function buildFantasyForecastExplanation(input: {
  matchesPlayed: number;
  expectedMinutes: number | null;
  forecastConfidence: number | null;
  recentFp: number[];
  fixtureDifficulties: Array<number | null>;
  isStarter: boolean;
}) {
  const factors: string[] = [];
  const risks: string[] = [];

  if (input.isStarter) factors.push("Active-roster starter flag");
  if (input.matchesPlayed >= 5) factors.push("Five-match historical sample");
  if ((input.expectedMinutes ?? 0) >= 70) factors.push(`Expected minutes ${Math.round(input.expectedMinutes ?? 0)}`);
  if (recentTrend(input.recentFp) > 0.5) factors.push("Recent fantasy-points trend is positive");
  if (input.fixtureDifficulties.some((difficulty) => difficulty !== null && difficulty <= 2)) factors.push("Favourable upcoming fixture");

  if (input.matchesPlayed === 0) risks.push("No prior match statistics");
  if (input.expectedMinutes !== null && input.expectedMinutes < 60) risks.push(`Expected minutes only ${Math.round(input.expectedMinutes)}`);
  if (input.forecastConfidence === null || input.forecastConfidence < 0.6) risks.push("Low forecast confidence");
  if (input.fixtureDifficulties.length === 0 || input.fixtureDifficulties.every((difficulty) => difficulty === null)) risks.push("Upcoming fixture strength is unavailable");
  if (input.fixtureDifficulties.some((difficulty) => difficulty !== null && difficulty >= 4)) risks.push("Difficult upcoming fixture");

  if (factors.length === 0) factors.push("Historical per-match event rates");
  return { factors, risks };
}

function recentTrend(values: number[]) {
  if (values.length < 3) return 0;
  const recent = values.slice(-2);
  const earlier = values.slice(0, -2);
  return average(recent) - average(earlier);
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function standardDeviation(values: number[], mean: number) {
  return values.length > 0 ? Math.sqrt(average(values.map((value) => (value - mean) ** 2))) : 0;
}

async function loadUpcomingRoundFixtures(prisma: PrismaClient, league: SharedLeagueSeasonOption) {
  const key = `${league.leagueId}:${league.season}`;
  return upcomingRoundFixturesCache.getOrCreate(key, upcomingRoundFixturesCacheTtlMs, () =>
    loadUpcomingRoundFixturesUncached(prisma, league)
  );
}

async function loadUpcomingRoundFixturesUncached(prisma: PrismaClient, league: SharedLeagueSeasonOption) {
  const now = new Date();
  const [matches, teamStrengthProfiles, seasonTeams] = await Promise.all([
    prisma.coreMatch.findMany({
      where: {
        leagueId: league.leagueId,
        season: league.season,
        cancelled: false,
        OR: [{ finished: false }, { matchDate: { gte: now } }]
      },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
        oddsSnapshots: {
          where: { provider: "FONBET", status: "AVAILABLE" },
          orderBy: { fetchedAt: "desc" },
          take: 1
        }
      },
      orderBy: [{ matchDate: "asc" }, { id: "asc" }],
      take: 180
    }),
    loadTeamStrengthProfiles(prisma, league.leagueId),
    prisma.leagueSeasonTeam.findMany({
      where: {
        leagueId: league.leagueId,
        season: league.season,
        active: true
      },
      select: {
        teamId: true,
        metadata: true
      }
    })
  ]);
  const missingShortNameTeamIds = seasonTeams
    .filter((row) => !providerTeamShortName({ metadata: row.metadata }))
    .map((row) => row.teamId);
  const fallbackSeasonTeams = missingShortNameTeamIds.length > 0
    ? await prisma.leagueSeasonTeam.findMany({
        where: { teamId: { in: missingShortNameTeamIds } },
        select: { teamId: true, metadata: true },
        orderBy: { updatedAt: "desc" }
      })
    : [];
  const shortNameByTeamId = fantasyTeamShortNamesByTeamId(seasonTeams, fallbackSeasonTeams);
  const coreFixtures = buildPlannerRoundFixtures(
    matches.map((match) => {
      const odds = match.oddsSnapshots[0];
      const freshOdds = odds && now.getTime() - odds.fetchedAt.getTime() <= 24 * 60 * 60 * 1_000 ? odds : null;
      return {
      id: String(match.id),
      round: match.round,
      matchDate: match.matchDate,
      homeTeamId: match.homeTeamId ? String(match.homeTeamId) : null,
      awayTeamId: match.awayTeamId ? String(match.awayTeamId) : null,
      homeTeamName: (match.homeTeamId ? shortNameByTeamId.get(String(match.homeTeamId)) : null) ?? match.homeTeam?.name ?? null,
      awayTeamName: (match.awayTeamId ? shortNameByTeamId.get(String(match.awayTeamId)) : null) ?? match.awayTeam?.name ?? null,
      homeTeamFullName: match.homeTeam?.name ?? null,
      awayTeamFullName: match.awayTeam?.name ?? null,
      finished: match.finished,
      cancelled: match.cancelled,
      homeOver15Probability: freshOdds?.homeOver15Probability ?? null,
      awayOver15Probability: freshOdds?.awayOver15Probability ?? null,
      homeCleanSheetProbability: freshOdds?.homeCleanSheetProbability ?? null,
      awayCleanSheetProbability: freshOdds?.awayCleanSheetProbability ?? null,
      oddsFetchedAt: freshOdds?.fetchedAt ?? null
      };
    }),
    now
  );

  if (coreFixtures.rounds.length > 0) {
    return applyFixtureStrength({ ...coreFixtures, teamShortNameById: shortNameByTeamId }, teamStrengthProfiles);
  }

  const legacyFixtures = await loadLegacyMacheteUpcomingRoundFixtures(prisma, league, now);
  return applyFixtureStrength({ ...legacyFixtures, teamShortNameById: shortNameByTeamId }, teamStrengthProfiles);
}

export function buildPlannerRoundFixtures(matches: PlannerMatch[], now = new Date()): PlannerRoundFixtures {
  const upcoming = matches.filter((match) => !match.finished && !match.cancelled && (!match.matchDate || match.matchDate >= startOfTodayUtc(now)));
  const grouped = groupMatchesByRound(upcoming.length > 0 ? upcoming : matches.filter((match) => !match.finished && !match.cancelled));
  const rounds = grouped.slice(0, maxProjectionRounds).map((group, index) => ({
    id: group.id,
    label: group.label || `Round ${index + 1}`,
    startsAt: group.startsAt?.toISOString() ?? null,
    fixtureCount: group.matches.length
  }));
  const selectedRoundIds = new Set(rounds.map((round) => round.id));
  const fixturesByTeamRound = new Map<string, Map<string, PlannerFixture[]>>();

  for (const group of grouped) {
    if (!selectedRoundIds.has(group.id)) continue;
    for (const match of group.matches) {
      if (match.homeTeamId) {
        addTeamFixture(fixturesByTeamRound, group.id, {
          id: match.id,
          roundId: group.id,
          teamId: match.homeTeamId,
          opponentTeamId: match.awayTeamId,
          opponentName: match.awayTeamName ?? "Opponent",
          opponentFullName: match.awayTeamFullName ?? match.awayTeamName ?? "Opponent",
          side: "H",
          kickoffAt: match.matchDate,
          projectedXg: null,
          projectedXga: null,
          attackMultiplier: null,
          defenseMultiplier: null,
          teamOver15Probability: match.homeOver15Probability ?? null,
          cleanSheetProbability: match.homeCleanSheetProbability ?? null,
          oddsFetchedAt: match.oddsFetchedAt ?? null
        });
      }
      if (match.awayTeamId) {
        addTeamFixture(fixturesByTeamRound, group.id, {
          id: match.id,
          roundId: group.id,
          teamId: match.awayTeamId,
          opponentTeamId: match.homeTeamId,
          opponentName: match.homeTeamName ?? "Opponent",
          opponentFullName: match.homeTeamFullName ?? match.homeTeamName ?? "Opponent",
          side: "A",
          kickoffAt: match.matchDate,
          projectedXg: null,
          projectedXga: null,
          attackMultiplier: null,
          defenseMultiplier: null,
          teamOver15Probability: match.awayOver15Probability ?? null,
          cleanSheetProbability: match.awayCleanSheetProbability ?? null,
          oddsFetchedAt: match.oddsFetchedAt ?? null
        });
      }
    }
  }

  return {
    rounds,
    fixturesByTeamRound,
    teamShortNameById: new Map()
  };
}

export function projectFixtureFantasyPoints(
  basePoints: number,
  positionGroup: FantasyPositionGroup,
  fixture: FantasyFixtureProjection
) {
  return basePoints * fixtureMultiplier(fixture, positionGroup);
}

export function fixtureDifficultyFromMultipliers(
  fixture: Pick<PlannerFixture, "attackMultiplier" | "defenseMultiplier" | "side">,
  positionGroup: FantasyPositionGroup
): number | null {
  const attack = fixture.attackMultiplier;
  const defense = fixture.defenseMultiplier;
  if (attack === null && defense === null) return null;

  const attackWeight = positionGroup === "GK" || positionGroup === "DEF" ? 0.35 : 0.7;
  const defenseWeight = 1 - attackWeight;
  const attackComponent = attack ?? defense ?? 1;
  const defenseComponent = defense ?? attack ?? 1;
  const combined = attackComponent * attackWeight + defenseComponent * defenseWeight;
  const homeBoost = fixture.side === "H" ? 0.04 : -0.04;
  const score = combined + homeBoost;

  if (score >= 1.18) return 1;
  if (score >= 1.06) return 2;
  if (score >= 0.94) return 3;
  if (score >= 0.82) return 4;
  return 5;
}

function aggregateRoundDifficulty(
  teamFixtures: PlannerFixture[],
  positionGroup: FantasyPositionGroup
): number | null {
  if (teamFixtures.length === 0) return null;
  const values = teamFixtures
    .map((fixture) => fixtureDifficultyFromMultipliers(fixture, positionGroup))
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  const max = Math.max(...values);
  return max;
}

export function buildTeamStrengthProfilesFromMatches(
  matches: TeamStrengthMatchInput[],
  options: { fallbackToGoals?: boolean } = {}
): TeamStrengthProfiles {
  const samples: TeamStrengthSample[] = [];
  const datedMatches = matches
    .map((match) => teamStrengthMatchDateMs(match.matchDate))
    .filter((value): value is number => value !== null);
  const referenceDateMs = datedMatches.length > 0 ? Math.max(...datedMatches) : null;

  for (const match of matches) {
    const weight = teamStrengthRecencyWeight(match.matchDate, referenceDateMs);
    for (const stat of match.teamStats) {
      const teamId = stat.teamId.trim();
      if (!teamId) continue;

      const opponent = findOpponentTeamStat(match, stat);
      const side = teamStatSide(match, stat);
      if (!side) continue;

      samples.push({
        teamId,
        side,
        xgFor: numericOrNull(stat.xg) ?? (options.fallbackToGoals ? numericOrNull(stat.goals) : null),
        xgAgainst: numericOrNull(opponent?.xg) ?? (options.fallbackToGoals ? numericOrNull(opponent?.goals) : null),
        weight
      });
    }
  }

  const teamIds = new Set(samples.map((sample) => sample.teamId));
  const league = profileFromSamples(samples);
  const byTeamId = new Map<string, TeamStrengthProfile>();
  for (const teamId of teamIds) {
    const teamSamples = samples.filter((sample) => sample.teamId === teamId);
    byTeamId.set(teamId, profileFromSamples(teamSamples, league));
  }

  return {
    byTeamId,
    league
  };
}

function applyFixtureStrength(fixtures: PlannerRoundFixtures, profiles: TeamStrengthProfiles): PlannerRoundFixtures {
  for (const roundFixtures of fixtures.fixturesByTeamRound.values()) {
    for (const teamFixtures of roundFixtures.values()) {
      for (const fixture of teamFixtures) {
        const projection = fixtureStrengthProjection(fixture, profiles);
        fixture.projectedXg = projection.projectedXg;
        fixture.projectedXga = projection.projectedXga;
        const marketProjection = fixtureStrengthWithBookmaker(projection, fixture);
        fixture.attackMultiplier = marketProjection.attackMultiplier;
        fixture.defenseMultiplier = marketProjection.defenseMultiplier;
      }
    }
  }

  return fixtures;
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
  const attackBase = leagueSide.xgForPerMatch ?? profiles.league.overall.xgForPerMatch ?? defaultTeamXgPerMatch;
  const defenseBase = leagueSide.xgAgainstPerMatch ?? profiles.league.overall.xgAgainstPerMatch ?? defaultTeamXgPerMatch;
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
    attackBase,
    defenseBase,
    attackMultiplier: ratioMultiplier(projectedXg, attackBase),
    defenseMultiplier: ratioMultiplier(defenseBase, projectedXga)
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

function bookmakerImpliedGoalsAgainst(cleanSheetProbability: number | null | undefined) {
  if (typeof cleanSheetProbability !== "number" || !Number.isFinite(cleanSheetProbability) || cleanSheetProbability <= 0 || cleanSheetProbability > 1) {
    return null;
  }
  return -Math.log(cleanSheetProbability);
}

function blendModelAndBookmakerExpectation(model: number, bookmaker: number | null) {
  if (bookmaker === null) return model;
  return clamp(model * 0.55 + bookmaker * 0.45, model * 0.7, model * 1.35);
}

async function loadTeamStrengthProfiles(prisma: PrismaClient, leagueId: bigint) {
  const feederLeagueId = teamStrengthFeederLeagueByTopLeague.get(String(leagueId));
  const [matches, feederMatches] = await Promise.all([
    loadTeamStrengthMatches(prisma, leagueId),
    feederLeagueId ? loadTeamStrengthMatches(prisma, feederLeagueId) : Promise.resolve([])
  ]);
  const profiles = buildTeamStrengthProfilesFromMatches(matches);
  if (!feederLeagueId || feederMatches.length === 0) return profiles;

  return addPromotedTeamStrengthProfiles(profiles, buildTeamStrengthProfilesFromMatches(feederMatches, { fallbackToGoals: true }));
}

async function loadTeamStrengthMatches(prisma: PrismaClient, leagueId: bigint): Promise<TeamStrengthMatchInput[]> {
  const matches = await prisma.coreMatch.findMany({
    where: {
      leagueId,
      finished: true,
      cancelled: false
    },
    orderBy: [{ matchDate: "desc" }, { id: "desc" }],
    take: 600,
    select: {
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      matchDate: true,
      teamStats: {
        select: {
          teamId: true,
          opponentTeamId: true,
          isHome: true,
          xg: true,
          goals: true
        }
      }
    }
  });

  return matches.map((match) => {
    const parsedTeamStats = match.teamStats.map((stat) => ({
      teamId: String(stat.teamId),
      opponentTeamId: stringifyBigInt(stat.opponentTeamId),
      isHome: stat.isHome,
      xg: stat.xg,
      goals: stat.goals
    }));
    return fillTeamStrengthStatsFromScore({
      homeTeamId: stringifyBigInt(match.homeTeamId),
      awayTeamId: stringifyBigInt(match.awayTeamId),
      matchDate: match.matchDate,
      teamStats: parsedTeamStats,
      homeScore: match.homeScore,
      awayScore: match.awayScore
    });
  });
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

export async function loadSportsRuFantasyPositionsByPlayerId(
  prisma: Pick<PrismaClient, "fantasyPlayerPrice" | "providerEntityMap">,
  input: {
    leagueId: bigint;
    season: string;
  }
) {
  const priceRows = await prisma.fantasyPlayerPrice.findMany({
    where: {
      provider: "SPORTS_RU",
      leagueId: input.leagueId,
      season: { in: sportsRuSeasonAliases(input.season) }
    },
    select: {
      id: true,
      playerId: true,
      position: true,
      positionLabel: true,
      sourceKind: true,
      sourceRowIndex: true
    },
    orderBy: { lastSeenAt: "desc" }
  });
  if (priceRows.length === 0) return new Map<string, string>();

  const maps = await prisma.providerEntityMap.findMany({
    where: {
      provider: "SPORTS_RU",
      providerEntityType: "FANTASY_PLAYER_PRICE",
      providerEntityId: { in: priceRows.map((row) => row.id) },
      internalEntityType: "PLAYER",
      internalEntityId: { not: null }
    },
    select: {
      providerEntityId: true,
      internalEntityId: true
    }
  });
  return sportsRuFantasyPositionsByPlayerId(priceRows, maps);
}

export async function loadSportsRuFantasyPriceRefsByScopedPlayer(
  prisma: PrismaClient,
  input: {
    scopes: SharedPlayerRowsScope[];
  }
) {
  const priceScopes = sportsRuPriceScopes(input.scopes);
  if (priceScopes.length === 0) return new Map<string, SportsRuFantasyPriceRef>();

  const priceRows = await prisma.fantasyPlayerPrice.findMany({
    where: {
      provider: "SPORTS_RU",
      OR: priceScopes.map((scope) => ({
        leagueId: scope.leagueId,
        season: scope.season
      }))
    },
    select: {
      id: true,
      leagueId: true,
      season: true,
      playerId: true,
      playerName: true,
      position: true,
      price: true,
      positionLabel: true,
      sourceKind: true,
      sourceRowIndex: true
    },
    orderBy: { lastSeenAt: "desc" }
  });
  if (priceRows.length === 0) return new Map<string, SportsRuFantasyPriceRef>();

  const maps = await prisma.providerEntityMap.findMany({
    where: {
      provider: "SPORTS_RU",
      providerEntityType: "FANTASY_PLAYER_PRICE",
      providerEntityId: { in: priceRows.map((row) => row.id) },
      internalEntityType: "PLAYER",
      internalEntityId: { not: null }
    },
    select: {
      providerEntityId: true,
      internalEntityId: true
    }
  });

  return sportsRuFantasyPriceRefsByScopedPlayer(priceRows, maps);
}

export function sportsRuFantasyPositionsByPlayerId(priceRows: SportsRuPositionPriceRow[], priceMaps: SportsRuPositionMapRow[]) {
  const mappedPlayerIdsByPriceId = new Map(
    priceMaps
      .filter((row) => row.internalEntityId)
      .map((row) => [row.providerEntityId, row.internalEntityId as string])
  );
  const positionsByPlayerId = new Map<string, string>();

  for (const row of priceRows) {
    const position = sportsRuPricePosition(row);
    if (!position) continue;
    const playerId = mappedPlayerIdsByPriceId.get(row.id) ?? (row.playerId ? String(row.playerId) : null);
    if (!playerId || positionsByPlayerId.has(playerId)) continue;
    positionsByPlayerId.set(playerId, position);
  }

  return positionsByPlayerId;
}

export function sportsRuFantasyPriceRefsByScopedPlayer(priceRows: SportsRuScopedPriceRow[], priceMaps: SportsRuPositionMapRow[]) {
  const mappedPlayerIdsByPriceId = new Map(
    priceMaps
      .filter((row) => row.internalEntityId)
      .map((row) => [row.providerEntityId, row.internalEntityId as string])
  );
  const refsByScopedPlayer = new Map<string, SportsRuFantasyPriceRef>();

  for (const row of priceRows) {
    const playerId = mappedPlayerIdsByPriceId.get(row.id) ?? (row.playerId ? String(row.playerId) : null);
    if (!playerId) continue;

    for (const season of sportsRuSeasonAliases(row.season)) {
      const key = sportsRuFantasyPriceScopeKey(row.leagueId, season, playerId);
      if (refsByScopedPlayer.has(key)) continue;
      refsByScopedPlayer.set(key, {
        playerId,
        leagueId: String(row.leagueId),
        season,
        playerName: row.playerName,
        position: sportsRuPricePosition(row),
        price: row.price
      });
    }
  }

  return refsByScopedPlayer;
}

export function sportsRuFantasyPriceScopeKey(leagueId: string | number | bigint, season: string, playerId: string | number | bigint) {
  return `${leagueId}:${season}:${playerId}`;
}

export function sportsRuPricePosition(row: Pick<SportsRuPositionPriceRow, "position" | "positionLabel" | "sourceKind" | "sourceRowIndex">) {
  const directPosition = knownFantasyPosition(row.position);
  if (directPosition) return directPosition;

  const labelPosition = knownFantasyPosition(row.positionLabel);
  if (labelPosition) return labelPosition;

  if (row.sourceKind === "featured-field" && row.sourceRowIndex !== null && row.sourceRowIndex !== undefined) {
    return sportsRuFeaturedRowPosition(row.sourceRowIndex);
  }

  if (row.sourceKind === "featured-field-fallback" && row.sourceRowIndex !== null && row.sourceRowIndex !== undefined) {
    return sportsRuFeaturedIndexPosition(row.sourceRowIndex);
  }

  return null;
}

async function loadLegacyMacheteUpcomingRoundFixtures(prisma: PrismaClient, league: SharedLeagueSeasonOption, now: Date) {
  const macheteLeague = await prisma.macheteLeague.findFirst({
    where: {
      provider: "FOTMOB",
      providerLeagueId: String(league.leagueId),
      OR: [{ season: { in: sportsRuSeasonAliases(league.season) } }, { season: null }]
    }
  });
  if (!macheteLeague) return buildPlannerRoundFixtures([], now);

  const fixtures = await prisma.macheteFixture.findMany({
    where: {
      leagueId: macheteLeague.id,
      OR: [{ status: { notIn: ["FINISHED", "PLAYED", "CANCELLED", "POSTPONED"] } }, { kickoffAt: { gte: startOfTodayUtc(now) } }]
    },
    include: {
      homeTeam: { select: { providerTeamId: true, name: true, shortName: true } },
      awayTeam: { select: { providerTeamId: true, name: true, shortName: true } }
    },
    orderBy: [{ kickoffAt: "asc" }, { id: "asc" }],
    take: 180
  });

  return buildPlannerRoundFixtures(
    fixtures.map((fixture) => ({
      id: fixture.providerFixtureId ?? fixture.id,
      round: fixture.round ?? null,
      matchDate: fixture.kickoffAt,
      homeTeamId: fixture.homeTeam?.providerTeamId ?? null,
      awayTeamId: fixture.awayTeam?.providerTeamId ?? null,
      homeTeamName: fixture.homeTeam?.shortName ?? fixture.homeTeam?.name ?? null,
      awayTeamName: fixture.awayTeam?.shortName ?? fixture.awayTeam?.name ?? null,
      homeTeamFullName: fixture.homeTeam?.name ?? null,
      awayTeamFullName: fixture.awayTeam?.name ?? null,
      finished: fixture.status === "FINISHED" || fixture.status === "PLAYED",
      cancelled: fixture.status === "CANCELLED" || fixture.status === "POSTPONED"
    })),
    now
  );
}

function groupMatchesByRound<T extends { id: string; round: string | null; matchDate: Date | null }>(matches: T[]) {
  const groups = new Map<string, { id: string; label: string; startsAt: Date | null; rank: number; matches: T[] }>();
  for (const match of matches) {
    const roundLabel = normalizeRoundLabel(match.round);
    const dateKey = match.matchDate ? match.matchDate.toISOString().slice(0, 10) : `fixture-${match.id}`;
    const id = roundLabel ? `round:${roundLabel}` : `date:${dateKey}`;
    const label = roundLabel ? `Round ${roundLabel}` : formatDate(match.matchDate);
    const existing = groups.get(id);
    if (existing) {
      existing.matches.push(match);
      if (dateMs(match.matchDate) < dateMs(existing.startsAt)) existing.startsAt = match.matchDate;
      continue;
    }

    groups.set(id, {
      id,
      label,
      startsAt: match.matchDate,
      rank: roundLabel ? Number(roundLabel) || dateMs(match.matchDate) : dateMs(match.matchDate),
      matches: [match]
    });
  }

  return [...groups.values()].sort((left, right) => left.rank - right.rank || dateMs(left.startsAt) - dateMs(right.startsAt));
}

function addTeamFixture(map: Map<string, Map<string, PlannerFixture[]>>, roundId: string, fixture: PlannerFixture) {
  const roundMap = map.get(roundId) ?? new Map<string, PlannerFixture[]>();
  const fixtures = roundMap.get(fixture.teamId) ?? [];
  fixtures.push(fixture);
  roundMap.set(fixture.teamId, fixtures);
  map.set(roundId, roundMap);
}

function findOpponentTeamStat(match: TeamStrengthMatchInput, stat: TeamStrengthMatchInput["teamStats"][number]) {
  const opponentTeamId =
    stat.opponentTeamId ??
    (stat.teamId === match.homeTeamId ? match.awayTeamId : stat.teamId === match.awayTeamId ? match.homeTeamId : null);

  return (
    match.teamStats.find((candidate) => opponentTeamId && candidate.teamId === opponentTeamId) ??
    match.teamStats.find((candidate) => candidate.teamId !== stat.teamId) ??
    null
  );
}

function teamStatSide(match: TeamStrengthMatchInput, stat: TeamStrengthMatchInput["teamStats"][number]): TeamStrengthSide | null {
  if (stat.isHome === true) return "home";
  if (stat.isHome === false) return "away";
  if (stat.teamId === match.homeTeamId) return "home";
  if (stat.teamId === match.awayTeamId) return "away";
  return null;
}

function profileFromSamples(samples: TeamStrengthSample[], leaguePrior?: TeamStrengthProfile): TeamStrengthProfile {
  if (!leaguePrior) {
    return {
      home: strengthBlock(samples.filter((sample) => sample.side === "home")),
      away: strengthBlock(samples.filter((sample) => sample.side === "away")),
      overall: strengthBlock(samples)
    };
  }

  const overall = strengthBlock(samples, leaguePrior.overall, teamStrengthOverallPriorMatches);
  return {
    home: strengthBlock(
      samples.filter((sample) => sample.side === "home"),
      venueAdjustedStrengthPrior(overall, leaguePrior.home, leaguePrior.overall),
      teamStrengthVenuePriorMatches
    ),
    away: strengthBlock(
      samples.filter((sample) => sample.side === "away"),
      venueAdjustedStrengthPrior(overall, leaguePrior.away, leaguePrior.overall),
      teamStrengthVenuePriorMatches
    ),
    overall
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

function promotedStrengthBlock(source: TeamStrengthBlock, feederAverage: TeamStrengthBlock, topAverage: TeamStrengthBlock): TeamStrengthBlock {
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

function promotedStrengthRatio(ratio: number, matches: number) {
  const sampleMatches = Math.max(0, matches);
  const shrunkRatio = (sampleMatches * ratio + promotedTeamPriorMatches) / (sampleMatches + promotedTeamPriorMatches);
  return promotedTeamStrengthFactor * shrunkRatio ** promotedTeamRatioExponent;
}

function strengthRatio(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator <= 0) return 1;
  return clamp(numerator / denominator, 0.5, 2);
}

function strengthBlock(samples: TeamStrengthSample[], prior?: TeamStrengthBlock, priorMatches = 0): TeamStrengthBlock {
  return {
    matches: samples.length,
    xgForPerMatch: weightedStrengthAverage(samples, "xgFor", prior?.xgForPerMatch ?? null, priorMatches),
    xgAgainstPerMatch: weightedStrengthAverage(samples, "xgAgainst", prior?.xgAgainstPerMatch ?? null, priorMatches)
  };
}

function weightedStrengthAverage(
  samples: TeamStrengthSample[],
  field: "xgFor" | "xgAgainst",
  prior: number | null,
  priorMatches: number
) {
  const known = samples.filter((sample) => sample[field] !== null);
  const sampleWeight = sum(known.map((sample) => sample.weight));
  const priorWeight = prior !== null ? priorMatches : 0;
  if (sampleWeight + priorWeight <= 0) return null;
  return (sum(known.map((sample) => (sample[field] ?? 0) * sample.weight)) + (prior ?? 0) * priorWeight) / (sampleWeight + priorWeight);
}

function venueAdjustedStrengthPrior(overall: TeamStrengthBlock, leagueVenue: TeamStrengthBlock, leagueOverall: TeamStrengthBlock): TeamStrengthBlock {
  return {
    matches: 0,
    xgForPerMatch: venueAdjustedMetric(overall.xgForPerMatch, leagueVenue.xgForPerMatch, leagueOverall.xgForPerMatch),
    xgAgainstPerMatch: venueAdjustedMetric(overall.xgAgainstPerMatch, leagueVenue.xgAgainstPerMatch, leagueOverall.xgAgainstPerMatch)
  };
}

function venueAdjustedMetric(teamOverall: number | null, leagueVenue: number | null, leagueOverall: number | null) {
  if (teamOverall === null) return leagueVenue ?? leagueOverall;
  if (leagueVenue === null || leagueOverall === null || leagueOverall <= 0) return teamOverall;
  return teamOverall * (leagueVenue / leagueOverall);
}

function teamStrengthRecencyWeight(value: Date | string | null | undefined, referenceDateMs: number | null) {
  const valueMs = teamStrengthMatchDateMs(value);
  if (valueMs === null || referenceDateMs === null) return 1;
  const ageDays = Math.max(0, (referenceDateMs - valueMs) / 86_400_000);
  return 0.5 ** (ageDays / teamStrengthHalfLifeDays);
}

function teamStrengthMatchDateMs(value: Date | string | null | undefined) {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function strengthBlockForSide(
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

function hasStrengthSignal(block: TeamStrengthBlock) {
  return block.matches > 0 && (block.xgForPerMatch !== null || block.xgAgainstPerMatch !== null);
}

function ratioMultiplier(numerator: number | null, denominator: number | null) {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return clamp(numerator / denominator, 0.72, 1.28);
}

function knownFantasyPosition(position: string | null | undefined) {
  const positionGroup = normalizeFantasyPosition(position);
  return positionGroup === "UNK" ? null : positionGroup;
}

function sportsRuFeaturedRowPosition(rowIndex: number) {
  if (rowIndex === 0) return "GK";
  if (rowIndex === 1) return "DEF";
  if (rowIndex === 2) return "MID";
  return "FWD";
}

function sportsRuFeaturedIndexPosition(index: number) {
  if (index === 0) return "GK";
  if (index <= 4) return "DEF";
  if (index <= 8) return "MID";
  return "FWD";
}

function sportsRuPriceScopes(scopes: SharedPlayerRowsScope[]) {
  const seen = new Set<string>();
  const priceScopes: Array<{ leagueId: bigint; season: string }> = [];

  for (const scope of scopes) {
    if (!scope.leagueId || !scope.season) continue;
    for (const season of sportsRuSeasonAliases(scope.season)) {
      const key = `${scope.leagueId}:${season}`;
      if (seen.has(key)) continue;
      seen.add(key);
      priceScopes.push({ leagueId: scope.leagueId, season });
    }
  }

  return priceScopes;
}

function priceLookup(
  priceRows: Array<{
    id: string;
    playerId: bigint | null;
    playerName: string;
    normalizedName: string;
    teamName: string;
    position: string | null;
    positionLabel?: string | null;
    sourceKind?: string | null;
    sourceRowIndex?: number | null;
    price: number;
  }>,
  priceMaps: Array<{
    providerEntityId: string;
    internalEntityId: string | null;
  }>
) {
  const mappedPlayerIdsByPriceId = new Map(
    priceMaps
      .filter((row) => row.internalEntityId)
      .map((row) => [row.providerEntityId, row.internalEntityId as string])
  );
  const byPlayerId = new Map<string, (typeof priceRows)[number]>();
  for (const row of priceRows) {
    const mappedPlayerId = mappedPlayerIdsByPriceId.get(row.id);
    if (mappedPlayerId) {
      if (!byPlayerId.has(mappedPlayerId)) byPlayerId.set(mappedPlayerId, row);
    } else if (row.playerId) {
      const playerId = String(row.playerId);
      if (!byPlayerId.has(playerId)) byPlayerId.set(playerId, row);
    }
  }
  return {
    byPlayerId
  };
}

export function fantasyPlannerPosition(
  sportsPosition: string | null | undefined,
  rosterPosition: string | null | undefined,
  projectedPosition: string | null | undefined
) {
  const candidates = [sportsPosition, rosterPosition, projectedPosition];
  const known = candidates.find((position) => position && normalizeFantasyPosition(position) !== "UNK");
  return known ?? candidates.find((position) => position?.trim()) ?? null;
}

export function resolveFantasyPlannerPrice(
  priceRow: { price: number } | null | undefined,
  score: number | null,
  positionGroup: FantasyPositionGroup
): Pick<FantasyPlannerPlayer, "price" | "priceSource"> {
  if (priceRow) return { price: priceRow.price, priceSource: "SPORTS_RU" };

  return {
    price: estimateFantasyPrice(score, positionGroup),
    priceSource: "ESTIMATED"
  };
}

function estimateFantasyPrice(score: number | null, positionGroup: FantasyPositionGroup) {
  const safeScore = Math.max(0, score ?? 0);
  const base = positionGroup === "GK" ? 4.5 : positionGroup === "DEF" ? 4.5 : positionGroup === "MID" ? 5 : 5.5;
  const multiplier = positionGroup === "GK" ? 0.28 : positionGroup === "DEF" ? 0.38 : positionGroup === "MID" ? 0.48 : 0.55;
  return Math.min(13.5, Math.max(3.5, roundFantasyValue(base + safeScore * multiplier)));
}

function fixtureMultiplier(fixture: FantasyFixtureProjection, positionGroup: FantasyPositionGroup) {
  const venueMultiplier = fixture.side === "H" ? 1.04 : 0.96;
  const attack = fixture.attackMultiplier ?? 1;
  const defense = fixture.defenseMultiplier ?? 1;
  const positionBlend =
    positionGroup === "GK" || positionGroup === "DEF"
      ? 1 + (attack - 1) * 0.12 + (defense - 1) * 0.42
      : positionGroup === "MID"
        ? 1 + (attack - 1) * 0.32 + (defense - 1) * 0.12
        : positionGroup === "FWD"
          ? 1 + (attack - 1) * 0.48
          : 1 + (attack - 1) * 0.24 + (defense - 1) * 0.12;

  return clamp(venueMultiplier * positionBlend, 0.68, 1.35);
}

export function fantasyTeamShortName(metadata: unknown, fallback: string) {
  return providerTeamShortName({ metadata }) ?? fallback;
}

export function fantasyTeamShortNamesByTeamId(
  selectedSeasonTeams: Array<{ teamId: bigint; metadata: unknown }>,
  fallbackSeasonTeams: Array<{ teamId: bigint; metadata: unknown }>
) {
  const result = new Map<string, string>();
  for (const row of [...selectedSeasonTeams, ...fallbackSeasonTeams]) {
    const teamId = String(row.teamId);
    if (result.has(teamId)) continue;
    const shortName = providerTeamShortName({ metadata: row.metadata });
    if (shortName) result.set(teamId, shortName);
  }
  return result;
}

export function compareFantasyPlannerPlayers(left: FantasyPlannerPlayer, right: FantasyPlannerPlayer) {
  return (
    (right.roundPoints[0] ?? right.predictedFp ?? 0) - (left.roundPoints[0] ?? left.predictedFp ?? 0) ||
    priceSourceRank(right.priceSource) - priceSourceRank(left.priceSource) ||
    right.valueScore - left.valueScore ||
    left.name.localeCompare(right.name)
  );
}

function priceSourceRank(source: FantasyPlannerPlayer["priceSource"]) {
  return source === "SPORTS_RU" ? 1 : 0;
}

function playerTeamKey(playerId: string | number | bigint, teamId: string | number | bigint) {
  return `${playerId}:${teamId}`;
}

function isTopFiveLeague(league: Pick<SharedLeagueSeasonOption, "leagueId" | "name" | "displayName" | "country">) {
  const name = `${league.name} ${league.displayName} ${league.country ?? ""}`.toLowerCase();
  return (
    String(league.leagueId) === "47" ||
    ["premier league", "la liga", "bundesliga", "serie a", "ligue 1"].some((candidate) => name.includes(candidate))
  );
}

function normalizeRoundLabel(value: string | null) {
  if (!value) return null;
  const match = value.match(/\d+/);
  return match?.[0] ?? value.trim();
}

function stringifyBigInt(value: bigint | null | undefined) {
  return value === null || value === undefined ? null : String(value);
}

function dateMs(value: Date | null) {
  return value?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function startOfTodayUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function sportsRuSeasonAliases(season: string) {
  const values = new Set([season]);
  const long = season.match(/^(\d{4})\/(\d{4})$/);
  if (long) values.add(`${long[1]}/${long[2].slice(-2)}`);
  const short = season.match(/^(\d{4})\/(\d{2})$/);
  if (short) values.add(`${short[1]}/20${short[2]}`);
  return [...values];
}

export function displayLeagueName(league: SharedLeagueSeasonOption) {
  return macheteLeagueDisplayName({
    id: league.providerLeagueId,
    name: league.name,
    country: league.country,
    providerLeagueId: league.providerLeagueId
  });
}

function numericOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, "").replace(/%$/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function sum(values: Array<number | null | undefined>): number {
  let total = 0;
  for (const value of values) {
    total += value ?? 0;
  }
  return total;
}

function averageKnown(values: Array<number | null | undefined>) {
  const known = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (known.length === 0) return null;
  return sum(known) / known.length;
}

function expectedFormulaUsesBookmaker(model: ActiveScoringModel, position: FantasyPositionGroup) {
  if (!model.customFormulaEnabled) return false;
  const positionFormula = position === "GK"
    ? model.customFormulaGk
    : position === "DEF"
      ? model.customFormulaDef
      : position === "MID"
        ? model.customFormulaMid
        : position === "FWD"
          ? model.customFormulaFwd
          : null;
  const formula = positionFormula?.trim() || model.customFormula?.trim() || "";
  const normalized = formula.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return normalized.includes("fixture_team_over_1_5_probability") || normalized.includes("fixture_clean_sheet_probability");
}

function poissonOver15Probability(projectedXg: number | null) {
  if (projectedXg === null || !Number.isFinite(projectedXg) || projectedXg < 0) return null;
  return 1 - Math.exp(-projectedXg) * (1 + projectedXg);
}

function poissonCleanSheetProbability(projectedXga: number | null) {
  if (projectedXga === null || !Number.isFinite(projectedXga) || projectedXga < 0) return null;
  return Math.exp(-projectedXga);
}

function relativeProbabilitySignal(actual: number | null | undefined, baseline: number | null) {
  if (actual === null || actual === undefined || !Number.isFinite(actual) || baseline === null || baseline <= 0) return 1;
  return clamp(actual / baseline, 0.8, 1.2);
}

function bookmakerSignalWeights(position: FantasyPositionGroup) {
  if (position === "GK" || position === "DEF") return { attack: 0.1, defense: 0.55 };
  if (position === "MID") return { attack: 0.45, defense: 0.15 };
  if (position === "FWD") return { attack: 0.6, defense: 0.05 };
  return { attack: 0.25, defense: 0.25 };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
